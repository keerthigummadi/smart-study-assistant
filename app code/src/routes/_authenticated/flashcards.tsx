import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, RotateCcw, Flame, ThumbsUp, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/flashcards")({
  component: FlashcardsPage,
  head: () => ({ meta: [{ title: "Flashcards — Smart Study" }] }),
});

type Card = {
  id: string;
  front: string;
  back: string;
  topic: string | null;
  is_difficult: boolean;
  ease_factor: number;
  interval_days: number;
  review_count: number;
  next_review_at: string;
};

// SM-2 simplified
function nextSchedule(card: Card, quality: 0 | 3 | 5) {
  let ef = card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;
  let interval: number;
  if (quality < 3) {
    interval = 1;
  } else if (card.review_count === 0) {
    interval = 1;
  } else if (card.review_count === 1) {
    interval = 3;
  } else {
    interval = Math.round(card.interval_days * ef);
  }
  return { ease_factor: ef, interval_days: interval, review_count: card.review_count + 1 };
}

function FlashcardsPage() {
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [mode, setMode] = useState<"due" | "all" | "difficult">("due");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("flashcards")
      .select("id,front,back,topic,is_difficult,ease_factor,interval_days,review_count,next_review_at")
      .order("next_review_at", { ascending: true });
    setAllCards(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cards = useMemo(() => {
    const now = Date.now();
    if (mode === "difficult") return allCards.filter((c) => c.is_difficult);
    if (mode === "all") return allCards;
    return allCards.filter((c) => new Date(c.next_review_at).getTime() <= now);
  }, [allCards, mode]);

  useEffect(() => { setIdx(0); setFlipped(false); }, [mode]);

  const card = cards[idx];

  const grade = async (quality: 0 | 3 | 5) => {
    if (!card) return;
    const sched = nextSchedule(card, quality);
    const nextReviewAt = new Date(Date.now() + sched.interval_days * 86400000).toISOString();
    await supabase
      .from("flashcards")
      .update({
        ...sched,
        next_review_at: nextReviewAt,
        is_difficult: quality === 0 ? true : card.is_difficult,
      })
      .eq("id", card.id);
    if (quality === 5) await supabase.rpc("award_xp", { _xp: 3 });
    if (quality === 3) await supabase.rpc("award_xp", { _xp: 1 });
    toast.success(quality === 5 ? "Easy! Next review in " + sched.interval_days + "d" : quality === 3 ? "Good — see again in " + sched.interval_days + "d" : "Marked for review");
    setFlipped(false);
    if (idx + 1 < cards.length) setIdx(idx + 1);
    else { await load(); setIdx(0); }
  };

  const toggleDifficult = async () => {
    if (!card) return;
    await supabase.from("flashcards").update({ is_difficult: !card.is_difficult }).eq("id", card.id);
    setAllCards((prev) => prev.map((c) => c.id === card.id ? { ...c, is_difficult: !c.is_difficult } : c));
  };

  if (loading) return <div className="text-center text-muted-foreground py-20">Loading…</div>;

  if (allCards.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Layers className="mb-3 h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No flashcards yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Upload material to generate your first deck.</p>
            <Link to="/upload" className="mt-4">
              <Button className="bg-gradient-primary text-primary-foreground shadow-glow">
                <Plus className="mr-2 h-4 w-4" />Create flashcards
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dueCount = allCards.filter((c) => new Date(c.next_review_at).getTime() <= Date.now()).length;
  const difficultCount = allCards.filter((c) => c.is_difficult).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Flashcards</h1>
          <p className="mt-1 text-sm text-muted-foreground">Spaced repetition keeps it fresh.</p>
        </div>
        <Link to="/upload">
          <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" />New deck</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <ModePill active={mode === "due"} onClick={() => setMode("due")} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Due now ({dueCount})
        </ModePill>
        <ModePill active={mode === "difficult"} onClick={() => setMode("difficult")} icon={<Flame className="h-3.5 w-3.5" />}>
          Difficult ({difficultCount})
        </ModePill>
        <ModePill active={mode === "all"} onClick={() => setMode("all")} icon={<Layers className="h-3.5 w-3.5" />}>
          All ({allCards.length})
        </ModePill>
      </div>

      {!card ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">All caught up!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "due" ? "No cards due for review right now." : "Nothing in this stack."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Card {idx + 1} of {cards.length}{card.topic && <> · <span className="text-primary">{card.topic}</span></>}</span>
            <button onClick={toggleDifficult} className="flex items-center gap-1 hover:text-destructive">
              <AlertTriangle className={`h-3.5 w-3.5 ${card.is_difficult ? "text-destructive" : ""}`} />
              {card.is_difficult ? "Difficult" : "Mark difficult"}
            </button>
          </div>

          <div className="flashcard-3d h-80 cursor-pointer select-none" onClick={() => setFlipped((f) => !f)}>
            <div className={`flashcard-inner ${flipped ? "is-flipped" : ""}`}>
              <div className="flashcard-face rounded-3xl bg-gradient-hero p-8 text-white shadow-elegant">
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase tracking-widest text-white/70">Question</span>
                  <p className="mt-4 text-2xl font-semibold leading-snug">{card.front}</p>
                  <span className="mt-6 text-xs text-white/60">Tap to flip</span>
                </div>
              </div>
              <div className="flashcard-face flashcard-back rounded-3xl bg-gradient-card p-8 shadow-elegant border">
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase tracking-widest text-primary">Answer</span>
                  <p className="mt-4 text-xl leading-relaxed">{card.back}</p>
                </div>
              </div>
            </div>
          </div>

          {flipped ? (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => grade(0)}>
                <AlertTriangle className="mr-1 h-4 w-4" />Hard
              </Button>
              <Button variant="outline" onClick={() => grade(3)}>
                Good
              </Button>
              <Button className="bg-gradient-primary text-primary-foreground shadow-glow" onClick={() => grade(5)}>
                <ThumbsUp className="mr-1 h-4 w-4" />Easy
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setFlipped(true)}>
              <RotateCcw className="mr-2 h-4 w-4" />Flip to see answer
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ModePill({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth ${active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
    >
      {icon}{children}
    </button>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Brain, Layers, TrendingUp, Sparkles, ArrowRight, FileText, Zap, Flame, Crown, MessageSquare, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Smart Study" }] }),
});

type Stats = { materials: number; quizzes: number; flashcards: number; avgScore: number | null };
type UStats = { xp: number; level: number; current_streak: number; best_streak: number };

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ materials: 0, quizzes: 0, flashcards: 0, avgScore: null });
  const [uStats, setUStats] = useState<UStats>({ xp: 0, level: 1, current_streak: 0, best_streak: 0 });
  const [recentMaterials, setRecentMaterials] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [recentScores, setRecentScores] = useState<{ id: string; score: number; total: number; created_at: string }[]>([]);
  const [name, setName] = useState("");
  const [dueCards, setDueCards] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const nowIso = new Date().toISOString();
      const [m, q, f, s, p, us, dc] = await Promise.all([
        supabase.from("materials").select("id", { count: "exact", head: true }),
        supabase.from("quizzes").select("id", { count: "exact", head: true }),
        supabase.from("flashcards").select("id", { count: "exact", head: true }),
        supabase.from("scores").select("score,total"),
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_stats").select("xp,level,current_streak,best_streak").eq("user_id", user.id).maybeSingle(),
        supabase.from("flashcards").select("id", { count: "exact", head: true }).lte("next_review_at", nowIso),
      ]);
      const scores = s.data ?? [];
      const avg = scores.length
        ? Math.round((scores.reduce((a, b) => a + (b.score / Math.max(b.total, 1)) * 100, 0) / scores.length))
        : null;
      setStats({ materials: m.count ?? 0, quizzes: q.count ?? 0, flashcards: f.count ?? 0, avgScore: avg });
      setName(p.data?.display_name ?? user.email?.split("@")[0] ?? "Student");
      if (us.data) setUStats(us.data);
      setDueCards(dc.count ?? 0);

      const [rm, rs] = await Promise.all([
        supabase.from("materials").select("id,title,created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("scores").select("id,score,total,created_at").order("created_at", { ascending: false }).limit(5),
      ]);
      setRecentMaterials(rm.data ?? []);
      setRecentScores(rs.data ?? []);
    })();
  }, [user]);

  const xpInLevel = uStats.xp % 100;
  const cards = [
    { label: "Materials", value: stats.materials, icon: FileText },
    { label: "Quizzes", value: stats.quizzes, icon: Brain },
    { label: "Flashcards", value: stats.flashcards, icon: Layers },
    { label: "Avg Score", value: stats.avgScore != null ? `${stats.avgScore}%` : "—", icon: TrendingUp },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Hey, <span className="text-gradient-primary">{name}</span> 👋
          </h1>
          <p className="mt-1 text-muted-foreground">Pick up where you left off, or start something new.</p>
        </div>
        <Link to="/upload">
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Sparkles className="mr-2 h-4 w-4" />New study session
          </Button>
        </Link>
      </div>

      {/* XP / Streak hero */}
      <Card className="overflow-hidden bg-gradient-card shadow-elegant">
        <div className="grid gap-4 p-6 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Crown className="h-3.5 w-3.5" />Level
            </div>
            <div className="mt-1 text-3xl font-black text-gradient-primary">Lv {uStats.level}</div>
            <Progress value={xpInLevel} className="mt-2 h-2" />
            <p className="mt-1 text-xs text-muted-foreground">{xpInLevel}/100 XP to next level</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />Total XP
            </div>
            <div className="mt-1 text-3xl font-black">{uStats.xp.toLocaleString()}</div>
            <p className="mt-1 text-xs text-muted-foreground">Earn XP from quizzes & reviews</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-orange-500" />Streak
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-black">{uStats.current_streak}d</span>
              <Badge variant="outline" className="text-xs">best {uStats.best_streak}d</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Study daily to keep it alive</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="overflow-hidden border bg-gradient-card shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-elegant">
            <CardContent className="p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <c.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="text-2xl font-black md:text-3xl">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dueCards > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">{dueCards} flashcard{dueCards === 1 ? "" : "s"} due now</div>
                <div className="text-xs text-muted-foreground">Spaced repetition is calling.</div>
              </div>
            </div>
            <Link to="/flashcards">
              <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow">Review now</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <QuickAction to="/upload" icon={Upload} title="Upload material" desc="PDF, DOCX, TXT or paste notes" />
        <QuickAction to="/tutor" icon={MessageSquare} title="Ask AI Tutor" desc="Get instant explanations" />
        <QuickAction to="/plan" icon={CalendarDays} title="Study plan" desc="Personalized 7-day schedule" />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent materials</CardTitle></CardHeader>
          <CardContent>
            {recentMaterials.length === 0 ? (
              <EmptyState text="No materials yet — upload your first one." />
            ) : (
              <ul className="space-y-2">
                {recentMaterials.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-lg border p-3 transition-smooth hover:bg-accent/50">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{m.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent scores</CardTitle></CardHeader>
          <CardContent>
            {recentScores.length === 0 ? (
              <EmptyState text="Take a quiz to see scores here." />
            ) : (
              <ul className="space-y-2">
                {recentScores.map((s) => {
                  const pct = Math.round((s.score / Math.max(s.total, 1)) * 100);
                  return (
                    <li key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-sm font-medium">{s.score}/{s.total} ({pct}%)</span>
                      <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, desc }: { to: string; icon: typeof Upload; title: string; desc: string }) {
  return (
    <Link to={to as "/upload"} className="group">
      <div className="relative h-full overflow-hidden rounded-2xl border bg-gradient-card p-5 shadow-card transition-smooth hover:-translate-y-1 hover:shadow-elegant">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </div>
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Target,
  AlertTriangle,
  Sparkles,
  Loader2,
  Check,
  X,
  ArrowRight,
  RotateCcw,
  Trophy,
  Zap,
  Flame,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/practice")({
  component: PracticePage,
  head: () => ({ meta: [{ title: "Practice Weak Areas — Smart Study" }] }),
});

type Q = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  correct_answer: string | null;
  question_type: string;
  topic: string | null;
  difficulty: string;
  explanation: string | null;
};

type Resp = {
  question_id: string | null;
  topic: string | null;
  is_correct: boolean;
};

type TopicStat = { topic: string; right: number; total: number; pct: number };

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

const SESSION_SIZE = 10;

function PracticePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [topicStats, setTopicStats] = useState<TopicStat[]>([]);
  const [responses, setResponses] = useState<Resp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);

  const [session, setSession] = useState<Q[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<
    { q: Q; is_correct: boolean; time_seconds: number }[]
  >([]);
  const [done, setDone] = useState(false);
  const [qSeconds, setQSeconds] = useState(0);
  const streakRef = useRef({ correct: 0, wrong: 0 });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("question_responses")
        .select("question_id,topic,is_correct")
        .eq("user_id", user.id);
      const rs = (data ?? []) as Resp[];
      setResponses(rs);

      const map = new Map<string, { right: number; total: number }>();
      rs.forEach((r) => {
        if (!r.topic) return;
        const c = map.get(r.topic) ?? { right: 0, total: 0 };
        c.total += 1;
        if (r.is_correct) c.right += 1;
        map.set(r.topic, c);
      });
      const stats: TopicStat[] = [...map.entries()]
        .map(([topic, v]) => ({
          topic,
          right: v.right,
          total: v.total,
          pct: Math.round((v.right / v.total) * 100),
        }))
        .sort((a, b) => a.pct - b.pct);
      setTopicStats(stats);
      // preselect weak topics
      setSelected(new Set(stats.filter((t) => t.pct < 60).map((t) => t.topic)));
      setLoading(false);
    })();
  }, [user]);

  const weakTopics = useMemo(
    () => topicStats.filter((t) => t.pct < 60),
    [topicStats]
  );

  // Per-question wrong counts to prioritize
  const wrongByQ = useMemo(() => {
    const m = new Map<string, number>();
    responses.forEach((r) => {
      if (!r.question_id) return;
      if (!r.is_correct) m.set(r.question_id, (m.get(r.question_id) ?? 0) + 1);
    });
    return m;
  }, [responses]);

  const seenQ = useMemo(() => {
    const s = new Set<string>();
    responses.forEach((r) => r.question_id && s.add(r.question_id));
    return s;
  }, [responses]);

  const toggle = (t: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const startSession = async () => {
    if (!user) return;
    const topics = [...selected];
    if (topics.length === 0) {
      toast.error("Pick at least one topic");
      return;
    }
    setBuilding(true);
    try {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select(
          "id,question,options,correct_index,correct_answer,question_type,topic,difficulty,explanation,quiz_id,quizzes!inner(user_id)"
        )
        .in("topic", topics)
        .eq("quizzes.user_id", user.id);
      if (error) throw error;

      const pool: Q[] = (data ?? []).map((x: any) => ({
        id: x.id,
        question: x.question,
        options: Array.isArray(x.options) ? x.options : [],
        correct_index: x.correct_index,
        correct_answer: x.correct_answer,
        question_type: x.question_type,
        topic: x.topic,
        difficulty: x.difficulty,
        explanation: x.explanation,
      }));

      if (pool.length === 0) {
        toast.error(
          "No questions found for those topics. Generate quizzes from your study material first."
        );
        setBuilding(false);
        return;
      }

      // Priority score: previously-wrong first, then unseen, then seen-correct.
      // Within tier, prefer easier first; adaptive logic will ramp up.
      const diffRank: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
      const scored = pool.map((q) => {
        const wrong = wrongByQ.get(q.id) ?? 0;
        const seen = seenQ.has(q.id);
        const tier = wrong > 0 ? 0 : seen ? 2 : 1; // wrong < unseen < correct-seen
        return { q, tier, wrong, dr: diffRank[q.difficulty] ?? 1 };
      });
      scored.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (a.wrong !== b.wrong) return b.wrong - a.wrong;
        return a.dr - b.dr;
      });

      // Pick session — limit per-topic to spread coverage
      const perTopicCap = Math.max(2, Math.ceil(SESSION_SIZE / topics.length));
      const perTopicCount = new Map<string, number>();
      const chosen: Q[] = [];
      for (const s of scored) {
        const t = s.q.topic ?? "—";
        const c = perTopicCount.get(t) ?? 0;
        if (c >= perTopicCap) continue;
        chosen.push(s.q);
        perTopicCount.set(t, c + 1);
        if (chosen.length >= SESSION_SIZE) break;
      }
      // If not enough, fill remainder from leftover
      if (chosen.length < SESSION_SIZE) {
        for (const s of scored) {
          if (chosen.length >= SESSION_SIZE) break;
          if (!chosen.includes(s.q)) chosen.push(s.q);
        }
      }

      streakRef.current = { correct: 0, wrong: 0 };
      setSession(chosen);
      setIdx(0);
      setPicked(null);
      setTextAnswer("");
      setRevealed(false);
      setResults([]);
      setDone(false);
      setQSeconds(0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  // Timer per question
  useEffect(() => {
    if (!session || done) return;
    const t = setInterval(() => setQSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [session, done, idx]);

  // Adaptive: after each answer, reorder remaining
  const applyAdaptive = (correct: boolean) => {
    if (!session) return;
    if (correct) {
      streakRef.current.correct += 1;
      streakRef.current.wrong = 0;
    } else {
      streakRef.current.wrong += 1;
      streakRef.current.correct = 0;
    }
    const target =
      streakRef.current.correct >= 2
        ? "hard"
        : streakRef.current.wrong >= 2
        ? "easy"
        : null;
    if (!target) return;

    setSession((prev) => {
      if (!prev) return prev;
      const past = prev.slice(0, idx + 1);
      const upcoming = prev.slice(idx + 1);
      const matches = upcoming.filter((q) => q.difficulty === target);
      const rest = upcoming.filter((q) => q.difficulty !== target);
      return [...past, ...matches, ...rest];
    });
    streakRef.current.correct = 0;
    streakRef.current.wrong = 0;
  };

  const current = session?.[idx];
  const total = session?.length ?? 0;
  const isText =
    current?.question_type === "fill_blank" ||
    current?.question_type === "short_answer";

  const evaluate = (): boolean => {
    if (!current) return false;
    if (
      current.question_type === "mcq" ||
      current.question_type === "true_false"
    ) {
      return picked === current.correct_index;
    }
    if (!current.correct_answer) return false;
    return normalize(textAnswer) === normalize(current.correct_answer);
  };

  const handleReveal = () => {
    if (!current) return;
    if (
      current.question_type === "mcq" ||
      current.question_type === "true_false"
    ) {
      if (picked === null) return toast.error("Pick an answer first");
    } else if (!textAnswer.trim()) {
      return toast.error("Type your answer first");
    }
    setRevealed(true);
  };

  const handleNext = async () => {
    if (!current || !session) return;
    const correct = evaluate();
    const rec = { q: current, is_correct: correct, time_seconds: qSeconds };
    const nextResults = [...results, rec];
    setResults(nextResults);

    applyAdaptive(correct);

    setPicked(null);
    setTextAnswer("");
    setRevealed(false);
    setQSeconds(0);

    if (idx + 1 < total) {
      setIdx(idx + 1);
    } else {
      setDone(true);
      if (user) {
        const score = nextResults.filter((r) => r.is_correct).length;
        await Promise.all([
          supabase.from("question_responses").insert(
            nextResults.map((r) => ({
              user_id: user.id,
              quiz_id: null,
              question_id: r.q.id,
              topic: r.q.topic,
              difficulty: r.q.difficulty,
              is_correct: r.is_correct,
              time_seconds: r.time_seconds,
            }))
          ),
          supabase.rpc("award_xp", {
            _xp: score * 8 + (score === total ? 20 : 0),
          }),
        ]);
      }
    }
  };

  const restart = () => {
    setSession(null);
    setIdx(0);
    setResults([]);
    setDone(false);
    setPicked(null);
    setTextAnswer("");
    setRevealed(false);
    // re-pull responses so weak-topic list updates
    if (user) {
      supabase
        .from("question_responses")
        .select("question_id,topic,is_correct")
        .eq("user_id", user.id)
        .then(({ data }) => setResponses((data ?? []) as Resp[]));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ===== Session done screen =====
  if (done && session) {
    const score = results.filter((r) => r.is_correct).length;
    const pct = Math.round((score / Math.max(total, 1)) * 100);
    const xp = score * 8 + (score === total ? 20 : 0);

    // recompute topic deltas inside session
    const topicMap = new Map<string, { right: number; total: number }>();
    results.forEach((r) => {
      const t = r.q.topic ?? "General";
      const c = topicMap.get(t) ?? { right: 0, total: 0 };
      c.total += 1;
      if (r.is_correct) c.right += 1;
      topicMap.set(t, c);
    });

    return (
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden bg-gradient-card shadow-elegant">
          <div className="bg-gradient-hero p-8 text-center text-white">
            <Trophy className="mx-auto h-12 w-12" />
            <h1 className="mt-3 text-3xl font-black">Practice complete!</h1>
            <p className="mt-1 text-white/90">Focused on your weak areas</p>
          </div>
          <CardContent className="space-y-6 p-8">
            <div className="text-center">
              <div className="text-6xl font-black text-gradient-primary">{pct}%</div>
              <p className="mt-2 text-muted-foreground">
                {score} of {total} correct
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                <Zap className="h-4 w-4" /> +{xp} XP earned
              </div>
            </div>
            <Progress value={pct} className="h-3" />

            <div>
              <h3 className="mb-2 font-semibold text-sm">Topic breakdown</h3>
              <ul className="space-y-1.5">
                {[...topicMap.entries()].map(([t, v]) => {
                  const p = Math.round((v.right / v.total) * 100);
                  return (
                    <li
                      key={t}
                      className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{t}</span>
                      <Badge
                        variant="outline"
                        className={
                          p >= 80
                            ? "border-success/40 text-success"
                            : p < 60
                            ? "border-destructive/40 text-destructive"
                            : ""
                        }
                      >
                        {v.right}/{v.total} · {p}%
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={restart} variant="outline" className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" /> New session
              </Button>
              <Link to="/progress" className="flex-1">
                <Button className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
                  View progress
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== Active session =====
  if (session && current) {
    const pct = ((idx + (revealed ? 1 : 0)) / total) * 100;
    const isCorrect = revealed && evaluate();
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Flame className="h-5 w-5 text-primary" /> Practice session
            </h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="secondary" className="capitalize">
                {current.difficulty}
              </Badge>
              {current.topic && <Badge variant="outline">{current.topic}</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={restart}>
            End
          </Button>
        </div>

        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">
          Question {idx + 1} of {total}
        </p>

        <Card className="bg-gradient-card shadow-card">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold leading-snug">
              {current.question}
            </h2>

            {!isText && (
              <div className="mt-5 space-y-2">
                {current.options.map((opt, i) => {
                  const isOptCorrect = i === current.correct_index;
                  const isPicked = picked === i;
                  return (
                    <button
                      key={i}
                      onClick={() => !revealed && setPicked(i)}
                      disabled={revealed}
                      className={[
                        "w-full rounded-xl border p-4 text-left transition-smooth",
                        revealed && isOptCorrect && "border-success bg-success/10",
                        revealed &&
                          isPicked &&
                          !isOptCorrect &&
                          "border-destructive bg-destructive/10",
                        !revealed && isPicked && "border-primary bg-primary/5",
                        !revealed &&
                          !isPicked &&
                          "hover:border-primary hover:bg-accent/50",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">{opt}</span>
                        {revealed && isOptCorrect && (
                          <Check className="h-5 w-5 text-success" />
                        )}
                        {revealed && isPicked && !isOptCorrect && (
                          <X className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {isText && (
              <div className="mt-5 space-y-3">
                <Input
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  disabled={revealed}
                  placeholder="Type your answer…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !revealed) handleReveal();
                  }}
                />
                {revealed && (
                  <div
                    className={`rounded-xl border p-3 text-sm ${
                      isCorrect
                        ? "border-success bg-success/10"
                        : "border-destructive bg-destructive/10"
                    }`}
                  >
                    {isCorrect ? (
                      <span className="font-semibold text-success">Correct!</span>
                    ) : (
                      <>
                        <span className="font-semibold text-destructive">
                          Not quite.
                        </span>{" "}
                        Expected:{" "}
                        <span className="font-semibold">
                          {current.correct_answer}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {revealed && current.explanation && (
              <div className="mt-4 rounded-xl border bg-accent/30 p-4 text-sm">
                <span className="font-semibold">Explanation:</span>{" "}
                {current.explanation}
              </div>
            )}

            {!revealed ? (
              <Button
                onClick={handleReveal}
                className="mt-5 w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              >
                Check answer
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="mt-5 w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              >
                {idx + 1 === total ? "Finish session" : "Next question"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== Picker screen =====
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" /> Practice Weak Areas
        </h1>
        <p className="mt-1 text-muted-foreground">
          A focused session that pulls questions from your weak topics and adapts
          to your performance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Your weak topics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topicStats.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Take a few quizzes first so we can identify weak areas.
            </div>
          ) : (
            <>
              {weakTopics.length === 0 && (
                <p className="mb-3 text-sm text-muted-foreground">
                  No clearly weak topics yet — pick anything you'd like to drill.
                </p>
              )}
              <ul className="space-y-2">
                {topicStats.map((t) => {
                  const checked = selected.has(t.topic);
                  const weak = t.pct < 60;
                  return (
                    <li key={t.topic}>
                      <button
                        onClick={() => toggle(t.topic)}
                        className={[
                          "w-full rounded-xl border p-3 text-left transition-smooth",
                          checked
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/40 hover:bg-accent/50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded border ${
                                checked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/40"
                              }`}
                            >
                              {checked && <Check className="h-3.5 w-3.5" />}
                            </div>
                            <span className="font-medium text-sm">{t.topic}</span>
                            {weak && (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 text-destructive text-xs"
                              >
                                weak
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t.right}/{t.total} · {t.pct}%
                          </div>
                        </div>
                        <Progress value={t.pct} className="mt-2 h-1.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gradient-card shadow-card">
        <CardContent className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-primary shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Adaptive session</p>
              <p className="text-muted-foreground">
                {SESSION_SIZE} questions · prioritizes ones you've missed before
                · ramps difficulty as you go.
              </p>
            </div>
          </div>
          <Button
            onClick={startSession}
            disabled={building || selected.size === 0}
            className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
          >
            {building ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building…
              </>
            ) : (
              <>
                Start practice
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

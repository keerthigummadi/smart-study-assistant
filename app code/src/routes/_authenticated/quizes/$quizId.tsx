import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, X, Clock, Trophy, ArrowRight, RotateCcw, Sparkles, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId")({
  component: QuizPage,
  head: () => ({ meta: [{ title: "Quiz — Smart Study" }] }),
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

type AnswerRec = {
  question_id: string;
  topic: string | null;
  difficulty: string;
  is_correct: boolean;
  time_seconds: number;
};

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function QuizPage() {
  const { quizId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<{ title: string; difficulty: string } | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<AnswerRec[]>([]);
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [qSeconds, setQSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adaptiveLevel, setAdaptiveLevel] = useState<"easy" | "medium" | "hard">("medium");
  const streakRef = useRef({ correct: 0, wrong: 0 });

  useEffect(() => {
    (async () => {
      const [q, qq] = await Promise.all([
        supabase.from("quizzes").select("title,difficulty").eq("id", quizId).single(),
        supabase
          .from("quiz_questions")
          .select("id,question,options,correct_index,correct_answer,question_type,topic,difficulty,explanation")
          .eq("quiz_id", quizId)
          .order("position"),
      ]);
      if (q.data) {
        setQuiz(q.data);
        setAdaptiveLevel((q.data.difficulty as "easy" | "medium" | "hard") ?? "medium");
      }
      const list = (qq.data ?? []).map((x) => ({
        ...x,
        options: Array.isArray(x.options) ? (x.options as string[]) : [],
      }));
      setQuestions(list);
      setLoading(false);
    })();
  }, [quizId]);

  useEffect(() => {
    if (done || loading) return;
    const t = setInterval(() => {
      setSeconds((s) => s + 1);
      setQSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [done, loading]);

  // Adaptive: reorder upcoming questions based on streak
  useEffect(() => {
    if (idx === 0 || done) return;
    const c = streakRef.current.correct;
    const w = streakRef.current.wrong;
    let target: "easy" | "medium" | "hard" | null = null;
    if (c >= 2) {
      target = adaptiveLevel === "easy" ? "medium" : "hard";
      streakRef.current.correct = 0;
    } else if (w >= 2) {
      target = adaptiveLevel === "hard" ? "medium" : "easy";
      streakRef.current.wrong = 0;
    }
    if (!target || target === adaptiveLevel) return;
    setAdaptiveLevel(target);
    setQuestions((prev) => {
      const past = prev.slice(0, idx);
      const upcoming = prev.slice(idx);
      const matches = upcoming.filter((q) => q.difficulty === target);
      const rest = upcoming.filter((q) => q.difficulty !== target);
      return [...past, ...matches, ...rest];
    });
  }, [results, idx, done, adaptiveLevel]);

  const current = questions[idx];
  const total = questions.length;
  const score = results.filter((r) => r.is_correct).length;

  const evaluate = (): boolean => {
    if (!current) return false;
    if (current.question_type === "mcq" || current.question_type === "true_false") {
      return picked === current.correct_index;
    }
    if (!current.correct_answer) return false;
    return normalize(textAnswer) === normalize(current.correct_answer);
  };

  const handleReveal = () => {
    if (current.question_type === "mcq" || current.question_type === "true_false") {
      if (picked === null) return toast.error("Pick an answer first");
    } else if (!textAnswer.trim()) {
      return toast.error("Type your answer first");
    }
    setRevealed(true);
    const isCorrect = evaluate();
    if (isCorrect) streakRef.current.correct += 1;
    else streakRef.current.wrong += 1;
  };

  const handleNext = async () => {
    const isCorrect = evaluate();
    const rec: AnswerRec = {
      question_id: current.id,
      topic: current.topic,
      difficulty: current.difficulty,
      is_correct: isCorrect,
      time_seconds: qSeconds,
    };
    const nextResults = [...results, rec];
    setResults(nextResults);
    setPicked(null);
    setTextAnswer("");
    setRevealed(false);
    setQSeconds(0);

    if (idx + 1 < total) {
      setIdx(idx + 1);
    } else {
      setDone(true);
      const finalScore = nextResults.filter((r) => r.is_correct).length;
      const weakTopics = Array.from(
        new Set(nextResults.filter((r) => !r.is_correct && r.topic).map((r) => r.topic as string))
      );
      if (user) {
        await Promise.all([
          supabase.from("scores").insert({
            user_id: user.id,
            quiz_id: quizId,
            score: finalScore,
            total,
            duration_seconds: seconds,
            weak_topics: weakTopics,
          }),
          supabase.from("question_responses").insert(
            nextResults.map((r) => ({
              user_id: user.id,
              quiz_id: quizId,
              question_id: r.question_id,
              topic: r.topic,
              difficulty: r.difficulty,
              is_correct: r.is_correct,
              time_seconds: r.time_seconds,
            }))
          ),
          supabase.rpc("award_xp", { _xp: finalScore * 10 + (finalScore === total ? 25 : 0) }),
        ]);
      }
    }
  };

  const restart = () => {
    setIdx(0);
    setPicked(null);
    setTextAnswer("");
    setRevealed(false);
    setResults([]);
    setDone(false);
    setSeconds(0);
    setQSeconds(0);
    streakRef.current = { correct: 0, wrong: 0 };
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!current && !done) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground">No questions found for this quiz.</p>
          <Link to="/quizzes" className="mt-4 inline-block">
            <Button variant="outline">Back to quizzes</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    const pct = Math.round((score / Math.max(total, 1)) * 100);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const xp = score * 10 + (score === total ? 25 : 0);

    // weak topics aggregated
    const topicMap = new Map<string, { right: number; total: number }>();
    results.forEach((r) => {
      const t = r.topic ?? "General";
      const cur = topicMap.get(t) ?? { right: 0, total: 0 };
      cur.total += 1;
      if (r.is_correct) cur.right += 1;
      topicMap.set(t, cur);
    });
    const weakTopics = Array.from(topicMap.entries())
      .filter(([, v]) => v.right / v.total < 0.6)
      .sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total);

    return (
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden bg-gradient-card shadow-elegant">
          <div className="bg-gradient-hero p-8 text-center text-white">
            <Trophy className="mx-auto h-12 w-12" />
            <h1 className="mt-3 text-3xl font-black">Quiz complete!</h1>
            <p className="mt-1 text-white/90">{quiz?.title}</p>
          </div>
          <CardContent className="space-y-6 p-8">
            <div className="text-center">
              <div className="text-6xl font-black text-gradient-primary">{pct}%</div>
              <p className="mt-2 text-muted-foreground">
                {score} of {total} correct · {mins}m {secs}s
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                <Zap className="h-4 w-4" /> +{xp} XP earned
              </div>
            </div>
            <Progress value={pct} className="h-3" />

            {weakTopics.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> Weak topics to revise
                </h3>
                <ul className="space-y-1.5">
                  {weakTopics.slice(0, 5).map(([t, v]) => (
                    <li key={t} className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                      <span className="font-medium">{t}</span>
                      <Badge variant="outline">{v.right}/{v.total}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={restart} variant="outline" className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" /> Retry quiz
              </Button>
              <Button
                onClick={() => navigate({ to: "/dashboard" })}
                className="flex-1 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              >
                Back to dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pct = ((idx + (revealed ? 1 : 0)) / total) * 100;
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  const isText = current.question_type === "fill_blank" || current.question_type === "short_answer";
  const isCorrect = revealed && evaluate();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{quiz?.title}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="secondary" className="capitalize">{current.difficulty}</Badge>
            {current.topic && <Badge variant="outline">{current.topic}</Badge>}
            <Badge className="bg-primary/10 text-primary">{labelType(current.question_type)}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-mono">
          <Clock className="h-4 w-4 text-primary" /> {mins}:{secs}
        </div>
      </div>

      <Progress value={pct} className="h-2" />
      <p className="text-xs text-muted-foreground">Question {idx + 1} of {total}</p>

      <Card className="bg-gradient-card shadow-card">
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold leading-snug">{current.question}</h2>

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
                      revealed && isPicked && !isOptCorrect && "border-destructive bg-destructive/10",
                      !revealed && isPicked && "border-primary bg-primary/5",
                      !revealed && !isPicked && "hover:border-primary hover:bg-accent/50",
                    ].filter(Boolean).join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{opt}</span>
                      {revealed && isOptCorrect && <Check className="h-5 w-5 text-success" />}
                      {revealed && isPicked && !isOptCorrect && <X className="h-5 w-5 text-destructive" />}
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
                onKeyDown={(e) => { if (e.key === "Enter" && !revealed) handleReveal(); }}
              />
              {revealed && (
                <div className={`rounded-xl border p-3 text-sm ${isCorrect ? "border-success bg-success/10" : "border-destructive bg-destructive/10"}`}>
                  {isCorrect ? (
                    <span className="font-semibold text-success">Correct!</span>
                  ) : (
                    <>
                      <span className="font-semibold text-destructive">Not quite.</span>{" "}
                      Expected: <span className="font-semibold">{current.correct_answer}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {revealed && current.explanation && (
            <div className="mt-4 rounded-xl border bg-accent/30 p-4 text-sm">
              <span className="font-semibold">Explanation:</span> {current.explanation}
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
              {idx + 1 === total ? "Finish quiz" : "Next question"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function labelType(t: string) {
  switch (t) {
    case "mcq": return "Multiple choice";
    case "true_false": return "True / False";
    case "fill_blank": return "Fill the blank";
    case "short_answer": return "Short answer";
    default: return t;
  }
}

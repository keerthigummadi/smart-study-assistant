import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Trophy, Target, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
  head: () => ({ meta: [{ title: "Progress — Smart Study" }] }),
});

type Score = { id: string; score: number; total: number; duration_seconds: number | null; created_at: string; quiz_id: string | null };
type Resp = { topic: string | null; is_correct: boolean; time_seconds: number; created_at: string };

function ProgressPage() {
  const [scores, setScores] = useState<Score[]>([]);
  const [resps, setResps] = useState<Resp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("scores").select("id,score,total,duration_seconds,created_at,quiz_id").order("created_at", { ascending: false }),
      supabase.from("question_responses").select("topic,is_correct,time_seconds,created_at").limit(500),
    ]).then(([s, r]) => {
      setScores(s.data ?? []);
      setResps(r.data ?? []);
      setLoading(false);
    });
  }, []);

  const totalAttempts = scores.length;
  const avgPct = totalAttempts
    ? Math.round(scores.reduce((a, s) => a + (s.score / Math.max(s.total, 1)) * 100, 0) / totalAttempts)
    : 0;
  const best = scores.reduce((m, s) => Math.max(m, Math.round((s.score / Math.max(s.total, 1)) * 100)), 0);
  const totalTime = scores.reduce((a, s) => a + (s.duration_seconds ?? 0), 0);
  const avgTimePerQ = resps.length ? Math.round(resps.reduce((a, r) => a + r.time_seconds, 0) / resps.length) : 0;

  const stats = [
    { label: "Attempts", value: totalAttempts, icon: Target },
    { label: "Average score", value: `${avgPct}%`, icon: TrendingUp },
    { label: "Best score", value: `${best}%`, icon: Trophy },
    { label: "Avg s/question", value: `${avgTimePerQ}s`, icon: Clock },
  ];

  // chart: score over time (oldest -> newest)
  const lineData = useMemo(() => {
    return [...scores]
      .reverse()
      .map((s, i) => ({
        n: i + 1,
        pct: Math.round((s.score / Math.max(s.total, 1)) * 100),
        date: new Date(s.created_at).toLocaleDateString(),
      }));
  }, [scores]);

  // topic breakdown
  const topicStats = useMemo(() => {
    const map = new Map<string, { right: number; total: number }>();
    resps.forEach((r) => {
      if (!r.topic) return;
      const cur = map.get(r.topic) ?? { right: 0, total: 0 };
      cur.total += 1;
      if (r.is_correct) cur.right += 1;
      map.set(r.topic, cur);
    });
    return [...map.entries()]
      .map(([topic, v]) => ({ topic, pct: Math.round((v.right / v.total) * 100), total: v.total }))
      .sort((a, b) => a.pct - b.pct);
  }, [resps]);

  const weakTopics = topicStats.filter((t) => t.pct < 60).slice(0, 5);
  const strongTopics = [...topicStats].reverse().filter((t) => t.pct >= 80).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Your progress</h1>
        <p className="mt-1 text-muted-foreground">Charts, weak topics and time analytics.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-gradient-card shadow-card">
            <CardContent className="p-5">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <s.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="text-2xl font-black md:text-3xl">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Score trend</CardTitle></CardHeader>
        <CardContent>
          {lineData.length === 0 ? (
            <Empty text="No data yet — take a quiz to see your trend." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="n" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v) => [`${v}%`, "Score"]}
                  />
                  <Line type="monotone" dataKey="pct" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--primary)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-destructive" />Weak topics</CardTitle></CardHeader>
          <CardContent>
            {weakTopics.length === 0 ? (
              <Empty text="No weak topics — nice work!" />
            ) : (
              <ul className="space-y-3">
                {weakTopics.map((t) => (
                  <li key={t.topic}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{t.topic}</span>
                      <Badge variant="outline">{t.pct}%</Badge>
                    </div>
                    <Progress value={t.pct} className="h-2" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-success" />Strong topics</CardTitle></CardHeader>
          <CardContent>
            {strongTopics.length === 0 ? (
              <Empty text="Build strength by retaking quizzes." />
            ) : (
              <ul className="space-y-3">
                {strongTopics.map((t) => (
                  <li key={t.topic}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{t.topic}</span>
                      <Badge variant="outline" className="border-success/40 text-success">{t.pct}%</Badge>
                    </div>
                    <Progress value={t.pct} className="h-2" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All topics — accuracy</CardTitle></CardHeader>
        <CardContent>
          {topicStats.length === 0 ? (
            <Empty text="Take more quizzes to see topic breakdown." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicStats} margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="topic" stroke="var(--muted-foreground)" fontSize={11} angle={-20} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v) => [`${v}%`, "Accuracy"]}
                  />
                  <Bar dataKey="pct" radius={[8, 8, 0, 0]}>
                    {topicStats.map((t, i) => (
                      <Cell key={i} fill={t.pct >= 80 ? "var(--success)" : t.pct >= 60 ? "var(--primary)" : "var(--destructive)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Quiz history</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : scores.length === 0 ? (
            <Empty text="No quiz attempts yet." />
          ) : (
            <ul className="space-y-3">
              {scores.map((s) => {
                const pct = Math.round((s.score / Math.max(s.total, 1)) * 100);
                return (
                  <li key={s.id} className="space-y-2 rounded-xl border p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{s.score}/{s.total} ({pct}%)</span>
                      <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center">Total study time: {Math.round(totalTime / 60)} minutes</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

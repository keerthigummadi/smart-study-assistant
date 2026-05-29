import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Sparkles, Loader2, Clock, Target, Lightbulb } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plan")({
  component: PlanPage,
  head: () => ({ meta: [{ title: "Study Plan — Smart Study" }] }),
});

type Day = { day: number; focus: string; goals: string[]; activities: string[]; estimated_minutes: number };
type Plan = { title: string; summary: string; days: Day[]; tips: string[] };

function PlanPage() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("study_plans")
      .select("plan,title")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.plan) setPlan(data.plan as unknown as Plan);
        setLoading(false);
      });
  }, [user]);

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const [scoresRes, respRes] = await Promise.all([
        supabase.from("scores").select("score,total,weak_topics").order("created_at", { ascending: false }).limit(20),
        supabase.from("question_responses").select("topic,is_correct").limit(200),
      ]);
      const scores = scoresRes.data ?? [];
      const avgScore = scores.length
        ? Math.round(scores.reduce((a, s) => a + (s.score / Math.max(s.total, 1)) * 100, 0) / scores.length)
        : 0;
      const topicMap = new Map<string, { right: number; total: number }>();
      (respRes.data ?? []).forEach((r) => {
        if (!r.topic) return;
        const cur = topicMap.get(r.topic) ?? { right: 0, total: 0 };
        cur.total += 1;
        if (r.is_correct) cur.right += 1;
        topicMap.set(r.topic, cur);
      });
      const weakTopics = [...topicMap.entries()].filter(([, v]) => v.total >= 2 && v.right / v.total < 0.6).map(([k]) => k).slice(0, 5);
      const strongTopics = [...topicMap.entries()].filter(([, v]) => v.total >= 2 && v.right / v.total >= 0.8).map(([k]) => k).slice(0, 5);

      const { data, error } = await supabase.functions.invoke("study-plan", {
        body: { weakTopics, strongTopics, avgScore, days: 7 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPlan(data as Plan);
      await supabase.from("study_plans").insert({ user_id: user.id, title: data.title, plan: data });
      toast.success("New study plan ready!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="text-center text-muted-foreground py-20">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-primary" />
            Your Study Plan
          </h1>
          <p className="mt-1 text-muted-foreground">A personalized 7-day plan from your performance.</p>
        </div>
        <Button onClick={generate} disabled={generating} className="bg-gradient-primary text-primary-foreground shadow-glow">
          {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {plan ? "Regenerate plan" : "Generate plan"}
        </Button>
      </div>

      {!plan ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No plan yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Generate one based on your weak topics.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-gradient-card shadow-elegant overflow-hidden">
            <div className="bg-gradient-hero p-6 text-white">
              <h2 className="text-xl font-bold">{plan.title}</h2>
              <p className="mt-1 text-sm text-white/90">{plan.summary}</p>
            </div>
          </Card>

          <div className="grid gap-4">
            {plan.days?.map((d) => (
              <Card key={d.day} className="bg-gradient-card shadow-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-base">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
                        {d.day}
                      </span>
                      <span>{d.focus}</span>
                    </CardTitle>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />{d.estimated_minutes}m
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <Target className="h-3 w-3" />Goals
                    </div>
                    <ul className="space-y-1 text-sm">
                      {d.goals?.map((g, i) => <li key={i} className="flex gap-2"><span className="text-primary">•</span>{g}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <Sparkles className="h-3 w-3" />Activities
                    </div>
                    <ul className="space-y-1 text-sm">
                      {d.activities?.map((a, i) => <li key={i} className="flex gap-2"><span className="text-primary">→</span>{a}</li>)}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {plan.tips?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4 text-primary" />Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {plan.tips.map((t, i) => (
                    <li key={i} className="rounded-lg border bg-accent/30 p-3">{t}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

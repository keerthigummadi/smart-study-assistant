import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/quizzes/")({
  component: QuizList,
  head: () => ({ meta: [{ title: "Quizzes — Smart Study" }] }),
});

type Quiz = { id: string; title: string; difficulty: string; created_at: string };

function QuizList() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("quizzes")
      .select("id,title,difficulty,created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setQuizzes(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your quizzes</h1>
          <p className="mt-1 text-muted-foreground">Practice with AI-generated MCQs.</p>
        </div>
        <Link to="/upload">
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />New quiz
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-16">Loading…</div>
      ) : quizzes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Brain className="mb-3 h-10 w-10 text-primary" />
            <h3 className="text-lg font-semibold">No quizzes yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Upload material to generate your first quiz.</p>
            <Link to="/upload" className="mt-4">
              <Button className="bg-gradient-primary text-primary-foreground shadow-glow">Upload material</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => (
            <Link key={q.id} to="/quizzes/$quizId" params={{ quizId: q.id }} className="group">
              <Card className="h-full overflow-hidden bg-gradient-card shadow-card transition-smooth hover:-translate-y-1 hover:shadow-elegant">
                <CardContent className="p-5">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                    <Brain className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold leading-tight">{q.title}</h3>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="secondary" className="capitalize">{q.difficulty}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(q.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

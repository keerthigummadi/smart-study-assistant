import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Flame, Zap, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  component: LeaderboardPage,
  head: () => ({ meta: [{ title: "Leaderboard — Smart Study" }] }),
});

type Row = {
  user_id: string;
  xp: number;
  level: number;
  current_streak: number;
  best_streak: number;
  display_name: string | null;
};

function LeaderboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: stats } = await supabase
        .from("user_stats")
        .select("user_id,xp,level,current_streak,best_streak")
        .order("xp", { ascending: false })
        .limit(50);
      const ids = (stats ?? []).map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,display_name")
        .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name]));
      setRows((stats ?? []).map((s) => ({ ...s, display_name: map.get(s.user_id) ?? "Student" })));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-center text-muted-foreground py-20">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" />Leaderboard
        </h1>
        <p className="mt-1 text-muted-foreground">Top learners by XP this season.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Be the first on the board — take a quiz to earn XP!
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((r, i) => {
                const isMe = r.user_id === user?.id;
                return (
                  <li key={r.user_id} className={`flex items-center justify-between gap-3 py-3 ${isMe ? "rounded-lg bg-primary/5 px-3" : ""}`}>
                    <div className="flex items-center gap-3">
                      <RankBadge rank={i + 1} />
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          {r.display_name}
                          {isMe && <Badge variant="outline" className="text-xs">You</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1"><Crown className="h-3 w-3" />Lv {r.level}</span>
                          <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-orange-500" />{r.current_streak}d</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-primary">
                      <Zap className="h-4 w-4" />{r.xp.toLocaleString()}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors = ["bg-yellow-500", "bg-gray-400", "bg-orange-600"];
  const cls = rank <= 3 ? colors[rank - 1] : "bg-muted";
  return (
    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${rank <= 3 ? "text-white " + cls : "text-muted-foreground " + cls}`}>
      {rank}
    </div>
  );
}

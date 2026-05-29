import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Sparkles, Loader2, Bot, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tutor")({
  component: TutorPage,
  head: () => ({ meta: [{ title: "AI Tutor — Smart Study" }] }),
});

type Msg = { role: "user" | "assistant"; content: string; id?: string };

function TutorPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [m, s] = await Promise.all([
        supabase.from("tutor_messages").select("id,role,content").order("created_at").limit(50),
        supabase.from("scores").select("weak_topics").order("created_at", { ascending: false }).limit(10),
      ]);
      const msgs = (m.data ?? []).map((x) => ({
        id: x.id,
        role: x.role as "user" | "assistant",
        content: x.content,
      }));
      setMessages(msgs);
      const topics = new Set<string>();
      (s.data ?? []).forEach((row) => {
        const wt = row.weak_topics;
        if (Array.isArray(wt)) wt.forEach((t) => typeof t === "string" && topics.add(t));
      });
      setWeakTopics([...topics].slice(0, 5));
    })();
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || !user || sending) return;
    setInput("");
    const userMsg: Msg = { role: "user", content };
    const next = [...messages, userMsg];
    setMessages(next);
    setSending(true);

    await supabase.from("tutor_messages").insert({ user_id: user.id, role: "user", content });

    try {
      const { data, error } = await supabase.functions.invoke("tutor-chat", {
        body: { messages: next.map((m) => ({ role: m.role, content: m.content })), weakTopics },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reply = data.reply as string;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      await supabase.from("tutor_messages").insert({ user_id: user.id, role: "assistant", content: reply });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const suggestions = [
    "Explain photosynthesis in simple terms",
    "Quiz me on my weak topics",
    "Give me a study tip for memorization",
  ];

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Tutor</h1>
          <p className="text-xs text-muted-foreground">Ask anything — I learn from your weak topics.</p>
        </div>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Sparkles className="mb-3 h-10 w-10 text-primary" />
              <h3 className="font-semibold">Start a conversation</h3>
              <p className="mt-1 text-sm text-muted-foreground">Try one of these:</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs hover:border-primary hover:bg-accent transition-smooth"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-gradient-primary text-primary-foreground" : "bg-muted"}`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-muted px-4 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <CardContent className="border-t p-3">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your tutor anything…"
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()} className="bg-gradient-primary text-primary-foreground shadow-glow">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

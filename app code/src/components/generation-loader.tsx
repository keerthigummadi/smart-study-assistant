"use client";

import { useState, useEffect, useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Brain,
  Sparkles,
  Save,
  LayoutList,
  CheckCircle2,
  Loader2,
  Lightbulb,
} from "lucide-react";

const TIPS = [
  "Spaced repetition boosts long-term retention by up to 200%.",
  "Teaching what you learn to someone else improves recall by 90%.",
  "The brain forms stronger memories during active recall than re-reading.",
  "Sleep after studying helps consolidate memories into long-term storage.",
  "Breaking study sessions into chunks (Pomodoro) improves focus.",
  "Mixed practice (varying topics) beats blocked practice for retention.",
  "Writing notes by hand activates more brain regions than typing.",
  "Quizzing yourself is one of the most effective study strategies.",
  "Difficulty is desirable — struggling a little while learning is good.",
  "AI-generated questions adapt to your weak areas for targeted practice.",
];

type Phase = 1 | 2 | 3;

interface GenerationLoaderProps {
  phase: Phase | null;
  mode: "quiz" | "flashcards";
}

const PHASES: { id: Phase; label: string; icon: typeof Save; description: string }[] = [
  { id: 1, label: "Saving", icon: Save, description: "Storing your study material" },
  { id: 2, label: "Generating", icon: Brain, description: "AI is crafting questions" },
  { id: 3, label: "Organizing", icon: LayoutList, description: "Building your study set" },
];

export function GenerationLoader({ phase, mode }: GenerationLoaderProps) {
  const [tipIndex, setTipIndex] = useState(1);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (phase) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    if (!phase) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [phase]);

  const progressValue = useMemo(() => {
    if (!phase) return 0;
    return Math.min(((phase - 0.5) / 3) * 100, 100);
  }, [phase]);

  const activePhase = phase ?? 0;

  if (!visible && !phase) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center rounded-[inherit] p-6 transition-opacity duration-300",
        phase ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 rounded-[inherit] bg-background/90 backdrop-blur-sm" />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center space-y-8 text-center">
        {/* Animated hero icon */}
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-primary shadow-glow">
            {phase === 3 ? (
              <Sparkles className="h-10 w-10 text-primary-foreground animate-bounce" />
            ) : (
              <Brain className="h-10 w-10 text-primary-foreground animate-pulse" />
            )}
          </div>
          {/* Orbiting dots */}
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: "8s" }}>
            <div className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary" />
          </div>
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: "12s", animationDirection: "reverse" }}>
            <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary-glow" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h3 className="text-xl font-bold tracking-tight">
            {phase === 3 ? "Almost ready!" : "AI is working…"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {phase === 1
              ? "Hold tight while we save your material."
              : phase === 2
              ? `Generating ${mode === "quiz" ? "quiz questions" : "flashcards"} with AI…`
              : "Putting everything together for you."}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full space-y-2">
          <Progress value={progressValue} className="h-2.5 w-full" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>{Math.round(progressValue)}%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Step timeline */}
        <div className="w-full">
          <div className="relative flex items-center justify-between">
            {/* Connector line */}
            <div className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-muted">
              <div
                className="h-full bg-gradient-primary transition-all duration-700 ease-out"
                style={{ width: `${((activePhase) / 3) * 100}%` }}
              />
            </div>

            {PHASES.map((p) => {
              const isDone = activePhase > p.id;
              const isCurrent = activePhase === p.id;
              const Icon = p.icon;
              return (
                <div key={p.id} className="relative z-10 flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500",
                      isDone
                        ? "border-success bg-success text-success-foreground"
                        : isCurrent
                        ? "border-primary bg-primary text-primary-foreground shadow-glow scale-110"
                        : "border-muted bg-background text-muted-foreground"
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isCurrent ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="space-y-0.5 text-center">
                    <p
                      className={cn(
                        "text-xs font-semibold transition-colors",
                        isDone || isCurrent ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {p.label}
                    </p>
                    <p className="hidden text-[10px] text-muted-foreground sm:block">
                      {p.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rotating tip */}
        <div className="flex items-start gap-2 rounded-xl border bg-accent/40 px-4 py-3 text-left">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground transition-opacity duration-500">
            {TIPS[tipIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

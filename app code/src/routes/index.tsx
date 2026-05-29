import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Brain, Layers, Zap, Target, Clock, ArrowRight, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Smart Study Assistant — Turn notes into AI quizzes & flashcards" },
      { name: "description", content: "Upload your study material and get instant AI-generated quizzes and flashcards. Built for students who want to learn faster." },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">Smart Study</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
              Get started
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-20 top-20 h-80 w-80 rounded-full bg-primary/30 blur-3xl animate-blob" />
          <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-primary-glow/30 blur-3xl animate-blob" style={{ animationDelay: "3s" }} />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-24 text-center md:pt-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/60 px-4 py-1.5 text-xs font-medium backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by AI · Built for students
          </div>
          <h1 className="text-4xl font-black tracking-tight md:text-6xl lg:text-7xl">
            Turn your notes into{" "}
            <span className="text-gradient-primary">smart quizzes</span> &{" "}
            <span className="text-gradient-primary">flashcards</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            Upload PDFs or paste your notes — get instant MCQ quizzes, flip-card decks, and progress
            tracking. Active learning, simplified.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/auth">
              <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-90 group">
                Start studying free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline">
                <GraduationCap className="mr-2 h-4 w-4" />
                I'm a student
              </Button>
            </Link>
          </div>

          {/* Stat cards */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { v: "10s", l: "to a quiz" },
              { v: "AI", l: "powered MCQs" },
              { v: "∞", l: "flashcards" },
              { v: "100%", l: "free to start" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border bg-gradient-card p-4 shadow-card">
                <div className="text-2xl font-black text-gradient-primary md:text-3xl">{s.v}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold md:text-4xl">Everything you need to learn faster</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            From notes to mastery in minutes — backed by AI that understands your material.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            { icon: Brain, title: "AI Quiz Generator", desc: "Multiple-choice questions with explanations and difficulty levels — easy, medium, hard.", grad: "from-primary to-primary-glow" },
            { icon: Layers, title: "Smart Flashcards", desc: "Auto-generated cards with smooth flip animations for spaced repetition.", grad: "from-primary-glow to-primary" },
            { icon: Clock, title: "Timed Quizzes", desc: "Practice under exam conditions with built-in timers and instant feedback.", grad: "from-primary to-primary-glow" },
            { icon: Target, title: "Weak-Topic Insights", desc: "We highlight where you struggle so you can revise smarter.", grad: "from-primary-glow to-primary" },
            { icon: Zap, title: "Instant Feedback", desc: "Know what you got right — and why — the moment you answer.", grad: "from-primary to-primary-glow" },
            { icon: Sparkles, title: "Beautiful Dashboard", desc: "Track materials, quizzes, scores, and progress in one clean place.", grad: "from-primary-glow to-primary" },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border bg-gradient-card p-6 shadow-card transition-smooth hover:-translate-y-1 hover:shadow-elegant"
            >
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${f.grad} shadow-glow`}>
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-hero p-10 text-center shadow-elegant md:p-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -left-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          </div>
          <h2 className="relative text-3xl font-black text-white md:text-5xl">
            Ready to study smarter?
          </h2>
          <p className="relative mx-auto mt-3 max-w-lg text-white/90">
            Join students turning passive notes into active learning with AI.
          </p>
          <div className="relative mt-8">
            <Link to="/auth">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 shadow-glow">
                Create free account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Smart Study Assistant · Built for learners</p>
      </footer>
    </div>
  );
}

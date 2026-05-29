import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Upload as UploadIcon, FileText, Loader2, Sparkles, Brain, Layers, AlertCircle, CheckCircle2 } from "lucide-react";
import { GenerationLoader } from "@/components/generation-loader";

const ALL_TYPES = [
  { id: "mcq", label: "Multiple choice" },
  { id: "true_false", label: "True / False" },
  { id: "fill_blank", label: "Fill the blank" },
  { id: "short_answer", label: "Short answer" },
] as const;
type QType = typeof ALL_TYPES[number]["id"];

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
  head: () => ({ meta: [{ title: "Upload — Smart Study" }] }),
});

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_TEXT_CHARS = 100;
const MAX_TEXT_CHARS = 50000;

async function extractPdfText(file: File): Promise<string> {
  // Dynamic import keeps pdfjs out of the initial bundle
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker (Vite handles the ?url import)
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const pageLimit = Math.min(doc.numPages, 100);
  for (let i = 1; i <= pageLimit; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items
      .map((it: unknown) => (it as { str?: string }).str ?? "")
      .join(" ");
    parts.push(pageText);
  }
  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

type ParseResult = { text: string; warning?: string };

async function parseFile(file: File): Promise<ParseResult> {
  if (file.size === 0) throw new Error("File is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too large (max 10 MB).");

  const name = file.name.toLowerCase();
  const isTxt = name.endsWith(".txt") || file.type === "text/plain";
  const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";

  if (!isTxt && !isPdf) {
    throw new Error("Unsupported file type. Upload a .pdf or .txt file.");
  }

  let text = "";
  if (isTxt) {
    try {
      text = await file.text();
    } catch {
      throw new Error("Couldn't read the text file — it may be corrupted.");
    }
  } else {
    try {
      text = await extractPdfText(file);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (/password/i.test(msg)) throw new Error("This PDF is password-protected.");
      if (/invalid|corrupt|missing|InvalidPDFException/i.test(msg)) {
        throw new Error("Couldn't read this PDF — the file looks corrupted.");
      }
      throw new Error("Couldn't extract text from this PDF. It may be a scanned image — try pasting the content instead.");
    }
  }

  text = text.replace(/\u0000/g, "").trim();
  if (text.length === 0) {
    throw new Error("No readable text found in the file. If it's a scanned PDF, paste the content instead.");
  }
  if (text.length < MIN_TEXT_CHARS) {
    throw new Error(`Only ${text.length} characters of text were extracted — too short to generate quality questions.`);
  }

  let warning: string | undefined;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    warning = `Trimmed to ${MAX_TEXT_CHARS.toLocaleString()} characters to keep generation fast.`;
  }
  return { text, warning };
}

function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [count, setCount] = useState(8);
  const [mode, setMode] = useState<"quiz" | "flashcards">("quiz");
  const [qTypes, setQTypes] = useState<QType[]>(["mcq", "true_false"]);
  const [generationPhase, setGenerationPhase] = useState<1 | 2 | 3 | null>(null);
  const [parsing, setParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [tab, setTab] = useState<"paste" | "file">("paste");

  const toggleType = (t: QType) => {
    setQTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const handleFile = async (f: File) => {
    setFileError(null);
    setParsing(true);
    try {
      const { text, warning } = await parseFile(f);
      setFile(f);
      setContent(text);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      toast.success(`Loaded ${text.length.toLocaleString()} characters from ${f.name}`);
      if (warning) toast.info(warning);
    } catch (e) {
      const msg = (e as Error).message;
      setFile(null);
      setFileError(msg);
      toast.error(msg, {
        description: "You can paste the content manually instead.",
        action: { label: "Paste instead", onClick: () => setTab("paste") },
      });
    } finally {
      setParsing(false);
    }
  };



  const handleGenerate = async () => {
    if (!user) return;
    const trimmed = content.trim();
    if (trimmed.length < MIN_TEXT_CHARS) {
      toast.error(`Please paste or upload at least ${MIN_TEXT_CHARS} characters of study material.`);
      return;
    }

    if (!title.trim()) {
      toast.error("Give your material a title.");
      return;
    }
    setGenerationPhase(1);
    try {
      // 1. save material
      const { data: material, error: mErr } = await supabase
        .from("materials")
        .insert({
          user_id: user.id,
          title: title.trim(),
          content: content.trim(),
          source_type: file ? "file" : "paste",
        })
        .select()
        .single();
      if (mErr) throw mErr;

      // 2. call AI
      setGenerationPhase(2);
      const { data, error: fErr } = await supabase.functions.invoke("generate-study", {
        body: { content: content.trim(), mode, difficulty, count, types: mode === "quiz" ? qTypes : undefined },
      });
      if (fErr) throw fErr;
      if (data?.error) throw new Error(data.error);

      // 3. organize results
      setGenerationPhase(3);
      if (mode === "quiz") {
        const { data: quiz, error: qErr } = await supabase
          .from("quizzes")
          .insert({
            user_id: user.id,
            material_id: material.id,
            title: data.title || title,
            difficulty,
          })
          .select()
          .single();
        if (qErr) throw qErr;

        type GenQ = {
          question: string;
          options?: string[];
          correct_index?: number;
          correct_answer?: string;
          explanation?: string;
          question_type?: string;
          topic?: string;
          difficulty?: string;
        };
        const questions = (data.questions ?? []).map((q: GenQ, i: number) => ({
          quiz_id: quiz.id,
          question: q.question,
          options: q.options ?? [],
          correct_index: q.correct_index ?? 0,
          correct_answer: q.correct_answer ?? null,
          question_type: q.question_type ?? "mcq",
          topic: q.topic ?? null,
          difficulty: q.difficulty ?? difficulty,
          explanation: q.explanation ?? null,
          position: i,
        }));
        if (questions.length === 0) throw new Error("No questions generated");
        const { error: qqErr } = await supabase.from("quiz_questions").insert(questions);
        if (qqErr) throw qqErr;
        toast.success(`Generated ${questions.length} questions!`);
        navigate({ to: "/quizzes/$quizId", params: { quizId: quiz.id } });
      } else {
        const cards = (data.flashcards ?? []).map((c: { front: string; back: string; topic?: string; difficulty?: string }) => ({
          user_id: user.id,
          material_id: material.id,
          front: c.front,
          back: c.back,
          topic: c.topic ?? null,
          difficulty: c.difficulty ?? "medium",
        }));
        if (cards.length === 0) throw new Error("No flashcards generated");
        const { error: fcErr } = await supabase.from("flashcards").insert(cards);
        if (fcErr) throw fcErr;
        toast.success(`Generated ${cards.length} flashcards!`);
        navigate({ to: "/flashcards" });
      }
    } catch (e) {
      setGenerationPhase(null);
      toast.error((e as Error).message);
    } finally {
      setGenerationPhase(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload study material</h1>
        <p className="mt-1 text-muted-foreground">Drop a file or paste your notes — we'll do the rest.</p>
      </div>

      <Card className="relative overflow-hidden">
        <CardContent className="space-y-5 p-6">
          <GenerationLoader phase={generationPhase} mode={mode} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as "paste" | "file")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="paste"><FileText className="mr-2 h-4 w-4" />Paste notes</TabsTrigger>
              <TabsTrigger value="file"><UploadIcon className="mr-2 h-4 w-4" />Upload file</TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-4">
              <Label htmlFor="content">Your notes</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste lecture notes, textbook excerpts, or any study material here..."
                className="mt-2 min-h-[240px]"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {content.length.toLocaleString()} characters
                {content.length > 0 && content.length < MIN_TEXT_CHARS && (
                  <span className="ml-2 text-destructive">(need at least {MIN_TEXT_CHARS})</span>
                )}
              </p>
            </TabsContent>

            <TabsContent value="file" className="mt-4">
              <label className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-smooth ${parsing ? "cursor-wait opacity-70" : "cursor-pointer hover:border-primary hover:bg-accent/50"} ${fileError ? "border-destructive/50 bg-destructive/5" : "bg-gradient-subtle"}`}>
                {parsing ? (
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                ) : file ? (
                  <CheckCircle2 className="mb-3 h-8 w-8 text-success" />
                ) : (
                  <UploadIcon className="mb-3 h-8 w-8 text-primary" />
                )}
                <span className="font-medium">
                  {parsing ? "Reading file…" : file ? file.name : "Click to upload"}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  PDF or TXT · max 10 MB · text is extracted in your browser
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  disabled={parsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) handleFile(f);
                  }}
                />
              </label>

              {fileError && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">{fileError}</p>
                    <button
                      type="button"
                      onClick={() => setTab("paste")}
                      className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Paste the content instead →
                    </button>
                  </div>
                </div>
              )}

              {file && !fileError && content && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Loaded {content.length.toLocaleString()} characters. Switch to "Paste notes" to edit before generating.
                </p>
              )}
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Biology — Chapter 4: Cell Structure"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>What to generate</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "quiz" | "flashcards")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quiz"><Brain className="mr-2 inline h-4 w-4" />Quiz (MCQ)</SelectItem>
                  <SelectItem value="flashcards"><Layers className="mr-2 inline h-4 w-4" />Flashcards</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="count">Count</Label>
              <Input
                id="count"
                type="number"
                min={5}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
          </div>

          {mode === "quiz" && (
            <div className="space-y-2">
              <Label>Question types</Label>
              <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/30 p-3">
                {ALL_TYPES.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-smooth hover:border-primary">
                    <Checkbox
                      checked={qTypes.includes(t.id)}
                      onCheckedChange={() => toggleType(t.id)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Pick one or more question formats. AI will mix them.</p>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!!generationPhase}
            size="lg"
            className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
          >
            {!!generationPhase ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Generate {mode === "quiz" ? "Quiz" : "Flashcards"}</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

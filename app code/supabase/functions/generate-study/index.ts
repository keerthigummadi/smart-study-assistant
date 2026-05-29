// Generate quizzes (multiple question types + topics) and flashcards from study material.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, mode, difficulty = "medium", count = 8, types } = await req.json();
    if (!content || typeof content !== "string") {
      return json({ error: "content required" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    const trimmed = content.slice(0, 12000);
    const allowedTypes: string[] = Array.isArray(types) && types.length
      ? types
      : ["mcq", "true_false", "fill_blank", "short_answer"];

    const tools = mode === "flashcards"
      ? [{
          type: "function",
          function: {
            name: "create_flashcards",
            description: "Create study flashcards from material",
            parameters: {
              type: "object",
              properties: {
                flashcards: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      front: { type: "string" },
                      back: { type: "string" },
                      topic: { type: "string", description: "Short topic tag (2-4 words)" },
                      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                    },
                    required: ["front", "back", "topic"],
                  },
                },
              },
              required: ["flashcards"],
            },
          },
        }]
      : [{
          type: "function",
          function: {
            name: "create_quiz",
            description: "Create a mixed quiz with several question types",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question_type: {
                        type: "string",
                        enum: ["mcq", "true_false", "fill_blank", "short_answer"],
                      },
                      question: { type: "string" },
                      options: {
                        type: "array",
                        items: { type: "string" },
                        description: "4 options for mcq, [\"True\",\"False\"] for true_false, empty for fill/short",
                      },
                      correct_index: {
                        type: "integer",
                        description: "Index of correct option for mcq/true_false (0-based). Use 0 for fill/short.",
                      },
                      correct_answer: {
                        type: "string",
                        description: "Exact answer for fill_blank/short_answer (lowercase, concise).",
                      },
                      explanation: {
                        type: "string",
                        description: "Concise student-friendly: why correct is right and why others (if any) are wrong.",
                      },
                      topic: { type: "string", description: "Short topic tag (2-4 words)" },
                      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                    },
                    required: ["question_type", "question", "explanation", "topic", "difficulty"],
                  },
                },
              },
              required: ["title", "questions"],
            },
          },
        }];

    const toolName = mode === "flashcards" ? "create_flashcards" : "create_quiz";
    const systemPrompt = mode === "flashcards"
      ? `You are an expert tutor. Create ${count} concise, high-quality flashcards from the study material. Each has a clear front, back, and a short topic tag. Vary difficulty.`
      : `You are an expert tutor. Generate exactly ${count} questions from the material at base difficulty "${difficulty}". Mix these question types: ${allowedTypes.join(", ")}.

Rules:
- mcq: 4 distinct options, set correct_index (0-3).
- true_false: options=["True","False"], correct_index 0 or 1.
- fill_blank: question contains "____" for the blank, correct_answer is the missing word/phrase (lowercase), options=[].
- short_answer: open question, correct_answer is the expected concise answer (lowercase), options=[].
- Always set a short topic tag (2-4 words) and difficulty (easy|medium|hard).
- Explanation is 1-3 sentences: state why the correct answer is right; for mcq also briefly note why a tempting wrong option is wrong.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Study material:\n\n${trimmed}` },
        ],
        tools,
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("AI gateway error", res.status, text);
      if (res.status === 429) return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
      if (res.status === 402) return json({ error: "AI credits exhausted. Add credits in Lovable workspace settings." }, 402);
      return json({ error: "AI request failed" }, 500);
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return json({ error: "AI returned no result" }, 500);
    const args = JSON.parse(toolCall.function.arguments);
    return json(args);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Generate a personalized 7-day study plan from weak topics + recent performance.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { weakTopics = [], strongTopics = [], avgScore = 0, days = 7 } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    const tools = [{
      type: "function",
      function: {
        name: "create_study_plan",
        description: "Create a day-by-day personalized study plan",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string", description: "1-2 sentence overview" },
            days: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "integer" },
                  focus: { type: "string", description: "Topic / theme of the day" },
                  goals: { type: "array", items: { type: "string" } },
                  activities: { type: "array", items: { type: "string" }, description: "Concrete tasks: review flashcards, take quiz on X, etc." },
                  estimated_minutes: { type: "integer" },
                },
                required: ["day", "focus", "goals", "activities", "estimated_minutes"],
              },
            },
            tips: { type: "array", items: { type: "string" } },
          },
          required: ["title", "summary", "days", "tips"],
        },
      },
    }];

    const prompt = `Create a ${days}-day study plan.
Weak topics: ${weakTopics.join(", ") || "none yet"}
Strong topics: ${strongTopics.join(", ") || "none yet"}
Recent average quiz score: ${avgScore}%
Bias the plan toward weak topics. Mix flashcard review, quizzes, and concept reading. Keep daily time realistic (30-60 min).`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You design effective, realistic study plans for students." },
          { role: "user", content: prompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "create_study_plan" } },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(res.status, t);
      if (res.status === 429) return json({ error: "Rate limit, try again shortly." }, 429);
      if (res.status === 402) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: "AI request failed" }, 500);
    }
    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return json({ error: "AI returned no plan" }, 500);
    return json(JSON.parse(tc.function.arguments));
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

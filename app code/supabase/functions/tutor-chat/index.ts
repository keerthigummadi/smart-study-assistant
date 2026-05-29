// AI tutor chatbot — non-streaming, conversational, can reference user's weak topics.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Msg = { role: "user" | "assistant" | "system"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, weakTopics } = await req.json() as { messages: Msg[]; weakTopics?: string[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages required" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI not configured" }, 500);

    const system = `You are an encouraging AI study tutor for students.
- Answer questions clearly with examples.
- Explain step-by-step when needed.
- Use simple language, short paragraphs, bullet points, and markdown.
- Offer mini practice questions when the user asks to be quizzed.
- Be concise (under ~250 words per reply unless asked for depth).
${weakTopics?.length ? `\nThe student is currently weakest at: ${weakTopics.slice(0, 5).join(", ")}. Lean toward those topics when relevant.` : ""}`;

    // keep last 20 turns to bound cost
    const trimmed = messages.slice(-20);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...trimmed],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("AI error", res.status, t);
      if (res.status === 429) return json({ error: "Rate limit, try again shortly." }, 429);
      if (res.status === 402) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: "AI request failed" }, 500);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "I'm not sure how to answer that.";
    return json({ reply });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

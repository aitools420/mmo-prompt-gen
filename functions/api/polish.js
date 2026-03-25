const MODELS = [
  "arcee-ai/trinity-large-preview:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-coder:free",
];

export async function onRequestPost(context) {
  const apiKey = context.env.OPENROUTER_API_KEY;
  const body = await context.request.json();
  const raw = body.prompt || "";

  if (!raw || !apiKey) {
    return Response.json({ polished: raw });
  }

  const promptMsg = `Improve the wording and clarity of the prompt below. Rules:
1. Keep EVERY section — the role instruction, ALL personal details (hours, budget, interests, experience, etc.), AND the output format/structure requirements at the end.
2. Do NOT remove, summarize, or condense any part. The improved version must be at least as long as the original.
3. Only improve grammar, word choice, and flow. Make instructions crisper and more specific where possible.
4. Return ONLY the improved prompt. No preamble, no explanation, no commentary.

PROMPT TO IMPROVE:
${raw}`;

  for (const model of MODELS) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: promptMsg }],
          max_tokens: 1500,
        }),
      });
      const data = await resp.json();
      if (data.choices) {
        return Response.json({ polished: data.choices[0].message.content });
      }
    } catch {
      continue;
    }
  }

  return Response.json({ polished: raw });
}

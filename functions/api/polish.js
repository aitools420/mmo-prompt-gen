const MODELS = [
  "arcee-ai/trinity-large-preview:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-coder:free",
];

// In-memory sliding window rate limit — resets when isolate recycles
// Generous: 20 req/min per IP. Legitimate users do ~2-3 polishes per session.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 20;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_HITS) return true;
  timestamps.push(now);
  hits.set(ip, timestamps);
  return false;
}

function todayKey() {
  return `stats:${new Date().toISOString().slice(0, 10)}`;
}

async function logStat(kv, field, model) {
  if (!kv) return;
  const key = todayKey();
  const raw = await kv.get(key);
  const stats = raw ? JSON.parse(raw) : { ok: 0, fail: 0, rate_limited: 0, models: {} };
  stats[field] = (stats[field] || 0) + 1;
  if (model) stats.models[model] = (stats.models[model] || 0) + 1;
  await kv.put(key, JSON.stringify(stats), { expirationTtl: 60 * 60 * 24 * 30 });
}

export async function onRequestPost(context) {
  const kv = context.env.STATS;
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";

  if (isRateLimited(ip)) {
    context.waitUntil(logStat(kv, "rate_limited"));
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
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
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await resp.json();
      if (data.choices) {
        context.waitUntil(logStat(kv, "ok", model));
        return Response.json({ polished: data.choices[0].message.content });
      }
    } catch {
      continue;
    }
  }

  context.waitUntil(logStat(kv, "fail"));
  return Response.json({ polished: raw });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");

  if (!key || key !== context.env.STATS_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const kv = context.env.STATS;
  if (!kv) {
    return Response.json({ error: "KV not bound" }, { status: 500 });
  }

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const raw = await kv.get(`stats:${dateStr}`);
    days.push({
      date: dateStr,
      ...(raw ? JSON.parse(raw) : { ok: 0, fail: 0, rate_limited: 0, models: {} }),
    });
  }

  return Response.json({ days });
}

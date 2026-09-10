function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }

  const expected = context.env.DINK_ACCESS_CODE;
  if (!expected || body.code !== expected) {
    return json({ error: "unauthorized" }, 403);
  }

  const origin = new URL(context.request.url).origin;
  const res = await fetch(origin + "/dink-config.txt", {
    headers: { "User-Agent": "Multi-Misfits clan website" },
  });
  if (!res.ok) {
    return json({ error: "config not found" }, 500);
  }

  let config = await res.text();

  const discordWebhook = context.env.DINK_DISCORD_WEBHOOK || "";
  const lootKey = context.env.LOOT_WEBHOOK_KEY || "";
  const lootWebhook = lootKey ? origin + "/api/loot?key=" + lootKey : "";

  config = config.replace("__DISCORD_WEBHOOK__", discordWebhook);
  config = config.replace("__LOOT_WEBHOOK__", lootWebhook);

  return new Response(config, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

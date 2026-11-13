function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const accessCode = context.env.EVENTFORGE_ACCESS_CODE;
  const botToken = context.env.DISCORD_BOT_TOKEN;
  const channelId = context.env.ANNOUNCEMENTS_CHANNEL_ID;
  const guildId = context.env.DISCORD_GUILD_ID;

  if (!accessCode || !botToken || !channelId || !guildId) {
    return json({ error: "not configured" }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }

  if (!body.code || body.code.trim() !== accessCode.trim()) {
    return json({ error: "invalid code" }, 403);
  }

  if (body.action === "validate") {
    return json({ ok: true });
  }

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return json({ error: "message required" }, 400);
  }

  var content = body.message.trim();
  content = content.replace(/\{\{link:(\d+)\}\}/g, function (_, threadId) {
    return "https://discord.com/channels/" + guildId + "/" + threadId;
  });

  if (content.length > 2000) {
    return json({ error: "message too long (max 2000 characters)" }, 400);
  }

  var res = await fetch(
    "https://discord.com/api/v10/channels/" + channelId + "/messages",
    {
      method: "POST",
      headers: {
        Authorization: "Bot " + botToken,
        "Content-Type": "application/json",
        "User-Agent": "MultiMisfits-Bot/1.0",
      },
      body: JSON.stringify({ content: content }),
    }
  );

  if (!res.ok) {
    var err = await res.text();
    return json(
      { error: "Discord API error", status: res.status, detail: err },
      502
    );
  }

  var msg = await res.json();
  return json({ ok: true, message_id: msg.id });
}

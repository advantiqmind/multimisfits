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

  const accessCode = context.env.DINK_ACCESS_CODE;
  const botToken = context.env.DISCORD_BOT_TOKEN;
  const channelId = context.env.ANNOUNCEMENTS_CHANNEL_ID;

  if (!accessCode || !botToken || !channelId) {
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

  const payload = {
    content: "@everyone",
    embeds: [
      {
        author: {
          name: "Dink Plugin Update",
          icon_url:
            "https://github.com/pajlads/DinkPlugin/raw/master/icon.png",
        },
        title: "Dink Settings Updated",
        url: "https://multimisfits.us/clandink.html",
        description:
          "New clan Dink settings are available! Visit the [Clan Dink Settings](https://multimisfits.us/clandink.html) page for details and to update your config.\n\nCheck <#1481841660982988920> for the access code.",
        fields: [
          {
            name: "✔ Webhook Fix",
            value:
              "Discord notifications now route correctly for quests, levels, pets, and more.",
            inline: true,
          },
          {
            name: "⚠ Level Thresholds",
            value:
              "Updated to level 85+ and virtual levels disabled to reduce spam.",
            inline: true,
          },
        ],
        color: 0xffcb2f,
        footer: {
          text: "Powered by Dink",
          icon_url:
            "https://github.com/pajlads/DinkPlugin/raw/master/icon.png",
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
        "User-Agent": "MultiMisfits-Bot/1.0",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return json({ error: "Discord API error", status: res.status, detail: err }, 502);
  }

  const msg = await res.json();
  return json({ ok: true, message_id: msg.id });
}

// Cloudflare Pages Function  ->  GET /api/events
// Reads Discord Guild Scheduled Events and returns clean, formatted event data.
// The bot token stays server-side (Pages secret); the browser only sees finished JSON.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   DISCORD_BOT_TOKEN  (encrypted/secret)  — the bot token
//   DISCORD_GUILD_ID   (plain)             — the guild/server id
//
// Discord bot needs the MANAGE_EVENTS or VIEW_CHANNEL scope on the guild.

const CACHE_TTL = 300;

export function transformEvents(rawEvents) {
  const now = Date.now();
  const events = [];

  for (const ev of Array.isArray(rawEvents) ? rawEvents : []) {
    if (ev.status === 4) continue;

    const start = new Date(ev.scheduled_start_time);
    const end = ev.scheduled_end_time ? new Date(ev.scheduled_end_time) : null;

    let status = "scheduled";
    if (ev.status === 2) status = "active";
    else if (ev.status === 3) status = "completed";
    else if (start.getTime() <= now && (!end || end.getTime() > now)) status = "active";

    const image = ev.image
      ? `https://cdn.discordapp.com/guild-events/${ev.id}/${ev.image}.png?size=512`
      : null;

    events.push({
      id: ev.id,
      name: (ev.name || "Event").slice(0, 200),
      description: (ev.description || "").trim().slice(0, 2000),
      startTime: ev.scheduled_start_time,
      endTime: ev.scheduled_end_time || null,
      status,
      interestedCount: ev.user_count || 0,
      image,
    });
  }

  events.sort((a, b) => {
    const order = { active: 0, scheduled: 1, completed: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.status === "completed") return new Date(b.startTime) - new Date(a.startTime);
    return new Date(a.startTime) - new Date(b.startTime);
  });

  return events;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export async function onRequest(context) {
  const token = context.env && context.env.DISCORD_BOT_TOKEN;
  const guildId = context.env && context.env.DISCORD_GUILD_ID;

  if (!token || !guildId) {
    return json({ configured: false, events: [] }, 200, { "Cache-Control": "public, max-age=60" });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + "/api/events", { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let rawEvents;
  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/scheduled-events?with_user_count=true`,
      { headers: { Authorization: `Bot ${token}`, "User-Agent": "Multi-Misfits clan website" } }
    );
    if (!r.ok) return json({ configured: true, error: "discord_" + r.status, events: [] }, 502);
    rawEvents = await r.json();
  } catch (e) {
    return json({ configured: true, error: "fetch_failed", events: [] }, 502);
  }

  const events = transformEvents(rawEvents);
  const res = json({ configured: true, events }, 200, { "Cache-Control": `public, max-age=${CACHE_TTL}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

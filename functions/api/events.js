// Cloudflare Pages Function  ->  GET /api/events
// Reads the #events forum channel (thread posts) via the Discord REST API
// and returns clean, formatted event data. The bot token stays server-side;
// the browser only sees finished JSON.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   DISCORD_BOT_TOKEN  (encrypted/secret)
//   EVENTS_CHANNEL_ID  (plain)  - the #events forum channel id
//   DISCORD_GUILD_ID   (plain)  - the guild/server id

const CACHE_TTL = 300;
const MAX_THREADS = 10;

function snowflakeToDate(id) {
  const DISCORD_EPOCH = 1420070400000;
  return new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH);
}

export function transformThreads(threads, openingMessages) {
  const msgMap = new Map();
  for (const m of Array.isArray(openingMessages) ? openingMessages : []) {
    if (m && m.id) msgMap.set(m.id, m);
  }

  const events = [];
  for (const t of Array.isArray(threads) ? threads : []) {
    const meta = t.thread_metadata || {};
    const createdAt = meta.create_timestamp
      || snowflakeToDate(t.id).toISOString();

    const status = meta.archived ? "completed" : "scheduled";

    const msg = msgMap.get(t.id);
    const content = msg ? (msg.content || "").trim() : "";
    const attachments = msg && Array.isArray(msg.attachments) ? msg.attachments : [];
    const image = attachments.find((a) => (a.content_type || "").startsWith("image/"));

    events.push({
      id: t.id,
      name: (t.name || "Event").slice(0, 200),
      description: content.slice(0, 2000),
      startTime: createdAt,
      endTime: null,
      status,
      interestedCount: t.message_count || 0,
      image: image ? image.url : null,
    });
  }

  events.sort((a, b) => {
    const order = { scheduled: 0, completed: 1 };
    const oa = order[a.status] != null ? order[a.status] : 0;
    const ob = order[b.status] != null ? order[b.status] : 0;
    if (oa !== ob) return oa - ob;
    return new Date(b.startTime) - new Date(a.startTime);
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
  const channelId = context.env && context.env.EVENTS_CHANNEL_ID;
  const guildId = context.env && context.env.DISCORD_GUILD_ID;

  if (!token || !channelId || !guildId) {
    return json({ configured: false, events: [] }, 200, {
      "Cache-Control": "public, max-age=60",
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/events",
    { method: "GET" }
  );
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const headers = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  let threads;
  try {
    const [activeRes, archivedRes] = await Promise.all([
      fetch(
        `https://discord.com/api/v10/guilds/${guildId}/threads/active`,
        { headers }
      ),
      fetch(
        `https://discord.com/api/v10/channels/${channelId}/threads/archived/public?limit=${MAX_THREADS}`,
        { headers }
      ),
    ]);

    if (!activeRes.ok && !archivedRes.ok) {
      return json(
        { configured: true, error: "discord_" + activeRes.status, events: [] },
        502
      );
    }

    const activeData = activeRes.ok ? await activeRes.json() : { threads: [] };
    const archivedData = archivedRes.ok
      ? await archivedRes.json()
      : { threads: [] };

    const active = (activeData.threads || []).filter(
      (t) => t.parent_id === channelId
    );
    const archived = archivedData.threads || [];

    const seen = new Set();
    threads = [];
    for (const t of [...active, ...archived]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        threads.push(t);
      }
    }
  } catch (e) {
    return json({ configured: true, error: "fetch_failed", events: [] }, 502);
  }

  if (!threads.length) {
    const res = json({ configured: true, events: [] }, 200, {
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
    });
    context.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  threads.sort((a, b) => {
    const dateA =
      (a.thread_metadata && a.thread_metadata.create_timestamp) ||
      snowflakeToDate(a.id).toISOString();
    const dateB =
      (b.thread_metadata && b.thread_metadata.create_timestamp) ||
      snowflakeToDate(b.id).toISOString();
    return dateB.localeCompare(dateA);
  });
  threads = threads.slice(0, MAX_THREADS);

  let openingMessages;
  try {
    openingMessages = await Promise.all(
      threads.map((t) =>
        fetch(
          `https://discord.com/api/v10/channels/${t.id}/messages/${t.id}`,
          { headers }
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );
  } catch (e) {
    openingMessages = [];
  }

  const events = transformThreads(threads, openingMessages);
  const res = json({ configured: true, events }, 200, {
    "Cache-Control": `public, max-age=${CACHE_TTL}`,
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

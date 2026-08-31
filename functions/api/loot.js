// Cloudflare Pages Function  ->  POST|GET /api/loot
// POST: Receives Dink (RuneLite plugin) loot webhooks, matches against
// active [Loot Value] events by boss name, stores in D1.
// GET:  Returns leaderboard data for a specific event.
//
// Required env:
//   DISCORD_BOT_TOKEN     (secret)
//   EVENTS_CHANNEL_ID     (plain)
//   DISCORD_GUILD_ID      (plain)
//   LOOT_WEBHOOK_KEY      (secret)
//   DB                    (D1 binding)

const EVENTS_CACHE_TTL = 300;
const LEADERBOARD_LIMIT = 20;
const NOTABLE_DROPS_LIMIT = 5;
const LEADERBOARD_CACHE_TTL = 60;

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export function parseBossFilter(content) {
  const m = content.match(/^Boss:\s*(.+)/im);
  if (!m) return null;
  const raw = m[1].trim();
  if (/^any$/i.test(raw)) return null;
  return raw.split(",").map(b => b.trim().toLowerCase()).filter(Boolean);
}

export function matchesBoss(source, bossFilter) {
  if (!bossFilter) return true;
  return bossFilter.includes(source.toLowerCase());
}

export function extractLootData(body) {
  if (!body || body.type !== "LOOT") return null;
  const player = body.playerName;
  const extra = body.extra || {};
  const source = extra.source;
  if (!player || !source) return null;

  const killCount = typeof extra.killCount === "number" ? extra.killCount : 0;
  const rawItems = Array.isArray(extra.items) ? extra.items : [];

  const items = rawItems.map(i => ({
    name: i.name || "Unknown",
    quantity: i.quantity || 1,
    price: i.price != null ? i.price : (i.priceEach || 0) * (i.quantity || 1),
  }));

  const totalValue = items.reduce((s, i) => s + i.price, 0);

  return { player, source, killCount, items, totalValue };
}

async function fetchActiveLootEvents(env) {
  const token = env.DISCORD_BOT_TOKEN;
  const channelId = env.EVENTS_CHANNEL_ID;
  const guildId = env.DISCORD_GUILD_ID;
  if (!token || !channelId || !guildId) return [];

  const headers = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  let threads;
  try {
    const [activeRes, channelRes] = await Promise.all([
      fetch(
        `https://discord.com/api/v10/guilds/${guildId}/threads/active`,
        { headers }
      ),
      fetch(
        `https://discord.com/api/v10/channels/${channelId}`,
        { headers }
      ),
    ]);
    if (!activeRes.ok) return [];
    const data = await activeRes.json();

    let lootTagId = null;
    if (channelRes.ok) {
      const channelData = await channelRes.json();
      const lootTag = (channelData.available_tags || []).find(
        tag => tag.name.toLowerCase() === "loot value"
      );
      if (lootTag) lootTagId = lootTag.id;
    }

    threads = (data.threads || []).filter(
      t => t.parent_id === channelId &&
        !(t.thread_metadata && t.thread_metadata.archived) &&
        lootTagId &&
        Array.isArray(t.applied_tags) &&
        t.applied_tags.includes(lootTagId)
    );
  } catch {
    return [];
  }

  if (!threads.length) return [];

  const events = await Promise.all(
    threads.map(async t => {
      try {
        const msgRes = await fetch(
          `https://discord.com/api/v10/channels/${t.id}/messages/${t.id}`,
          { headers }
        );
        if (!msgRes.ok) return null;
        const msg = await msgRes.json();
        const bossFilter = parseBossFilter((msg.content || "").trim());
        return { id: t.id, name: t.name, bossFilter };
      } catch {
        return null;
      }
    })
  );

  return events.filter(Boolean);
}

async function getActiveLootEvents(env) {
  const cache = caches.default;
  const cacheKey = new Request("https://internal/api/_loot_events", { method: "GET" });

  const hit = await cache.match(cacheKey);
  if (hit) {
    try { return await hit.json(); } catch { /* fall through */ }
  }

  const events = await fetchActiveLootEvents(env);
  const res = new Response(JSON.stringify(events), {
    headers: {
      "content-type": "application/json",
      "Cache-Control": `public, max-age=${EVENTS_CACHE_TTL}`,
    },
  });
  await cache.put(cacheKey, res);
  return events;
}

let _tableCreated = false;

async function ensureTable(db) {
  if (_tableCreated) return;
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS loot_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      player TEXT NOT NULL,
      source TEXT NOT NULL,
      kill_count INTEGER DEFAULT 0,
      items TEXT NOT NULL DEFAULT '[]',
      total_value INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_loot_event ON loot_entries(event_id)"
  ).run();
  _tableCreated = true;
}

async function handlePost(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key");
  const expectedKey = context.env.LOOT_WEBHOOK_KEY;

  if (!expectedKey || key !== expectedKey) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = context.env.DB;
  if (!db) {
    return json({ error: "database_not_configured" }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const loot = extractLootData(body);
  if (!loot) {
    return json({ stored: false, reason: "not_loot_or_missing_fields" });
  }

  const activeEvents = await getActiveLootEvents(context.env);
  const matched = activeEvents.filter(e => matchesBoss(loot.source, e.bossFilter));

  if (!matched.length) {
    return json({ stored: false, reason: "no_matching_event" });
  }

  await ensureTable(db);

  const now = new Date().toISOString();
  const itemsJson = JSON.stringify(loot.items);

  for (const event of matched) {
    await db.prepare(
      `INSERT INTO loot_entries (event_id, player, source, kill_count, items, total_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(event.id, loot.player, loot.source, loot.killCount, itemsJson, loot.totalValue, now).run();
  }

  return json({
    stored: true,
    events: matched.map(e => e.id),
    player: loot.player,
    value: loot.totalValue,
  });
}

async function handleGet(context) {
  const url = new URL(context.request.url);
  const eventId = url.searchParams.get("event");

  if (!eventId) {
    return json({ error: "event_parameter_required" }, 400);
  }

  const db = context.env.DB;
  if (!db) {
    return json({
      eventId,
      leaderboard: [],
      stats: { totalPlayers: 0, totalKills: 0, totalValue: 0 },
      notableDrops: [],
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/loot?event=" + eventId, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  await ensureTable(db);

  const lbResult = await db.prepare(
    `SELECT player, SUM(total_value) as total, COUNT(*) as kills
     FROM loot_entries WHERE event_id = ?
     GROUP BY player ORDER BY total DESC LIMIT ?`
  ).bind(eventId, LEADERBOARD_LIMIT).all();

  const leaderboard = (lbResult.results || []).map((row, i) => ({
    rank: i + 1,
    player: row.player,
    total: row.total,
    kills: row.kills,
  }));

  const statsResult = await db.prepare(
    `SELECT COUNT(DISTINCT player) as players, COUNT(*) as kills, SUM(total_value) as value
     FROM loot_entries WHERE event_id = ?`
  ).bind(eventId).first();

  const stats = {
    totalPlayers: (statsResult && statsResult.players) || 0,
    totalKills: (statsResult && statsResult.kills) || 0,
    totalValue: (statsResult && statsResult.value) || 0,
  };

  const topKills = await db.prepare(
    `SELECT player, items, total_value, created_at
     FROM loot_entries WHERE event_id = ?
     ORDER BY total_value DESC LIMIT 30`
  ).bind(eventId).all();

  const allItems = [];
  for (const row of (topKills.results || [])) {
    try {
      const items = JSON.parse(row.items || "[]");
      for (const item of items) {
        if (item.price > 0) {
          allItems.push({
            player: row.player,
            name: item.name,
            quantity: item.quantity || 1,
            value: item.price,
          });
        }
      }
    } catch { /* skip bad JSON */ }
  }

  allItems.sort((a, b) => b.value - a.value);
  const notableDrops = allItems.slice(0, NOTABLE_DROPS_LIMIT);

  const res = json({ eventId, leaderboard, stats, notableDrops }, 200, {
    "Cache-Control": `public, max-age=${LEADERBOARD_CACHE_TTL}`,
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return handlePost(context);
  }
  return handleGet(context);
}

// Cloudflare Pages Function  ->  POST|GET /api/loot
// POST: Receives Dink (RuneLite plugin) loot webhooks, matches against
// active Loot Value events by boss name, stores in D1.
// Also forwards drops above a configurable threshold to Discord.
// GET:  Returns leaderboard data for a specific event.
//
// Required env:
//   DISCORD_BOT_TOKEN     (secret)
//   EVENTS_CHANNEL_ID     (plain)
//   DISCORD_GUILD_ID      (plain)
//   LOOT_WEBHOOK_KEY      (secret)
//   DB                    (D1 binding)
//
// Optional env (forwarding proxy):
//   LOOT_DISCORD_WEBHOOK  (secret) - Discord webhook URL for chest channel
//   LOOT_DISCORD_MIN_VALUE (plain) - minimum total value to forward (default 150000)

const EVENTS_CACHE_TTL = 300;
const LEADERBOARD_LIMIT = 20;
const NOTABLE_DROPS_LIMIT = 5;
const LEADERBOARD_CACHE_TTL = 60;
const DEFAULT_DISCORD_MIN_VALUE = 150000;

export function parseEventDateField(content, field) {
  const re = new RegExp("\\b" + field + ":\\s*(.+)", "i");
  const m = content.match(re);
  if (!m) return null;
  let s = m[1].trim();
  const ts = s.match(/<t:(\d+)(?::[tTdDfFR])?>/);
  if (ts) return new Date(parseInt(ts[1], 10) * 1000).toISOString();
  if (/^in\s+\d/i.test(s)) return null;
  s = s.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "");
  s = s.replace(/\s+at\s+/i, " ");
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

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
  const src = source.toLowerCase();
  return bossFilter.some(b => src.startsWith(b));
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
        const content = (msg.content || "").trim();
        const bossFilter = parseBossFilter(content);
        const startTime = parseEventDateField(content, "When") || null;
        const endTime = parseEventDateField(content, "Ends?") || null;
        return { id: t.id, name: t.name, bossFilter, startTime, endTime };
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
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS loot_debug_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      payload_type TEXT,
      player TEXT,
      source TEXT,
      total_value INTEGER,
      result TEXT,
      forwarded INTEGER DEFAULT 0,
      raw_preview TEXT
    )`
  ).run();
  _tableCreated = true;
}

function maybeForwardToDiscord(context, contentType, rawBody, totalValue) {
  const webhookUrl = context.env.LOOT_DISCORD_WEBHOOK;
  if (!webhookUrl) return;

  const minValue = parseInt(context.env.LOOT_DISCORD_MIN_VALUE, 10)
    || DEFAULT_DISCORD_MIN_VALUE;
  if (totalValue < minValue) return;

  context.waitUntil(
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: rawBody,
    }).catch(() => {})
  );
}

async function parseBodyFromBuffer(contentType, buffer) {
  if (contentType.includes("multipart/form-data")) {
    try {
      const req = new Request("https://dummy/", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: buffer,
      });
      const formData = await req.formData();
      const payloadJson = formData.get("payload_json");
      if (!payloadJson) return null;
      return JSON.parse(payloadJson);
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    return null;
  }
}

async function logDebug(db, info) {
  try {
    await ensureTable(db);
    await db.prepare(
      `INSERT INTO loot_debug_log (created_at, payload_type, player, source, total_value, result, forwarded, raw_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      info.payloadType || null,
      info.player || null,
      info.source || null,
      info.totalValue || 0,
      info.result || null,
      info.forwarded || 0,
      info.rawPreview || null
    ).run();
  } catch { /* debug logging should never break the main flow */ }
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

  const contentType = context.request.headers.get("content-type") || "";
  const rawBody = await context.request.arrayBuffer();

  const body = await parseBodyFromBuffer(contentType, rawBody);
  if (!body) {
    await logDebug(db, { result: "invalid_payload" });
    return json({ error: "invalid_payload" }, 400);
  }

  const loot = extractLootData(body);
  if (!loot) {
    await logDebug(db, {
      payloadType: body.type || null,
      player: body.playerName || null,
      source: (body.extra && body.extra.source) || null,
      result: "not_loot_or_missing_fields",
      rawPreview: JSON.stringify(body).slice(0, 500),
    });
    return json({ stored: false, reason: "not_loot_or_missing_fields" });
  }

  const minValue = parseInt(context.env.LOOT_DISCORD_MIN_VALUE, 10) || DEFAULT_DISCORD_MIN_VALUE;
  const willForward = !!context.env.LOOT_DISCORD_WEBHOOK && loot.totalValue >= minValue;
  maybeForwardToDiscord(context, contentType, rawBody, loot.totalValue);

  const activeEvents = await getActiveLootEvents(context.env);
  const now = Date.now();
  const matched = activeEvents.filter(e => {
    if (!matchesBoss(loot.source, e.bossFilter)) return false;
    if (e.startTime && new Date(e.startTime).getTime() > now) return false;
    if (e.endTime && new Date(e.endTime).getTime() < now) return false;
    return true;
  });

  if (!matched.length) {
    const bossMatched = activeEvents.filter(e => matchesBoss(loot.source, e.bossFilter));
    let reason = "no_matching_event";
    if (bossMatched.length) {
      const first = bossMatched[0];
      if (first.startTime && new Date(first.startTime).getTime() > now) reason = "event_not_started";
      else if (first.endTime && new Date(first.endTime).getTime() < now) reason = "event_ended";
    }
    await logDebug(db, {
      payloadType: "LOOT",
      player: loot.player,
      source: loot.source,
      totalValue: loot.totalValue,
      result: reason,
      forwarded: willForward ? 1 : 0,
    });
    return json({ stored: false, reason, forwarded: willForward });
  }

  await ensureTable(db);

  const createdAt = new Date().toISOString();
  const itemsJson = JSON.stringify(loot.items);

  for (const event of matched) {
    await db.prepare(
      `INSERT INTO loot_entries (event_id, player, source, kill_count, items, total_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(event.id, loot.player, loot.source, loot.killCount, itemsJson, loot.totalValue, createdAt).run();
  }

  await logDebug(db, {
    payloadType: "LOOT",
    player: loot.player,
    source: loot.source,
    totalValue: loot.totalValue,
    result: "stored:" + matched.map(e => e.id).join(","),
    forwarded: willForward ? 1 : 0,
  });

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

  let eventMeta = null;
  const activeEvents = await getActiveLootEvents(context.env);
  const ev = activeEvents.find(e => e.id === eventId);
  if (ev) {
    const now = Date.now();
    const started = !ev.startTime || new Date(ev.startTime).getTime() <= now;
    const ended = ev.endTime && new Date(ev.endTime).getTime() < now;
    eventMeta = {
      startTime: ev.startTime || null,
      endTime: ev.endTime || null,
      ended: !!ended,
      started,
    };
  }

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

  const payload = { eventId, leaderboard, stats, notableDrops };
  if (eventMeta) {
    payload.ended = eventMeta.ended;
    payload.startTime = eventMeta.startTime;
    payload.endTime = eventMeta.endTime;
  }
  const res = json(payload, 200, {
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

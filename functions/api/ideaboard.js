const CACHE_TTL = 60;
const VALID_COLUMNS = ["ideas", "review", "approved", "shared", "rejected"];
const COLUMN_MIGRATION = { planned: "review", active: "approved", done: "shared" };
const KNOWN_TAGS = ['website','discord','pvm','pvp','wild','social','skilling','weekend','1day','teams'];
const BASE = "https://discord.com/api/v10";

let _tableReady = false;

async function ensureTable(db) {
  if (_tableReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS idea_positions (
      message_id TEXT PRIMARY KEY,
      column_name TEXT NOT NULL DEFAULT 'ideas',
      dismissed INTEGER NOT NULL DEFAULT 0,
      dismissed_by TEXT,
      moved_by TEXT,
      updated_at TEXT NOT NULL
    )`
    )
    .run();
  _tableReady = true;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

async function fetchNickMap(guildId, headers) {
  const map = new Map();
  try {
    const res = await fetch(
      `${BASE}/guilds/${guildId}/members?limit=1000`,
      { headers }
    );
    if (!res.ok) return map;
    const members = await res.json();
    for (const m of members) {
      if (m.user && m.user.id && m.nick) map.set(m.user.id, m.nick);
    }
  } catch (_) {}
  return map;
}

async function fetchChannelMap(guildId, headers) {
  const map = new Map();
  try {
    const res = await fetch(
      `${BASE}/guilds/${guildId}/channels`,
      { headers }
    );
    if (!res.ok) return map;
    const channels = await res.json();
    for (const ch of channels) {
      if (ch.id && ch.name) map.set(ch.id, ch.name.toLowerCase());
    }
  } catch (_) {}
  return map;
}

function resolveName(user, nickMap) {
  if (nickMap && user && user.id && nickMap.has(user.id))
    return nickMap.get(user.id);
  if (user && user.global_name) return user.global_name;
  return (user && user.username) || "Unknown";
}

function parseIdea(msg, nickMap, channelMap) {
  let content = (msg.content || "").trim();
  if (!content) return null;

  const tags = [];

  // Resolve Discord channel mentions <#ID> to tags when channel name matches a known tag
  const mentionRx = /<#(\d+)>/g;
  let cm;
  while ((cm = mentionRx.exec(content)) !== null) {
    const chName = channelMap && channelMap.get(cm[1]);
    if (chName && KNOWN_TAGS.includes(chName) && !tags.includes(chName)) {
      tags.push(chName);
    }
  }

  // Strip Discord channel mentions before parsing hashtags
  content = content.replace(/<#\d+>/g, "");

  const lines = content.split("\n");

  // Match hashtags that contain at least one letter (excludes pure-numeric Discord IDs)
  const tagRx = /#((?=\w*[a-zA-Z])\w+)/g;
  let m;
  while ((m = tagRx.exec(content)) !== null) {
    const t = m[1].toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }

  const stripRx = /#(?=\w*[a-zA-Z])\w+/g;
  const title = lines[0].replace(stripRx, "").trim();
  if (!title) return null;

  const noteLines = lines.slice(1).map((l) => l.replace(stripRx, "").trim());
  while (noteLines.length && !noteLines[0]) noteLines.shift();
  while (noteLines.length && !noteLines[noteLines.length - 1])
    noteLines.pop();
  const notes = noteLines.join("\n") || null;

  return {
    id: msg.id,
    title,
    notes,
    tags,
    author: resolveName(msg.author, nickMap),
    createdAt: msg.timestamp,
  };
}

async function handleGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/ideaboard",
    { method: "GET" }
  );
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const token = context.env.DISCORD_BOT_TOKEN;
  const threadId = context.env.IDEABOARD_THREAD_ID;
  const guildId = context.env.DISCORD_GUILD_ID;

  if (!token || !threadId) {
    return json(
      { configured: false, ideas: [] },
      200,
      { "Cache-Control": "public, max-age=60" }
    );
  }

  const headers = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  let messages = [];
  let before;
  for (let i = 0; i < 5; i++) {
    let url = `${BASE}/channels/${threadId}/messages?limit=100`;
    if (before) url += `&before=${before}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const batch = await res.json();
    if (!batch.length) break;
    messages.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }

  const [nickMap, channelMap] = await Promise.all([
    guildId ? fetchNickMap(guildId, headers) : Promise.resolve(new Map()),
    guildId ? fetchChannelMap(guildId, headers) : Promise.resolve(new Map()),
  ]);

  const ideas = messages
    .filter((m) => !m.author?.bot && m.type === 0)
    .map((m) => parseIdea(m, nickMap, channelMap))
    .filter(Boolean);

  const db = context.env.DB;
  const positions = new Map();
  if (db) {
    await ensureTable(db);
    const result = await db
      .prepare(
        "SELECT message_id, column_name, dismissed, dismissed_by, moved_by, updated_at FROM idea_positions"
      )
      .all();
    for (const row of result.results) {
      positions.set(row.message_id, row);
    }
  }

  const merged = ideas.map((idea) => {
    const pos = positions.get(idea.id);
    return {
      ...idea,
      column: pos ? (COLUMN_MIGRATION[pos.column_name] || pos.column_name) : "ideas",
      dismissed: pos ? !!pos.dismissed : false,
      dismissedBy: pos?.dismissed_by || null,
      movedBy: pos?.moved_by || null,
    };
  });

  const discordUrl =
    guildId && threadId
      ? `https://discord.com/channels/${guildId}/${threadId}`
      : null;

  const res = json(
    { configured: true, ideas: merged, discordUrl },
    200,
    { "Cache-Control": `public, max-age=${CACHE_TTL}` }
  );
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function handlePost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }
  const { action, message_id, column, user } = body;

  if (!message_id) return json({ error: "message_id required" }, 400);

  const db = context.env.DB;
  if (!db) return json({ error: "database not configured" }, 500);
  await ensureTable(db);

  const now = new Date().toISOString();

  if (action === "move") {
    if (!VALID_COLUMNS.includes(column))
      return json({ error: "invalid column" }, 400);
    await db
      .prepare(
        `INSERT INTO idea_positions (message_id, column_name, moved_by, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           column_name = excluded.column_name,
           moved_by = excluded.moved_by,
           updated_at = excluded.updated_at,
           dismissed = 0,
           dismissed_by = NULL`
      )
      .bind(message_id, column, user || null, now)
      .run();
  } else if (action === "dismiss") {
    if (!user) return json({ error: "user required for dismiss" }, 400);
    await db
      .prepare(
        `INSERT INTO idea_positions (message_id, column_name, dismissed, dismissed_by, updated_at)
         VALUES (?, 'ideas', 1, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           dismissed = 1,
           dismissed_by = excluded.dismissed_by,
           updated_at = excluded.updated_at`
      )
      .bind(message_id, user, now)
      .run();
  } else if (action === "restore") {
    await db
      .prepare(
        `UPDATE idea_positions SET dismissed = 0, dismissed_by = NULL, updated_at = ?
         WHERE message_id = ?`
      )
      .bind(now, message_id)
      .run();
  } else {
    return json({ error: "invalid action" }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/ideaboard",
    { method: "GET" }
  );
  context.waitUntil(cache.delete(cacheKey));

  return json({ ok: true });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return handlePost(context);
  return handleGet(context);
}

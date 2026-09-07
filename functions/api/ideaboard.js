const CACHE_TTL = 60;
const VALID_COLUMNS = ["ideas", "planned", "active", "done"];
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

function resolveName(user, nickMap) {
  if (nickMap && user && user.id && nickMap.has(user.id))
    return nickMap.get(user.id);
  if (user && user.global_name) return user.global_name;
  return (user && user.username) || "Unknown";
}

function parseIdea(msg, nickMap) {
  const content = (msg.content || "").trim();
  if (!content) return null;

  const lines = content.split("\n");

  const tags = [];
  const tagRx = /#(\w+)/g;
  let m;
  while ((m = tagRx.exec(content)) !== null) {
    const t = m[1].toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }

  const title = lines[0].replace(/#\w+/g, "").trim();
  if (!title) return null;

  const noteLines = lines.slice(1).map((l) => l.replace(/#\w+/g, "").trim());
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

  const nickMap = guildId
    ? await fetchNickMap(guildId, headers)
    : new Map();

  const ideas = messages
    .filter((m) => !m.author?.bot && m.type === 0)
    .map((m) => parseIdea(m, nickMap))
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
      column: pos ? pos.column_name : "ideas",
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

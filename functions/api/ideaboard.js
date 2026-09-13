const CACHE_TTL = 30;
const VALID_COLUMNS = ["review", "approved", "shared", "onhold", "used"];
const COLUMN_MIGRATION = { planned: "review", active: "approved", done: "shared", ideas: "review", rejected: "onhold" };
const KNOWN_TAGS = ['website','discord','pvm','pvp','wild','social','skilling','weekend','1day','teams','misc'];
const BASE = "https://discord.com/api/v10";

let _tableReady = false;

async function ensureTable(db) {
  if (_tableReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS idea_positions (
      message_id TEXT PRIMARY KEY,
      column_name TEXT NOT NULL DEFAULT 'review',
      dismissed INTEGER NOT NULL DEFAULT 0,
      dismissed_by TEXT,
      moved_by TEXT,
      updated_at TEXT NOT NULL
    )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS idea_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
    )
    .run();
  try {
    await db.prepare("ALTER TABLE idea_positions ADD COLUMN template_json TEXT").run();
  } catch (_) {}
  try {
    await db.prepare("ALTER TABLE idea_positions ADD COLUMN held INTEGER NOT NULL DEFAULT 0").run();
  } catch (_) {}
  try {
    await db.prepare("ALTER TABLE idea_positions ADD COLUMN held_by TEXT").run();
  } catch (_) {}
  try {
    await db.prepare("ALTER TABLE idea_positions ADD COLUMN scheduled_date TEXT").run();
  } catch (_) {}
  try {
    await db.prepare("ALTER TABLE idea_positions ADD COLUMN scheduled_end_date TEXT").run();
  } catch (_) {}
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

  const mentionRx = /<#(\d+)>/g;
  let cm;
  while ((cm = mentionRx.exec(content)) !== null) {
    const chName = channelMap && channelMap.get(cm[1]);
    if (chName && KNOWN_TAGS.includes(chName) && !tags.includes(chName)) {
      tags.push(chName);
    }
  }

  content = content.replace(/<#\d+>/g, "");

  const lines = content.split("\n");

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

  const authorId = msg.author?.id || null;
  const authorAvatar = msg.author?.avatar || null;

  const images = (msg.attachments || [])
    .filter(a => a.content_type && a.content_type.startsWith("image/"))
    .map(a => a.url);

  return {
    id: msg.id,
    title,
    notes,
    tags,
    author: resolveName(msg.author, nickMap),
    authorId,
    authorAvatar,
    images: images.length ? images : null,
    createdAt: msg.timestamp,
  };
}

async function handleCalendarGet(context) {
  const url = new URL(context.request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/ideaboard?fields=calendar", { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const token = context.env.DISCORD_BOT_TOKEN;
  const threadId = context.env.IDEABOARD_THREAD_ID;
  const guildId = context.env.DISCORD_GUILD_ID;

  if (!token || !threadId) {
    return json({ configured: false, ideas: [] }, 200, { "Cache-Control": "public, max-age=60" });
  }

  const headers = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  let messages = [];
  let before;
  for (let i = 0; i < 5; i++) {
    let murl = `${BASE}/channels/${threadId}/messages?limit=100`;
    if (before) murl += `&before=${before}`;
    const res = await fetch(murl, { headers });
    if (!res.ok) break;
    const batch = await res.json();
    if (!batch.length) break;
    messages.push(...batch);
    if (batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }

  const nickMap = guildId ? await fetchNickMap(guildId, headers) : new Map();

  const ideas = messages
    .filter((m) => !m.author?.bot && m.type === 0)
    .map((m) => parseIdea(m, nickMap, new Map()))
    .filter(Boolean);

  const db = context.env.DB;
  const calendarIdeas = [];
  if (db) {
    await ensureTable(db);
    const result = await db
      .prepare("SELECT message_id, column_name, template_json, scheduled_date, scheduled_end_date FROM idea_positions WHERE dismissed = 0 AND (column_name = 'onhold' OR (scheduled_date IS NOT NULL AND scheduled_date != ''))")
      .all();
    const posMap = new Map();
    for (const row of result.results) posMap.set(row.message_id, row);

    for (const idea of ideas) {
      const pos = posMap.get(idea.id);
      if (!pos) continue;
      calendarIdeas.push({
        id: idea.id,
        title: idea.title,
        tags: idea.tags,
        author: idea.author,
        images: idea.images,
        hasTemplate: !!pos.template_json,
        templateJson: pos.template_json || null,
        scheduledDate: pos.scheduled_date || null,
        scheduledEndDate: pos.scheduled_end_date || null,
      });
    }
  }

  const res = json(
    { configured: true, ideas: calendarIdeas },
    200,
    { "Cache-Control": `public, max-age=${CACHE_TTL}` }
  );
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
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
        "SELECT message_id, column_name, dismissed, dismissed_by, moved_by, updated_at, template_json, held, held_by, scheduled_date, scheduled_end_date FROM idea_positions"
      )
      .all();
    for (const row of result.results) {
      positions.set(row.message_id, row);
    }
  }

  const notesMap = new Map();
  if (db) {
    const notesResult = await db
      .prepare("SELECT id, message_id, author, text, created_at FROM idea_notes ORDER BY created_at ASC")
      .all();
    for (const row of notesResult.results) {
      if (!notesMap.has(row.message_id)) notesMap.set(row.message_id, []);
      notesMap.get(row.message_id).push({
        id: row.id,
        author: row.author,
        text: row.text,
        createdAt: row.created_at,
      });
    }
  }

  const merged = ideas.map((idea) => {
    const pos = positions.get(idea.id);
    return {
      ...idea,
      column: pos ? (COLUMN_MIGRATION[pos.column_name] || pos.column_name) : "review",
      dismissed: pos ? !!pos.dismissed : false,
      dismissedBy: pos?.dismissed_by || null,
      movedBy: pos?.moved_by || null,
      templateJson: pos?.template_json || null,
      held: pos ? !!pos.held : false,
      heldBy: pos?.held_by || null,
      scheduledDate: pos?.scheduled_date || null,
      scheduledEndDate: pos?.scheduled_end_date || null,
      comments: notesMap.get(idea.id) || [],
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

function zonedUnix(date, time, tz) {
  if (!date || !time) return null;
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  let guess = Date.UTC(Y, M - 1, D, h, m, 0);
  for (let k = 0; k < 3; k++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (t) => +parts.find((p) => p.type === t).value;
    const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    guess += Date.UTC(Y, M - 1, D, h, m) - asUTC;
  }
  return Math.floor(guess / 1000);
}

function templateToDiscord(templateJson, scheduledDate, scheduledEndDate) {
  let parsed;
  try { parsed = JSON.parse(templateJson); } catch (_) { return null; }

  const event = parsed.template?.event
    || (parsed.eventforge && Array.isArray(parsed.events) && parsed.events[0])
    || parsed;
  if (!event || !event.blocks) return null;

  if (scheduledDate) event.date = scheduledDate;
  if (scheduledEndDate && scheduledEndDate !== scheduledDate) {
    event.endDate = scheduledEndDate;
    event.multiDay = true;
  } else if (scheduledDate) {
    event.endDate = "";
    event.multiDay = false;
  }

  const tz = event.timezone || "America/New_York";
  const LINE_EMOJI = { when: "\u{1F4C5}", starts: "⏳", ends: "\u{1F3C1}", world: "\u{1F30E}", meet: "\u{1F4CD}", host: "\u{1F451}", repeat: "\u{1F501}", rsvp: "✅", dink: "\u{1F4AC}", scoring: "\u{1F4CA}" };
  const lem = (k) => { const v = LINE_EMOJI[k]; return v ? v + " " : ""; };

  function importancePrefix(b) {
    if (!b.showLabel) return "";
    const emo = b.emoji || "";
    const title = `${emo} ${b.label || ""}`.trim();
    if (b.importance === "featured") return `# ${title}`;
    if (b.importance === "medium") return `## ${title}`;
    if (b.importance === "small") return `${emo} **${b.label}:**`.trim();
    return `### ${title}`;
  }

  function conditionOK(b) {
    if (!b.visible) return false;
    if (!b.condition || b.condition === "always") return true;
    if (b.condition === "hasPrize") return event.blocks.some((x) => x.kind === "prizes" && (x.items || []).some((i) => i.trim()));
    if (b.condition === "hasEnd") return !!(event.endDate || event.endTime);
    return true;
  }

  function blockToText(b) {
    if (!conditionOK(b)) return "";
    if (b.kind === "spacer") return "\n";
    if (b.kind === "divider") return "────────────";
    const head = importancePrefix(b);
    let content = "";
    if (b.kind === "details") {
      const lines = [];
      if (b.world) lines.push(`${lem("world")}**World:** ${b.world}`);
      if (b.location) lines.push(`${lem("meet")}**Meet:** ${b.location}`);
      if (b.host) lines.push(`${lem("host")}**Host:** ${b.host}`);
      content = lines.join("\n");
    } else if (["requirements", "rules", "prizes"].includes(b.kind)) {
      content = (b.items || []).filter((x) => x.trim())
        .map((x) => x.trim().match(/^(\d+[.)]|[-•*])/) ? x : `• ${x}`)
        .join("\n");
    } else if (b.kind === "gear") {
      const lines = [];
      if (b.provided) lines.push(`**Provided by clan:** ${b.provided}`);
      if (b.value) lines.push(b.value);
      content = lines.join("\n");
    } else if (b.kind === "training") {
      const lines = [];
      if (b.name && b.name !== b.label) lines.push(`**${b.name}**`);
      const u = zonedUnix(b.date, b.time, b.timezone || tz);
      if (u) lines.push(`${lem("when")}<t:${u}:F>\n${lem("starts")}<t:${u}:R>`);
      if (b.world) lines.push(`${lem("world")}**World:** ${b.world}`);
      if (b.location) lines.push(`${lem("meet")}**Meet:** ${b.location}`);
      if (b.details) lines.push(b.details);
      content = lines.join("\n");
    } else {
      content = b.value || "";
    }
    if (!head) return content;
    if (b.importance === "small" && content && !content.includes("\n")) return `${head} ${content}`;
    return [head, content].filter(Boolean).join("\n");
  }

  const arr = [];
  if (event.name) arr.push(`# ${event.name}`);

  const su = zonedUnix(event.date, event.time || "21:00", tz);
  const multi = event.endDate && event.endDate !== event.date;
  const eu = (event.endDate || event.endTime) ? zonedUnix(event.endDate || event.date, event.endTime || event.time || "21:00", tz) : null;

  if (su) {
    if (multi && eu) arr.push(`${lem("when")}**When:** <t:${su}:D> — <t:${eu}:D>\n${lem("starts")}**Starts:** <t:${su}:F> (<t:${su}:R>)`);
    else arr.push(`${lem("when")}**When:** <t:${su}:F>\n${lem("starts")}**Starts:** <t:${su}:R>`);
  }
  if (eu) arr.push(`${lem("ends")}**Ends:** <t:${eu}:F>`);

  for (const b of event.blocks) {
    const t = blockToText(b);
    if (t) arr.push(t);
  }

  const extras = [];
  if (event.bossFilter) {
    const bosses = event.bossFilterBosses || [];
    extras.push(`**Boss:** ${bosses.length ? bosses.join(", ") : "any"}`);
  }
  if (event.scoring && event.scoringConfig) extras.push(`${lem("scoring")}**Scoring:** ${event.scoringConfig}`);
  if (event.rsvp) extras.push(`${lem("rsvp")}**React with ${event.rsvpEmoji || "✅"} if you plan to make it!**`);
  if (event.dinkNote) extras.push(`${lem("dink")}*Running **Dink**? Keep it on so your drops and highlights post straight to Discord.*`);
  if (extras.length) arr.push(extras.join("\n"));

  return arr.join("\n\n").trim();
}

function checkAccess(env, code) {
  const leaderCode = env.IDEABOARD_LEADER_CODE;
  const memberCode = env.IDEABOARD_MEMBER_CODE;
  if (!leaderCode && !memberCode) return "leader";
  if (leaderCode && code === leaderCode) return "leader";
  if (memberCode && code === memberCode) return "member";
  return null;
}

async function handlePost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }
  const { action, message_id, column, user, text, access_code, template_json } = body;

  if (action === "validate") {
    const level = checkAccess(context.env, access_code);
    if (!level) return json({ error: "invalid code" }, 403);
    return json({ ok: true, level });
  }

  if (!message_id) return json({ error: "message_id required" }, 400);

  const db = context.env.DB;
  if (!db) return json({ error: "database not configured" }, 500);
  await ensureTable(db);

  const level = checkAccess(context.env, access_code);

  if (action === "move" || action === "dismiss" || action === "restore" || action === "set_template" || action === "hold" || action === "unhold" || action === "schedule" || action === "publish") {
    if (level !== "leader") return json({ error: "leader access required" }, 403);
  } else if (action === "add_note") {
    if (!level) return json({ error: "access code required" }, 403);
  }

  const now = new Date().toISOString();

  if (action === "move") {
    if (!user) return json({ error: "user required for move" }, 400);
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
           dismissed_by = NULL,
           held = 0,
           held_by = NULL`
      )
      .bind(message_id, column, user, now)
      .run();
  } else if (action === "add_note") {
    if (!user) return json({ error: "user required for notes" }, 400);
    if (!text || !text.trim()) return json({ error: "text required" }, 400);
    await db
      .prepare(
        "INSERT INTO idea_notes (message_id, author, text, created_at) VALUES (?, ?, ?, ?)"
      )
      .bind(message_id, user, text.trim(), now)
      .run();
  } else if (action === "dismiss") {
    if (!user) return json({ error: "user required for dismiss" }, 400);
    await db
      .prepare(
        `INSERT INTO idea_positions (message_id, column_name, dismissed, dismissed_by, updated_at)
         VALUES (?, 'review', 1, ?, ?)
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
  } else if (action === "set_template") {
    const val = template_json && typeof template_json === "string" ? template_json.trim() : null;
    await db
      .prepare(
        `UPDATE idea_positions SET template_json = ?, updated_at = ? WHERE message_id = ?`
      )
      .bind(val || null, now, message_id)
      .run();
  } else if (action === "hold") {
    if (!user) return json({ error: "user required for hold" }, 400);
    await db
      .prepare(
        `INSERT INTO idea_positions (message_id, column_name, held, held_by, updated_at)
         VALUES (?, 'review', 1, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           held = 1,
           held_by = excluded.held_by,
           updated_at = excluded.updated_at`
      )
      .bind(message_id, user, now)
      .run();
  } else if (action === "unhold") {
    await db
      .prepare(
        `UPDATE idea_positions SET held = 0, held_by = NULL, updated_at = ?
         WHERE message_id = ?`
      )
      .bind(now, message_id)
      .run();
  } else if (action === "schedule") {
    const { scheduled_date, scheduled_end_date } = body;
    const isScheduling = scheduled_date && scheduled_date !== "";
    const targetColumn = isScheduling ? "used" : "onhold";

    const existing = await db
      .prepare("SELECT template_json FROM idea_positions WHERE message_id = ?")
      .bind(message_id)
      .first();

    let updatedTemplate = existing?.template_json || null;
    if (updatedTemplate && isScheduling) {
      try {
        const parsed = JSON.parse(updatedTemplate);
        const target = (parsed.eventforge && Array.isArray(parsed.events) && parsed.events[0]) ? parsed.events[0] : parsed;
        target.date = scheduled_date;
        if (scheduled_end_date && scheduled_end_date !== scheduled_date) {
          target.endDate = scheduled_end_date;
          target.multiDay = true;
        } else {
          target.endDate = "";
          target.multiDay = false;
        }
        updatedTemplate = JSON.stringify(parsed);
      } catch (_) {}
    }

    await db
      .prepare(
        `INSERT INTO idea_positions (message_id, column_name, scheduled_date, scheduled_end_date, template_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           column_name = excluded.column_name,
           scheduled_date = excluded.scheduled_date,
           scheduled_end_date = excluded.scheduled_end_date,
           template_json = CASE WHEN excluded.scheduled_date IS NOT NULL AND excluded.scheduled_date != '' THEN excluded.template_json ELSE idea_positions.template_json END,
           updated_at = excluded.updated_at`
      )
      .bind(message_id, targetColumn, scheduled_date || null, scheduled_end_date || null, updatedTemplate, now)
      .run();

    const cache2 = caches.default;
    const calCacheKey = new Request(
      new URL(context.request.url).origin + "/api/ideaboard?fields=calendar",
      { method: "GET" }
    );
    context.waitUntil(cache2.delete(calCacheKey));

    return json({ ok: true, templateJson: updatedTemplate });
  } else if (action === "publish") {
    if (!body.title || !body.title.trim()) return json({ error: "title required" }, 400);
    if (!user) return json({ error: "user required" }, 400);

    const eventsChannelId = context.env.EVENTS_CHANNEL_ID;
    const token = context.env.DISCORD_BOT_TOKEN;
    if (!eventsChannelId || !token) return json({ error: "events channel not configured" }, 500);

    const authHeaders = {
      Authorization: `Bot ${token}`,
      "User-Agent": "Multi-Misfits clan website",
    };

    const { scheduled_date, scheduled_end_date } = body;
    if (!scheduled_date) return json({ error: "scheduled_date required" }, 400);

    const existing = await db
      .prepare("SELECT template_json FROM idea_positions WHERE message_id = ?")
      .bind(message_id)
      .first();
    if (!existing || !existing.template_json) return json({ error: "no template found for this idea" }, 400);

    const discordBody = templateToDiscord(existing.template_json, scheduled_date, scheduled_end_date || null);
    if (!discordBody) return json({ error: "failed to generate post content" }, 500);

    const images = [];

    if (body.include_idea_images !== false) {
      const threadId = context.env.IDEABOARD_THREAD_ID;
      if (threadId) {
        try {
          const msgRes = await fetch(`${BASE}/channels/${threadId}/messages/${message_id}`, { headers: authHeaders });
          if (msgRes.ok) {
            const msg = await msgRes.json();
            for (const att of (msg.attachments || [])) {
              if (att.content_type && att.content_type.startsWith("image/")) {
                try {
                  const imgRes = await fetch(att.url);
                  if (imgRes.ok) {
                    images.push({ name: att.filename, type: att.content_type, data: await imgRes.arrayBuffer() });
                  }
                } catch (_) {}
              }
            }
          }
        } catch (_) {}
      }
    }

    if (body.uploaded_images && Array.isArray(body.uploaded_images)) {
      for (const img of body.uploaded_images) {
        if (!img.name || !img.data) continue;
        try {
          const binary = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
          images.push({ name: img.name, type: img.type || "image/png", data: binary.buffer });
        } catch (_) {}
      }
    }

    if (images.length === 0) return json({ error: "at least one image is required" }, 400);

    const payload = {
      name: body.title.trim().slice(0, 100),
      message: {
        content: discordBody,
        attachments: images.map((img, i) => ({ id: i, filename: img.name })),
      },
    };
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    images.forEach((img, i) => {
      form.append(`files[${i}]`, new Blob([img.data], { type: img.type }), img.name);
    });

    const threadRes = await fetch(`${BASE}/channels/${eventsChannelId}/threads`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });

    if (!threadRes.ok) {
      const errText = await threadRes.text();
      return json({ error: `Discord API error (${threadRes.status})`, details: errText }, 502);
    }

    const thread = await threadRes.json();

    let updatedTemplate = existing.template_json;
    try {
      const parsed = JSON.parse(updatedTemplate);
      const target = parsed.template?.event
        || (parsed.eventforge && Array.isArray(parsed.events) && parsed.events[0])
        || parsed;
      target.date = scheduled_date;
      if (scheduled_end_date && scheduled_end_date !== scheduled_date) {
        target.endDate = scheduled_end_date;
        target.multiDay = true;
      } else {
        target.endDate = "";
        target.multiDay = false;
      }
      updatedTemplate = JSON.stringify(parsed);
    } catch (_) {}

    await db
      .prepare(
        `INSERT INTO idea_positions (message_id, column_name, scheduled_date, scheduled_end_date, template_json, updated_at)
         VALUES (?, 'used', ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           column_name = 'used',
           scheduled_date = excluded.scheduled_date,
           scheduled_end_date = excluded.scheduled_end_date,
           template_json = excluded.template_json,
           updated_at = excluded.updated_at`
      )
      .bind(message_id, scheduled_date, scheduled_end_date || null, updatedTemplate, now)
      .run();

    const guildId = context.env.DISCORD_GUILD_ID;
    const threadUrl = guildId
      ? `https://discord.com/channels/${guildId}/${thread.id}`
      : null;

    const cache2 = caches.default;
    const origin = new URL(context.request.url).origin;
    context.waitUntil(Promise.all([
      cache2.delete(new Request(origin + "/api/ideaboard", { method: "GET" })),
      cache2.delete(new Request(origin + "/api/ideaboard?fields=calendar", { method: "GET" })),
      cache2.delete(new Request(origin + "/api/events", { method: "GET" })),
    ]));

    return json({ ok: true, threadId: thread.id, threadUrl, publishedBy: user });
  } else {
    return json({ error: "invalid action" }, 400);
  }

  const cache = caches.default;
  const origin = new URL(context.request.url).origin;
  const cacheKey = new Request(origin + "/api/ideaboard", { method: "GET" });
  const calCacheKey = new Request(origin + "/api/ideaboard?fields=calendar", { method: "GET" });
  context.waitUntil(Promise.all([cache.delete(cacheKey), cache.delete(calCacheKey)]));

  return json({ ok: true });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return handlePost(context);
  const url = new URL(context.request.url);
  if (url.searchParams.get("fields") === "calendar") return handleCalendarGet(context);
  return handleGet(context);
}

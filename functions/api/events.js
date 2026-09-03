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

export function parseEventForgeDateField(content, field) {
  // \b so "Ends?" can't match inside words like "Weekend:"
  const re = new RegExp("\\b" + field + ":\\s*(.+)", "i");
  const m = content.match(re);
  if (!m) return null;
  let s = m[1].trim();
  // Discord timestamp token: <t:1724871600:F> or <t:1724871600>
  const ts = s.match(/<t:(\d+)(?::[tTdDfFR])?>/);
  if (ts) return new Date(parseInt(ts[1], 10) * 1000).toISOString();
  // Skip relative text like "in 2 days"
  if (/^in\s+\d/i.test(s)) return null;
  // Plain text fallback: "Friday, August 28, 2026 at 3:00 PM"
  s = s.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "");
  s = s.replace(/\s+at\s+/i, " ");
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function resolveMentions(text, mentions) {
  if (!text || !Array.isArray(mentions) || !mentions.length) return text;
  let t = text;
  for (const u of mentions) {
    if (!u || !u.id) continue;
    const name = u.global_name || u.username || "member";
    const display = name.charAt(0).toUpperCase() + name.slice(1);
    t = t.replace(new RegExp("<@!?" + u.id + ">", "g"), "**" + display + "**");
  }
  return t;
}

export function teamFromEmoji(name) {
  if (!name) return null;
  const cp = name.codePointAt(0);
  if (cp === 0x1F170) return "a";
  if (cp === 0x1F171) return "b";
  if (cp === 0x1F1E8) return "c";
  if (cp === 0x1F1E9) return "d";
  return null;
}

export function extractTeamEmbed(message) {
  if (!Array.isArray(message.embeds) || !message.embeds.length) return null;
  const embed = message.embeds[0];
  const title = (embed.title || "").trim();
  if (title !== "Team Assigned" && title !== "Team Removed") return null;
  const fields = embed.fields || [];
  const playerField = fields.find(f => f.name === "Player");
  if (!playerField) return null;
  if (title === "Team Removed") {
    return { player: playerField.value.trim(), team: null };
  }
  const teamField = fields.find(f => f.name === "Team");
  if (!teamField) return null;
  const letter = teamField.value.trim().slice(-1).toLowerCase();
  if (!"abcd".includes(letter)) return null;
  return { player: playerField.value.trim(), team: letter };
}

export function parseTeams(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  const sorted = messages.slice().sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  const assignments = new Map();
  for (const m of sorted) {
    const embed = extractTeamEmbed(m);
    if (embed) {
      const key = embed.player.toLowerCase();
      if (embed.team === null) assignments.delete(key);
      else assignments.set(key, { name: embed.player, team: embed.team });
      continue;
    }
    if (!Array.isArray(m.reactions) || !m.reactions.length) continue;
    if (!m.author) continue;
    for (const r of m.reactions) {
      const team = teamFromEmoji(r.emoji && r.emoji.name);
      if (team) {
        const author = m.author.global_name || m.author.username || "Unknown";
        assignments.set(author.toLowerCase(), { name: author, team });
        break;
      }
    }
  }
  if (assignments.size === 0) return null;
  const result = {};
  for (const [, entry] of assignments) {
    if (!result[entry.team]) result[entry.team] = [];
    result[entry.team].push(entry.name);
  }
  for (const t of Object.keys(result)) {
    result[t].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }
  return result;
}

export function isCheckmark(name) {
  if (!name) return false;
  const cp = name.codePointAt(0);
  return cp === 0x2705;
}

export function extractParticipantEmbed(message) {
  if (!Array.isArray(message.embeds) || !message.embeds.length) return null;
  const embed = message.embeds[0];
  const title = (embed.title || "").trim();
  if (title !== "Participant Added" && title !== "Participant Removed") return null;
  const fields = embed.fields || [];
  const playerField = fields.find(f => f.name === "Player");
  if (!playerField) return null;
  return {
    player: playerField.value.trim(),
    added: title === "Participant Added",
  };
}

export function parseParticipants(messages, reactors) {
  const participants = new Map();
  if (Array.isArray(reactors)) {
    for (const u of reactors) {
      if (!u || u.bot) continue;
      const name = u.global_name || u.username || "Unknown";
      participants.set(name.toLowerCase(), name);
    }
  }
  if (Array.isArray(messages) && messages.length) {
    const sorted = messages.slice().sort((a, b) => {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    for (const m of sorted) {
      const embed = extractParticipantEmbed(m);
      if (!embed) continue;
      const key = embed.player.toLowerCase();
      if (embed.added) participants.set(key, embed.player);
      else participants.delete(key);
    }
  }
  if (participants.size === 0) return null;
  const result = Array.from(participants.values());
  result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return result;
}

function capitalizeName(name) {
  if (!name) return name;
  return name.replace(/\b\w/g, c => c.toUpperCase());
}

export function parseWinner(messages, threadId) {
  if (!Array.isArray(messages) || !messages.length) return null;
  for (const m of messages) {
    if (m.id === threadId) continue;
    const c = (m.content || "");
    const hasTrophy = c.includes("\u{1F3C6}");
    if (!hasTrophy) continue;
    const mentioned = Array.isArray(m.mentions) && m.mentions.length
      ? m.mentions[0] : null;
    let winnerName;
    if (mentioned) {
      winnerName = mentioned.global_name || mentioned.username || "Unknown";
    } else {
      let afterTrophy = c.split("\u{1F3C6}").pop().split("\n")[0]
        .replace(/[!.,;:]+$/g, "").trim();
      afterTrophy = afterTrophy.replace(/^(?:congratulations|congrats|winner|grats)[!.,;:]*\s*/i, "")
        .replace(/[!.,;:]+$/g, "").trim();
      const wordCount = afterTrophy.split(/\s+/).length;
      winnerName = afterTrophy.length > 0 && afterTrophy.length < 40 && wordCount <= 3
        ? afterTrophy
        : (m.author.global_name || m.author.username || "Unknown");
    }
    return capitalizeName(winnerName);
  }
  return null;
}

export function transformThreads(threads, openingMessages, tagMap, threadMessages, threadReactors) {
  const msgMap = new Map();
  for (const m of Array.isArray(openingMessages) ? openingMessages : []) {
    if (m && m.id) msgMap.set(m.id, m);
  }

  const events = [];
  for (const t of Array.isArray(threads) ? threads : []) {
    if (/giveaway/i.test(t.name || "")) continue;
    const meta = t.thread_metadata || {};
    const createdAt = meta.create_timestamp
      || snowflakeToDate(t.id).toISOString();

    const status = meta.archived ? "completed" : "scheduled";

    const msg = msgMap.get(t.id);
    const content = msg ? (msg.content || "").trim() : "";
    const msgMentions = msg && Array.isArray(msg.mentions) ? msg.mentions : [];
    const attachments = msg && Array.isArray(msg.attachments) ? msg.attachments : [];
    const image = attachments.find((a) => (a.content_type || "").startsWith("image/"));

    const whenDate = parseEventForgeDateField(content, "When");
    const endsDate = parseEventForgeDateField(content, "Ends?");
    const description = resolveMentions(content, msgMentions);

    const appliedIds = Array.isArray(t.applied_tags) ? t.applied_tags : [];
    const tags = tagMap
      ? appliedIds.map(id => tagMap.get(id)).filter(Boolean)
      : [];

    const allMsgs = threadMessages && threadMessages.get(t.id);
    const teams = allMsgs ? parseTeams(allMsgs) : null;
    const reactors = threadReactors && threadReactors.get(t.id);
    const participants = (allMsgs || reactors) ? parseParticipants(allMsgs, reactors) : null;
    const winner = allMsgs ? parseWinner(allMsgs, t.id) : null;

    events.push({
      id: t.id,
      name: (t.name || "Event").slice(0, 200),
      description: description.slice(0, 2000),
      startTime: whenDate || createdAt,
      endTime: endsDate || null,
      hasParsedDate: !!whenDate,
      status,
      interestedCount: t.message_count || 0,
      image: image ? image.url : null,
      tags,
      teams,
      participants,
      winner,
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

  let tagMap = new Map();
  let openingMessages;
  const threadMessages = new Map();
  const threadReactors = new Map();
  try {
    const [channelRes, ...threadResults] = await Promise.all([
      fetch(
        `https://discord.com/api/v10/channels/${channelId}`,
        { headers }
      ),
      ...threads.map(async (t) => {
        const [openingRes, msgsRes, reactorsRes] = await Promise.all([
          fetch(
            `https://discord.com/api/v10/channels/${t.id}/messages/${t.id}`,
            { headers }
          ).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(
            `https://discord.com/api/v10/channels/${t.id}/messages?limit=100`,
            { headers }
          ).then((r) => (r.ok ? r.json() : [])).catch(() => []),
          fetch(
            `https://discord.com/api/v10/channels/${t.id}/messages/${t.id}/reactions/${encodeURIComponent("✅")}?limit=100`,
            { headers }
          ).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        const allMsgs = Array.isArray(msgsRes) ? [...msgsRes] : [];
        if (openingRes && !allMsgs.find(m => m.id === openingRes.id)) {
          allMsgs.push(openingRes);
        }
        threadMessages.set(t.id, allMsgs);
        if (Array.isArray(reactorsRes) && reactorsRes.length) {
          threadReactors.set(t.id, reactorsRes);
        }
        return openingRes;
      }),
    ]);
    openingMessages = threadResults;
    if (channelRes.ok) {
      const channelData = await channelRes.json();
      for (const tag of (channelData.available_tags || [])) {
        tagMap.set(tag.id, tag.name);
      }
    }
  } catch (e) {
    openingMessages = [];
  }

  const events = transformThreads(threads, openingMessages, tagMap, threadMessages, threadReactors);
  const res = json({ configured: true, events }, 200, {
    "Cache-Control": `public, max-age=${CACHE_TTL}`,
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

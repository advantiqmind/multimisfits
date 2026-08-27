// Cloudflare Pages Function  ->  GET /api/giveaway
// Reads the giveaway forum channel via Discord REST API.
// Each thread = one giveaway round. Leader replies with entry counts,
// confirmed by checkmark reaction. Pinned messages = winners.
//
// Required env:
//   DISCORD_BOT_TOKEN    (secret)
//   GIVEAWAY_CHANNEL_ID  (plain)  - the giveaway forum channel id
//   DISCORD_GUILD_ID     (plain)

const CACHE_TTL = 300;
const MAX_ROUNDS = 10;

function snowflakeToDate(id) {
  const DISCORD_EPOCH = 1420070400000;
  return new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH);
}

export function parseEventForgeDateField(content, field) {
  const re = new RegExp(field + ":\\s*(.+)", "i");
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

export function parsePrize(content) {
  const m = content.match(/^Prize:\s*(.+)/im);
  return m ? m[1].trim() : null;
}

export function parseEntryRate(content) {
  const m = content.match(/(\d+(?:\.\d+)?)\s*M?\s*(?:GP)?\s*=\s*(\d+)\s*entr/i);
  if (m) {
    const gp = parseFloat(m[1]);
    const entries = parseInt(m[2], 10);
    return entries > 0 ? gp / entries : 1;
  }
  return 1;
}

export function extractEntryCount(content) {
  if (!content) return null;
  const trimmed = content.trim();
  const exact = trimmed.match(/^(\d+)$/);
  if (exact) return parseInt(exact[1], 10);
  const withLabel = trimmed.match(/^(\d+)\s*(?:entr(?:y|ies)|x|tickets?|ducks?)\s*$/i);
  if (withLabel) return parseInt(withLabel[1], 10);
  const prefix = trimmed.match(/^(?:entries?|count|total):\s*(\d+)\s*$/i);
  if (prefix) return parseInt(prefix[1], 10);
  return null;
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

export function transformGiveawayData(threads, threadMessages) {
  const rounds = [];

  for (const thread of (Array.isArray(threads) ? threads : [])) {
    const meta = thread.thread_metadata || {};
    const createdAt = meta.create_timestamp || snowflakeToDate(thread.id).toISOString();
    const messages = threadMessages.get ? threadMessages.get(thread.id) || [] : [];

    const opening = messages.find(m => m.id === thread.id);
    const content = opening ? (opening.content || "").trim() : "";
    const openingMentions = opening && Array.isArray(opening.mentions) ? opening.mentions : [];
    const attachments = opening && Array.isArray(opening.attachments) ? opening.attachments : [];
    const image = attachments.find(a => (a.content_type || "").startsWith("image/"));

    const whenDate = parseEventForgeDateField(content, "When");
    const endsDate = parseEventForgeDateField(content, "Ends");

    const prize = parsePrize(content);
    const gpPerEntry = parseEntryRate(content);

    const msgMap = new Map();
    for (const m of messages) {
      msgMap.set(m.id, m);
    }

    const entries = [];
    const participantCounts = new Map();

    for (const m of messages) {
      if (m.id === thread.id) continue;
      if (!m.message_reference || !m.message_reference.message_id) continue;

      const entryCount = extractEntryCount(m.content || "");
      if (entryCount === null || entryCount <= 0) continue;

      const reactions = m.reactions || [];
      const hasCheck = reactions.some(r => {
        const name = r.emoji && (r.emoji.name || "");
        return name === "✅" || name === "white_check_mark";
      });
      if (!hasCheck) continue;

      const refMsg = msgMap.get(m.message_reference.message_id);
      const participant = refMsg
        ? (refMsg.author.global_name || refMsg.author.username || "Unknown")
        : "Unknown";
      const participantId = refMsg ? refMsg.author.id : ("unknown-" + m.id);

      entries.push({
        player: participant,
        playerId: participantId,
        count: entryCount,
        confirmedBy: m.author.global_name || m.author.username || "Leader",
        timestamp: m.timestamp,
      });

      participantCounts.set(participantId, (participantCounts.get(participantId) || 0) + entryCount);
    }

    const totalEntries = entries.reduce((sum, e) => sum + e.count, 0);
    const totalParticipants = participantCounts.size;
    const gpRaised = totalEntries * gpPerEntry;

    const pinnedMessages = messages.filter(m => m.pinned && m.id !== thread.id);
    const winners = pinnedMessages.map(m => ({
      name: m.author.global_name || m.author.username || "Unknown",
      message: (m.content || "").slice(0, 500),
      timestamp: m.timestamp,
    }));

    const description = resolveMentions(content, openingMentions);
    const status = meta.archived ? "completed" : "scheduled";

    rounds.push({
      id: thread.id,
      name: (thread.name || "Giveaway").slice(0, 200),
      description: description.slice(0, 2000),
      startTime: whenDate || createdAt,
      endTime: endsDate || null,
      hasParsedDate: !!whenDate,
      status,
      prize: prize || "TBA",
      gpPerEntry,
      entries,
      totalEntries,
      totalParticipants,
      gpRaised,
      winners,
      image: image ? image.url : null,
    });
  }

  rounds.sort((a, b) => {
    const order = { scheduled: 0, completed: 1 };
    const oa = order[a.status] != null ? order[a.status] : 0;
    const ob = order[b.status] != null ? order[b.status] : 0;
    if (oa !== ob) return oa - ob;
    return new Date(b.startTime) - new Date(a.startTime);
  });

  return rounds;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export async function onRequest(context) {
  const token = context.env && context.env.DISCORD_BOT_TOKEN;
  const channelId = context.env && context.env.GIVEAWAY_CHANNEL_ID;
  const guildId = context.env && context.env.DISCORD_GUILD_ID;

  if (!token || !channelId || !guildId) {
    return json({ configured: false, rounds: [] }, 200, {
      "Cache-Control": "public, max-age=60",
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/giveaway",
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
      fetch(`https://discord.com/api/v10/guilds/${guildId}/threads/active`, { headers }),
      fetch(`https://discord.com/api/v10/channels/${channelId}/threads/archived/public?limit=${MAX_ROUNDS}`, { headers }),
    ]);

    if (!activeRes.ok && !archivedRes.ok) {
      return json({ configured: true, error: "discord_" + activeRes.status, rounds: [] }, 502);
    }

    const activeData = activeRes.ok ? await activeRes.json() : { threads: [] };
    const archivedData = archivedRes.ok ? await archivedRes.json() : { threads: [] };

    const active = (activeData.threads || []).filter(t => t.parent_id === channelId);
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
    return json({ configured: true, error: "fetch_failed", rounds: [] }, 502);
  }

  if (!threads.length) {
    const res = json({ configured: true, rounds: [] }, 200, {
      "Cache-Control": `public, max-age=${CACHE_TTL}`,
    });
    context.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  threads.sort((a, b) => {
    const dateA = (a.thread_metadata && a.thread_metadata.create_timestamp) || snowflakeToDate(a.id).toISOString();
    const dateB = (b.thread_metadata && b.thread_metadata.create_timestamp) || snowflakeToDate(b.id).toISOString();
    return dateB.localeCompare(dateA);
  });
  threads = threads.slice(0, MAX_ROUNDS);

  const threadMessages = new Map();
  try {
    await Promise.all(
      threads.map(async (t) => {
        try {
          const [msgsRes, openingRes] = await Promise.all([
            fetch(`https://discord.com/api/v10/channels/${t.id}/messages?limit=100`, { headers }),
            fetch(`https://discord.com/api/v10/channels/${t.id}/messages/${t.id}`, { headers }),
          ]);

          const msgs = msgsRes.ok ? await msgsRes.json() : [];
          const opening = openingRes.ok ? await openingRes.json() : null;

          const allMsgs = Array.isArray(msgs) ? [...msgs] : [];
          if (opening && !allMsgs.find(m => m.id === opening.id)) {
            allMsgs.push(opening);
          }

          threadMessages.set(t.id, allMsgs);
        } catch (e) {
          threadMessages.set(t.id, []);
        }
      })
    );
  } catch (e) {
    // proceed with whatever we have
  }

  const rounds = transformGiveawayData(threads, threadMessages);
  const res = json({ configured: true, rounds }, 200, {
    "Cache-Control": `public, max-age=${CACHE_TTL}`,
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

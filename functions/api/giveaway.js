// Cloudflare Pages Function  ->  GET /api/giveaway
// Reads the giveaway forum channel via Discord REST API.
// Each thread = one giveaway round. Leaders react with 1/2 keycap emoji
// on member screenshots to confirm entries. Pinned messages = winners.
//
// Required env:
//   DISCORD_BOT_TOKEN    (secret)
//   GIVEAWAY_CHANNEL_ID  (plain)  - the giveaway forum channel id
//   DISCORD_GUILD_ID     (plain)

const CACHE_TTL = 60;
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
  const explicit = content.match(/^Prize:\s*(.+)/im);
  if (explicit) return explicit[1].trim();
  const bold = content.match(/giving away (?:an?\s+)?\*\*(.+?)\*\*/i);
  if (bold) return bold[1].trim();
  return null;
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

const GIVEAWAY_CYCLE_DAYS = 14;

function defaultEndDate(startISO) {
  const d = new Date(startISO);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + GIVEAWAY_CYCLE_DAYS);
  return d.toISOString();
}

const MAX_ENTRIES_PER_PERSON = 2;

export function extractEntryCountFromReactions(reactions) {
  if (!Array.isArray(reactions) || !reactions.length) return 0;
  let count = 0;
  for (const r of reactions) {
    const name = r.emoji && (r.emoji.name || "");
    if (name === "1️⃣" || name === "1⃣") count += 1;
    else if (name === "2️⃣" || name === "2⃣") count += 2;
  }
  return Math.min(count, MAX_ENTRIES_PER_PERSON);
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

    const entries = [];
    const participantCounts = new Map();

    for (const m of messages) {
      if (m.id === thread.id) continue;

      const entryCount = extractEntryCountFromReactions(m.reactions);
      if (entryCount <= 0) continue;

      const participant = m.author.global_name || m.author.username || "Unknown";
      const participantId = m.author.id;

      const existing = participantCounts.get(participantId) || 0;
      const allowed = Math.min(entryCount, MAX_ENTRIES_PER_PERSON - existing);
      if (allowed <= 0) continue;

      entries.push({
        player: participant,
        playerId: participantId,
        count: allowed,
        timestamp: m.timestamp,
      });

      participantCounts.set(participantId, existing + allowed);
    }

    const totalEntries = entries.reduce((sum, e) => sum + e.count, 0);
    const totalParticipants = participantCounts.size;
    const gpRaised = totalEntries * gpPerEntry;

    const winners = [];
    for (const m of messages) {
      if (m.id === thread.id) continue;
      const c = (m.content || "");
      const hasTrophy = c.includes("\u{1F3C6}");
      if (!hasTrophy && !m.pinned) continue;
      const mentioned = Array.isArray(m.mentions) && m.mentions.length
        ? m.mentions[0] : null;
      let winnerName;
      if (mentioned) {
        winnerName = mentioned.global_name || mentioned.username || "Unknown";
      } else if (hasTrophy) {
        let afterTrophy = c.split("\u{1F3C6}").pop().split("\n")[0]
          .replace(/[!.,;:]+$/g, "").trim();
        afterTrophy = afterTrophy.replace(/^(?:congratulations|congrats|winner|grats)[!.,;:]*\s*/i, "")
          .replace(/[!.,;:]+$/g, "").trim();
        const wordCount = afterTrophy.split(/\s+/).length;
        winnerName = afterTrophy.length > 0 && afterTrophy.length < 40 && wordCount <= 3
          ? afterTrophy
          : (m.author.global_name || m.author.username || "Unknown");
      } else {
        winnerName = m.author.global_name || m.author.username || "Unknown";
      }
      winners.push({
        name: winnerName,
        message: c.slice(0, 500),
        timestamp: m.timestamp,
      });
    }

    const description = resolveMentions(content, openingMentions);
    const status = meta.archived ? "completed" : "scheduled";

    rounds.push({
      id: thread.id,
      name: (thread.name || "Giveaway").slice(0, 200),
      description: description.slice(0, 2000),
      startTime: whenDate || createdAt,
      endTime: endsDate || (!meta.archived ? defaultEndDate(whenDate || createdAt) : null),
      hasParsedDate: true,
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

  const url = new URL(context.request.url);
  const debug = url.searchParams.get("debug") === "1";

  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/giveaway", { method: "GET" });
  if (!debug) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

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
  const debugInfo = debug ? [] : null;
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

          if (debugInfo) {
            const openingMsg = allMsgs.find(m => m.id === t.id);
            debugInfo.push({
              threadId: t.id,
              threadName: t.name,
              msgsStatus: msgsRes.status,
              openingStatus: openingRes.status,
              totalMessages: allMsgs.length,
              openingFound: !!openingMsg,
              openingContentLength: openingMsg ? (openingMsg.content || "").length : 0,
              openingContentPreview: openingMsg ? (openingMsg.content || "").slice(0, 200) : null,
              messagesWithReactions: allMsgs.filter(m => m.reactions && m.reactions.length).length,
              reactions: allMsgs.filter(m => m.reactions && m.reactions.length).map(m => ({
                msgId: m.id,
                author: m.author && m.author.global_name,
                reactions: m.reactions.map(r => ({ name: r.emoji && r.emoji.name, count: r.count })),
              })),
              trophyMessages: allMsgs.filter(m => (m.content || "").includes("\u{1F3C6}")).map(m => ({
                msgId: m.id,
                content: (m.content || "").slice(0, 100),
                mentions: (m.mentions || []).map(u => u.global_name || u.username),
              })),
            });
          }
        } catch (e) {
          threadMessages.set(t.id, []);
          if (debugInfo) debugInfo.push({ threadId: t.id, error: e.message });
        }
      })
    );
  } catch (e) {
    // proceed with whatever we have
  }

  const rounds = transformGiveawayData(threads, threadMessages);

  if (debug) {
    return json({ configured: true, rounds, _debug: debugInfo }, 200, {
      "Cache-Control": "no-store",
    });
  }

  const res = json({ configured: true, rounds }, 200, {
    "Cache-Control": `public, max-age=${CACHE_TTL}`,
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

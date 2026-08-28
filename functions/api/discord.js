// Cloudflare Pages Function  ->  /api/discord
// Discord interactions endpoint for slash commands.
// GET  = one-time command registration (visit in browser to set up)
// POST = Discord interaction handler (signature-verified)
//
// Required env:
//   DISCORD_BOT_TOKEN   (secret)
//   DISCORD_PUBLIC_KEY   (plain) - from Discord Developer Portal
//   DISCORD_GUILD_ID     (plain)
//   REFERRAL_THREAD_ID   (plain, optional) - for /referralstats
//   GIVEAWAY_CHANNEL_ID  (plain, optional) - for /giveawaystats, /giveawaylast

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function verifySignature(request, publicKeyHex) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();

  if (!signature || !timestamp) return { valid: false, body };

  const key = await crypto.subtle.importKey(
    "raw",
    hexToUint8Array(publicKeyHex),
    { name: "Ed25519", namedCurve: "Ed25519" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + body)
  );

  return { valid, body };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const COMMANDS = [
  {
    name: "referralstats",
    description: "Show referral code redemption breakdown",
    type: 1,
  },
  {
    name: "giveawaystats",
    description: "Show the current active giveaway round",
    type: 1,
  },
  {
    name: "giveawaylast",
    description: "Show the last completed giveaway round",
    type: 1,
  },
  {
    name: "rank",
    description: "Look up a player's clan rank and stats",
    type: 1,
    options: [
      {
        name: "username",
        description: "RuneScape username to look up",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "website",
    description: "Get the Multi-Misfits website link",
    type: 1,
  },
  {
    name: "status",
    description: "Check which site features are configured and online",
    type: 1,
  },
];

async function getAppId(token) {
  const res = await fetch(
    "https://discord.com/api/v10/oauth2/applications/@me",
    {
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": "Multi-Misfits clan website",
      },
    }
  );
  if (!res.ok) return null;
  const app = await res.json();
  return app.id;
}

async function registerCommands(token, guildId) {
  const appId = await getAppId(token);
  if (!appId) return json({ error: "could not fetch app id" }, 500);

  const res = await fetch(
    `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Multi-Misfits clan website",
      },
      body: JSON.stringify(COMMANDS),
    }
  );

  const data = await res.json();
  return json({ registered: res.ok, commands: data });
}

// ---------------------------------------------------------------------------
// /referralstats
// ---------------------------------------------------------------------------
async function handleReferralStats(interaction, token, threadId, appId, referralCodes) {
  const authHeaders = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  const codeCounts = {};
  if (referralCodes) {
    for (const c of referralCodes.split(",")) {
      const code = c.trim();
      if (code) codeCounts[code] = 0;
    }
  }
  let total = 0;

  if (threadId) {
    const msgsRes = await fetch(
      `https://discord.com/api/v10/channels/${threadId}/messages?limit=100`,
      { headers: authHeaders }
    );
    if (msgsRes.ok) {
      const msgs = await msgsRes.json();
      for (const m of msgs) {
        if (!Array.isArray(m.embeds) || !m.embeds.length) continue;
        const fields = m.embeds[0].fields || [];
        const codeField = fields.find((f) => f.name === "Code");
        if (!codeField) continue;
        codeCounts[codeField.value] = (codeCounts[codeField.value] || 0) + 1;
        total++;
      }
    }
  }

  const entries = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);
  const breakdown = entries.length
    ? entries.map(([code, count]) => `**${code}** -- ${count}`).join("\n")
    : "No redemptions yet.";

  await patchFollowup(appId, interaction.token, {
    embeds: [
      {
        title: "Referral Code Stats",
        color: 0x2ecc71,
        description: breakdown,
        footer: { text: `${total} total redemptions` },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Giveaway helpers (inlined from giveaway.js -- can't import across functions)
// ---------------------------------------------------------------------------
const MAX_GIVEAWAY_ROUNDS = 10;
const GIVEAWAY_CYCLE_DAYS = 14;
const MAX_ENTRIES_PER_PERSON = 2;

function snowflakeToDate(id) {
  const DISCORD_EPOCH = 1420070400000;
  return new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH);
}

function parseEventForgeDateField(content, field) {
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

function parsePrize(content) {
  const explicit = content.match(/^Prize:\s*(.+)/im);
  if (explicit) return explicit[1].trim();
  const bold = content.match(/giving away (?:an?\s+)?\*\*(.+?)\*\*/i);
  if (bold) return bold[1].trim();
  return null;
}

function parseEntryRate(content) {
  const m = content.match(/(\d+(?:\.\d+)?)\s*M?\s*(?:GP)?\s*=\s*(\d+)\s*entr/i);
  if (m) {
    const gp = parseFloat(m[1]);
    const entries = parseInt(m[2], 10);
    return entries > 0 ? gp / entries : 1;
  }
  return 1;
}

function defaultEndDate(startISO) {
  const d = new Date(startISO);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + GIVEAWAY_CYCLE_DAYS);
  return d.toISOString();
}

function capitalizeName(name) {
  if (!name) return name;
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractEntryCountFromReactions(reactions) {
  if (!Array.isArray(reactions) || !reactions.length) return 0;
  let count = 0;
  for (const r of reactions) {
    const name = r.emoji && (r.emoji.name || "");
    if (name === "1️⃣" || name === "1⃣") count += 1;
    else if (name === "2️⃣" || name === "2⃣") count += 2;
  }
  return Math.min(count, MAX_ENTRIES_PER_PERSON);
}

async function fetchGiveawayRounds(token, guildId, channelId) {
  const headers = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  const [activeRes, archivedRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/threads/active`, { headers }),
    fetch(`https://discord.com/api/v10/channels/${channelId}/threads/archived/public?limit=${MAX_GIVEAWAY_ROUNDS}`, { headers }),
  ]);

  if (!activeRes.ok && !archivedRes.ok) return [];

  const activeData = activeRes.ok ? await activeRes.json() : { threads: [] };
  const archivedData = archivedRes.ok ? await archivedRes.json() : { threads: [] };

  const active = (activeData.threads || []).filter((t) => t.parent_id === channelId);
  const archived = archivedData.threads || [];

  const seen = new Set();
  let threads = [];
  for (const t of [...active, ...archived]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      threads.push(t);
    }
  }

  threads.sort((a, b) => {
    const dateA = (a.thread_metadata && a.thread_metadata.create_timestamp) || snowflakeToDate(a.id).toISOString();
    const dateB = (b.thread_metadata && b.thread_metadata.create_timestamp) || snowflakeToDate(b.id).toISOString();
    return dateB.localeCompare(dateA);
  });
  threads = threads.slice(0, MAX_GIVEAWAY_ROUNDS);

  const threadMessages = new Map();
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
        if (opening && !allMsgs.find((m) => m.id === opening.id)) allMsgs.push(opening);
        threadMessages.set(t.id, allMsgs);
      } catch (e) {
        threadMessages.set(t.id, []);
      }
    })
  );

  const rounds = [];
  for (const thread of threads) {
    const meta = thread.thread_metadata || {};
    const createdAt = meta.create_timestamp || snowflakeToDate(thread.id).toISOString();
    const messages = threadMessages.get(thread.id) || [];

    const opening = messages.find((m) => m.id === thread.id);
    const content = opening ? (opening.content || "").trim() : "";

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
      entries.push({ player: participant, count: allowed });
      participantCounts.set(participantId, existing + allowed);
    }

    const totalEntries = entries.reduce((sum, e) => sum + e.count, 0);
    const totalParticipants = participantCounts.size;
    const gpRaised = totalEntries * gpPerEntry;

    const winners = [];
    for (const m of messages) {
      if (m.id === thread.id) continue;
      const c = m.content || "";
      const hasTrophy = c.includes("\u{1F3C6}");
      if (!hasTrophy && !m.pinned) continue;
      const mentioned = Array.isArray(m.mentions) && m.mentions.length ? m.mentions[0] : null;
      let winnerName;
      if (mentioned) {
        winnerName = mentioned.global_name || mentioned.username || "Unknown";
      } else if (hasTrophy) {
        let afterTrophy = c.split("\u{1F3C6}").pop().split("\n")[0].replace(/[!.,;:]+$/g, "").trim();
        afterTrophy = afterTrophy.replace(/^(?:congratulations|congrats|winner|grats)[!.,;:]*\s*/i, "").replace(/[!.,;:]+$/g, "").trim();
        const wordCount = afterTrophy.split(/\s+/).length;
        winnerName = afterTrophy.length > 0 && afterTrophy.length < 40 && wordCount <= 3
          ? afterTrophy
          : (m.author.global_name || m.author.username || "Unknown");
      } else {
        winnerName = m.author.global_name || m.author.username || "Unknown";
      }
      winners.push({ name: capitalizeName(winnerName) });
    }

    const status = meta.archived ? "completed" : "scheduled";
    rounds.push({
      name: (thread.name || "Giveaway").slice(0, 200),
      startTime: whenDate || createdAt,
      endTime: endsDate || (!meta.archived ? defaultEndDate(whenDate || createdAt) : null),
      status,
      prize: prize || "TBA",
      gpPerEntry,
      totalEntries,
      totalParticipants,
      gpRaised,
      winners,
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

function formatDate(iso) {
  if (!iso) return "TBA";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCountdown(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - Date.now();
  if (diff <= 0) return "ended";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

// ---------------------------------------------------------------------------
// /giveawaystats
// ---------------------------------------------------------------------------
async function handleGiveawayStats(interaction, token, guildId, channelId, appId) {
  if (!channelId) {
    return patchFollowup(appId, interaction.token, {
      content: "Giveaway channel is not configured.",
      flags: 64,
    });
  }

  const rounds = await fetchGiveawayRounds(token, guildId, channelId);
  const active = rounds.find((r) => r.status === "scheduled");

  if (!active) {
    return patchFollowup(appId, interaction.token, {
      embeds: [
        {
          title: "No Active Giveaway",
          color: 0x95a5a6,
          description: "There's no giveaway running right now. Check back later!",
        },
      ],
    });
  }

  const countdown = formatCountdown(active.endTime);

  const fields = [
    { name: "Prize", value: active.prize, inline: true },
    { name: "GP per Entry", value: `${active.gpPerEntry}M`, inline: true },
    { name: "Entries", value: String(active.totalEntries), inline: true },
    { name: "Participants", value: String(active.totalParticipants), inline: true },
    { name: "GP Raised", value: `${active.gpRaised}M`, inline: true },
  ];

  if (countdown && countdown !== "ended") {
    fields.push({ name: "Time Left", value: countdown, inline: true });
  }

  if (active.endTime) {
    fields.push({ name: "Ends", value: formatDate(active.endTime), inline: true });
  }

  await patchFollowup(appId, interaction.token, {
    embeds: [
      {
        title: `Giveaway: ${active.name}`,
        color: 0x2ecc71,
        fields,
        footer: { text: `Started ${formatDate(active.startTime)}` },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// /giveawaylast
// ---------------------------------------------------------------------------
async function handleGiveawayLast(interaction, token, guildId, channelId, appId) {
  if (!channelId) {
    return patchFollowup(appId, interaction.token, {
      content: "Giveaway channel is not configured.",
      flags: 64,
    });
  }

  const rounds = await fetchGiveawayRounds(token, guildId, channelId);
  const completed = rounds.filter((r) => r.status === "completed");
  const last = completed.length ? completed[0] : null;

  if (!last) {
    return patchFollowup(appId, interaction.token, {
      embeds: [
        {
          title: "No Completed Giveaways",
          color: 0x95a5a6,
          description: "No giveaway rounds have been completed yet.",
        },
      ],
    });
  }

  const winnerText = last.winners.length
    ? last.winners.map((w) => w.name).join(", ")
    : "No winner recorded";

  const fields = [
    { name: "Winner", value: winnerText, inline: false },
    { name: "Prize", value: last.prize, inline: true },
    { name: "Total Entries", value: String(last.totalEntries), inline: true },
    { name: "Participants", value: String(last.totalParticipants), inline: true },
    { name: "GP Raised", value: `${last.gpRaised}M`, inline: true },
  ];

  await patchFollowup(appId, interaction.token, {
    embeds: [
      {
        title: `Last Giveaway: ${last.name}`,
        color: 0xe74c3c,
        fields,
        footer: { text: `Ran ${formatDate(last.startTime)} -- ${formatDate(last.endTime || last.startTime)} | Completed` },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// /rank USERNAME
// ---------------------------------------------------------------------------
const WOM_GROUP_ID = 26075;

const RANK_ORDER = {
  owner: 120, deputy_owner: 110, colonel: 95, captain: 90, paladin: 75,
  knight: 70, expert: 60, inquisitor: 50, striker: 40, duellist: 30,
  beast: 25, squire: 20,
};

function prettyRole(role) {
  return String(role || "member")
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatXP(xp) {
  if (xp >= 1000000) return (xp / 1000000).toFixed(1) + "M";
  if (xp >= 1000) return (xp / 1000).toFixed(0) + "K";
  return String(xp);
}

async function handleRank(interaction, appId) {
  const options = (interaction.data && interaction.data.options) || [];
  const usernameOpt = options.find((o) => o.name === "username");
  const username = usernameOpt ? usernameOpt.value.trim() : "";

  if (!username) {
    return patchFollowup(appId, interaction.token, {
      content: "Please provide a username.",
      flags: 64,
    });
  }

  let group;
  try {
    const res = await fetch(`https://api.wiseoldman.net/v2/groups/${WOM_GROUP_ID}`, {
      headers: { "User-Agent": "Multi-Misfits clan website (WOM group 26075)" },
    });
    if (!res.ok) {
      return patchFollowup(appId, interaction.token, {
        content: "Could not reach Wise Old Man. Try again later.",
        flags: 64,
      });
    }
    group = await res.json();
  } catch (e) {
    return patchFollowup(appId, interaction.token, {
      content: "Could not reach Wise Old Man. Try again later.",
      flags: 64,
    });
  }

  const memberships = Array.isArray(group.memberships) ? group.memberships : [];
  const searchLower = username.toLowerCase().replace(/[\s_-]+/g, " ");
  const member = memberships.find((m) => {
    const p = m.player || {};
    const name = (p.displayName || p.username || "").toLowerCase().replace(/[\s_-]+/g, " ");
    return name === searchLower;
  });

  if (!member) {
    return patchFollowup(appId, interaction.token, {
      embeds: [
        {
          title: "Player Not Found",
          color: 0xe74c3c,
          description: `**${username}** is not in the Multi-Misfits clan on Wise Old Man.`,
        },
      ],
    });
  }

  const p = member.player || {};
  const roleKey = member.role || "member";
  const priority = RANK_ORDER[roleKey] != null ? RANK_ORDER[roleKey] : 10;
  const displayName = p.displayName || p.username || username;

  const allSorted = memberships
    .map((m) => ({
      exp: (m.player && typeof m.player.exp === "number") ? m.player.exp : 0,
    }))
    .sort((a, b) => b.exp - a.exp);
  const playerExp = typeof p.exp === "number" ? p.exp : 0;
  const xpRank = allSorted.findIndex((m) => m.exp === playerExp) + 1;

  const fields = [
    { name: "Rank", value: prettyRole(roleKey), inline: true },
    { name: "Total XP", value: formatXP(playerExp), inline: true },
    { name: "EHB", value: typeof p.ehb === "number" ? p.ehb.toFixed(1) : "N/A", inline: true },
    { name: "XP Position", value: `#${xpRank} of ${memberships.length}`, inline: true },
  ];

  await patchFollowup(appId, interaction.token, {
    embeds: [
      {
        title: displayName,
        color: 0x3498db,
        fields,
        footer: { text: "Data from Wise Old Man" },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// /website
// ---------------------------------------------------------------------------
async function handleWebsite(interaction, appId) {
  await patchFollowup(appId, interaction.token, {
    embeds: [
      {
        title: "Multi-Misfits",
        color: 0xf1c40f,
        description: "Check out our clan website for news, events, giveaways, roster, and more!",
        url: "https://multimisfits.us",
        fields: [
          { name: "Website", value: "[multimisfits.us](https://multimisfits.us)", inline: false },
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// /status
// ---------------------------------------------------------------------------
async function handleStatus(interaction, env, appId) {
  const checks = [
    { name: "Discord Bot", ok: !!(env.DISCORD_BOT_TOKEN) },
    { name: "News Feed", ok: !!(env.ANNOUNCEMENTS_CHANNEL_ID) },
    { name: "Events", ok: !!(env.EVENTS_CHANNEL_ID) },
    { name: "Achievements", ok: !!(env.CHEST_CHANNEL_ID) },
    { name: "Giveaways", ok: !!(env.GIVEAWAY_CHANNEL_ID) },
    { name: "Referral Tracking", ok: !!(env.REFERRAL_THREAD_ID) },
    { name: "Spotlight", ok: !!(env.SPOTLIGHT_CHANNEL_ID) },
  ];

  const lines = checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.name}`);
  const allGood = checks.every((c) => c.ok);

  await patchFollowup(appId, interaction.token, {
    embeds: [
      {
        title: "Site Status",
        color: allGood ? 0x2ecc71 : 0xf39c12,
        description: lines.join("\n"),
        footer: { text: `Checked ${new Date().toUTCString()}` },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Shared: patch followup message
// ---------------------------------------------------------------------------
async function patchFollowup(appId, interactionToken, payload) {
  await fetch(
    `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function onRequest(context) {
  const env = context.env || {};
  const token = env.DISCORD_BOT_TOKEN;
  const publicKey = env.DISCORD_PUBLIC_KEY;
  const guildId = env.DISCORD_GUILD_ID;
  const threadId = env.REFERRAL_THREAD_ID;
  const channelId = env.GIVEAWAY_CHANNEL_ID;
  const referralCodes = env.REFERRAL_CODES;

  if (context.request.method === "GET") {
    if (!token || !guildId) return json({ error: "not_configured" });
    return registerCommands(token, guildId);
  }

  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!publicKey) return new Response("Not configured", { status: 500 });

  const { valid, body } = await verifySignature(context.request, publicKey);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(body);

  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  if (interaction.type === 2) {
    const name = interaction.data && interaction.data.name;
    const appId = interaction.application_id;

    if (name === "referralstats") {
      context.waitUntil(handleReferralStats(interaction, token, threadId, appId, referralCodes));
      return json({ type: 5 });
    }

    if (name === "giveawaystats") {
      context.waitUntil(handleGiveawayStats(interaction, token, guildId, channelId, appId));
      return json({ type: 5 });
    }

    if (name === "giveawaylast") {
      context.waitUntil(handleGiveawayLast(interaction, token, guildId, channelId, appId));
      return json({ type: 5 });
    }

    if (name === "rank") {
      context.waitUntil(handleRank(interaction, appId));
      return json({ type: 5 });
    }

    if (name === "website") {
      context.waitUntil(handleWebsite(interaction, appId));
      return json({ type: 5 });
    }

    if (name === "status") {
      context.waitUntil(handleStatus(interaction, env, appId));
      return json({ type: 5 });
    }

    return json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
  }

  return json({ type: 4, data: { content: "Unhandled interaction.", flags: 64 } });
}

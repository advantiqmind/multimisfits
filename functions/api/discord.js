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
//   EVENTS_CHANNEL_ID    (plain, optional) - for /event
//   CHEST_CHANNEL_ID     (plain, optional) - for /topdrops

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
  {
    name: "event",
    description: "Show the current or next upcoming clan event",
    type: 1,
  },
  {
    name: "clanstats",
    description: "Show clan overview from Wise Old Man",
    type: 1,
  },
  {
    name: "topdrops",
    description: "Show the most recent valuable drops",
    type: 1,
  },
  {
    name: "help",
    description: "List all available bot commands",
    type: 1,
  },
  {
    name: "inactives",
    description: "Show members who haven't authenticated on the site recently",
    type: 1,
    options: [
      {
        name: "days",
        description: "Number of days to check (default 30)",
        type: 4,
        required: false,
        min_value: 1,
        max_value: 365,
      },
    ],
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

  let rounds;
  try {
    rounds = await fetchGiveawayRounds(token, guildId, channelId);
  } catch (e) {
    return patchFollowup(appId, interaction.token, {
      content: "Could not fetch giveaway data. Try again in a moment.",
      flags: 64,
    });
  }
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

  let rounds;
  try {
    rounds = await fetchGiveawayRounds(token, guildId, channelId);
  } catch (e) {
    return patchFollowup(appId, interaction.token, {
      content: "Could not fetch giveaway data. Try again in a moment.",
      flags: 64,
    });
  }
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
    { name: "Auth Gate", ok: !!(env.DB && env.DISCORD_CLIENT_ID) },
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
// /event
// ---------------------------------------------------------------------------
async function handleEvent(interaction, token, guildId, eventsChannelId, appId) {
  if (!eventsChannelId || !guildId) {
    return patchFollowup(appId, interaction.token, {
      content: "Events channel is not configured.",
      flags: 64,
    });
  }

  const authHeaders = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  let threads;
  try {
    const [activeRes, archivedRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${guildId}/threads/active`, { headers: authHeaders }),
      fetch(`https://discord.com/api/v10/channels/${eventsChannelId}/threads/archived/public?limit=10`, { headers: authHeaders }),
    ]);
    if (!activeRes.ok && !archivedRes.ok) {
      return patchFollowup(appId, interaction.token, {
        content: "Could not fetch events from Discord.",
        flags: 64,
      });
    }
    const activeData = activeRes.ok ? await activeRes.json() : { threads: [] };
    const archivedData = archivedRes.ok ? await archivedRes.json() : { threads: [] };
    const active = (activeData.threads || []).filter((t) => t.parent_id === eventsChannelId);
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
    return patchFollowup(appId, interaction.token, {
      content: "Could not fetch events from Discord.",
      flags: 64,
    });
  }

  threads = threads.filter((t) => !/giveaway/i.test(t.name || ""));
  if (!threads.length) {
    return patchFollowup(appId, interaction.token, {
      embeds: [{
        title: "No Events",
        color: 0x95a5a6,
        description: "No events posted right now.",
      }],
    });
  }

  threads = threads.slice(0, 10);
  const openingMsgs = await Promise.all(
    threads.map((t) =>
      fetch(`https://discord.com/api/v10/channels/${t.id}/messages/${t.id}`, { headers: authHeaders })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );
  const msgMap = new Map();
  for (const m of openingMsgs) {
    if (m && m.id) msgMap.set(m.id, m);
  }

  const now = Date.now();
  const events = [];
  for (const t of threads) {
    const meta = t.thread_metadata || {};
    const createdAt = meta.create_timestamp || snowflakeToDate(t.id).toISOString();
    const msg = msgMap.get(t.id);
    const content = msg ? (msg.content || "").trim() : "";
    const whenDate = parseEventForgeDateField(content, "When");
    const endsDate = parseEventForgeDateField(content, "Ends");
    const name = (t.name || "Event").slice(0, 200);
    const startTime = whenDate || createdAt;
    const endTime = endsDate || null;

    const hasLiveTag = /\[LIVE\]/i.test(name);
    const startMs = new Date(startTime).getTime();
    const endMs = endTime ? new Date(endTime).getTime() : null;

    let status;
    if (hasLiveTag) status = "live";
    else if (meta.archived || (endMs && now >= endMs)) status = "completed";
    else if (now >= startMs) status = "live";
    else status = "scheduled";

    events.push({ name, description: content.slice(0, 400), startTime, endTime, status });
  }

  const live = events.find((e) => e.status === "live");
  const upcoming = events
    .filter((e) => e.status === "scheduled")
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const best = live || (upcoming.length ? upcoming[0] : null);

  if (!best) {
    return patchFollowup(appId, interaction.token, {
      embeds: [{
        title: "No Upcoming Events",
        color: 0x95a5a6,
        description: "No live or upcoming events right now. Check [the website](https://multimisfits.us/events.html) for the full schedule.",
      }],
    });
  }

  const fields = [];
  if (best.status === "live") {
    fields.push({ name: "Status", value: "LIVE NOW", inline: true });
    if (best.endTime) {
      const diff = new Date(best.endTime).getTime() - now;
      if (diff > 0) {
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const mn = Math.floor((diff % 3600000) / 60000);
        const cd = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${mn}m left` : `${mn}m left`;
        fields.push({ name: "Ends", value: `${formatDate(best.endTime)} (${cd})`, inline: true });
      } else {
        fields.push({ name: "Ends", value: formatDate(best.endTime), inline: true });
      }
    }
  } else {
    const diff = new Date(best.startTime).getTime() - now;
    if (diff > 0) {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const mn = Math.floor((diff % 3600000) / 60000);
      const cd = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mn}m` : `${mn}m`;
      fields.push({ name: "Starts In", value: cd, inline: true });
    }
    fields.push({ name: "When", value: formatDate(best.startTime), inline: true });
    if (best.endTime) {
      fields.push({ name: "Ends", value: formatDate(best.endTime), inline: true });
    }
  }

  let desc = best.description || "";
  desc = desc.replace(/^.*?(?:When|Ends|Location|Hosted by|Host):.+$/gim, "").trim();
  desc = desc.replace(/\n{3,}/g, "\n\n");
  if (desc.length > 250) desc = desc.slice(0, 250) + "...";

  const displayName = best.name.replace(/\[LIVE\]\s*/i, "").trim();
  const color = best.status === "live" ? 0xe74c3c : 0x3498db;

  await patchFollowup(appId, interaction.token, {
    embeds: [{
      title: displayName,
      color,
      description: desc || undefined,
      fields,
      footer: { text: best.status === "live" ? "Happening now!" : "multimisfits.us/events.html" },
    }],
  });
}

// ---------------------------------------------------------------------------
// /clanstats
// ---------------------------------------------------------------------------
async function handleClanStats(interaction, appId) {
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
  const memberCount = memberships.length;

  const totalXP = memberships.reduce((sum, m) => {
    return sum + (m.player && typeof m.player.exp === "number" ? m.player.exp : 0);
  }, 0);

  const byEHB = memberships
    .filter((m) => m.player && typeof m.player.ehb === "number" && m.player.ehb > 0)
    .sort((a, b) => b.player.ehb - a.player.ehb)
    .slice(0, 3);
  const topEHB = byEHB.length
    ? byEHB.map((m, i) => `**${i + 1}.** ${m.player.displayName || m.player.username} -- ${m.player.ehb.toFixed(1)} EHB`).join("\n")
    : "No data";

  const byXP = memberships
    .filter((m) => m.player && typeof m.player.exp === "number")
    .sort((a, b) => b.player.exp - a.player.exp)
    .slice(0, 3);
  const topXP = byXP.length
    ? byXP.map((m, i) => `**${i + 1}.** ${m.player.displayName || m.player.username} -- ${formatXP(m.player.exp)}`).join("\n")
    : "No data";

  await patchFollowup(appId, interaction.token, {
    embeds: [{
      title: "Multi-Misfits Clan Stats",
      color: 0xf1c40f,
      fields: [
        { name: "Members", value: String(memberCount), inline: true },
        { name: "Total Clan XP", value: formatXP(totalXP), inline: true },
        { name: "Top EHB", value: topEHB, inline: false },
        { name: "Top XP", value: topXP, inline: false },
      ],
      footer: { text: "Data from Wise Old Man" },
    }],
  });
}

// ---------------------------------------------------------------------------
// /topdrops
// ---------------------------------------------------------------------------
function stripMdLinks(s) {
  return String(s || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

async function handleTopDrops(interaction, token, chestChannelId, appId) {
  if (!chestChannelId) {
    return patchFollowup(appId, interaction.token, {
      content: "Chest channel is not configured.",
      flags: 64,
    });
  }

  let messages;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${chestChannelId}/messages?limit=50`,
      { headers: { Authorization: `Bot ${token}`, "User-Agent": "Multi-Misfits clan website" } }
    );
    if (!res.ok) {
      return patchFollowup(appId, interaction.token, {
        content: "Could not fetch drops from Discord.",
        flags: 64,
      });
    }
    messages = await res.json();
  } catch (e) {
    return patchFollowup(appId, interaction.token, {
      content: "Could not fetch drops from Discord.",
      flags: 64,
    });
  }

  const drops = [];
  for (const m of (Array.isArray(messages) ? messages : [])) {
    if (drops.length >= 5) break;
    const embeds = Array.isArray(m.embeds) ? m.embeds : [];
    for (const embed of embeds) {
      if (drops.length >= 5) break;
      const title = (embed.title || "").trim().toLowerCase();
      if (title !== "loot drop" && title !== "loot" && title !== "collection log") continue;

      const rawDesc = stripMdLinks((embed.description || "").trim());
      const authorName = embed.author ? (embed.author.name || "").replace(/<[^>]+>/g, "").trim() : "";
      const player = authorName || "Unknown";
      const thumbnail = embed.thumbnail && embed.thumbnail.url ? embed.thumbnail.url : "";
      const image = embed.image && embed.image.url ? embed.image.url : "";

      const lines = rawDesc.split("\n").filter((l) => l.trim());
      const itemLines = lines.filter((l) => /^\d+\s*x\s+/.test(l));
      const fromLine = lines.find((l) => /^From:\s*/i.test(l));
      const source = fromLine ? fromLine.replace(/^From:\s*/i, "").trim() : "";

      const eFields = Array.isArray(embed.fields) ? embed.fields : [];
      const valField = eFields.find((f) => (f.name || "").toLowerCase().includes("total value"));
      const value = valField ? stripMdLinks((valField.value || "").replace(/`/g, "").trim()) : "";
      const kcField = eFields.find((f) => {
        const n = (f.name || "").toLowerCase();
        return n.includes("completion count") || n.includes("killcount") || n === "kc";
      });
      const kc = kcField ? (kcField.value || "").replace(/`/g, "").trim() : "";

      let items;
      if (itemLines.length > 0) {
        items = itemLines.slice(0, 3).map((l) => l.trim()).join(", ");
        if (itemLines.length > 3) items += ` +${itemLines.length - 3} more`;
      } else {
        items = source ? `Loot from ${source}` : lines[0] || "Drop";
      }

      const metaParts = [];
      if (source) metaParts.push(source);
      if (value) metaParts.push(value);
      if (kc) metaParts.push(kc + " KC");

      drops.push({
        player: player.slice(0, 30),
        items: items.slice(0, 100),
        meta: metaParts.join(" | "),
        thumbnail,
        image,
      });
    }
  }

  if (!drops.length) {
    return patchFollowup(appId, interaction.token, {
      embeds: [{
        title: "No Recent Drops",
        color: 0x95a5a6,
        description: "No drops recorded recently.",
      }],
    });
  }

  const embeds = drops.map((d, i) => {
    const e = {
      color: 0xe67e22,
      description: `**${d.player}** -- ${d.items}${d.meta ? `\n${d.meta}` : ""}`,
    };
    if (d.thumbnail) e.thumbnail = { url: d.thumbnail };
    else if (d.image) e.thumbnail = { url: d.image };
    return e;
  });
  embeds[0].title = "Recent Drops";
  embeds[embeds.length - 1].footer = { text: "From the chest channel" };

  await patchFollowup(appId, interaction.token, { embeds });
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------
async function handleHelp(interaction, appId) {
  const lines = COMMANDS
    .filter((c) => c.name !== "help")
    .map((c) => `**/${c.name}** -- ${c.description}`);
  lines.push("**/help** -- You're looking at it!");

  await patchFollowup(appId, interaction.token, {
    embeds: [{
      title: "Bot Commands",
      color: 0x3498db,
      description: lines.join("\n"),
      footer: { text: "Multi-Misfits Bot" },
    }],
  });
}

// ---------------------------------------------------------------------------
// /inactives [days]
// ---------------------------------------------------------------------------
async function handleInactives(interaction, env, appId) {
  if (!env.DB) {
    return patchFollowup(appId, interaction.token, {
      content: "Authentication database is not configured.",
      flags: 64,
    });
  }

  const options = (interaction.data && interaction.data.options) || [];
  const daysOpt = options.find((o) => o.name === "days");
  const days = daysOpt ? daysOpt.value : 30;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let allUsers;
  try {
    const result = await env.DB.prepare(
      "SELECT discord_id, discord_username, MAX(last_auth_at) as latest_auth FROM sessions GROUP BY discord_id"
    ).all();
    allUsers = result.results || [];
  } catch (e) {
    return patchFollowup(appId, interaction.token, {
      content: "Could not query the authentication database.",
      flags: 64,
    });
  }

  const overdue = allUsers
    .filter((u) => u.latest_auth < cutoff)
    .sort((a, b) => a.latest_auth.localeCompare(b.latest_auth));

  const total = allUsers.length;

  if (!overdue.length) {
    return patchFollowup(appId, interaction.token, {
      embeds: [{
        title: "No Inactive Members",
        color: 0x2ecc71,
        description: `All ${total} authenticated members have signed in within the last ${days} days.`,
      }],
      flags: 64,
    });
  }

  const embed = {
    title: `Inactive Members (${days}+ days)`,
    color: 0xe74c3c,
    description: `**${overdue.length}** of ${total} authenticated members have not signed in within ${days} days.`,
    flags: 64,
  };

  const components = [{
    type: 1,
    components: [{
      type: 2,
      style: 1,
      label: `Show List (${overdue.length})`,
      custom_id: `inactives:${days}:0`,
    }],
  }];

  await patchFollowup(appId, interaction.token, {
    embeds: [embed],
    components: components,
    flags: 64,
  });
}

async function handleInactivesPage(interaction, env, appId) {
  const parts = (interaction.data.custom_id || "").split(":");
  const days = parseInt(parts[1], 10) || 30;
  const page = parseInt(parts[2], 10) || 0;
  const pageSize = 25;

  if (!env.DB) {
    return patchFollowup(appId, interaction.token, {
      content: "Authentication database is not configured.",
      flags: 64,
    });
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let allUsers;
  try {
    const result = await env.DB.prepare(
      "SELECT discord_id, discord_username, MAX(last_auth_at) as latest_auth FROM sessions GROUP BY discord_id"
    ).all();
    allUsers = result.results || [];
  } catch (e) {
    return patchFollowup(appId, interaction.token, {
      content: "Could not query the authentication database.",
      flags: 64,
    });
  }

  const overdue = allUsers
    .filter((u) => u.latest_auth < cutoff)
    .sort((a, b) => a.latest_auth.localeCompare(b.latest_auth));

  const start = page * pageSize;
  const slice = overdue.slice(start, start + pageSize);
  const totalPages = Math.ceil(overdue.length / pageSize);

  if (!slice.length) {
    return patchFollowup(appId, interaction.token, {
      content: "No more results.",
      flags: 64,
    });
  }

  const lines = slice.map((u, i) => {
    const lastSeen = u.latest_auth ? new Date(u.latest_auth).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "never";
    return `**${start + i + 1}.** ${u.discord_username} -- last seen ${lastSeen}`;
  });

  const components = [];
  const buttons = [];
  if (page > 0) {
    buttons.push({
      type: 2,
      style: 2,
      label: "Previous",
      custom_id: `inactives:${days}:${page - 1}`,
    });
  }
  if (start + pageSize < overdue.length) {
    buttons.push({
      type: 2,
      style: 1,
      label: "Next",
      custom_id: `inactives:${days}:${page + 1}`,
    });
  }
  if (buttons.length) {
    components.push({ type: 1, components: buttons });
  }

  await patchFollowup(appId, interaction.token, {
    embeds: [{
      title: `Inactive Members (${days}+ days) -- Page ${page + 1}/${totalPages}`,
      color: 0xe74c3c,
      description: lines.join("\n"),
      footer: { text: `${overdue.length} total inactive` },
    }],
    components: components,
    flags: 64,
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

    const safeWait = (promise) =>
      context.waitUntil(
        promise.catch((err) =>
          patchFollowup(appId, interaction.token, {
            content: "Something went wrong. Try again in a moment.",
            flags: 64,
          }).catch(() => {})
        )
      );

    if (name === "referralstats") {
      safeWait(handleReferralStats(interaction, token, threadId, appId, referralCodes));
      return json({ type: 5 });
    }

    if (name === "giveawaystats") {
      safeWait(handleGiveawayStats(interaction, token, guildId, channelId, appId));
      return json({ type: 5 });
    }

    if (name === "giveawaylast") {
      safeWait(handleGiveawayLast(interaction, token, guildId, channelId, appId));
      return json({ type: 5 });
    }

    if (name === "rank") {
      safeWait(handleRank(interaction, appId));
      return json({ type: 5 });
    }

    if (name === "website") {
      safeWait(handleWebsite(interaction, appId));
      return json({ type: 5 });
    }

    if (name === "status") {
      safeWait(handleStatus(interaction, env, appId));
      return json({ type: 5 });
    }

    if (name === "event") {
      safeWait(handleEvent(interaction, token, guildId, env.EVENTS_CHANNEL_ID, appId));
      return json({ type: 5 });
    }

    if (name === "clanstats") {
      safeWait(handleClanStats(interaction, appId));
      return json({ type: 5 });
    }

    if (name === "topdrops") {
      safeWait(handleTopDrops(interaction, token, env.CHEST_CHANNEL_ID, appId));
      return json({ type: 5 });
    }

    if (name === "help") {
      safeWait(handleHelp(interaction, appId));
      return json({ type: 5 });
    }

    if (name === "inactives") {
      safeWait(handleInactives(interaction, env, appId));
      return json({ type: 5, data: { flags: 64 } });
    }

    return json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
  }

  if (interaction.type === 3) {
    const customId = interaction.data && interaction.data.custom_id;
    const appId = interaction.application_id;

    if (customId && customId.startsWith("inactives:")) {
      const safeWait2 = (promise) =>
        context.waitUntil(
          promise.catch((err) =>
            patchFollowup(appId, interaction.token, {
              content: "Something went wrong. Try again in a moment.",
              flags: 64,
            }).catch(() => {})
          )
        );
      safeWait2(handleInactivesPage(interaction, env, appId));
      return json({ type: 6 });
    }
  }

  return json({ type: 4, data: { content: "Unhandled interaction.", flags: 64 } });
}

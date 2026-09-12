// Cloudflare Pages Function  ->  GET /api/wom-score
// Fetches Wise Old Man group delta data for a given event's date range,
// applies scoring weights from the event's Scoring: config line,
// and returns a ranked leaderboard.
//
// Required env:
//   DISCORD_BOT_TOKEN  (secret)
//   EVENTS_CHANNEL_ID  (plain)
//   DISCORD_GUILD_ID   (plain)
//
// Query params:
//   event  (required) - Discord thread ID of the event

import { GROUP_ID } from "./wom.js";

const CACHE_TTL = 300;
const WOM_BULK_GAINED_URL = `https://api.wiseoldman.net/v2/groups/${GROUP_ID}/bulk-gained`;

const SCORING_PRESETS = {
  clues: {
    clue_scrolls_beginner: 1,
    clue_scrolls_easy: 2,
    clue_scrolls_medium: 5,
    clue_scrolls_hard: 10,
    clue_scrolls_elite: 20,
    clue_scrolls_master: 35,
  },
  bossing: null,
  skilling: null,
};

const ALL_SKILLS = [
  "attack", "defence", "strength", "hitpoints", "ranged", "prayer",
  "magic", "cooking", "woodcutting", "fletching", "fishing", "firemaking",
  "crafting", "smithing", "mining", "herblore", "agility", "thieving",
  "slayer", "farming", "runecrafting", "hunter", "construction",
];

const ALL_BOSSES = [
  "abyssal_sire", "alchemical_hydra", "amoxliatl", "araxxor",
  "artio", "barrows_chests", "brutus", "bryophyta",
  "callisto", "calvarion", "cerberus",
  "chambers_of_xeric", "chambers_of_xeric_challenge_mode",
  "chaos_elemental", "chaos_fanatic", "commander_zilyana",
  "corporeal_beast", "crazy_archaeologist", "dagannoth_prime",
  "dagannoth_rex", "dagannoth_supreme", "deranged_archaeologist",
  "doom_of_mokhaiotl", "duke_sucellus", "general_graardor",
  "giant_mole", "grotesque_guardians", "hespori",
  "kalphite_queen", "king_black_dragon", "kraken", "kreearra",
  "kril_tsutsaroth", "lunar_chests", "mad_angel", "maggot_king",
  "mimic", "nex", "nightmare", "phosanis_nightmare",
  "obor", "phantom_muspah", "sarachnis", "scorpia", "scurrius",
  "shellbane_gryphon", "skotizo", "sol_heredit", "spindel",
  "tempoross", "the_corrupted_gauntlet", "the_gauntlet",
  "the_hueycoatl", "the_leviathan", "the_royal_titans",
  "the_whisperer", "theatre_of_blood", "theatre_of_blood_hard_mode",
  "thermonuclear_smoke_devil", "tombs_of_amascut",
  "tombs_of_amascut_expert", "tzkal_zuk", "tztok_jad",
  "vardorvis", "venenatis", "vetion", "vorkath", "wintertodt",
  "yama", "zalcano", "zulrah",
];

const ALL_CLUES = [
  "clue_scrolls_all", "clue_scrolls_beginner", "clue_scrolls_easy",
  "clue_scrolls_medium", "clue_scrolls_hard", "clue_scrolls_elite",
  "clue_scrolls_master",
];

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export function parseScoringConfig(content) {
  const m = content.match(/^Scoring:\s*(.+)/im);
  if (!m) return null;
  const raw = m[1].trim().toLowerCase();

  if (SCORING_PRESETS[raw] !== undefined) {
    if (raw === "bossing") {
      const weights = {};
      for (const b of ALL_BOSSES) weights[b] = 1;
      return { preset: raw, weights };
    }
    if (raw === "skilling") {
      const weights = {};
      for (const s of ALL_SKILLS) weights[s] = 1;
      return { preset: raw, weights };
    }
    return { preset: raw, weights: SCORING_PRESETS[raw] };
  }

  const weights = {};
  const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eq = part.split("=");
    const metric = eq[0].trim();
    const value = eq.length > 1 ? parseFloat(eq[1].trim()) : 1;
    if (metric && !isNaN(value)) {
      if (ALL_SKILLS.includes(metric) || ALL_BOSSES.includes(metric) || ALL_CLUES.includes(metric)) {
        weights[metric] = value;
      }
    }
  }

  if (!Object.keys(weights).length) return null;
  return { preset: null, weights };
}

export function scorePlayer(playerData, weights) {
  const breakdown = {};
  let totalPoints = 0;

  for (const entry of playerData) {
    if (weights[entry.metric] !== undefined && entry.gained > 0) {
      const points = entry.gained * weights[entry.metric];
      breakdown[entry.metric] = {
        gained: entry.gained,
        points: Math.round(points * 100) / 100,
      };
      totalPoints += points;
    }
  }

  return {
    totalPoints: Math.round(totalPoints * 100) / 100,
    breakdown,
  };
}

export function buildLeaderboard(womData, weights, participantFilter) {
  const entries = [];

  for (const member of womData) {
    const player = member.player;
    const displayName = player.displayName || player.username || "Unknown";

    if (participantFilter && participantFilter.length) {
      const nameLC = displayName.toLowerCase();
      if (!participantFilter.some(p => p.toLowerCase() === nameLC)) continue;
    }

    const data = Array.isArray(member.data) ? member.data : [];
    const scored = scorePlayer(data, weights);

    if (scored.totalPoints > 0) {
      entries.push({
        player: displayName,
        points: scored.totalPoints,
        breakdown: scored.breakdown,
      });
    }
  }

  entries.sort((a, b) => b.points - a.points);
  return entries.map((e, i) => ({ rank: i + 1, ...e }));
}

async function fetchEventData(env, eventId) {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  const headers = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${eventId}/messages/${eventId}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function parseEventForgeDateField(content, field) {
  const pattern = new RegExp(
    "(?:^|\\n)\\s*(?:[\\u{1F000}-\\u{1FFFF}]\\s*)?(?:" + field + "):\\s*(.+)",
    "imu"
  );
  const m = content.match(pattern);
  if (!m) return null;
  const line = m[1].trim();

  const tsMatch = line.match(/<t:(\d+)(?::[tTdDfFR])?>/);
  if (tsMatch) {
    return new Date(parseInt(tsMatch[1], 10) * 1000).toISOString();
  }

  const dateMatch = line.match(
    /(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i
  );
  if (dateMatch) {
    const d = new Date(dateMatch[1]);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const eventId = url.searchParams.get("event");

  if (!eventId) {
    return json({ error: "event_parameter_required" }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(url.origin + "/api/wom-score?event=" + eventId, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const eventMsg = await fetchEventData(context.env, eventId);
  if (!eventMsg) {
    return json({ error: "event_not_found" }, 404);
  }

  const content = (eventMsg.content || "").trim();
  const scoring = parseScoringConfig(content);
  if (!scoring) {
    return json({ error: "no_scoring_config", hint: "Add a Scoring: line to the event description" }, 400);
  }

  const startDate = parseEventForgeDateField(content, "When");
  const endDate = parseEventForgeDateField(content, "Ends?");

  if (!startDate) {
    return json({ error: "no_start_date", hint: "Add a When: line to the event description" }, 400);
  }

  const params = new URLSearchParams();
  params.set("startDate", startDate);
  if (endDate) {
    params.set("endDate", endDate);
  } else {
    params.set("endDate", new Date().toISOString());
  }

  let womData;
  try {
    const r = await fetch(
      WOM_BULK_GAINED_URL + "?" + params.toString(),
      { headers: { "User-Agent": "Multi-Misfits clan website (WOM group 26075)" } }
    );
    if (!r.ok) {
      return json({ error: "wom_unavailable", status: r.status }, 502);
    }
    womData = await r.json();
  } catch {
    return json({ error: "wom_fetch_failed" }, 502);
  }

  if (!Array.isArray(womData)) {
    return json({ error: "wom_unexpected_response" }, 502);
  }

  const leaderboard = buildLeaderboard(womData, scoring.weights, null);

  const stats = {
    totalPlayers: leaderboard.length,
    totalPoints: leaderboard.reduce((s, e) => s + e.points, 0),
    metrics: Object.keys(scoring.weights),
    preset: scoring.preset,
  };

  const res = json({ eventId, leaderboard, stats, scoring: scoring.weights }, 200, {
    "Cache-Control": `public, max-age=${CACHE_TTL}`,
  });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

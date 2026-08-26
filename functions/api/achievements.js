// Cloudflare Pages Function  ->  GET /api/achievements
// Reads the "chest" channel (Dink plugin posts drops/pets/CAs) via the Discord
// REST API and returns parsed achievement items. The bot token stays server-side;
// the browser only sees the finished JSON.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   DISCORD_BOT_TOKEN  (encrypted/secret)  — the bot token
//   CHEST_CHANNEL_ID   (plain)             — the chest channel id

const LIMIT = 12;
const FETCH_COUNT = 50;
const CACHE_TTL = 300; // 5 minutes

const MEDAL_MAP = {
  pet: "🐦",
  drop: "💰",
  ca: "⭐",
  max: "🏆",
  xp: "🎯",
  quest: "📜",
  clue: "🗺️",
  pb: "⏱️",
  default: "🔥",
};

function classifyAchievement(text) {
  const t = text.toLowerCase();
  if (t.includes("pet") || t.includes("olmlet") || t.includes("baby mole") ||
      t.includes("vorki") || t.includes("jad pet") || t.includes("zuk pet") ||
      t.includes("metamorphic") || t.includes("youngllef")) return "pet";
  if (t.includes("combat achievement") || t.includes("combat task")) return "ca";
  if (t.includes("maxed") || t.includes("max cape") || t.includes("2277")) return "max";
  if (t.includes("200m") || t.includes("99 ") || t.includes("level 99") ||
      t.includes("xp milestone")) return "xp";
  if (t.includes("quest cape") || t.includes("quest point")) return "quest";
  if (t.includes("clue") || t.includes("casket")) return "clue";
  if (t.includes("personal best") || t.includes("new pb") || t.includes("fastest")) return "pb";
  if (t.includes("drop") || t.includes("received") || t.includes("loot") ||
      t.includes("obtained") || t.includes("bow") || t.includes("scythe") ||
      t.includes("twisted") || t.includes("rapier") || t.includes("dragon") ||
      t.includes("rare") || t.includes("unique")) return "drop";
  return "default";
}

export function parseDinkMessage(m) {
  const embeds = Array.isArray(m.embeds) ? m.embeds : [];
  const content = (m.content || "").trim();

  for (const embed of embeds) {
    const title = (embed.title || "").trim();
    const desc = (embed.description || "").trim();
    const authorName = embed.author ? (embed.author.name || "") : "";

    const player = authorName || extractPlayer(title) || extractPlayer(desc) || "Unknown";
    const what = title || desc.split("\n")[0] || content.split("\n")[0] || "Achievement";

    if (what && what !== "Achievement") {
      const type = classifyAchievement(what);
      const detail = desc ? desc.split("\n")[0].slice(0, 200) : "";
      return {
        player: player.slice(0, 100),
        what: what.slice(0, 200),
        detail,
        type,
        medal: MEDAL_MAP[type],
      };
    }
  }

  if (content) {
    const player = extractPlayer(content) || "Unknown";
    const type = classifyAchievement(content);
    return {
      player: player.slice(0, 100),
      what: content.split("\n")[0].slice(0, 200),
      detail: "",
      type,
      medal: MEDAL_MAP[type],
    };
  }

  return null;
}

function extractPlayer(text) {
  if (!text) return null;
  const pats = [
    /^(.+?) (?:received|has|got|earned|completed|achieved)/i,
    /^(.+?)['']s /i,
    /^(.+?) — /,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m && m[1] && m[1].length < 30) return m[1].trim();
  }
  return null;
}

export function transformMessages(messages, opts = {}) {
  const limit = opts.limit || LIMIT;
  const out = [];

  for (const m of Array.isArray(messages) ? messages : []) {
    const parsed = parseDinkMessage(m);
    if (!parsed) continue;

    out.push({
      id: m.id,
      timestamp: m.timestamp || null,
      ...parsed,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export async function onRequest(context) {
  const token = context.env && context.env.DISCORD_BOT_TOKEN;
  const channelId = context.env && context.env.CHEST_CHANNEL_ID;

  if (!token || !channelId) {
    return json({ configured: false, items: [] }, 200, { "Cache-Control": "public, max-age=60" });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + "/api/achievements", { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let messages;
  try {
    const r = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=${FETCH_COUNT}`,
      { headers: { Authorization: `Bot ${token}`, "User-Agent": "Multi-Misfits clan website" } }
    );
    if (!r.ok) return json({ configured: true, error: "discord_" + r.status, items: [] }, 502);
    messages = await r.json();
  } catch (e) {
    return json({ configured: true, error: "fetch_failed", items: [] }, 502);
  }

  const items = transformMessages(messages, { limit: LIMIT });
  const res = json({ configured: true, items }, 200, { "Cache-Control": `public, max-age=${CACHE_TTL}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

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

function stripDiscord(s) {
  return String(s || "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@!?\d+>/g, "").replace(/<@&\d+>/g, "").replace(/<#\d+>/g, "")
    .replace(/<t:\d+(?::[tTdDfFR])?>/g, "")
    .replace(/@(everyone|here)/gi, "")
    .replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+(?:\/\d+)?/g, "")
    .trim();
}

function stripMdLinks(s) {
  return String(s || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

function stripCodeBlocks(s) {
  return String(s || "")
    .replace(/```\w*\s*([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseFields(embed) {
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const map = {};
  for (const f of fields) {
    if (f.name) map[f.name.toLowerCase().trim()] = stripCodeBlocks((f.value || "").trim());
  }
  return map;
}

function classifyByTitle(title) {
  const t = title.toLowerCase().trim();
  if (t === "loot drop" || t === "loot") return "drop";
  if (t === "level up") return "xp";
  if (t === "quest completed") return "quest";
  if (t.startsWith("combat achievement")) return "ca";
  if (t.includes("personal best")) return "pb";
  if (t === "collection log") return "drop";
  if (t.includes("pet")) return "pet";
  if (t.includes("clue") || t.includes("casket")) return "clue";
  if (t === "achievement diary" || t === "diary") return "ca";
  return null;
}

function classifyAchievement(text) {
  const t = text.toLowerCase();
  if (t.includes("pet") || t.includes("olmlet") || t.includes("baby mole") ||
      t.includes("vorki") || t.includes("jad pet") || t.includes("zuk pet") ||
      t.includes("metamorphic") || t.includes("youngllef")) return "pet";
  if (t.includes("combat achievement") || t.includes("combat task")) return "ca";
  if (t.includes("maxed") || t.includes("max cape") || t.includes("2277")) return "max";
  if (t.includes("200m") || t.includes("99 ") || t.includes("level 99") ||
      t.includes("xp milestone") || t.includes("level up") || t.includes("levelled") ||
      t.includes("has levelled")) return "xp";
  if (t.includes("quest cape") || t.includes("quest point") || t.includes("quest completed") ||
      t.includes("completed a quest")) return "quest";
  if (t.includes("clue") || t.includes("casket")) return "clue";
  if (t.includes("personal best") || t.includes("new pb") || t.includes("fastest")) return "pb";
  if (t.includes("drop") || t.includes("received") || t.includes("loot") ||
      t.includes("obtained") || t.includes("bow") || t.includes("scythe") ||
      t.includes("twisted") || t.includes("rapier") || t.includes("dragon") ||
      t.includes("rare") || t.includes("unique")) return "drop";
  return "default";
}

function extractPlayer(text) {
  if (!text) return null;
  const pats = [
    /^(.+?) (?:received|has|got|earned|completed|achieved)/i,
    /^(.+?)[''\u2019]s /i,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m && m[1] && m[1].length < 30) return m[1].trim();
  }
  return null;
}

function parseDinkEmbed(embed) {
  const title = (embed.title || "").trim();
  const rawDesc = (embed.description || "").trim();
  const desc = stripMdLinks(stripDiscord(rawDesc));
  const authorName = embed.author ? (embed.author.name || "") : "";
  const player = stripDiscord(authorName) || extractPlayer(desc) || extractPlayer(title) || "Unknown";
  const fields = parseFields(embed);
  const dinkType = classifyByTitle(title);

  if (dinkType) {
    let what = "";
    let detail = "";

    switch (dinkType) {
      case "drop": {
        const lines = desc.split("\n").filter(function (l) { return l.trim(); });
        const itemLines = lines.filter(function (l) { return /^\d+\s*x\s+/.test(l); });
        const fromLine = lines.find(function (l) { return /^From:\s*/i.test(l); });
        const source = fromLine ? fromLine.replace(/^From:\s*/i, "").trim() : "";
        const totalValue = fields["total value"] || "";
        const kc = fields["completion count"] || "";

        if (itemLines.length > 0) {
          what = itemLines.slice(0, 3).join(", ");
          if (itemLines.length > 3) what += " +" + (itemLines.length - 3) + " more";
        } else {
          what = source ? "Loot from " + source : lines[0] || "Loot";
        }

        const dp = [];
        if (source) dp.push("From " + source);
        if (kc) dp.push(kc + " KC");
        if (totalValue) dp.push(totalValue);
        detail = dp.join(" | ");
        break;
      }
      case "xp": {
        var match = desc.match(/has levelled\s+(.+?\s+to\s+\d+)/i);
        what = match ? "Levelled " + match[1] : desc.split("\n")[0] || "Level Up";
        detail = "";
        break;
      }
      case "quest": {
        var match = desc.match(/completed a quest:\s*(.+)/i);
        what = match ? "Completed " + match[1].trim() : desc.split("\n")[0] || "Quest Completed";
        var qc = fields["completed quests"] || "";
        var qp = fields["quest points"] || "";
        var dp = [];
        if (qc) dp.push(qc + " quests");
        if (qp) dp.push(qp + " QP");
        detail = dp.join(" | ");
        break;
      }
      case "ca": {
        var match = desc.match(/has completed\s+(.+)/i) || desc.match(/completed\s+(.+)/i);
        what = match ? match[1].trim() : desc.split("\n")[0] || "Combat Achievement";
        detail = fields["total points"] || "";
        break;
      }
      case "pb": {
        var match = desc.match(/personal best[:\s]+(.+)/i) ||
                    desc.match(/new (?:personal )?best[:\s]+(.+)/i);
        what = match ? match[1].trim() : desc.split("\n")[0] || "Personal Best";
        detail = "";
        break;
      }
      case "pet": {
        var match = desc.match(/(?:has )?received (?:the )?(.+)/i);
        what = match ? match[1].trim() : desc.split("\n")[0] || "Pet drop!";
        detail = "";
        break;
      }
      case "clue": {
        what = desc.split("\n")[0] || "Clue scroll";
        detail = fields["total value"] || "";
        break;
      }
      default: {
        what = desc.split("\n")[0] || title;
        detail = "";
      }
    }

    return {
      player: player.slice(0, 100),
      what: (what || title).slice(0, 200),
      detail: (detail || "").slice(0, 200),
      type: dinkType,
      medal: MEDAL_MAP[dinkType] || MEDAL_MAP.default,
    };
  }

  return null;
}

export function parseDinkMessage(m) {
  const embeds = Array.isArray(m.embeds) ? m.embeds : [];
  const content = (m.content || "").trim();

  for (const embed of embeds) {
    const dinkResult = parseDinkEmbed(embed);
    if (dinkResult) return dinkResult;

    const title = (embed.title || "").trim();
    const rawDesc = (embed.description || "").trim();
    const desc = stripMdLinks(stripDiscord(rawDesc));
    const authorName = embed.author ? (embed.author.name || "") : "";
    const player = stripDiscord(authorName) || extractPlayer(stripDiscord(title)) || extractPlayer(desc) || "Unknown";
    const what = stripDiscord(title) || desc.split("\n")[0] || stripDiscord(content.split("\n")[0]) || "Achievement";

    if (what && what !== "Achievement") {
      const type = classifyAchievement(what + " " + desc);
      const detail = desc ? desc.split("\n")[0].slice(0, 200) : "";
      return {
        player: player.slice(0, 100),
        what: what.slice(0, 200),
        detail: detail !== what ? detail : "",
        type,
        medal: MEDAL_MAP[type],
      };
    }
  }

  if (content) {
    const cleaned = stripMdLinks(stripDiscord(content));
    const player = extractPlayer(cleaned) || "Unknown";
    const type = classifyAchievement(cleaned);
    return {
      player: player.slice(0, 100),
      what: cleaned.split("\n")[0].slice(0, 200),
      detail: "",
      type,
      medal: MEDAL_MAP[type],
    };
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

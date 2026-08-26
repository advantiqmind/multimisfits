// Cloudflare Pages Function  ->  GET /api/spotlight
// Reads the most recent image from a mod-only Discord channel and returns
// it as the gallery spotlight. The bot token stays server-side.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   DISCORD_BOT_TOKEN    (encrypted/secret)
//   SPOTLIGHT_CHANNEL_ID (plain)  — the mod-only spotlight channel id

const CACHE_TTL = 300; // 5 minutes

function stripDiscord(s) {
  return String(s || "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@!?\d+>/g, "").replace(/<@&\d+>/g, "").replace(/<#\d+>/g, "")
    .replace(/<t:\d+(?::[tTdDfFR])?>/g, "")
    .replace(/@(everyone|here)/gi, "")
    .replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+(?:\/\d+)?/g, "")
    .trim();
}

export function parseSpotlight(messages) {
  for (const m of Array.isArray(messages) ? messages : []) {
    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
    const image = attachments.find(function (a) {
      return a && (a.content_type || "").startsWith("image/");
    });

    const embedImage = !image && Array.isArray(m.embeds)
      ? m.embeds.find(function (e) { return e.image && e.image.url; })
      : null;

    const imageUrl = image ? image.url : (embedImage ? embedImage.image.url : null);
    if (!imageUrl) continue;

    const caption = stripDiscord((m.content || "").trim());
    const author = m.author
      ? (m.author.global_name || m.author.username || "Unknown")
      : "Unknown";

    return {
      image: imageUrl,
      caption: caption.split("\n")[0].slice(0, 200) || "",
      author: author,
      timestamp: m.timestamp || null,
    };
  }
  return null;
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export async function onRequest(context) {
  const token = context.env && context.env.DISCORD_BOT_TOKEN;
  const channelId = context.env && context.env.SPOTLIGHT_CHANNEL_ID;

  if (!token || !channelId) {
    return json({ configured: false, spotlight: null }, 200, { "Cache-Control": "public, max-age=60" });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + "/api/spotlight", { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let messages;
  try {
    const r = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=5`,
      { headers: { Authorization: `Bot ${token}`, "User-Agent": "Multi-Misfits clan website" } }
    );
    if (!r.ok) return json({ configured: true, error: "discord_" + r.status, spotlight: null }, 502);
    messages = await r.json();
  } catch (e) {
    return json({ configured: true, error: "fetch_failed", spotlight: null }, 502);
  }

  const spotlight = parseSpotlight(messages);
  const res = json({ configured: true, spotlight }, 200, { "Cache-Control": `public, max-age=${CACHE_TTL}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

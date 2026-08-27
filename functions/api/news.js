// Cloudflare Pages Function  ->  GET /api/news
// Reads the locked #announcements channel via the Discord REST API and returns
// clean, formatted news items. The bot token stays server-side (Pages secret);
// the browser only ever sees the finished JSON.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   DISCORD_BOT_TOKEN        (encrypted/secret)  — the bot token
//   ANNOUNCEMENTS_CHANNEL_ID (plain)             — the #announcements channel id
// Optional:
//   PUBLISH_REACTION         (plain)             — e.g. "✅" to ONLY publish
//                                                  messages that have that reaction
//                                                  (safety valve). Empty = show all.

const LIMIT = 8;          // news items to return
const FETCH_COUNT = 25;   // messages to pull before filtering
const CACHE_TTL = 300;    // 5 minutes

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Convert a safe subset of Discord markdown to HTML.
// Order matters: strip Discord's <...> tokens on the RAW text first (so the
// patterns still match), THEN escape any remaining HTML, THEN apply markdown.
export function formatContent(text) {
  let t = String(text || "");
  // 1) Discord tokens (raw, before escaping)
  t = t.replace(/<a?:\w+:\d+>/g, "");                       // custom emoji -> strip
  t = t.replace(/<@!?\d+>/g, "");                            // unresolved user mention -> strip
  t = t.replace(/<@&\d+>/g, "@role");                       // role mention
  t = t.replace(/<#\d+>/g, "");                              // channel mention -> strip (can't resolve name)
  t = t.replace(/<t:\d+(?::[tTdDfFR])?>/g, "");             // discord timestamps -> drop
  t = t.replace(/@(everyone|here)/gi, "");                   // @everyone/@here -> strip
  t = t.replace(/\[([^\]]+)\]\(https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com[^)]*\)/g, "$1"); // md links to Discord -> text only
  t = t.replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+(?:\/\d+)?/g, ""); // discord internal links -> strip
  // 2) escape everything else
  t = escapeHtml(t);
  // 3) markdown
  t = t.replace(/```([\s\S]*?)```/g, "$1");                 // code fences -> plain
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");           // inline code
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); // bold
  t = t.replace(/__([^_]+)__/g, "<u>$1</u>");               // underline
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>"); // italics *x*
  // 4) markdown links [text](url) -> clickable links
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 5) bare links
  t = t.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  // 6) Discord heading markdown
  t = t.replace(/(^|<br>|\n)### ([^\n<]+)/g, '$1<strong>$2</strong>');
  t = t.replace(/(^|<br>|\n)## ([^\n<]+)/g, '$1<strong>$2</strong>');
  t = t.replace(/(^|<br>|\n)# ([^\n<]+)/g, '$1<strong>$2</strong>');
  // 7) newlines
  t = t.replace(/\n/g, "<br>");
  return t;
}

function stripDiscordRaw(s) {
  return String(s || "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<@!?\d+>/g, "").replace(/<@&\d+>/g, "").replace(/<#\d+>/g, "")
    .replace(/<t:\d+(?::[tTdDfFR])?>/g, "")
    .replace(/@(everyone|here)/gi, "")
    .replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+(?:\/\d+)?/g, "")
    .replace(/^#{1,3}\s+/, "")
    .trim();
}

// Pure + testable: raw Discord messages -> news items
export function transformMessages(messages, opts = {}) {
  const limit = opts.limit || LIMIT;
  const reaction = opts.reaction || "";
  const allowBots = !!opts.allowBots;
  const out = [];

  for (const m of Array.isArray(messages) ? messages : []) {
    if (m.type !== 0 && m.type !== 19) continue;            // default + reply only
    if (!allowBots && m.author && m.author.bot) continue;   // skip bot posts
    if (reaction) {
      const has = Array.isArray(m.reactions) &&
        m.reactions.some((r) => r && r.emoji && r.emoji.name === reaction);
      if (!has) continue;                                    // safety-valve gate
    }
    let content = (m.content || "").trim();
    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
    const image = attachments.find((a) => (a.content_type || "").startsWith("image/"));
    if (!content && !image) continue;                        // nothing to show

    const mentions = Array.isArray(m.mentions) ? m.mentions : [];
    for (const u of mentions) {
      if (!u || !u.id) continue;
      const name = u.global_name || u.username || "member";
      const display = name.charAt(0).toUpperCase() + name.slice(1);
      content = content.replace(new RegExp("<@!?" + u.id + ">", "g"), "**" + display + "**");
    }

    const lines = content.split("\n");
    let titleIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (stripDiscordRaw(lines[i])) { titleIdx = i; break; }
    }
    const title = (titleIdx >= 0 ? lines[titleIdx] : "Announcement").slice(0, 140);
    const bodyText = lines.filter(function (_, i) { return i !== titleIdx; }).join("\n").trim();
    const author = m.author ? (m.author.global_name || m.author.username || "Unknown") : "Unknown";
    const avatar = m.author && m.author.avatar
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png?size=64`
      : null;

    out.push({
      id: m.id,
      author,
      avatar,
      timestamp: m.timestamp || null,
      titleHtml: formatContent(title),
      bodyHtml: bodyText ? formatContent(bodyText) : "",
      image: image ? image.url : null,
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
  const channelId = context.env && context.env.ANNOUNCEMENTS_CHANNEL_ID;
  const reaction = (context.env && context.env.PUBLISH_REACTION) || "";

  // Not wired up yet -> tell the front-end to keep showing its sample content.
  if (!token || !channelId) {
    return json({ configured: false, items: [] }, 200, { "Cache-Control": "public, max-age=60" });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + "/api/news", { method: "GET" });
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

  const items = transformMessages(messages, { limit: LIMIT, reaction });
  const res = json({ configured: true, items }, 200, { "Cache-Control": `public, max-age=${CACHE_TTL}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

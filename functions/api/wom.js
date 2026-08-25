// Cloudflare Pages Function  ->  GET /api/wom
// Fetches the Multi-Misfits Wise Old Man group, caches it, and returns a clean,
// pre-sorted roster so the browser never talks to WOM directly (respects their
// rate limits, keeps the token-free data server-side, one request every 6h).

export const GROUP_ID = 26075;
const WOM_URL = `https://api.wiseoldman.net/v2/groups/${GROUP_ID}`;
const CACHE_TTL = 21600; // 6 hours, in seconds

// -------------------------------------------------------------------------
// RANK HIERARCHY  (higher number = more senior; controls roster sort order)
// Derived from the clan ladder: squire < duellist < striker < inquisitor <
// expert < knight < [officers] < [owners].
//
// !! CONFIRM THESE TWO — currently best guesses, one-line fix each:
//   - beast .... placed just above squire
//   - paladin .. placed just above knight
//   - officer tier order (colonel vs captain) — guessed colonel > captain
// Any rank not listed still renders; it just sorts to the bottom.
// -------------------------------------------------------------------------
export const RANK_ORDER = {
  owner: 120,
  deputy_owner: 110,
  colonel: 95,   // officer
  captain: 90,   // officer
  paladin: 75,   // GUESS
  knight: 70,
  expert: 60,
  inquisitor: 50,
  striker: 40,
  duellist: 30,
  beast: 25,     // GUESS
  squire: 20,
};
const RANK_FALLBACK = 10;

export function prettyRole(role) {
  return String(role || "member")
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Pure + testable: WOM group JSON -> clean roster payload
export function transformGroup(group) {
  const memberships = Array.isArray(group && group.memberships) ? group.memberships : [];
  const members = memberships.map((m) => {
    const p = (m && m.player) || {};
    const roleKey = (m && m.role) || "member";
    return {
      username: p.username || "",
      name: p.displayName || p.username || "Unknown",
      role: roleKey,
      rankLabel: prettyRole(roleKey),
      priority: RANK_ORDER[roleKey] != null ? RANK_ORDER[roleKey] : RANK_FALLBACK,
      exp: typeof p.exp === "number" ? p.exp : 0,
      ehb: typeof p.ehb === "number" ? p.ehb : 0,
    };
  });

  members.sort(
    (a, b) => b.priority - a.priority || b.exp - a.exp || a.name.localeCompare(b.name)
  );

  return {
    name: (group && group.name) || "Multi-Misfits",
    memberCount: members.length,
    updatedAt: new Date().toISOString(),
    members,
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export async function onRequest(context) {
  const cache = caches.default;
  const origin = new URL(context.request.url).origin;
  const cacheKey = new Request(origin + "/api/wom", { method: "GET" });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let group;
  try {
    const r = await fetch(WOM_URL, {
      headers: { "User-Agent": "Multi-Misfits clan website (WOM group 26075)" },
    });
    if (!r.ok) return json({ error: "wom_unavailable", status: r.status }, 502);
    group = await r.json();
  } catch (e) {
    return json({ error: "fetch_failed" }, 502);
  }

  const data = transformGroup(group);
  const res = json(data, 200, { "Cache-Control": `public, max-age=${CACHE_TTL}` });
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

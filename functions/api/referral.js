// Cloudflare Pages Function  ->  POST /api/referral
// Validates a referral code against REFERRAL_CODES env var.
// Returns the Discord invite URL only when the code is valid.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   REFERRAL_CODES   (plain) - comma-separated valid codes, e.g. "TEQUILA,FLASH,KOI"
//   DISCORD_INVITE   (plain, optional) - override invite URL; defaults to hardcoded link

const DEFAULT_INVITE = "https://discord.gg/kT4vEGnjgU";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (context.request.method !== "POST") {
    return json({ valid: false, error: "POST required" }, 405);
  }

  const codesRaw = context.env && context.env.REFERRAL_CODES;
  if (!codesRaw) {
    return json({ valid: false, error: "not_configured" }, 200);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ valid: false, error: "bad_request" }, 400);
  }

  const submitted = (body.code || "").trim().toUpperCase();
  if (!submitted) {
    return json({ valid: false }, 200);
  }

  const validCodes = codesRaw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const isValid = validCodes.includes(submitted);

  if (!isValid) {
    return json({ valid: false }, 200);
  }

  const invite = (context.env && context.env.DISCORD_INVITE) || DEFAULT_INVITE;
  return json({ valid: true, invite });
}

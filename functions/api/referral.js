// Cloudflare Pages Function  ->  POST /api/referral
// Validates a referral code against REFERRAL_CODES env var.
// Returns the Discord invite URL only when the code is valid.
// On success, fires a Discord webhook so mods see the redemption.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   REFERRAL_CODES       (plain) - comma-separated valid codes, e.g. "TEQUILA,FLASH,KOI"
//   DISCORD_INVITE       (plain, optional) - override invite URL; defaults to hardcoded link
//   REFERRAL_WEBHOOK_URL (plain, optional) - Discord webhook URL for tracking redemptions

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

  const webhookUrl = context.env && context.env.REFERRAL_WEBHOOK_URL;
  if (webhookUrl) {
    context.waitUntil(notifyReferral(webhookUrl, submitted));
  }

  const invite = (context.env && context.env.DISCORD_INVITE) || DEFAULT_INVITE;
  return json({ valid: true, invite });
}

async function notifyReferral(webhookUrl, code) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "Referral Code Redeemed",
          color: 0x2ecc71,
          fields: [
            { name: "Code", value: code, inline: true },
            { name: "Time", value: new Date().toUTCString(), inline: true },
          ],
        }],
      }),
    });
  } catch (e) {
    // webhook failure should never break the referral flow
  }
}

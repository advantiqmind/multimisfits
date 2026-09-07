// Cloudflare Pages Function  ->  POST /api/referral
// Validates a referral code against REFERRAL_CODES env var.
// Returns the Discord invite URL only when the code is valid.
// On success, posts a tracking message to a Discord forum thread
// so mods see every redemption with a running total.
//
// Required env (set in Cloudflare Pages -> Settings -> Environment variables):
//   REFERRAL_CODES       (plain) - comma-separated valid codes, e.g. "TEQUILA,FLASH,KOI"
//   DISCORD_INVITE       (plain, optional) - override invite URL; defaults to hardcoded link
//   DISCORD_BOT_TOKEN    (secret) - bot token (shared with other functions)
//   REFERRAL_THREAD_ID   (plain, optional) - forum thread ID for tracking redemptions

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

  const token = context.env && context.env.DISCORD_BOT_TOKEN;
  const threadId = context.env && context.env.REFERRAL_THREAD_ID;
  if (token && threadId) {
    context.waitUntil(notifyReferral(token, threadId, submitted));
  }

  const invite = (context.env && context.env.DISCORD_INVITE) || DEFAULT_INVITE;
  return json({ valid: true, invite });
}

async function notifyReferral(token, threadId, code) {
  try {
    const authHeaders = {
      Authorization: `Bot ${token}`,
      "User-Agent": "Multi-Misfits clan website",
    };

    const msgsRes = await fetch(
      `https://discord.com/api/v10/channels/${threadId}/messages?limit=100`,
      { headers: authHeaders }
    );
    let codeCount = 0;
    if (msgsRes.ok) {
      const msgs = await msgsRes.json();
      for (const m of msgs) {
        if (!Array.isArray(m.embeds) || !m.embeds.length) continue;
        const fields = m.embeds[0].fields || [];
        const codeField = fields.find(f => f.name === "Code");
        if (codeField && codeField.value === code) codeCount++;
      }
    }

    await fetch(
      `https://discord.com/api/v10/channels/${threadId}/messages`,
      {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "Referral Code Redeemed",
            color: 0x2ecc71,
            fields: [
              { name: "Code", value: code, inline: true },
              { name: "Time", value: new Date().toUTCString(), inline: true },
              { name: "Total Redemptions", value: String(codeCount + 1), inline: true },
            ],
          }],
        }),
      }
    );
  } catch (e) {
    // tracking failure should never break the referral flow
  }
}

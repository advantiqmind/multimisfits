function getCookie(request, name) {
  var header = request.headers.get("Cookie") || "";
  var match = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function gateError(message, redirectTo) {
  var r = redirectTo || "/gate.html";
  var sep = r.includes("?") ? "&" : "?";
  return new Response(null, {
    status: 302,
    headers: {
      Location: r + sep + "error=" + encodeURIComponent(message),
      "Set-Cookie": "mm_referral_ok=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    },
  });
}

export async function onRequest(context) {
  var request = context.request;
  var env = context.env || {};
  var url = new URL(request.url);

  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  var code = url.searchParams.get("code");
  var state = url.searchParams.get("state") || "/";
  var errorParam = url.searchParams.get("error");

  if (errorParam || !code) {
    return gateError(errorParam || "no_code");
  }

  var clientId = env.DISCORD_CLIENT_ID;
  var clientSecret = env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret || !env.DB) {
    return gateError("not_configured");
  }

  var redirectUri = url.origin + "/api/auth/callback";

  var tokenRes;
  try {
    tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Multi-Misfits clan website",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });
  } catch (e) {
    return gateError("discord_error");
  }

  if (!tokenRes.ok) {
    return gateError("token_exchange_failed");
  }

  var tokenData = await tokenRes.json();
  var accessToken = tokenData.access_token;
  if (!accessToken) {
    return gateError("no_access_token");
  }

  var userRes;
  try {
    userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: "Bearer " + accessToken,
        "User-Agent": "Multi-Misfits clan website",
      },
    });
  } catch (e) {
    return gateError("user_fetch_failed");
  }

  if (!userRes.ok) {
    return gateError("user_fetch_failed");
  }

  var user = await userRes.json();
  var discordId = user.id;
  var discordUsername = user.global_name || user.username || "Unknown";
  var discordAvatar = user.avatar || null;

  var hasReferral = getCookie(request, "mm_referral_ok") === "1";

  var existing = await env.DB.prepare(
    "SELECT id FROM sessions WHERE discord_id = ? LIMIT 1"
  ).bind(discordId).first();

  if (!hasReferral && !existing) {
    return gateError("referral_required");
  }

  var bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  var sessionToken = Array.from(bytes).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");

  var now = new Date();
  var expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  var referralCode = null;
  if (hasReferral) {
    referralCode = "used";
  }

  await env.DB.prepare(
    "INSERT INTO sessions (discord_id, discord_username, discord_avatar, referral_code, session_token, created_at, last_auth_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    discordId,
    discordUsername,
    discordAvatar,
    referralCode,
    sessionToken,
    now.toISOString(),
    now.toISOString(),
    expires.toISOString()
  ).run();

  var cookieMaxAge = 30 * 24 * 60 * 60;
  var redirect = state || "/";
  if (redirect.startsWith("http") || redirect.includes("..")) redirect = "/";

  return new Response(null, {
    status: 302,
    headers: [
      ["Location", redirect],
      ["Set-Cookie", "mm_session=" + sessionToken + "; Path=/; Max-Age=" + cookieMaxAge + "; HttpOnly; Secure; SameSite=Lax"],
      ["Set-Cookie", "mm_referral_ok=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"],
    ],
  });
}

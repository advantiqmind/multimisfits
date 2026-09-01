function json(obj, status, extraHeaders) {
  var headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (extraHeaders) {
    for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }
  return new Response(JSON.stringify(obj), { status: status || 200, headers: headers });
}

function buildOAuthUrl(clientId, redirectUri, state) {
  return "https://discord.com/oauth2/authorize" +
    "?client_id=" + clientId +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope=identify" +
    "&prompt=consent" +
    "&state=" + encodeURIComponent(state || "/");
}

export async function onRequest(context) {
  var request = context.request;
  var env = context.env || {};
  var url = new URL(request.url);

  var clientId = env.DISCORD_CLIENT_ID;
  if (!clientId) return json({ error: "not_configured" }, 500);

  var redirectUri = url.origin + "/api/auth/callback";

  if (request.method === "GET") {
    var redirect = url.searchParams.get("r") || "/";
    var authUrl = buildOAuthUrl(clientId, redirectUri, redirect);
    return Response.redirect(authUrl, 302);
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ valid: false, error: "bad_request" }, 400);
  }

  var submitted = (body.code || "").trim().toUpperCase();
  if (!submitted) return json({ valid: false });

  var codesRaw = env.REFERRAL_CODES;
  if (!codesRaw) {
    var redirect2 = body.redirect || "/";
    return json({ valid: true, authUrl: buildOAuthUrl(clientId, redirectUri, redirect2) });
  }

  var validCodes = codesRaw.split(",").map(function (c) { return c.trim().toUpperCase(); }).filter(Boolean);
  if (!env.DISABLE_LAUNCH) validCodes.push("MISFITS");
  if (!validCodes.includes(submitted)) {
    return json({ valid: false });
  }

  var redirect3 = body.redirect || "/";
  var authUrl = buildOAuthUrl(clientId, redirectUri, redirect3);

  return json(
    { valid: true, authUrl: authUrl },
    200,
    { "Set-Cookie": "mm_referral_ok=" + encodeURIComponent(submitted) + "; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax" }
  );
}

function getCookie(request, name) {
  var header = request.headers.get("Cookie") || "";
  var match = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequest(context) {
  var request = context.request;
  var next = context.next;
  var env = context.env || {};
  var url = new URL(request.url);
  var path = url.pathname;

  if (!env.DB || !env.DISCORD_CLIENT_ID) return next();

  if (path === "/gate.html" || path === "/gate") return next();
  if (path.startsWith("/api/auth/")) return next();
  if (path === "/api/referral") return next();
  if (path === "/api/discord") return next();
  if (path.startsWith("/assets/")) return next();
  if (path === "/style.css" || path === "/app.js") return next();
  if (path === "/favicon.ico" || path === "/robots.txt") return next();
  if (/\.(css|js|png|jpg|jpeg|webp|gif|svg|ico|woff|woff2|ttf|eot|map)$/i.test(path)) return next();

  var sessionToken = getCookie(request, "mm_session");
  if (!sessionToken) {
    var redir = path !== "/" ? "?r=" + encodeURIComponent(path + url.search) : "";
    return new Response(null, {
      status: 302,
      headers: { Location: "/gate.html" + redir },
    });
  }

  try {
    var now = new Date().toISOString();
    var session = await env.DB.prepare(
      "SELECT id FROM sessions WHERE session_token = ? AND expires_at > ?"
    ).bind(sessionToken, now).first();

    if (!session) {
      var redir2 = path !== "/" ? "?r=" + encodeURIComponent(path + url.search) : "";
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/gate.html" + redir2,
          "Set-Cookie": "mm_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }
  } catch (e) {
    return next();
  }

  return next();
}

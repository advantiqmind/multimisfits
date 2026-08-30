function getCookie(request, name) {
  var header = request.headers.get("Cookie") || "";
  var match = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequest(context) {
  var request = context.request;
  var env = context.env || {};

  var sessionToken = getCookie(request, "mm_session");
  if (sessionToken && env.DB) {
    try {
      await env.DB.prepare("DELETE FROM sessions WHERE session_token = ?")
        .bind(sessionToken).run();
    } catch (e) { /* best effort */ }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/gate.html",
      "Set-Cookie": "mm_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    },
  });
}

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
  if (context.request.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  const code = context.env.DINK_ACCESS_CODE;
  if (!code) {
    return json({ error: "not configured" }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }

  if (!body.code || typeof body.code !== "string") {
    return json({ error: "code required" }, 400);
  }

  if (body.code.trim() === code.trim()) {
    return json({ ok: true });
  }

  return json({ error: "invalid code" }, 403);
}

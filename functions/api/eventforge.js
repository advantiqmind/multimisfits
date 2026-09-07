// Cloudflare Pages Function  ->  GET|POST|PUT|DELETE /api/eventforge
// Shared EventForge saves -- event configs and templates stored in D1.
//
// GET:  List all saves (summary) or fetch one by ?id=xxx (full with data).
// POST: Create a new save.
// PUT:  Update an existing save (optimistic locking via version).
// DELETE: Remove a save by id.
//
// Required env:
//   DB  (D1 binding)

const LIST_CACHE_TTL = 30;
const VALID_TYPES = ["event", "template"];
const VALID_CATEGORIES = ["PvM", "Skilling", "Minigame", "Social", "Competition", "Other"];

let _tableReady = false;

async function ensureTable(db) {
  if (_tableReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS eventforge_saves (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        data TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    )
    .run();
  _tableReady = true;
}

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Format as UUID v4 shape: 8-4-4-4-12
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20, 32)
  );
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type",
      ...extra,
    },
  });
}

async function handleGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "database not configured" }, 500);
  await ensureTable(db);

  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");

  if (id) {
    // Single save -- full record with data, no cache
    const row = await db
      .prepare("SELECT * FROM eventforge_saves WHERE id = ?")
      .bind(id)
      .first();
    if (!row) return json({ error: "not found" }, 404);
    return json({
      id: row.id,
      type: row.type,
      name: row.name,
      category: row.category,
      data: JSON.parse(row.data),
      created_by: row.created_by,
      updated_by: row.updated_by,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  // List all saves -- summary without data, cached
  const cache = caches.default;
  const cacheKey = new Request(
    url.origin + "/api/eventforge",
    { method: "GET" }
  );
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const result = await db
    .prepare(
      `SELECT id, type, name, category, created_by, updated_by, version, created_at, updated_at
       FROM eventforge_saves ORDER BY updated_at DESC`
    )
    .all();

  const res = json(
    { saves: result.results },
    200,
    { "Cache-Control": `public, max-age=${LIST_CACHE_TTL}` }
  );
  context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function handlePost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "database not configured" }, 500);
  await ensureTable(db);

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }

  const { type, name, category, data, user } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return json({ error: "type must be 'event' or 'template'" }, 400);
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return json({ error: "name is required" }, 400);
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return json({ error: "invalid category" }, 400);
  }
  if (data == null) {
    return json({ error: "data is required" }, 400);
  }
  if (!user || typeof user !== "string" || !user.trim()) {
    return json({ error: "user is required" }, 400);
  }

  const id = generateId();
  const now = new Date().toISOString();
  const dataStr = typeof data === "string" ? data : JSON.stringify(data);

  await db
    .prepare(
      `INSERT INTO eventforge_saves (id, type, name, category, data, created_by, updated_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(id, type, name.trim(), category, dataStr, user.trim(), user.trim(), now, now)
    .run();

  // Bust list cache
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/eventforge",
    { method: "GET" }
  );
  context.waitUntil(cache.delete(cacheKey));

  return json({
    id,
    type,
    name: name.trim(),
    category,
    created_by: user.trim(),
    updated_by: user.trim(),
    version: 1,
    created_at: now,
    updated_at: now,
  }, 201);
}

async function handlePut(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "database not configured" }, 500);
  await ensureTable(db);

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }

  const { id, name, category, data, user, version } = body;

  if (!id) return json({ error: "id is required" }, 400);
  if (typeof version !== "number") return json({ error: "version is required" }, 400);
  if (!user || typeof user !== "string" || !user.trim()) {
    return json({ error: "user is required" }, 400);
  }

  // Fetch current row to check version
  const current = await db
    .prepare("SELECT version, updated_by, updated_at FROM eventforge_saves WHERE id = ?")
    .bind(id)
    .first();

  if (!current) return json({ error: "not found" }, 404);

  if (current.version !== version) {
    return json(
      {
        error: "conflict",
        currentVersion: current.version,
        updatedBy: current.updated_by,
        updatedAt: current.updated_at,
      },
      409
    );
  }

  const now = new Date().toISOString();
  const newVersion = version + 1;

  // Build dynamic SET clause based on provided fields
  const sets = ["updated_by = ?", "updated_at = ?", "version = ?"];
  const binds = [user.trim(), now, newVersion];

  if (name != null && typeof name === "string" && name.trim()) {
    sets.push("name = ?");
    binds.push(name.trim());
  }
  if (category != null) {
    if (!VALID_CATEGORIES.includes(category)) {
      return json({ error: "invalid category" }, 400);
    }
    sets.push("category = ?");
    binds.push(category);
  }
  if (data != null) {
    const dataStr = typeof data === "string" ? data : JSON.stringify(data);
    sets.push("data = ?");
    binds.push(dataStr);
  }

  binds.push(id);

  await db
    .prepare(`UPDATE eventforge_saves SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  // Bust list cache
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/eventforge",
    { method: "GET" }
  );
  context.waitUntil(cache.delete(cacheKey));

  return json({
    id,
    version: newVersion,
    updated_by: user.trim(),
    updated_at: now,
  });
}

async function handleDelete(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "database not configured" }, 500);
  await ensureTable(db);

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "invalid JSON" }, 400);
  }

  const { id } = body;
  if (!id) return json({ error: "id is required" }, 400);

  await db
    .prepare("DELETE FROM eventforge_saves WHERE id = ?")
    .bind(id)
    .run();

  // Bust list cache
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(context.request.url).origin + "/api/eventforge",
    { method: "GET" }
  );
  context.waitUntil(cache.delete(cacheKey));

  return json({ ok: true });
}

export async function onRequest(context) {
  // Handle CORS preflight
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  try {
    switch (context.request.method) {
      case "GET":
        return handleGet(context);
      case "POST":
        return handlePost(context);
      case "PUT":
        return handlePut(context);
      case "DELETE":
        return handleDelete(context);
      default:
        return json({ error: "method not allowed" }, 405);
    }
  } catch (err) {
    return json({ error: "internal error", detail: err.message || "unknown" }, 500);
  }
}

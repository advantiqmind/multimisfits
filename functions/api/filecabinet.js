const CACHE_TTL = 30;
const TRASH_DAYS = 15;

const DEFAULT_FOLDERS = [
  { id: "clan-rules", name: "Clan Rules", emoji: "\u{1F4D6}", color: "#a03030", description: "Code of conduct, policies, and guidelines", sort_order: 0 },
  { id: "guides", name: "Guides", emoji: "\u{1F393}", color: "#2a5a8a", description: "How-to guides and tutorials", sort_order: 1 },
  { id: "event-templates", name: "Event Templates", emoji: "\u{1F3AF}", color: "#8a5a1a", description: "Reusable event post templates", sort_order: 2 },
  { id: "event-results", name: "Event Results", emoji: "\u{1F3C6}", color: "#d4a017", description: "Past event outcomes and standings", sort_order: 3 },
  { id: "rank-system", name: "Rank System", emoji: "\u{1F4DA}", color: "#6b5836", description: "Rank requirements and promotion info", sort_order: 4 },
  { id: "announcements", name: "Announcements Archive", emoji: "\u{1F4E4}", color: "#2a7a3a", description: "Archived clan announcements", sort_order: 5 },
  { id: "clan-assets", name: "Clan Assets", emoji: "\u{1F3A8}", color: "#7a3a8a", description: "Logos, banners, graphics", sort_order: 6 },
  { id: "recruitment", name: "Recruitment", emoji: "\u{1F465}", color: "#3a7a8a", description: "Recruitment info and templates", sort_order: 7 },
  { id: "finances", name: "Finances / Clan Coffers", emoji: "\u{1F4B0}", color: "#5a8a2a", description: "GP tracking and coffer records", sort_order: 8 },
];

let _tablesReady = false;

async function ensureTables(db) {
  if (_tablesReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS filecabinet_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '📁',
    color TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS filecabinet_files (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    filed_by TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    trashed INTEGER NOT NULL DEFAULT 0,
    trashed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS filecabinet_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    edited_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS filecabinet_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS filecabinet_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    target_name TEXT,
    folder_id TEXT,
    actor TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  _tablesReady = true;
}

async function seedDefaults(db) {
  const { results } = await db.prepare("SELECT COUNT(*) as c FROM filecabinet_folders").first() ? { results: [await db.prepare("SELECT COUNT(*) as c FROM filecabinet_folders").first()] } : { results: [] };
  const count = results[0]?.c ?? 0;
  if (count > 0) return;
  const stmt = db.prepare("INSERT OR IGNORE INTO filecabinet_folders (id, name, emoji, color, description, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, 'system')");
  const batch = DEFAULT_FOLDERS.map(f => stmt.bind(f.id, f.name, f.emoji, f.color, f.description, f.sort_order));
  await db.batch(batch);
}

async function cleanupTrash(db) {
  await db.prepare(`DELETE FROM filecabinet_comments WHERE file_id IN (SELECT id FROM filecabinet_files WHERE trashed = 1 AND trashed_at < datetime('now', '-${TRASH_DAYS} days'))`).run();
  await db.prepare(`DELETE FROM filecabinet_versions WHERE file_id IN (SELECT id FROM filecabinet_files WHERE trashed = 1 AND trashed_at < datetime('now', '-${TRASH_DAYS} days'))`).run();
  await db.prepare(`DELETE FROM filecabinet_files WHERE trashed = 1 AND trashed_at < datetime('now', '-${TRASH_DAYS} days')`).run();
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

async function logActivity(db, action, targetType, targetId, targetName, folderId, actor, details) {
  await db.prepare(
    "INSERT INTO filecabinet_activity (action, target_type, target_id, target_name, folder_id, actor, details) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(action, targetType, targetId || "", targetName || "", folderId || "", actor || "", details || "").run();
}

// ── GET handlers ──

async function getFolders(db) {
  const folders = await db.prepare(
    "SELECT f.*, COALESCE(c.cnt, 0) as file_count FROM filecabinet_folders f LEFT JOIN (SELECT folder_id, COUNT(*) as cnt FROM filecabinet_files WHERE trashed = 0 GROUP BY folder_id) c ON f.id = c.folder_id ORDER BY f.sort_order ASC"
  ).all();
  return json({ folders: folders.results });
}

async function getFiles(db, folderId, sort) {
  let orderBy = "pinned DESC, updated_at DESC";
  if (sort === "oldest") orderBy = "pinned DESC, created_at ASC";
  if (sort === "alpha") orderBy = "pinned DESC, title ASC";
  if (sort === "edited") orderBy = "pinned DESC, updated_at DESC";
  if (sort === "newest") orderBy = "pinned DESC, created_at DESC";

  const files = await db.prepare(
    `SELECT id, folder_id, title, substr(content, 1, 200) as snippet, tags, filed_by, pinned, created_at, updated_at FROM filecabinet_files WHERE folder_id = ? AND trashed = 0 ORDER BY ${orderBy}`
  ).bind(folderId).all();

  const result = files.results.map(f => ({ ...f, tags: safeParseTags(f.tags) }));
  return json({ files: result });
}

async function getFile(db, fileId) {
  const file = await db.prepare(
    "SELECT * FROM filecabinet_files WHERE id = ?"
  ).bind(fileId).first();
  if (!file) return json({ error: "File not found" }, 404);

  const comments = await db.prepare(
    "SELECT * FROM filecabinet_comments WHERE file_id = ? ORDER BY created_at ASC"
  ).bind(fileId).all();

  const versionCount = await db.prepare(
    "SELECT COUNT(*) as c FROM filecabinet_versions WHERE file_id = ?"
  ).bind(fileId).first();

  return json({
    file: { ...file, tags: safeParseTags(file.tags) },
    comments: comments.results,
    versionCount: versionCount?.c ?? 0,
  });
}

async function getVersions(db, fileId) {
  const versions = await db.prepare(
    "SELECT * FROM filecabinet_versions WHERE file_id = ? ORDER BY created_at DESC"
  ).bind(fileId).all();
  return json({ versions: versions.results });
}

async function searchFiles(db, params) {
  const q = params.get("search") || "";
  const folderId = params.get("folder");
  if (!q.trim()) return json({ results: [] });

  const term = `%${q.trim()}%`;
  let query, binds;

  if (folderId) {
    query = `SELECT f.id, f.folder_id, f.title, substr(f.content, 1, 300) as snippet, f.tags, f.filed_by, f.pinned, f.created_at, f.updated_at, fo.name as folder_name, fo.emoji as folder_emoji FROM filecabinet_files f JOIN filecabinet_folders fo ON f.folder_id = fo.id WHERE f.trashed = 0 AND f.folder_id = ? AND (f.title LIKE ? OR f.content LIKE ? OR f.tags LIKE ?) ORDER BY CASE WHEN f.title LIKE ? THEN 0 ELSE 1 END, f.updated_at DESC LIMIT 50`;
    binds = [folderId, term, term, term, term];
  } else {
    query = `SELECT f.id, f.folder_id, f.title, substr(f.content, 1, 300) as snippet, f.tags, f.filed_by, f.pinned, f.created_at, f.updated_at, fo.name as folder_name, fo.emoji as folder_emoji FROM filecabinet_files f JOIN filecabinet_folders fo ON f.folder_id = fo.id WHERE f.trashed = 0 AND (f.title LIKE ? OR f.content LIKE ? OR f.tags LIKE ?) ORDER BY CASE WHEN f.title LIKE ? THEN 0 ELSE 1 END, f.updated_at DESC LIMIT 50`;
    binds = [term, term, term, term];
  }

  const stmt = db.prepare(query);
  const results = await stmt.bind(...binds).all();
  return json({
    query: q.trim(),
    results: results.results.map(r => ({ ...r, tags: safeParseTags(r.tags) })),
  });
}

async function getTrash(db) {
  const files = await db.prepare(
    "SELECT f.id, f.folder_id, f.title, f.filed_by, f.trashed_at, fo.name as folder_name FROM filecabinet_files f LEFT JOIN filecabinet_folders fo ON f.folder_id = fo.id WHERE f.trashed = 1 ORDER BY f.trashed_at DESC"
  ).all();
  return json({ files: files.results });
}

async function getActivity(db) {
  const activity = await db.prepare(
    "SELECT * FROM filecabinet_activity ORDER BY created_at DESC LIMIT 50"
  ).all();
  return json({ activity: activity.results });
}

// ── POST handlers ──

async function validateCode(env, body) {
  const code = env.FILECABINET_ACCESS_CODE;
  if (!code) return json({ valid: true, level: "leader" });
  if (body.access_code === code) return json({ valid: true, level: "leader" });
  return json({ valid: false }, 403);
}

async function createFolder(db, body) {
  const id = genId();
  const maxOrder = await db.prepare("SELECT MAX(sort_order) as m FROM filecabinet_folders").first();
  const sortOrder = (maxOrder?.m ?? -1) + 1;

  await db.prepare(
    "INSERT INTO filecabinet_folders (id, name, emoji, color, description, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, body.name || "New Folder", body.emoji || "\u{1F4C1}", body.color || "", body.description || "", sortOrder, body.actor || "").run();

  await logActivity(db, "created", "folder", id, body.name, id, body.actor);
  return json({ ok: true, id });
}

async function updateFolder(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_folders WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "Folder not found" }, 404);

  const name = body.name ?? existing.name;
  const emoji = body.emoji ?? existing.emoji;
  const color = body.color ?? existing.color;
  const desc = body.description ?? existing.description;

  await db.prepare(
    "UPDATE filecabinet_folders SET name = ?, emoji = ?, color = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(name, emoji, color, desc, body.id).run();

  await logActivity(db, "updated", "folder", body.id, name, body.id, body.actor);
  return json({ ok: true });
}

async function deleteFolder(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_folders WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "Folder not found" }, 404);

  const fileCount = await db.prepare("SELECT COUNT(*) as c FROM filecabinet_files WHERE folder_id = ? AND trashed = 0").bind(body.id).first();
  if (fileCount?.c > 0) return json({ error: "Folder is not empty. Move or delete files first." }, 400);

  await db.prepare("DELETE FROM filecabinet_folders WHERE id = ?").bind(body.id).run();
  await logActivity(db, "deleted", "folder", body.id, existing.name, body.id, body.actor);
  return json({ ok: true });
}

async function createFile(db, body) {
  const id = genId();
  const tags = JSON.stringify(body.tags || []);

  await db.prepare(
    "INSERT INTO filecabinet_files (id, folder_id, title, content, tags, filed_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, body.folder_id, body.title || "Untitled", body.content || "", tags, body.filed_by || "").run();

  await logActivity(db, "created", "file", id, body.title, body.folder_id, body.filed_by);
  return json({ ok: true, id });
}

async function updateFile(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  await db.prepare(
    "INSERT INTO filecabinet_versions (file_id, title, content, edited_by) VALUES (?, ?, ?, ?)"
  ).bind(body.id, existing.title, existing.content, body.edited_by || "").run();

  const title = body.title ?? existing.title;
  const content = body.content ?? existing.content;
  const tags = body.tags ? JSON.stringify(body.tags) : existing.tags;

  await db.prepare(
    "UPDATE filecabinet_files SET title = ?, content = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(title, content, tags, body.id).run();

  await logActivity(db, "edited", "file", body.id, title, existing.folder_id, body.edited_by);
  return json({ ok: true });
}

async function moveFile(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  const targetFolder = await db.prepare("SELECT name FROM filecabinet_folders WHERE id = ?").bind(body.folder_id).first();
  if (!targetFolder) return json({ error: "Target folder not found" }, 404);

  await db.prepare(
    "UPDATE filecabinet_files SET folder_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(body.folder_id, body.id).run();

  await logActivity(db, "moved", "file", body.id, existing.title, body.folder_id, body.actor, `to ${targetFolder.name}`);
  return json({ ok: true });
}

async function duplicateFile(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  const newId = genId();
  const targetFolder = body.target_folder_id || existing.folder_id;
  const newTitle = existing.title + " (Copy)";

  await db.prepare(
    "INSERT INTO filecabinet_files (id, folder_id, title, content, tags, filed_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(newId, targetFolder, newTitle, existing.content, existing.tags, body.actor || existing.filed_by).run();

  await logActivity(db, "duplicated", "file", newId, newTitle, targetFolder, body.actor);
  return json({ ok: true, id: newId });
}

async function pinFile(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  const pinned = body.pinned ? 1 : 0;
  await db.prepare("UPDATE filecabinet_files SET pinned = ? WHERE id = ?").bind(pinned, body.id).run();

  await logActivity(db, pinned ? "pinned" : "unpinned", "file", body.id, existing.title, existing.folder_id, body.actor);
  return json({ ok: true });
}

async function trashFile(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  await db.prepare(
    "UPDATE filecabinet_files SET trashed = 1, trashed_at = datetime('now') WHERE id = ?"
  ).bind(body.id).run();

  await logActivity(db, "trashed", "file", body.id, existing.title, existing.folder_id, body.actor);
  return json({ ok: true });
}

async function restoreFile(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  await db.prepare(
    "UPDATE filecabinet_files SET trashed = 0, trashed_at = NULL WHERE id = ?"
  ).bind(body.id).run();

  await logActivity(db, "restored", "file", body.id, existing.title, existing.folder_id, body.actor);
  return json({ ok: true });
}

async function deleteFilePermanent(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  await db.prepare("DELETE FROM filecabinet_comments WHERE file_id = ?").bind(body.id).run();
  await db.prepare("DELETE FROM filecabinet_versions WHERE file_id = ?").bind(body.id).run();
  await db.prepare("DELETE FROM filecabinet_files WHERE id = ?").bind(body.id).run();

  await logActivity(db, "deleted permanently", "file", body.id, existing.title, existing.folder_id, body.actor);
  return json({ ok: true });
}

async function emptyTrash(db, body) {
  await db.prepare("DELETE FROM filecabinet_comments WHERE file_id IN (SELECT id FROM filecabinet_files WHERE trashed = 1)").run();
  await db.prepare("DELETE FROM filecabinet_versions WHERE file_id IN (SELECT id FROM filecabinet_files WHERE trashed = 1)").run();
  const { changes } = await db.prepare("DELETE FROM filecabinet_files WHERE trashed = 1").run().then(r => r.meta || {});
  await logActivity(db, "emptied trash", "system", null, null, null, body.actor);
  return json({ ok: true });
}

async function addComment(db, body) {
  const existing = await db.prepare("SELECT * FROM filecabinet_files WHERE id = ?").bind(body.file_id).first();
  if (!existing) return json({ error: "File not found" }, 404);

  await db.prepare(
    "INSERT INTO filecabinet_comments (file_id, author, text) VALUES (?, ?, ?)"
  ).bind(body.file_id, body.author || "", body.text || "").run();

  await logActivity(db, "commented on", "file", body.file_id, existing.title, existing.folder_id, body.author);
  return json({ ok: true });
}

async function importFiles(db, body) {
  const files = body.files || [];
  if (!files.length) return json({ error: "No files to import" }, 400);

  let imported = 0;
  for (const f of files) {
    if (!f.title) continue;
    const id = genId();
    const tags = JSON.stringify(f.tags || []);
    const folderId = f.folder_id || "clan-rules";
    await db.prepare(
      "INSERT INTO filecabinet_files (id, folder_id, title, content, tags, filed_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, folderId, f.title, f.content || "", tags, f.filed_by || body.actor || "").run();
    imported++;
  }

  await logActivity(db, "imported", "system", null, `${imported} files`, null, body.actor);
  return json({ ok: true, imported });
}

function safeParseTags(raw) {
  try { return JSON.parse(raw); } catch (_) { return []; }
}

// ── Request handlers ──

export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;
  const url = new URL(request.url);

  await ensureTables(db);
  await seedDefaults(db);
  context.waitUntil(cleanupTrash(db));

  if (url.searchParams.has("file")) return getFile(db, url.searchParams.get("file"));
  if (url.searchParams.has("folder")) return getFiles(db, url.searchParams.get("folder"), url.searchParams.get("sort"));
  if (url.searchParams.has("search")) return searchFiles(db, url.searchParams);
  if (url.searchParams.has("trash")) return getTrash(db);
  if (url.searchParams.has("activity")) return getActivity(db);
  if (url.searchParams.has("versions")) return getVersions(db, url.searchParams.get("versions"));

  return getFolders(db);
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON" }, 400); }

  await ensureTables(db);
  await seedDefaults(db);

  if (body.action === "validate") return validateCode(env, body);

  const code = env.FILECABINET_ACCESS_CODE;
  if (code && body.access_code !== code) return json({ error: "Invalid access code" }, 403);

  switch (body.action) {
    case "create_folder": return createFolder(db, body);
    case "update_folder": return updateFolder(db, body);
    case "delete_folder": return deleteFolder(db, body);
    case "create_file": return createFile(db, body);
    case "update_file": return updateFile(db, body);
    case "move_file": return moveFile(db, body);
    case "duplicate_file": return duplicateFile(db, body);
    case "pin_file": return pinFile(db, body);
    case "trash_file": return trashFile(db, body);
    case "restore_file": return restoreFile(db, body);
    case "delete_file": return deleteFilePermanent(db, body);
    case "empty_trash": return emptyTrash(db, body);
    case "add_comment": return addComment(db, body);
    case "import": return importFiles(db, body);
    default: return json({ error: "Unknown action" }, 400);
  }
}

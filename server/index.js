import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const port = Number(process.env.PORT || 3000);
const importToken = process.env.IMPORT_TOKEN || "";
const allowUnauthenticatedImport = process.env.ALLOW_UNAUTHENTICATED_IMPORT === "true";
const databasePath = process.env.DATABASE_PATH || path.join(rootDir, ".data", "prompt-frame.sqlite");
const maxImportItems = Number(process.env.MAX_IMPORT_ITEMS || 5000);
const importBodyLimit = process.env.IMPORT_BODY_LIMIT || "10mb";

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS gallery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_number INTEGER NOT NULL,
    username TEXT NOT NULL,
    post_url TEXT NOT NULL,
    image_url TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    title TEXT NOT NULL,
    info TEXT NOT NULL,
    prompt TEXT NOT NULL,
    image_index INTEGER NOT NULL,
    original_tags TEXT NOT NULL DEFAULT '[]',
    user_tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(image_url, post_number, image_index)
  );
`);

const selectItems = db.prepare(`
  SELECT post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, original_tags, user_tags
  FROM gallery_items
  ORDER BY post_number DESC, image_index ASC, id DESC
`);

const insertItem = db.prepare(`
  INSERT OR IGNORE INTO gallery_items (
    post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, original_tags, user_tags
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectTagsForItem = db.prepare(`
  SELECT original_tags, user_tags
  FROM gallery_items
  WHERE image_url = ? AND post_number = ? AND image_index = ?
`);

const updateTagsForItem = db.prepare(`
  UPDATE gallery_items
  SET original_tags = ?, user_tags = ?, updated_at = CURRENT_TIMESTAMP
  WHERE image_url = ? AND post_number = ? AND image_index = ?
`);

function safeJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTagList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 24);
}

function truncateText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeUrl(value) {
  const url = truncateText(value, 2048);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function requireImportAuth(req, res) {
  if (!importToken) {
    if (allowUnauthenticatedImport) return true;
    res.status(503).json({ error: "Import is disabled until IMPORT_TOKEN is configured" });
    return false;
  }

  const auth = req.headers.authorization || "";
  const expected = `Bearer ${importToken}`;
  const authBuffer = Buffer.from(auth);
  const expectedBuffer = Buffer.from(expected);
  const valid = authBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(authBuffer, expectedBuffer);

  if (!valid) {
    res.status(403).json({ error: "Invalid or missing import token" });
    return false;
  }

  return true;
}

function normalizeImportedItems(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "object" && value
      ? Array.isArray(value.items)
        ? value.items
        : Array.isArray(value.data)
          ? value.data
          : []
      : [];

  const items = [];
  let invalid = Math.max(0, source.length - maxImportItems);

  for (const entry of source.slice(0, maxImportItems)) {
    if (!entry || typeof entry !== "object") {
      invalid += 1;
      continue;
    }

    const postNumber = Number(entry.post_number);
    const imageIndex = Number(entry.image_index || 1);
    const imageUrl = normalizeUrl(entry.image_url);
    const thumbUrl = normalizeUrl(entry.thumb_url) || imageUrl;
    const postUrl = normalizeUrl(entry.post_url);
    const username = truncateText(entry.username, 120);

    if (!Number.isFinite(postNumber) || !imageUrl || !username) {
      invalid += 1;
      continue;
    }

    items.push({
      post_number: postNumber,
      username,
      post_url: postUrl,
      image_url: imageUrl,
      thumb_url: thumbUrl,
      title: truncateText(entry.title || `Floor ${postNumber} - Image ${Number.isFinite(imageIndex) ? imageIndex : 1}`, 240),
      info: truncateText(entry.info, 1000),
      prompt: truncateText(entry.prompt || "Not provided", 20000),
      image_index: Number.isFinite(imageIndex) ? imageIndex : 1,
      original_tags: normalizeTagList(entry.original_tags),
      user_tags: normalizeTagList(entry.user_tags),
    });
  }

  return { items, invalid };
}

function rowToItem(row) {
  return {
    post_number: row.post_number,
    username: row.username,
    post_url: row.post_url,
    image_url: row.image_url,
    thumb_url: row.thumb_url,
    title: row.title,
    info: row.info,
    prompt: row.prompt,
    image_index: row.image_index,
    original_tags: safeJsonArray(row.original_tags),
    user_tags: safeJsonArray(row.user_tags),
  };
}

function mergeTagsForDuplicate(item) {
  if (!item.original_tags.length && !item.user_tags.length) return;

  const existing = selectTagsForItem.get(item.image_url, item.post_number, item.image_index);
  if (!existing) return;

  const originalTags = Array.from(new Set([...safeJsonArray(existing.original_tags), ...item.original_tags])).slice(0, 24);
  const userTags = Array.from(new Set([...safeJsonArray(existing.user_tags), ...item.user_tags])).slice(0, 24);

  updateTagsForItem.run(
    JSON.stringify(originalTags),
    JSON.stringify(userTags),
    item.image_url,
    item.post_number,
    item.image_index,
  );
}

const app = express();

app.use(express.json({ limit: importBodyLimit }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/items", (_req, res) => {
  const items = selectItems.all().map(rowToItem);
  res.json({ items });
});

app.post("/api/import", (req, res) => {
  if (!requireImportAuth(req, res)) return;

  const result = normalizeImportedItems(req.body);

  let added = 0;
  let duplicated = 0;

  try {
    db.exec("BEGIN");
    for (const item of result.items) {
      try {
        const insertResult = insertItem.run(
          item.post_number,
          item.username,
          item.post_url,
          item.image_url,
          item.thumb_url,
          item.title,
          item.info,
          item.prompt,
          item.image_index,
          JSON.stringify(item.original_tags),
          JSON.stringify(item.user_tags),
        );

        if (insertResult.changes) {
          added += 1;
        } else {
          duplicated += 1;
          mergeTagsForDuplicate(item);
        }
      } catch {
        result.invalid += 1;
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.json({
    added,
    duplicated,
    invalid: result.invalid,
    total: selectItems.all().length,
  });
});

app.use("/assets", express.static(path.join(distDir, "assets"), { immutable: true, maxAge: "1y" }));
app.use(express.static(distDir));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found" });
    return;
  }

  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  res.status(404).send("Build output not found. Run npm run build first.");
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`PromptFrame server listening on http://0.0.0.0:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  if (!importToken && !allowUnauthenticatedImport) {
    console.log("Import API disabled: set IMPORT_TOKEN to enable authenticated imports.");
  }
});

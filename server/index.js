import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const port = Number(process.env.PORT || 3000);
const importToken = process.env.IMPORT_TOKEN || "";
const adminToken = process.env.ADMIN_TOKEN || "promptframe";
const databasePath = process.env.DATABASE_PATH || path.join(rootDir, ".data", "prompt-frame.sqlite");

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
    recommended INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    original_tags TEXT NOT NULL DEFAULT '[]',
    user_tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(image_url, post_number, image_index)
  );
`);

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

if (!hasColumn("gallery_items", "recommended")) {
  db.exec("ALTER TABLE gallery_items ADD COLUMN recommended INTEGER NOT NULL DEFAULT 0;");
}

if (!hasColumn("gallery_items", "pinned")) {
  db.exec("ALTER TABLE gallery_items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS upload_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const categoriesCount = db.prepare("SELECT COUNT(*) as count FROM categories").get();
if (Number(categoriesCount?.count || 0) === 0) {
  const defaults = ["海报", "城市", "人物", "插画", "国风"];
  db.exec("BEGIN");
  try {
    const insertCategory = db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)");
    defaults.forEach((name, index) => insertCategory.run(name, index + 1));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const selectItems = db.prepare(`
  SELECT id, post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, recommended, pinned, original_tags, user_tags
  FROM gallery_items
  ORDER BY pinned DESC, recommended DESC, post_number DESC, image_index ASC, id DESC
`);

const insertItem = db.prepare(`
  INSERT OR IGNORE INTO gallery_items (
    post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, recommended, pinned, original_tags, user_tags
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertItemWithId = db.prepare(`
  INSERT INTO gallery_items (
    id, post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, recommended, pinned, original_tags, user_tags
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const selectAdminItems = db.prepare(`
  SELECT id, post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, recommended, pinned, original_tags, user_tags, created_at, updated_at
  FROM gallery_items
  ORDER BY pinned DESC, recommended DESC, post_number DESC, image_index ASC, id DESC
`);

const selectCategoriesPublic = db.prepare(`
  SELECT name
  FROM categories
  ORDER BY sort_order ASC, id ASC
`);

const selectCategoriesAdmin = db.prepare(`
  SELECT id, name, sort_order, created_at, updated_at
  FROM categories
  ORDER BY sort_order ASC, id ASC
`);

const insertCategory = db.prepare(`
  INSERT INTO categories (name, sort_order)
  VALUES (?, ?)
`);

const insertCategoryWithId = db.prepare(`
  INSERT INTO categories (id, name, sort_order)
  VALUES (?, ?, ?)
`);

const updateCategory = db.prepare(`
  UPDATE categories
  SET name = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteCategory = db.prepare(`
  DELETE FROM categories
  WHERE id = ?
`);

const selectItemById = db.prepare(`
  SELECT id, post_number, username, post_url, image_url, thumb_url, title, info, prompt, image_index, recommended, pinned, original_tags, user_tags, created_at, updated_at
  FROM gallery_items
  WHERE id = ?
`);

const updateItemById = db.prepare(`
  UPDATE gallery_items
  SET
    post_number = ?,
    username = ?,
    post_url = ?,
    image_url = ?,
    thumb_url = ?,
    title = ?,
    info = ?,
    prompt = ?,
    image_index = ?,
    recommended = ?,
    pinned = ?,
    original_tags = ?,
    user_tags = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteItemById = db.prepare(`
  DELETE FROM gallery_items
  WHERE id = ?
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

const selectUploadChannelsAdmin = db.prepare(`
  SELECT id, name, type, enabled, config, created_at, updated_at
  FROM upload_channels
  ORDER BY enabled DESC, id DESC
`);

const selectUploadChannelById = db.prepare(`
  SELECT id, name, type, enabled, config, created_at, updated_at
  FROM upload_channels
  WHERE id = ?
`);

const insertUploadChannel = db.prepare(`
  INSERT INTO upload_channels (name, type, enabled, config)
  VALUES (?, ?, ?, ?)
`);

const insertUploadChannelWithId = db.prepare(`
  INSERT INTO upload_channels (id, name, type, enabled, config)
  VALUES (?, ?, ?, ?, ?)
`);

const updateUploadChannel = db.prepare(`
  UPDATE upload_channels
  SET name = ?, type = ?, enabled = ?, config = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteUploadChannel = db.prepare(`
  DELETE FROM upload_channels
  WHERE id = ?
`);

const selectSetting = db.prepare(`
  SELECT value
  FROM app_settings
  WHERE key = ?
`);

const upsertSetting = db.prepare(`
  INSERT INTO app_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`);

const selectAllSettings = db.prepare(`
  SELECT key, value, updated_at
  FROM app_settings
  ORDER BY key ASC
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
  let invalid = 0;

  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      invalid += 1;
      continue;
    }

    const postNumber = Number(entry.post_number);
    const imageIndex = Number(entry.image_index || 1);
    const imageUrl = String(entry.image_url || "").trim();
    const username = String(entry.username || "").trim();

    if (!Number.isFinite(postNumber) || !imageUrl || !username) {
      invalid += 1;
      continue;
    }

    items.push({
      post_number: postNumber,
      username,
      post_url: String(entry.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(entry.thumb_url || imageUrl),
      title: String(entry.title ?? "").trim(),
      info: String(entry.info || ""),
      prompt: String(entry.prompt || "未提供"),
      image_index: Number.isFinite(imageIndex) ? imageIndex : 1,
      recommended: Boolean(entry.recommended),
      pinned: Boolean(entry.pinned),
      original_tags: normalizeTagList(entry.original_tags),
      user_tags: normalizeTagList(entry.user_tags),
    });
  }

  return { items, invalid };
}

function safeJsonObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function rowToItem(row) {
  return {
    id: row.id,
    post_number: row.post_number,
    username: row.username,
    post_url: row.post_url,
    image_url: row.image_url,
    thumb_url: row.thumb_url,
    title: row.title,
    info: row.info,
    prompt: row.prompt,
    image_index: row.image_index,
    recommended: Boolean(row.recommended),
    pinned: Boolean(row.pinned),
    original_tags: safeJsonArray(row.original_tags),
    user_tags: safeJsonArray(row.user_tags),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToUploadChannel(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: Boolean(row.enabled),
    config: safeJsonObject(row.config),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getSettingValue(key) {
  const row = selectSetting.get(key);
  return row?.value ?? null;
}

function setSettingValue(key, value) {
  upsertSetting.run(key, String(value ?? ""));
}

function getDefaultUploadChannelId() {
  const raw = getSettingValue("default_upload_channel_id");
  const id = raw ? Number(raw) : null;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function setDefaultUploadChannelId(id) {
  if (id === null) {
    setSettingValue("default_upload_channel_id", "");
    return;
  }
  setSettingValue("default_upload_channel_id", String(id));
}

function normalizeChannelInput(value) {
  const source = value && typeof value === "object" ? value : {};
  const name = String(source.name || "").trim();
  const type = String(source.type || "").trim();
  const enabled = "enabled" in source ? Boolean(source.enabled) : true;
  const config = source.config && typeof source.config === "object" ? source.config : {};

  if (!name) return { ok: false, error: "name 不能为空" };
  if (!type) return { ok: false, error: "type 不能为空" };
  if (!["telegram", "r2", "s3"].includes(type)) return { ok: false, error: "type 必须是 telegram / r2 / s3" };

  if (type === "telegram") {
    const botToken = String(config.bot_token || "").trim();
    const chatId = String(config.chat_id || "").trim();
    const proxyDomain = String(config.proxy_domain || "").trim();
    if (!botToken) return { ok: false, error: "Telegram bot_token 不能为空" };
    if (!chatId) return { ok: false, error: "Telegram chat_id 不能为空" };
    return { ok: true, channel: { name, type, enabled, config: { bot_token: botToken, chat_id: chatId, proxy_domain: proxyDomain } } };
  }

  if (type === "r2") {
    const accessKeyId = String(config.access_key_id || "").trim();
    const secretAccessKey = String(config.secret_access_key || "").trim();
    const accountId = String(config.account_id || "").trim();
    const bucket = String(config.bucket || "").trim();
    const publicBaseUrl = String(config.public_base_url || "").trim();
    const region = String(config.region || "auto").trim() || "auto";
    if (!accessKeyId || !secretAccessKey) return { ok: false, error: "R2 access_key_id / secret_access_key 不能为空" };
    if (!accountId) return { ok: false, error: "R2 account_id 不能为空" };
    if (!bucket) return { ok: false, error: "R2 bucket 不能为空" };
    if (!publicBaseUrl) return { ok: false, error: "R2 public_base_url 不能为空" };
    return {
      ok: true,
      channel: { name, type, enabled, config: { access_key_id: accessKeyId, secret_access_key: secretAccessKey, account_id: accountId, bucket, public_base_url: publicBaseUrl, region } },
    };
  }

  const accessKeyId = String(config.access_key_id || "").trim();
  const secretAccessKey = String(config.secret_access_key || "").trim();
  const region = String(config.region || "").trim();
  const bucket = String(config.bucket || "").trim();
  const endpoint = String(config.endpoint || "").trim();
  const publicBaseUrl = String(config.public_base_url || "").trim();
  if (!accessKeyId || !secretAccessKey) return { ok: false, error: "S3 access_key_id / secret_access_key 不能为空" };
  if (!region) return { ok: false, error: "S3 region 不能为空" };
  if (!bucket) return { ok: false, error: "S3 bucket 不能为空" };
  if (!publicBaseUrl) return { ok: false, error: "S3 public_base_url 不能为空" };
  return { ok: true, channel: { name, type, enabled, config: { access_key_id: accessKeyId, secret_access_key: secretAccessKey, region, bucket, endpoint, public_base_url: publicBaseUrl } } };
}

function normalizeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: "url 不能为空" };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "url 格式不合法" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false, error: "仅支持 http/https url" };
  return { ok: true, url: parsed.toString() };
}

function inferExtFromMime(mime) {
  const map = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
  };
  return map[mime] || "";
}

function inferMimeFromExt(ext) {
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
  };
  return map[String(ext || "").toLowerCase()] || "application/octet-stream";
}

function safeJoinUrl(base, key) {
  const trimmed = String(base || "").trim().replace(/\/+$/g, "");
  const cleanedKey = String(key || "").replace(/^\/+/g, "");
  return trimmed ? `${trimmed}/${cleanedKey}` : cleanedKey;
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return { ok: false, error: "data_url 不是合法的 data:...;base64,... 格式" };
  const mime = match[1].trim();
  if (!mime.startsWith("image/")) return { ok: false, error: "仅支持图片 data_url" };
  try {
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) return { ok: false, error: "data_url 内容为空" };
    return { ok: true, mime, buffer };
  } catch {
    return { ok: false, error: "data_url base64 解析失败" };
  }
}

async function downloadToBuffer(url, maxBytes = 15 * 1024 * 1024) {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
  if (mime && !mime.startsWith("image/")) throw new Error("仅支持转存图片资源");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("下载失败：响应体为空");

  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) throw new Error("图片过大：超过服务端限制");
      chunks.push(Buffer.from(value));
    }
  }
  return { buffer: Buffer.concat(chunks), mime: mime || "application/octet-stream" };
}

function buildUploadKey(fileName, mime) {
  const safeName = String(fileName || "").trim().replace(/[^\w.\-]+/g, "_");
  const extFromName = path.extname(safeName);
  const ext = extFromName || inferExtFromMime(mime) || ".bin";
  const ymd = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `uploads/${ymd}/${randomUUID()}${ext}`;
}

async function uploadToS3Compatible({ buffer, mime, key, config }) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: Boolean(config.force_path_style),
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
    }),
  );
}

async function uploadToR2({ buffer, mime, key, config }) {
  const endpoint = `https://${config.account_id}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: config.region || "auto",
    endpoint,
    credentials: {
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
    }),
  );
}

async function uploadToTelegram({ buffer, mime, fileName, config }) {
  const apiDomain = config.proxy_domain ? `https://${config.proxy_domain}` : "https://api.telegram.org";
  const baseURL = `${apiDomain}/bot${config.bot_token}`;
  const formData = new FormData();
  formData.set("chat_id", String(config.chat_id));
  formData.set("photo", new Blob([buffer], { type: mime }), fileName || `upload${inferExtFromMime(mime) || ".jpg"}`);

  const response = await fetch(`${baseURL}/sendPhoto`, { method: "POST", body: formData });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    const description = json && typeof json === "object" && "description" in json ? String(json.description) : response.statusText;
    throw new Error(`Telegram 上传失败：${description || `HTTP ${response.status}`}`);
  }

  const photos = json?.result?.photo;
  if (!Array.isArray(photos) || !photos.length) throw new Error("Telegram 上传失败：未返回 photo 信息");
  const largest = photos.reduce((prev, cur) => (Number(cur?.file_size || 0) > Number(prev?.file_size || 0) ? cur : prev), photos[0]);
  const fileId = String(largest.file_id || "").trim();
  if (!fileId) throw new Error("Telegram 上传失败：file_id 为空");
  return { file_id: fileId };
}

async function getTelegramFileStream({ fileId, config }) {
  const apiDomain = config.proxy_domain ? `https://${config.proxy_domain}` : "https://api.telegram.org";
  const baseURL = `${apiDomain}/bot${config.bot_token}`;
  const fileDomain = config.proxy_domain ? `https://${config.proxy_domain}` : "https://api.telegram.org";

  const metaRes = await fetch(`${baseURL}/getFile?file_id=${encodeURIComponent(fileId)}`, { method: "GET" });
  const metaJson = await metaRes.json().catch(() => null);
  if (!metaRes.ok || !metaJson?.ok || !metaJson?.result?.file_path) throw new Error("Telegram 获取文件信息失败");
  const filePath = String(metaJson.result.file_path);

  const fileRes = await fetch(`${fileDomain}/file/bot${config.bot_token}/${filePath}`, { method: "GET" });
  if (!fileRes.ok) throw new Error(`Telegram 拉取文件失败：HTTP ${fileRes.status}`);
  return fileRes;
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

function performImport(payload) {
  const result = normalizeImportedItems(payload);

  let added = 0;
  let duplicated = 0;

  db.exec("BEGIN");
  try {
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
          item.recommended ? 1 : 0,
          item.pinned ? 1 : 0,
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

  return {
    added,
    duplicated,
    invalid: result.invalid,
    total: selectItems.all().length,
  };
}

function normalizeBackupPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const container = source.data && typeof source.data === "object" ? source.data : source;

  const rawItems = Array.isArray(container.items) ? container.items : [];
  const rawCategories = Array.isArray(container.categories) ? container.categories : [];
  const rawChannels = Array.isArray(container.upload_channels) ? container.upload_channels : Array.isArray(container.channels) ? container.channels : [];
  const rawSettings = Array.isArray(container.app_settings) ? container.app_settings : [];

  const items = [];
  let itemInvalid = 0;
  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") {
      itemInvalid += 1;
      continue;
    }
    const id = Number(entry.id);
    const postNumber = Number(entry.post_number);
    const imageIndex = Number(entry.image_index || 1);
    const username = String(entry.username || "").trim();
    const imageUrl = String(entry.image_url || "").trim();
    const title = String(entry.title || "").trim();
    const promptRaw = String(entry.prompt ?? "");

    if (!Number.isFinite(postNumber) || postNumber <= 0) {
      itemInvalid += 1;
      continue;
    }
    if (!Number.isFinite(imageIndex) || imageIndex <= 0) {
      itemInvalid += 1;
      continue;
    }
    if (!username || !imageUrl || !promptRaw.trim()) {
      itemInvalid += 1;
      continue;
    }

    items.push({
      id: Number.isFinite(id) && id > 0 ? id : null,
      post_number: postNumber,
      username,
      post_url: String(entry.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(entry.thumb_url || imageUrl),
      title,
      info: String(entry.info || ""),
      prompt: promptRaw,
      image_index: imageIndex,
      recommended: Boolean(entry.recommended),
      pinned: Boolean(entry.pinned),
      original_tags: normalizeTagList(entry.original_tags),
      user_tags: normalizeTagList(entry.user_tags),
    });
  }

  const categories = [];
  let categoryInvalid = 0;
  for (const entry of rawCategories) {
    if (!entry || typeof entry !== "object") {
      categoryInvalid += 1;
      continue;
    }
    const id = Number(entry.id);
    const name = String(entry.name || "").trim();
    const sortOrder = Number(entry.sort_order);
    if (!name) {
      categoryInvalid += 1;
      continue;
    }
    categories.push({
      id: Number.isFinite(id) && id > 0 ? id : null,
      name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    });
  }

  const uploadChannels = [];
  let channelInvalid = 0;
  for (const entry of rawChannels) {
    if (!entry || typeof entry !== "object") {
      channelInvalid += 1;
      continue;
    }
    const id = Number(entry.id);
    const name = String(entry.name || "").trim();
    const type = String(entry.type || "").trim();
    const enabled = "enabled" in entry ? Boolean(entry.enabled) : true;
    const config = entry.config && typeof entry.config === "object" && !Array.isArray(entry.config) ? entry.config : {};

    if (!name || !type || !["telegram", "r2", "s3"].includes(type)) {
      channelInvalid += 1;
      continue;
    }

    uploadChannels.push({
      id: Number.isFinite(id) && id > 0 ? id : null,
      name,
      type,
      enabled,
      config,
    });
  }

  const appSettings = [];
  let settingInvalid = 0;
  for (const entry of rawSettings) {
    if (!entry || typeof entry !== "object") {
      settingInvalid += 1;
      continue;
    }
    const key = String(entry.key || "").trim();
    if (!key) {
      settingInvalid += 1;
      continue;
    }
    appSettings.push({ key, value: String(entry.value ?? "") });
  }

  return {
    items,
    categories,
    upload_channels: uploadChannels,
    app_settings: appSettings,
    invalid: { items: itemInvalid, categories: categoryInvalid, upload_channels: channelInvalid, app_settings: settingInvalid },
  };
}

function performRestoreBackup(payload) {
  const normalized = normalizeBackupPayload(payload);

  const categoriesSorted = [...normalized.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.id || 0) - (b.id || 0));

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM gallery_items; DELETE FROM categories; DELETE FROM upload_channels; DELETE FROM app_settings;");

    for (let index = 0; index < categoriesSorted.length; index += 1) {
      const cat = categoriesSorted[index];
      const sortOrder = cat.sort_order > 0 ? cat.sort_order : index + 1;
      if (cat.id) insertCategoryWithId.run(cat.id, cat.name, sortOrder);
      else insertCategory.run(cat.name, sortOrder);
    }

    for (const channel of normalized.upload_channels) {
      const enabled = channel.enabled ? 1 : 0;
      const configJson = JSON.stringify(channel.config || {});
      if (channel.id) insertUploadChannelWithId.run(channel.id, channel.name, channel.type, enabled, configJson);
      else insertUploadChannel.run(channel.name, channel.type, enabled, configJson);
    }

    for (const setting of normalized.app_settings) {
      upsertSetting.run(setting.key, setting.value);
    }

    for (const item of normalized.items) {
      const originalTagsJson = JSON.stringify(item.original_tags || []);
      const userTagsJson = JSON.stringify(item.user_tags || []);
      if (item.id) {
        insertItemWithId.run(
          item.id,
          item.post_number,
          item.username,
          item.post_url,
          item.image_url,
          item.thumb_url,
          item.title,
          item.info,
          item.prompt,
          item.image_index,
          item.recommended ? 1 : 0,
          item.pinned ? 1 : 0,
          originalTagsJson,
          userTagsJson,
        );
      } else {
        insertItem.run(
          item.post_number,
          item.username,
          item.post_url,
          item.image_url,
          item.thumb_url,
          item.title,
          item.info,
          item.prompt,
          item.image_index,
          item.recommended ? 1 : 0,
          item.pinned ? 1 : 0,
          originalTagsJson,
          userTagsJson,
        );
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    restored: {
      items: normalized.items.length,
      categories: normalized.categories.length,
      upload_channels: normalized.upload_channels.length,
      app_settings: normalized.app_settings.length,
    },
    invalid: normalized.invalid,
  };
}

const app = express();

app.use(express.json({ limit: "50mb" }));

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${adminToken}`) {
    res.status(403).json({ error: "Invalid or missing admin token" });
    return;
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/items", (_req, res) => {
  const items = selectItems.all().map(rowToItem);
  res.json({ items });
});

app.get("/api/categories", (_req, res) => {
  const categories = selectCategoriesPublic.all().map((row) => row.name);
  res.json({ categories });
});

app.post("/api/admin/auth", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/admin/items", requireAdmin, (_req, res) => {
  const items = selectAdminItems.all().map(rowToItem);
  res.json({ items });
});

app.get("/api/admin/categories", requireAdmin, (_req, res) => {
  const categories = selectCategoriesAdmin.all();
  res.json({ categories });
});

app.post("/api/admin/categories", requireAdmin, (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    res.status(400).json({ error: "name 不能为空" });
    return;
  }
  const maxRow = db.prepare("SELECT MAX(sort_order) as max FROM categories").get();
  const nextOrder = Number(maxRow?.max || 0) + 1;
  try {
    const result = insertCategory.run(name, nextOrder);
    const created = db.prepare("SELECT id, name, sort_order, created_at, updated_at FROM categories WHERE id = ?").get(result.lastInsertRowid);
    res.json({ category: created });
  } catch {
    res.status(409).json({ error: "分类已存在" });
  }
});

app.put("/api/admin/categories/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "无效的 id" });
    return;
  }
  const name = String(req.body?.name || "").trim();
  const sortOrder = Number(req.body?.sort_order);
  if (!name) {
    res.status(400).json({ error: "name 不能为空" });
    return;
  }
  if (!Number.isFinite(sortOrder)) {
    res.status(400).json({ error: "sort_order 必须是数字" });
    return;
  }
  try {
    const result = updateCategory.run(name, sortOrder, id);
    if (!result.changes) {
      res.status(404).json({ error: "分类不存在" });
      return;
    }
    const updated = db.prepare("SELECT id, name, sort_order, created_at, updated_at FROM categories WHERE id = ?").get(id);
    res.json({ category: updated });
  } catch {
    res.status(409).json({ error: "更新失败：可能触发唯一键冲突" });
  }
});

app.delete("/api/admin/categories/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "无效的 id" });
    return;
  }
  const result = deleteCategory.run(id);
  res.json({ deleted: result.changes ? 1 : 0 });
});

app.post("/api/admin/categories/batch-delete", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0) : [];
  if (!ids.length) {
    res.status(400).json({ error: "ids 不能为空" });
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  const stmt = db.prepare(`DELETE FROM categories WHERE id IN (${placeholders})`);
  const result = stmt.run(...ids);
  res.json({ deleted: result.changes });
});

app.post("/api/admin/categories/reorder", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  if (!ids.length) {
    res.status(400).json({ error: "ids 不能为空" });
    return;
  }
  db.exec("BEGIN");
  try {
    const stmt = db.prepare("UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    ids.forEach((id, index) => stmt.run(index + 1, id));
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
});

app.get("/api/admin/export", requireAdmin, (_req, res) => {
  const items = selectAdminItems.all().map(rowToItem);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="promptframe-export-${stamp}.json"`);
  res.send(JSON.stringify({ items }, null, 2));
});

app.get("/api/admin/backup", requireAdmin, (_req, res) => {
  const items = selectAdminItems.all().map(rowToItem);
  const categories = selectCategoriesAdmin.all();
  const uploadChannels = selectUploadChannelsAdmin.all().map(rowToUploadChannel);
  const appSettings = selectAllSettings.all();
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    data: { items, categories, upload_channels: uploadChannels, app_settings: appSettings },
  };
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="promptframe-backup-${stamp}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

app.post("/api/admin/import", requireAdmin, (req, res) => {
  try {
    const summary = performImport(req.body);
    res.json(summary);
  } catch {
    res.status(500).json({ error: "导入失败：服务端写入失败" });
  }
});

app.post("/api/admin/restore", requireAdmin, (req, res) => {
  try {
    const summary = performRestoreBackup(req.body);
    res.json(summary);
  } catch {
    res.status(500).json({ error: "恢复失败：服务端写入失败" });
  }
});

app.get("/api/admin/upload-channels", requireAdmin, (_req, res) => {
  const channels = selectUploadChannelsAdmin.all().map(rowToUploadChannel);
  res.json({ channels, default_channel_id: getDefaultUploadChannelId() });
});

app.post("/api/admin/upload-channels", requireAdmin, (req, res) => {
  const normalized = normalizeChannelInput(req.body);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  try {
    const ch = normalized.channel;
    const result = insertUploadChannel.run(ch.name, ch.type, ch.enabled ? 1 : 0, JSON.stringify(ch.config || {}));
    const created = selectUploadChannelById.get(result.lastInsertRowid);
    res.json({ channel: rowToUploadChannel(created), default_channel_id: getDefaultUploadChannelId() });
  } catch {
    res.status(409).json({ error: "新增失败：可能是 name 已存在" });
  }
});

app.put("/api/admin/upload-channels/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "无效的 id" });
    return;
  }

  const normalized = normalizeChannelInput(req.body);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  try {
    const ch = normalized.channel;
    const result = updateUploadChannel.run(ch.name, ch.type, ch.enabled ? 1 : 0, JSON.stringify(ch.config || {}), id);
    if (!result.changes) {
      res.status(404).json({ error: "渠道不存在" });
      return;
    }
    const updated = selectUploadChannelById.get(id);
    res.json({ channel: rowToUploadChannel(updated), default_channel_id: getDefaultUploadChannelId() });
  } catch {
    res.status(409).json({ error: "更新失败：可能触发唯一键冲突" });
  }
});

app.delete("/api/admin/upload-channels/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "无效的 id" });
    return;
  }
  const result = deleteUploadChannel.run(id);
  const defaultId = getDefaultUploadChannelId();
  if (defaultId === id) setDefaultUploadChannelId(null);
  res.json({ deleted: result.changes ? 1 : 0, default_channel_id: getDefaultUploadChannelId() });
});

app.post("/api/admin/upload-channels/default", requireAdmin, (req, res) => {
  const idRaw = req.body?.id;
  const id = idRaw === null || idRaw === "" || typeof idRaw === "undefined" ? null : Number(idRaw);
  if (id !== null && (!Number.isFinite(id) || id <= 0)) {
    res.status(400).json({ error: "id 必须是正整数或空" });
    return;
  }
  if (id !== null) {
    const exists = selectUploadChannelById.get(id);
    if (!exists) {
      res.status(404).json({ error: "渠道不存在" });
      return;
    }
  }
  setDefaultUploadChannelId(id);
  res.json({ default_channel_id: getDefaultUploadChannelId() });
});

app.post("/api/admin/uploads", requireAdmin, async (req, res) => {
  const mode = String(req.body?.mode || "").trim();
  const channelIdRaw = req.body?.channel_id;
  const channelId = Number.isFinite(Number(channelIdRaw)) ? Number(channelIdRaw) : null;

  if (!["direct", "fetch", "data"].includes(mode)) {
    res.status(400).json({ error: "mode 必须是 direct / fetch / data" });
    return;
  }

  if (mode === "direct") {
    const normalizedUrl = normalizeHttpUrl(req.body?.url);
    if (!normalizedUrl.ok) {
      res.status(400).json({ error: normalizedUrl.error });
      return;
    }
    res.json({ image_url: normalizedUrl.url, thumb_url: normalizedUrl.url, stored: false });
    return;
  }

  const defaultChannelId = getDefaultUploadChannelId();
  const effectiveChannelId = channelId || defaultChannelId;
  if (!effectiveChannelId) {
    res.status(400).json({ error: "未指定 channel_id，且未设置默认上传渠道" });
    return;
  }

  const channelRow = selectUploadChannelById.get(effectiveChannelId);
  if (!channelRow) {
    res.status(404).json({ error: "上传渠道不存在" });
    return;
  }
  if (!channelRow.enabled) {
    res.status(400).json({ error: "上传渠道已禁用" });
    return;
  }

  const channel = rowToUploadChannel(channelRow);
  const fileName = String(req.body?.file_name || "").trim();

  try {
    let buffer;
    let mime;
    if (mode === "fetch") {
      const normalizedUrl = normalizeHttpUrl(req.body?.url);
      if (!normalizedUrl.ok) {
        res.status(400).json({ error: normalizedUrl.error });
        return;
      }
      const downloaded = await downloadToBuffer(normalizedUrl.url);
      buffer = downloaded.buffer;
      mime = downloaded.mime;
      if (!mime.startsWith("image/")) mime = "image/jpeg";
    } else {
      const parsed = parseDataUrl(req.body?.data_url);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      buffer = parsed.buffer;
      mime = parsed.mime;
    }

    if (!mime.startsWith("image/")) {
      res.status(400).json({ error: "仅支持上传图片" });
      return;
    }

    if (channel.type === "telegram") {
      const telegramResult = await uploadToTelegram({ buffer, mime, fileName, config: channel.config });
      res.json({
        image_url: `/api/uploads/telegram/${encodeURIComponent(telegramResult.file_id)}`,
        thumb_url: `/api/uploads/telegram/${encodeURIComponent(telegramResult.file_id)}`,
        stored: true,
        channel_id: channel.id,
      });
      return;
    }

    const key = buildUploadKey(fileName, mime);
    if (channel.type === "r2") {
      await uploadToR2({ buffer, mime, key, config: channel.config });
      const url = safeJoinUrl(channel.config.public_base_url, key);
      res.json({ image_url: url, thumb_url: url, stored: true, channel_id: channel.id });
      return;
    }

    const endpoint = channel.config.endpoint ? String(channel.config.endpoint).trim() : "";
    await uploadToS3Compatible({ buffer, mime, key, config: { ...channel.config, endpoint } });
    const url = safeJoinUrl(channel.config.public_base_url, key);
    res.json({ image_url: url, thumb_url: url, stored: true, channel_id: channel.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "上传失败" });
  }
});

app.get("/api/uploads/telegram/:fileId", async (req, res) => {
  const fileId = String(req.params.fileId || "").trim();
  if (!fileId) {
    res.status(400).send("invalid fileId");
    return;
  }

  const defaultId = getDefaultUploadChannelId();
  const row = defaultId ? selectUploadChannelById.get(defaultId) : null;
  const channels = row ? [rowToUploadChannel(row)] : selectUploadChannelsAdmin.all().map(rowToUploadChannel);
  const telegram = channels.find((ch) => ch.enabled && ch.type === "telegram");
  if (!telegram) {
    res.status(404).send("telegram channel not configured");
    return;
  }

  try {
    const fileRes = await getTelegramFileStream({ fileId, config: telegram.config });
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    const ct = fileRes.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    const cl = fileRes.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    res.status(200);
    const body = fileRes.body;
    if (!body) {
      res.status(502).send("upstream empty");
      return;
    }
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch {
    res.status(502).send("upstream error");
  }
});

function normalizeAdminItemInput(value) {
  const source = value && typeof value === "object" ? value : {};
  const postNumber = Number(source.post_number);
  const imageIndex = Number(source.image_index || 1);
  const imageUrl = String(source.image_url || "").trim();
  const username = String(source.username || "").trim() || "unknown";
  const title = String(source.title || "").trim();
  const promptRaw = String(source.prompt ?? "");

  if (!Number.isFinite(postNumber) || postNumber <= 0) return { ok: false, error: "post_number 必须是正数" };
  if (!Number.isFinite(imageIndex) || imageIndex <= 0) return { ok: false, error: "image_index 必须是正数" };
  if (!imageUrl) return { ok: false, error: "image_url 不能为空" };
  if (!promptRaw.trim()) return { ok: false, error: "prompt 不能为空" };

  const recommended = Boolean(source.recommended);
  const pinned = Boolean(source.pinned);
  const originalTags = normalizeTagList(source.original_tags);
  const userTags = normalizeTagList(source.user_tags);

  return {
    ok: true,
    item: {
      post_number: postNumber,
      username,
      post_url: String(source.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(source.thumb_url || imageUrl),
      title,
      info: String(source.info || ""),
      prompt: promptRaw,
      image_index: imageIndex,
      recommended,
      pinned,
      original_tags: originalTags,
      user_tags: userTags,
    },
  };
}

app.post("/api/admin/items", requireAdmin, (req, res) => {
  const normalized = normalizeAdminItemInput(req.body);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  try {
    const item = normalized.item;
    const result = insertItem.run(
      item.post_number,
      item.username,
      item.post_url,
      item.image_url,
      item.thumb_url,
      item.title,
      item.info,
      item.prompt,
      item.image_index,
      item.recommended ? 1 : 0,
      item.pinned ? 1 : 0,
      JSON.stringify(item.original_tags),
      JSON.stringify(item.user_tags),
    );

    if (!result.changes) {
      res.status(409).json({ error: "作品已存在（image_url + post_number + image_index 唯一）" });
      return;
    }

    const created = selectItemById.get(result.lastInsertRowid);
    res.json({ item: rowToItem(created) });
  } catch (err) {
    res.status(500).json({ error: "创建失败" });
  }
});

app.put("/api/admin/items/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "无效的 id" });
    return;
  }

  const normalized = normalizeAdminItemInput(req.body);
  if (!normalized.ok) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const existing = selectItemById.get(id);
  if (!existing) {
    res.status(404).json({ error: "作品不存在" });
    return;
  }

  try {
    const item = normalized.item;
    const result = updateItemById.run(
      item.post_number,
      item.username,
      item.post_url,
      item.image_url,
      item.thumb_url,
      item.title,
      item.info,
      item.prompt,
      item.image_index,
      item.recommended ? 1 : 0,
      item.pinned ? 1 : 0,
      JSON.stringify(item.original_tags),
      JSON.stringify(item.user_tags),
      id,
    );

    if (!result.changes) {
      res.status(404).json({ error: "作品不存在" });
      return;
    }

    const updated = selectItemById.get(id);
    res.json({ item: rowToItem(updated) });
  } catch {
    res.status(409).json({ error: "更新失败：可能触发唯一键冲突" });
  }
});

app.delete("/api/admin/items/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "无效的 id" });
    return;
  }

  const result = deleteItemById.run(id);
  res.json({ deleted: result.changes ? 1 : 0 });
});

app.patch("/api/admin/items/batch", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  const changes = req.body?.changes && typeof req.body.changes === "object" ? req.body.changes : {};
  const setRecommended = "recommended" in changes ? Boolean(changes.recommended) : null;
  const setPinned = "pinned" in changes ? Boolean(changes.pinned) : null;

  if (!ids.length) {
    res.status(400).json({ error: "ids 不能为空" });
    return;
  }
  if (setRecommended === null && setPinned === null) {
    res.status(400).json({ error: "changes 不能为空" });
    return;
  }

  const setters = [];
  const params = [];
  if (setRecommended !== null) {
    setters.push("recommended = ?");
    params.push(setRecommended ? 1 : 0);
  }
  if (setPinned !== null) {
    setters.push("pinned = ?");
    params.push(setPinned ? 1 : 0);
  }
  setters.push("updated_at = CURRENT_TIMESTAMP");

  const placeholders = ids.map(() => "?").join(", ");
  const sql = `UPDATE gallery_items SET ${setters.join(", ")} WHERE id IN (${placeholders})`;
  const stmt = db.prepare(sql);
  const result = stmt.run(...params, ...ids);
  res.json({ updated: result.changes });
});

app.post("/api/admin/items/batch-delete", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  if (!ids.length) {
    res.status(400).json({ error: "ids 不能为空" });
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  const stmt = db.prepare(`DELETE FROM gallery_items WHERE id IN (${placeholders})`);
  const result = stmt.run(...ids);
  res.json({ deleted: result.changes });
});

app.post("/api/import", (req, res) => {
  if (importToken) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${importToken}`) {
      return res.status(403).json({ error: "Invalid or missing import token" });
    }
  }
  try {
    const summary = performImport(req.body);
    res.json(summary);
  } catch {
    res.status(500).json({ error: "导入失败：服务端写入失败" });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use("/assets", express.static(path.join(distDir, "assets"), { immutable: true, maxAge: "1y" }));
app.use(express.static(distDir));

app.get(/.*/, (req, res) => {
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
});

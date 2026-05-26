import { useEffect, useState } from "react";
import type { GalleryItem } from "../types";

const API_ITEMS_URL = `${import.meta.env.BASE_URL}api/items`;
const API_IMPORT_URL = `${import.meta.env.BASE_URL}api/import`;

type ImportResult = { added: number; duplicated: number; invalid: number; total?: number };

function normalizeTagList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 24);
}

function normalizeImportedItems(value: unknown): { items: GalleryItem[]; invalid: number } {
  const source = Array.isArray(value)
    ? value
    : typeof value === "object" && value
      ? Array.isArray((value as { items?: unknown }).items)
        ? (value as { items: unknown[] }).items
        : Array.isArray((value as { data?: unknown }).data)
          ? (value as { data: unknown[] }).data
          : []
      : [];

  const items: GalleryItem[] = [];
  let invalid = 0;

  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      invalid += 1;
      continue;
    }

    const record = entry as Partial<GalleryItem>;
    const postNumber = Number(record.post_number);
    const imageIndex = Number(record.image_index || 1);
    const imageUrl = String(record.image_url || "").trim();
    const username = String(record.username || "").trim();

    if (!Number.isFinite(postNumber) || !imageUrl || !username) {
      invalid += 1;
      continue;
    }

    items.push({
      post_number: postNumber,
      username,
      post_url: String(record.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(record.thumb_url || imageUrl),
      title: String(record.title || `Floor ${postNumber} - Image ${Number.isFinite(imageIndex) ? imageIndex : 1}`),
      info: String(record.info || ""),
      prompt: String(record.prompt ?? "").trim(),
      image_index: Number.isFinite(imageIndex) ? imageIndex : 1,
      original_tags: normalizeTagList(record.original_tags),
      user_tags: normalizeTagList(record.user_tags),
    });
  }

  return { items, invalid };
}

function readNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeImportResult(value: unknown): ImportResult {
  if (!value || typeof value !== "object") return { added: 0, duplicated: 0, invalid: 0 };
  const record = value as Partial<Record<keyof ImportResult, unknown>>;
  return {
    added: readNumber(record.added),
    duplicated: readNumber(record.duplicated),
    invalid: readNumber(record.invalid),
    total: record.total === undefined ? undefined : readNumber(record.total),
  };
}

export async function requestGalleryItems() {
  const response = await fetch(API_ITEMS_URL);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return [];

  return normalizeImportedItems((await response.json()) as unknown).items;
}

export function useGalleryData() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setItems(await requestGalleryItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function importFile(file: File, token: string) {
    const parsed = JSON.parse(await file.text()) as unknown;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;

    const response = await fetch(API_IMPORT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed),
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? ((await response.json()) as unknown) : null;

    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `HTTP ${response.status}`;
      throw new Error(message);
    }

    setItems(await requestGalleryItems());
    setError("");
    return normalizeImportResult(payload);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await requestGalleryItems();
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { error, importFile, items, loading, reload, setItems };
}

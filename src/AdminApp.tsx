import {
  CheckCircle2,
  ChevronLeft,
  Download,
  LayoutGrid,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  Star,
  Sun,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryItem, ThemeMode } from "./types";

const ADMIN_TOKEN_KEY = "promptframe:admin-token";
const THEME_KEY = "linux-do-gallery:theme";
const NAV_COLLAPSED_KEY = "promptframe:admin-nav-collapsed";

function joinBase(relativePath: string) {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.startsWith("/") ? base : `/${base}`;
  const baseWithSlash = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;
  const normalizedRelative = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  return `${baseWithSlash}${normalizedRelative}`;
}

const API_ADMIN_AUTH_URL = joinBase("api/admin/auth");
const API_ADMIN_ITEMS_URL = joinBase("api/admin/items");
const API_ADMIN_BATCH_URL = joinBase("api/admin/items/batch");
const API_ADMIN_BATCH_DELETE_URL = joinBase("api/admin/items/batch-delete");
const API_ADMIN_CATEGORIES_URL = joinBase("api/admin/categories");
const API_ADMIN_CATEGORIES_REORDER_URL = joinBase("api/admin/categories/reorder");
const API_ADMIN_EXPORT_URL = joinBase("api/admin/export");
const API_ADMIN_IMPORT_URL = joinBase("api/admin/import");
const API_ADMIN_BACKUP_URL = joinBase("api/admin/backup");
const API_ADMIN_RESTORE_URL = joinBase("api/admin/restore");
const API_ADMIN_UPLOAD_CHANNELS_URL = joinBase("api/admin/upload-channels");
const API_ADMIN_UPLOAD_CHANNEL_DEFAULT_URL = joinBase("api/admin/upload-channels/default");
const API_ADMIN_UPLOAD_URL = joinBase("api/admin/uploads");

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}

async function adminFetch(token: string, input: RequestInfo, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? ((await response.json()) as unknown) : null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && payload && "error" in payload ? String(payload.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function normalizeTagsText(text: string) {
  const raw = text
    .split(/[,，\n]/g)
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(raw)).slice(0, 24);
}

function tagsToText(tags: string[] | undefined) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

type EditorState = {
  id?: number;
  post_number: string;
  image_index: string;
  username: string;
  post_url: string;
  image_url: string;
  thumb_url: string;
  title: string;
  info: string;
  prompt: string;
  original_tags: string;
  user_tags: string;
  recommended: boolean;
  pinned: boolean;
};

type AdminCategory = {
  id: number;
  name: string;
  sort_order: number;
};

type UploadChannelType = "telegram" | "r2" | "s3";

type UploadChannel = {
  id: number;
  name: string;
  type: UploadChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type AdminPage = "items" | "create" | "categories" | "channels" | "backup";

type UploadImageAddMode = "local" | "direct" | "fetch";

function normalizeHttpUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function itemToEditorState(item: GalleryItem | null): EditorState {
  return {
    id: item?.id,
    post_number: item ? String(item.post_number) : "",
    image_index: item ? String(item.image_index) : "1",
    username: item?.username || "",
    post_url: item?.post_url || "",
    image_url: item?.image_url || "",
    thumb_url: item?.thumb_url || "",
    title: item?.title || "",
    info: item?.info || "",
    prompt: item?.prompt || "",
    original_tags: tagsToText(item?.original_tags),
    user_tags: tagsToText(item?.user_tags),
    recommended: Boolean(item?.recommended),
    pinned: Boolean(item?.pinned),
  };
}

function editorStateToPayload(state: EditorState) {
  return {
    post_number: Number(state.post_number),
    image_index: Number(state.image_index || 1),
    username: state.username.trim(),
    post_url: state.post_url.trim(),
    image_url: state.image_url.trim(),
    thumb_url: state.thumb_url.trim(),
    title: state.title.trim(),
    info: state.info.trim(),
    prompt: state.prompt,
    original_tags: normalizeTagsText(state.original_tags),
    user_tags: normalizeTagsText(state.user_tags),
    recommended: state.recommended,
    pinned: state.pinned,
  };
}

export default function AdminApp() {
  const [theme, setTheme] = useStoredState<ThemeMode>(THEME_KEY, "light");
  const [navCollapsed, setNavCollapsed] = useStoredState<boolean>(NAV_COLLAPSED_KEY, false);
  const [token, setToken] = useState<string>(() => {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activePage, setActivePage] = useState<AdminPage>("create");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [editorState, setEditorState] = useState<EditorState>(() => itemToEditorState(null));
  const [saving, setSaving] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategorySavingId, setEditingCategorySavingId] = useState<number | null>(null);
  const [uploadChannels, setUploadChannels] = useState<UploadChannel[]>([]);
  const [defaultUploadChannelId, setDefaultUploadChannelId] = useState<number | null>(null);
  const [activeUploadChannelId, setActiveUploadChannelId] = useStoredState<number | null>("promptframe:active-upload-channel-id", null);
  const [channelEditorId, setChannelEditorId] = useState<number | null>(null);
  const [channelEditorName, setChannelEditorName] = useState("");
  const [channelEditorType, setChannelEditorType] = useState<UploadChannelType>("r2");
  const [channelEditorEnabled, setChannelEditorEnabled] = useState(true);
  const [channelEditorConfig, setChannelEditorConfig] = useState<Record<string, string>>({});
  const [uploadImageAddMode, setUploadImageAddMode] = useStoredState<UploadImageAddMode>("promptframe:admin-image-add-mode", "local");
  const [uploadUrlInput, setUploadUrlInput] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const createInitializedRef = useRef(false);
  const lastAutoUrlByModeRef = useRef<{ direct: string; fetch: string }>({ direct: "", fetch: "" });

  useEffect(() => {
    if (!token) createInitializedRef.current = false;
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      if (!token) {
        if (!cancelled) {
          setAuthChecked(true);
          setAuthError("");
        }
        return;
      }
      try {
        await adminFetch(token, API_ADMIN_AUTH_URL, { method: "POST" });
        if (!cancelled) {
          setAuthChecked(true);
          setAuthError("");
        }
      } catch (err) {
        if (!cancelled) {
          setAuthChecked(true);
          setAuthError(err instanceof Error ? err.message : "鉴权失败");
          setToken("");
          try {
            localStorage.removeItem(ADMIN_TOKEN_KEY);
          } catch {
            // ignore
          }
        }
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function loadItems(activeToken: string) {
    setLoading(true);
    try {
      const payload = (await adminFetch(activeToken, API_ADMIN_ITEMS_URL, { method: "GET" })) as { items?: GalleryItem[] };
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);
      setSelectedIds(new Set());
      setAuthError("");
      if (activePage === "create" && !createInitializedRef.current) {
        createInitializedRef.current = true;
        openCreate(nextItems);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories(activeToken: string) {
    try {
      const payload = (await adminFetch(activeToken, API_ADMIN_CATEGORIES_URL, { method: "GET" })) as { categories?: AdminCategory[] };
      setCategories(Array.isArray(payload.categories) ? payload.categories : []);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "加载分类失败");
    }
  }

  async function loadUploadChannels(activeToken: string) {
    try {
      const payload = (await adminFetch(activeToken, API_ADMIN_UPLOAD_CHANNELS_URL, { method: "GET" })) as {
        channels?: UploadChannel[];
        default_channel_id?: number | null;
      };
      const nextChannels = Array.isArray(payload.channels) ? payload.channels : [];
      const nextDefault = typeof payload.default_channel_id === "number" && Number.isFinite(payload.default_channel_id) ? payload.default_channel_id : null;
      setUploadChannels(nextChannels);
      setDefaultUploadChannelId(nextDefault);

      setActiveUploadChannelId((current) => {
        if (current && nextChannels.some((ch) => ch.id === current && ch.enabled)) return current;
        if (nextDefault && nextChannels.some((ch) => ch.id === nextDefault && ch.enabled)) return nextDefault;
        const firstEnabled = nextChannels.find((ch) => ch.enabled)?.id ?? null;
        return firstEnabled;
      });
    } catch (err) {
      setToast(err instanceof Error ? err.message : "加载上传渠道失败");
    }
  }

  useEffect(() => {
    if (!authChecked || !token) return;
    loadItems(token);
    loadCategories(token);
    loadUploadChannels(token);
  }, [authChecked, token]);

  function resetChannelEditor() {
    setChannelEditorId(null);
    setChannelEditorName("");
    setChannelEditorType("r2");
    setChannelEditorEnabled(true);
    setChannelEditorConfig({});
  }

  function startEditChannel(channel: UploadChannel | null) {
    if (!channel) {
      resetChannelEditor();
      return;
    }
    setChannelEditorId(channel.id);
    setChannelEditorName(channel.name);
    setChannelEditorType(channel.type);
    setChannelEditorEnabled(channel.enabled);
    const nextConfig: Record<string, string> = {};
    Object.entries(channel.config || {}).forEach(([key, value]) => {
      nextConfig[key] = typeof value === "string" ? value : JSON.stringify(value ?? "");
    });
    setChannelEditorConfig(nextConfig);
  }

  async function saveChannelEditor() {
    if (!token) return;
    const payload = {
      name: channelEditorName,
      type: channelEditorType,
      enabled: channelEditorEnabled,
      config: channelEditorConfig,
    };

    try {
      if (channelEditorId) {
        await adminFetch(token, `${API_ADMIN_UPLOAD_CHANNELS_URL}/${channelEditorId}`, { method: "PUT", body: JSON.stringify(payload) });
        setToast("已更新渠道");
      } else {
        await adminFetch(token, API_ADMIN_UPLOAD_CHANNELS_URL, { method: "POST", body: JSON.stringify(payload) });
        setToast("已新增渠道");
      }
      resetChannelEditor();
      await loadUploadChannels(token);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存渠道失败");
    }
  }

  async function deleteChannel(id: number) {
    if (!token) return;
    try {
      await adminFetch(token, `${API_ADMIN_UPLOAD_CHANNELS_URL}/${id}`, { method: "DELETE" });
      setToast("已删除渠道");
      await loadUploadChannels(token);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除渠道失败");
    }
  }

  async function setDefaultChannel(id: number | null) {
    if (!token) return;
    try {
      const payload = (await adminFetch(token, API_ADMIN_UPLOAD_CHANNEL_DEFAULT_URL, { method: "POST", body: JSON.stringify({ id }) })) as { default_channel_id?: number | null };
      const nextDefault = typeof payload.default_channel_id === "number" && Number.isFinite(payload.default_channel_id) ? payload.default_channel_id : null;
      setDefaultUploadChannelId(nextDefault);
      setToast("已设置默认上传渠道");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "设置默认渠道失败");
    }
  }

  async function fileToDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }

  async function performUpload(mode: "direct" | "fetch" | "data", input: { url?: string; file?: File }) {
    if (!token) return false;
    const channelId = activeUploadChannelId;
    setUploadBusy(true);
    try {
      let body: Record<string, unknown> = { mode, channel_id: channelId };
      if (mode === "direct" || mode === "fetch") {
        body = { ...body, url: input.url || "" };
      } else {
        const file = input.file;
        if (!file) throw new Error("请选择图片文件");
        const dataUrl = await fileToDataUrl(file);
        body = { ...body, data_url: dataUrl, file_name: file.name };
      }
      const result = (await adminFetch(token, API_ADMIN_UPLOAD_URL, { method: "POST", body: JSON.stringify(body) })) as { image_url?: string; thumb_url?: string };
      const imageUrl = String(result.image_url || "").trim();
      const thumbUrl = String(result.thumb_url || "").trim();
      if (!imageUrl) throw new Error("上传成功但未返回 image_url");
      setEditorState((s) => ({ ...s, image_url: imageUrl, thumb_url: thumbUrl || s.thumb_url }));
      setToast(mode === "direct" ? "已使用外链" : "已上传并写入 image_url");
      setUploadUrlInput("");
      return true;
    } catch (err) {
      setToast(err instanceof Error ? err.message : "上传失败");
      return false;
    } finally {
      setUploadBusy(false);
    }
  }

  useEffect(() => {
    if (uploadImageAddMode === "local") return;
    if (uploadBusy) return;
    const normalized = normalizeHttpUrl(uploadUrlInput);
    if (!normalized) return;

    if (uploadImageAddMode === "direct") {
      const timer = window.setTimeout(() => {
        if (lastAutoUrlByModeRef.current.direct === normalized) return;
        lastAutoUrlByModeRef.current.direct = normalized;
        setEditorState((s) => (s.image_url.trim() === normalized ? s : { ...s, image_url: normalized }));
        setToast("已写入 image_url（外链）");
      }, 450);
      return () => window.clearTimeout(timer);
    }

    if (uploadImageAddMode === "fetch") {
      if (!token) return;
      const timer = window.setTimeout(async () => {
        if (uploadBusy) return;
        if (lastAutoUrlByModeRef.current.fetch === normalized) return;
        lastAutoUrlByModeRef.current.fetch = normalized;
        const ok = await performUpload("fetch", { url: normalized });
        if (!ok) lastAutoUrlByModeRef.current.fetch = "";
      }, 650);
      return () => window.clearTimeout(timer);
    }
  }, [token, uploadBusy, uploadImageAddMode, uploadUrlInput]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const parts = [
        item.title,
        item.username,
        item.prompt,
        item.info,
        item.post_url,
        item.image_url,
        String(item.post_number),
        String(item.image_index),
        ...(item.original_tags || []),
        ...(item.user_tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return parts.includes(query);
    });
  }, [items, searchTerm]);

  const configuredTagNames = useMemo(() => {
    return categories
      .slice()
      .sort((a, b) => {
        const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (orderDelta) return orderDelta;
        return a.name.localeCompare(b.name, "zh-Hans-CN");
      })
      .map((category) => category.name)
      .filter(Boolean);
  }, [categories]);

  const currentOriginalTags = useMemo(() => normalizeTagsText(editorState.original_tags), [editorState.original_tags]);

  const selectedCount = selectedIds.size;
  const allVisibleSelected = filteredItems.length && filteredItems.every((item) => item.id && selectedIds.has(item.id));

  function toggleSelected(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setSelectAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of filteredItems) {
        if (!item.id) continue;
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  async function handleLogin(raw: string) {
    const nextToken = raw.trim();
    if (!nextToken) {
      setAuthError("请输入管理密钥");
      return;
    }
    try {
      await adminFetch(nextToken, API_ADMIN_AUTH_URL, { method: "POST" });
      setToken(nextToken);
      setAuthError("");
      try {
        localStorage.setItem(ADMIN_TOKEN_KEY, nextToken);
      } catch {
        // ignore
      }
      setToast("已登录管理端");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "管理密钥不正确");
      setToast("登录失败");
    }
  }

  function logout() {
    setToken("");
    setItems([]);
    setSelectedIds(new Set());
    setAuthError("");
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // ignore
    }
    setToast("已退出管理端");
  }

  function openCreate(sourceItems: GalleryItem[] = items) {
    const maxPostNumber = sourceItems.reduce((max, item) => Math.max(max, Number(item.post_number) || 0), 0);
    const nextPostNumber = Math.max(1, maxPostNumber + 1);
    setEditorState({
      ...itemToEditorState(null),
      post_number: String(nextPostNumber),
      image_index: "1",
      title: "",
      prompt: "",
    });
    setActivePage("create");
  }

  function openEdit(item: GalleryItem) {
    setEditorState(itemToEditorState(item));
    setActivePage("create");
  }

  function toggleOriginalTag(tag: string) {
    const normalized = tag.trim();
    if (!normalized) return;
    setEditorState((state) => {
      const current = normalizeTagsText(state.original_tags);
      const next = current.includes(normalized) ? current.filter((value) => value !== normalized) : [...current, normalized];
      return { ...state, original_tags: next.join(", ") };
    });
  }

  async function saveEditor() {
    if (!token) return;
    const payload = editorStateToPayload(editorState);
    setSaving(true);
    try {
      if (editorState.id) {
        const updated = (await adminFetch(token, `${API_ADMIN_ITEMS_URL}/${editorState.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })) as { item?: GalleryItem };
        setItems((current) => current.map((item) => (item.id === editorState.id ? (updated.item || item) : item)));
        setToast("已保存修改");
      } else {
        const created = (await adminFetch(token, API_ADMIN_ITEMS_URL, { method: "POST", body: JSON.stringify(payload) })) as { item?: GalleryItem };
        const createdItem = created.item;
        if (createdItem) setItems((current) => [createdItem, ...current]);
        setToast("已新增作品");
        openCreate(createdItem ? [createdItem, ...items] : items);
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOne(item: GalleryItem) {
    if (!token || !item.id) return;
    if (!window.confirm(`确定删除「${item.title || "未命名"}」吗？`)) return;
    try {
      await adminFetch(token, `${API_ADMIN_ITEMS_URL}/${item.id}`, { method: "DELETE" });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(item.id!);
        return next;
      });
      setToast("已删除");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function batchUpdate(changes: { recommended?: boolean; pinned?: boolean }) {
    if (!token) return;
    const ids = Array.from(selectedIds.values());
    if (!ids.length) return;
    try {
      await adminFetch(token, API_ADMIN_BATCH_URL, { method: "PATCH", body: JSON.stringify({ ids, changes }) });
      await loadItems(token);
      setToast("批量更新成功");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "批量更新失败");
    }
  }

  async function updateOneFlag(id: number, changes: { recommended?: boolean; pinned?: boolean }) {
    if (!token) return;
    try {
      await adminFetch(token, API_ADMIN_BATCH_URL, { method: "PATCH", body: JSON.stringify({ ids: [id], changes }) });
      await loadItems(token);
      setToast("已更新");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "更新失败");
    }
  }

  async function batchDelete() {
    if (!token) return;
    const ids = Array.from(selectedIds.values());
    if (!ids.length) return;
    if (!window.confirm(`确定删除所选 ${ids.length} 条作品吗？此操作不可撤销。`)) return;
    try {
      await adminFetch(token, API_ADMIN_BATCH_DELETE_URL, { method: "POST", body: JSON.stringify({ ids }) });
      await loadItems(token);
      setToast("批量删除成功");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "批量删除失败");
    }
  }

  async function addCategory() {
    if (!token) return;
    const name = categoryName.trim();
    if (!name) {
      setToast("请输入分类名称");
      return;
    }
    try {
      const payload = (await adminFetch(token, API_ADMIN_CATEGORIES_URL, { method: "POST", body: JSON.stringify({ name }) })) as { category?: AdminCategory };
      const created = payload.category;
      if (created) setCategories((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));
      setCategoryName("");
      setToast("已新增分类");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "新增分类失败");
    }
  }

  async function deleteCategory(id: number) {
    if (!token) return;
    const target = categories.find((c) => c.id === id);
    if (!window.confirm(`确定删除分类「${target?.name || id}」吗？`)) return;
    try {
      await adminFetch(token, `${API_ADMIN_CATEGORIES_URL}/${id}`, { method: "DELETE" });
      setCategories((current) => current.filter((c) => c.id !== id));
      setToast("已删除分类");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除分类失败");
    }
  }

  async function reorderCategories(next: AdminCategory[]) {
    if (!token) return;
    const ids = next.map((c) => c.id);
    try {
      await adminFetch(token, API_ADMIN_CATEGORIES_REORDER_URL, { method: "POST", body: JSON.stringify({ ids }) });
      setCategories(next.map((c, index) => ({ ...c, sort_order: index + 1 })));
      setToast("已更新排序");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "更新排序失败");
    }
  }

  function startEditCategory(category: AdminCategory) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  }

  function cancelEditCategory() {
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setEditingCategorySavingId(null);
  }

  async function saveCategoryName(id: number) {
    if (!token) return;
    const nextName = editingCategoryName.trim();
    if (!nextName) {
      setToast("请输入分类名称");
      return;
    }
    const existing = categories.find((c) => c.id === id);
    if (!existing) return;

    setEditingCategorySavingId(id);
    try {
      const payload = (await adminFetch(token, `${API_ADMIN_CATEGORIES_URL}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: nextName, sort_order: existing.sort_order }),
      })) as { category?: AdminCategory };
      const updated = payload.category;
      if (updated) {
        setCategories((current) =>
          current.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
        );
      }
      setToast("已更新分类");
      cancelEditCategory();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "更新分类失败");
    } finally {
      setEditingCategorySavingId(null);
    }
  }

  async function exportData() {
    if (!token) return;
    try {
      const response = await fetch(API_ADMIN_EXPORT_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "promptframe-export.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setToast("已导出数据");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "导出失败");
    }
  }

  async function backupAll() {
    if (!token) return;
    try {
      const response = await fetch(API_ADMIN_BACKUP_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "promptframe-backup.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setToast("已下载备份");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "备份失败");
    }
  }

  async function importDataFile(file: File | null) {
    if (!token || !file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const payload = (await adminFetch(token, API_ADMIN_IMPORT_URL, { method: "POST", body: JSON.stringify(parsed) })) as Partial<{
        added: number;
        duplicated: number;
        invalid: number;
      }>;
      await loadItems(token);
      await loadCategories(token);
      setToast(`导入 ${Number(payload.added || 0)} 条，跳过 ${Number(payload.duplicated || 0) + Number(payload.invalid || 0)} 条`);
    } catch (err) {
      setToast(err instanceof SyntaxError ? "导入失败：JSON 格式不正确" : err instanceof Error ? err.message : "导入失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function restoreBackupFile(file: File | null) {
    if (!token || !file) return;
    if (!window.confirm("恢复会覆盖当前的作品、标签与上传渠道配置。确定要继续吗？")) {
      if (restoreInputRef.current) restoreInputRef.current.value = "";
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const payload = (await adminFetch(token, API_ADMIN_RESTORE_URL, { method: "POST", body: JSON.stringify(parsed) })) as Partial<{
        restored: { items: number; categories: number; upload_channels: number; app_settings: number };
      }>;
      await loadItems(token);
      await loadCategories(token);
      await loadUploadChannels(token);
      const restored = payload.restored;
      setToast(
        restored
          ? `已恢复：作品 ${Number(restored.items || 0)} · 标签 ${Number(restored.categories || 0)} · 渠道 ${Number(restored.upload_channels || 0)}`
          : "已恢复数据",
      );
    } catch (err) {
      setToast(err instanceof SyntaxError ? "恢复失败：JSON 格式不正确" : err instanceof Error ? err.message : "恢复失败");
    } finally {
      setLoading(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  }

  function navigateTo(page: AdminPage) {
    if (page === "create") openCreate();
    else setActivePage(page);
  }

  function moveCategory(id: number, direction: -1 | 1) {
    const index = categories.findIndex((c) => c.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return;
    const next = [...categories];
    const [picked] = next.splice(index, 1);
    next.splice(nextIndex, 0, picked);
    reorderCategories(next);
  }

  if (!authChecked) {
    return (
      <div className="app-shell" data-theme={theme}>
        <div className="admin-shell admin-center">
          <div className="admin-login-card">
            <span className="admin-login-icon">
              <Shield size={22} />
            </span>
            <strong>正在检查管理端权限…</strong>
            <span className="muted">请稍候</span>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="app-shell" data-theme={theme}>
        <div className="admin-shell admin-center">
          <form
            className="admin-login-card"
            onSubmit={(event) => {
              event.preventDefault();
              handleLogin(tokenInputRef.current?.value || "");
            }}
          >
            <a className="admin-back" href="/" aria-label="返回前台">
              <ChevronLeft size={18} />
              返回作品页
            </a>
            <span className="admin-login-icon">
              <Shield size={22} />
            </span>
            <strong>PromptFrame 管理端</strong>
            <span className="muted">输入管理密钥进入管理页</span>
            <label className="admin-field">
              <span>管理密钥</span>
              <input ref={tokenInputRef} type="password" autoComplete="current-password" placeholder="请输入管理密钥" />
            </label>
            {authError ? <div className="admin-error">{authError}</div> : null}
            <button className="admin-primary" type="submit">
              <CheckCircle2 size={18} />
              登录
            </button>
            <button className="admin-secondary" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              切换主题
            </button>
          </form>
        </div>
        <div className={`toast ${toast ? "toast-show" : ""}`} role="status" aria-live="polite">
          {toast}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <div className={`admin-shell ${navCollapsed ? "nav-collapsed" : ""}`}>
        <header className="admin-topbar">
          <div className="admin-topbar-inner">
            <div className="admin-brand">
              <span className="admin-brand-mark">A</span>
              <span>
                <strong>PromptFrame 管理后台</strong>
                <small>批量管理 · 推荐 · 置顶</small>
              </span>
            </div>

            <div className="admin-actions">
              <button className="admin-action ghost-button" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                切换主题
              </button>
              <button className="admin-action ghost-button" type="button" onClick={logout}>
                <LogOut size={18} />
                退出
              </button>
            </div>
          </div>
        </header>

        <input
          ref={importInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => importDataFile(event.target.files?.[0] || null)}
        />

        <input
          ref={restoreInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => restoreBackupFile(event.target.files?.[0] || null)}
        />

        <aside className="admin-float-nav" aria-label="管理菜单">
          <div className="admin-float-nav-inner">
            <button
              type="button"
              className={activePage === "items" ? "active" : ""}
              onClick={() => navigateTo("items")}
              aria-label="作品管理"
            >
              <LayoutGrid size={18} />
              <span className="admin-float-nav-label">作品管理</span>
            </button>
            <button
              type="button"
              className={activePage === "create" ? "active" : ""}
              onClick={() => navigateTo("create")}
              aria-label="新增作品"
            >
              <Plus size={18} />
              <span className="admin-float-nav-label">新增作品</span>
            </button>
            <button
              type="button"
              className={activePage === "categories" ? "active" : ""}
              onClick={() => navigateTo("categories")}
              aria-label="标签管理"
            >
              <Tag size={18} />
              <span className="admin-float-nav-label">标签管理</span>
            </button>
            <button
              type="button"
              className={activePage === "channels" ? "active" : ""}
              onClick={() => navigateTo("channels")}
              aria-label="上传渠道"
            >
              <Upload size={18} />
              <span className="admin-float-nav-label">上传渠道</span>
            </button>
            <button
              type="button"
              className={activePage === "backup" ? "active" : ""}
              onClick={() => navigateTo("backup")}
              aria-label="备份与恢复"
            >
              <Shield size={18} />
              <span className="admin-float-nav-label">备份恢复</span>
            </button>
            <button
              type="button"
              className="admin-float-nav-toggle"
              onClick={() => setNavCollapsed((current) => !current)}
              aria-label={navCollapsed ? "展开菜单" : "收起菜单"}
              title={navCollapsed ? "展开菜单" : "收起菜单"}
            >
              {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              <span className="admin-float-nav-label">{navCollapsed ? "展开" : "收起"}</span>
            </button>
          </div>
        </aside>

        <main className="admin-main">
          {activePage === "categories" ? (
            <section className="admin-panel admin-category-panel">
            <div className="admin-panel-header">
              <div className="admin-panel-title">
                <strong>分类标签管理</strong>
                <small className="muted">前台分类筛选会使用这里的排序与内容（“全部”固定存在）</small>
              </div>
              <div className="admin-panel-buttons">
                <button className="admin-secondary admin-inline" type="button" onClick={() => loadCategories(token)} disabled={loading}>
                  刷新分类
                </button>
              </div>
            </div>

            <div className="admin-category-body">
              <div className="admin-category-add">
                <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="新增分类名称，如：摄影 / 3D / 建筑…" />
                <button className="admin-primary admin-inline" type="button" onClick={addCategory}>
                  <Plus size={18} />
                  新增分类
                </button>
              </div>

              <div className="admin-category-list">
                {categories.map((cat, index) => (
                  <div className="admin-category-row" key={cat.id}>
                    <span className="admin-category-index">{index + 1}</span>
                    {editingCategoryId === cat.id ? (
                      <span className="admin-category-name">
                        <input
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveCategoryName(cat.id);
                            if (event.key === "Escape") cancelEditCategory();
                          }}
                        />
                      </span>
                    ) : (
                      <strong className="admin-category-name">{cat.name}</strong>
                    )}
                    <div className="admin-category-actions">
                      {editingCategoryId === cat.id ? (
                        <>
                          <button type="button" onClick={() => saveCategoryName(cat.id)} disabled={editingCategorySavingId === cat.id}>
                            保存
                          </button>
                          <button type="button" onClick={cancelEditCategory} disabled={editingCategorySavingId === cat.id}>
                            取消
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEditCategory(cat)}>
                          <Pencil size={14} />
                          编辑
                        </button>
                      )}
                      <button type="button" onClick={() => moveCategory(cat.id, -1)} disabled={index === 0}>
                        上移
                      </button>
                      <button type="button" onClick={() => moveCategory(cat.id, 1)} disabled={index === categories.length - 1}>
                        下移
                      </button>
                      <button className="danger" type="button" onClick={() => deleteCategory(cat.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {!categories.length ? (
                  <div className="admin-empty admin-category-empty">
                    <strong>暂无分类</strong>
                    <span className="muted">新增分类后，前台会自动出现对应的分类按钮。</span>
                  </div>
                ) : null}
              </div>
            </div>
            </section>
          ) : null}

          {activePage === "channels" ? (
            <section className="admin-panel" aria-label="上传渠道">
              <div className="admin-panel-header">
                <div className="admin-panel-title">
                  <strong>上传渠道管理</strong>
                  <small className="muted">用于“新增作品”里的本地上传 / 外链转存</small>
                </div>
                <div className="admin-panel-buttons">
                  <button className="admin-secondary admin-inline" type="button" onClick={() => loadUploadChannels(token)} disabled={loading}>
                    刷新渠道
                  </button>
                </div>
              </div>

              <div className="admin-editor-body">
                <div className="admin-editor-grid">
                  <label className="admin-field admin-span-2">
                    <span>默认上传渠道</span>
                    <select
                      value={defaultUploadChannelId ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        const id = value ? Number(value) : null;
                        setDefaultChannel(Number.isFinite(id as number) ? (id as number) : null);
                      }}
                    >
                      <option value="">不设置（新增作品需手动选择）</option>
                      {uploadChannels
                        .filter((ch) => ch.enabled)
                        .map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name}（{ch.type}）
                          </option>
                        ))}
                    </select>
                  </label>

                  <div className="admin-field admin-span-2">
                    <span>已配置渠道</span>
                    <div className="admin-category-list">
                      {uploadChannels.map((ch) => (
                        <div className="admin-category-row" key={ch.id}>
                          <strong className="admin-category-name">
                            {ch.name} <span className="muted">（{ch.type}{ch.enabled ? "" : " · 已禁用"}{defaultUploadChannelId === ch.id ? " · 默认" : ""}）</span>
                          </strong>
                          <div className="admin-category-actions">
                            {channelEditorId === ch.id ? (
                              <button type="button" onClick={() => startEditChannel(null)}>
                                退出编辑
                              </button>
                            ) : (
                              <button type="button" onClick={() => startEditChannel(ch)}>
                                <Pencil size={14} />
                                编辑
                              </button>
                            )}
                            <button className="danger" type="button" onClick={() => deleteChannel(ch.id)}>
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                      {!uploadChannels.length ? (
                        <div className="admin-empty admin-category-empty">
                          <strong>暂无上传渠道</strong>
                          <span className="muted">先新增一个 Telegram / R2 / S3 渠道，然后在“新增作品”里使用。</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <label className="admin-field required">
                    <span>渠道名称</span>
                    <input value={channelEditorName} onChange={(event) => setChannelEditorName(event.target.value)} placeholder="例如：R2 公共桶 / Telegram Bot" />
                  </label>

                  <label className="admin-field required">
                    <span>渠道类型</span>
                    <select value={channelEditorType} onChange={(event) => setChannelEditorType(event.target.value as UploadChannelType)}>
                      <option value="telegram">telegram</option>
                      <option value="r2">r2</option>
                      <option value="s3">s3</option>
                    </select>
                  </label>

                  <label className="admin-toggle admin-span-2">
                    <input type="checkbox" checked={channelEditorEnabled} onChange={(event) => setChannelEditorEnabled(event.target.checked)} />
                    <span>启用该渠道</span>
                  </label>

                  {channelEditorType === "telegram" ? (
                    <>
                      <label className="admin-field required">
                        <span>bot_token</span>
                        <input
                          value={channelEditorConfig["bot_token"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, bot_token: event.target.value }))}
                          placeholder="123456:ABC..."
                        />
                      </label>
                      <label className="admin-field required">
                        <span>chat_id</span>
                        <input
                          value={channelEditorConfig["chat_id"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, chat_id: event.target.value }))}
                          placeholder="-100xxxxxx 或 @channel"
                        />
                      </label>
                      <label className="admin-field admin-span-2">
                        <span>proxy_domain（可选）</span>
                        <input
                          value={channelEditorConfig["proxy_domain"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, proxy_domain: event.target.value }))}
                          placeholder="例如：tg.example.com（需自行反代 api.telegram.org）"
                        />
                      </label>
                    </>
                  ) : null}

                  {channelEditorType === "r2" ? (
                    <>
                      <label className="admin-field required">
                        <span>access_key_id</span>
                        <input value={channelEditorConfig["access_key_id"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, access_key_id: event.target.value }))} />
                      </label>
                      <label className="admin-field required">
                        <span>secret_access_key</span>
                        <input
                          value={channelEditorConfig["secret_access_key"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, secret_access_key: event.target.value }))}
                          type="password"
                        />
                      </label>
                      <label className="admin-field required">
                        <span>account_id</span>
                        <input value={channelEditorConfig["account_id"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, account_id: event.target.value }))} />
                      </label>
                      <label className="admin-field required">
                        <span>bucket</span>
                        <input value={channelEditorConfig["bucket"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, bucket: event.target.value }))} />
                      </label>
                      <label className="admin-field required admin-span-2">
                        <span>public_base_url</span>
                        <input
                          value={channelEditorConfig["public_base_url"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, public_base_url: event.target.value }))}
                          placeholder="例如：https://pub-xxxx.r2.dev"
                        />
                      </label>
                      <label className="admin-field admin-span-2">
                        <span>region（可选，默认 auto）</span>
                        <input value={channelEditorConfig["region"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, region: event.target.value }))} placeholder="auto" />
                      </label>
                    </>
                  ) : null}

                  {channelEditorType === "s3" ? (
                    <>
                      <label className="admin-field required">
                        <span>access_key_id</span>
                        <input value={channelEditorConfig["access_key_id"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, access_key_id: event.target.value }))} />
                      </label>
                      <label className="admin-field required">
                        <span>secret_access_key</span>
                        <input
                          value={channelEditorConfig["secret_access_key"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, secret_access_key: event.target.value }))}
                          type="password"
                        />
                      </label>
                      <label className="admin-field required">
                        <span>region</span>
                        <input value={channelEditorConfig["region"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, region: event.target.value }))} placeholder="ap-southeast-1" />
                      </label>
                      <label className="admin-field required">
                        <span>bucket</span>
                        <input value={channelEditorConfig["bucket"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, bucket: event.target.value }))} />
                      </label>
                      <label className="admin-field admin-span-2">
                        <span>endpoint（可选）</span>
                        <input value={channelEditorConfig["endpoint"] || ""} onChange={(event) => setChannelEditorConfig((c) => ({ ...c, endpoint: event.target.value }))} placeholder="例如：https://s3.amazonaws.com 或 MinIO Endpoint" />
                      </label>
                      <label className="admin-field required admin-span-2">
                        <span>public_base_url</span>
                        <input
                          value={channelEditorConfig["public_base_url"] || ""}
                          onChange={(event) => setChannelEditorConfig((c) => ({ ...c, public_base_url: event.target.value }))}
                          placeholder="例如：https://cdn.example.com/mybucket"
                        />
                      </label>
                    </>
                  ) : null}
                </div>

                {channelEditorId ? (
                  <div className="admin-batchbar admin-span-2">
                    <span className="admin-batch-meta">正在编辑：{channelEditorName ? channelEditorName : `#${channelEditorId}`}</span>
                  </div>
                ) : null}

                <div className="admin-editor-footer">
                  <button type="button" className="admin-primary" onClick={saveChannelEditor}>
                    {channelEditorId ? "保存修改" : "新增渠道"}
                  </button>
                  {channelEditorId ? (
                    <button type="button" className="admin-secondary" onClick={() => startEditChannel(null)}>
                      退出编辑
                    </button>
                  ) : (
                    <button type="button" className="admin-secondary" onClick={() => startEditChannel(null)}>
                      清空表单
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {activePage === "backup" ? (
            <section className="admin-panel" aria-label="备份与恢复">
              <div className="admin-panel-header">
                <div className="admin-panel-title">
                  <strong>备份与恢复</strong>
                  <small className="muted">备份会导出作品、分类标签、上传渠道配置（包含密钥）；恢复会覆盖当前数据</small>
                </div>
              </div>

              <div className="admin-editor-body">
                <div className="admin-editor-grid">
                  <div className="admin-field admin-span-2">
                    <span>备份</span>
                    <div className="admin-item-actions">
                      <button className="admin-secondary admin-inline" type="button" onClick={backupAll} disabled={loading}>
                        <Download size={18} />
                        下载 JSON 备份
                      </button>
                    </div>
                  </div>

                  <div className="admin-field admin-span-2">
                    <span>恢复</span>
                    <div className="admin-item-actions">
                      <button className="admin-secondary admin-inline danger" type="button" onClick={() => restoreInputRef.current?.click()} disabled={loading}>
                        <Upload size={18} />
                        选择 JSON 并恢复
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activePage === "items" ? (
            <section className="admin-panel">
            <div className="admin-panel-header">
              <div className="admin-search">
                <Search size={18} />
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="搜索标题 / 用户 / Prompt / 标签 / 链接…" />
              </div>
              <div className="admin-panel-buttons">
                <button className="admin-primary admin-inline" type="button" onClick={() => navigateTo("create")}>
                  <Plus size={18} />
                  新增作品
                </button>
                <button className="admin-secondary admin-inline" type="button" onClick={() => importInputRef.current?.click()}>
                  <Upload size={18} />
                  导入
                </button>
                <button className="admin-secondary admin-inline" type="button" onClick={exportData}>
                  <Download size={18} />
                  导出
                </button>
                <button className="admin-secondary admin-inline" type="button" onClick={() => loadItems(token)} disabled={loading}>
                  刷新
                </button>
              </div>
            </div>

            <div className="admin-batchbar">
              <label className="admin-select-all">
                <input type="checkbox" checked={Boolean(allVisibleSelected)} onChange={(event) => setSelectAllVisible(event.target.checked)} />
                全选当前列表
              </label>
              <span className="admin-batch-meta">已选 {selectedCount} / {filteredItems.length}</span>
              <div className="admin-batch-actions">
                <button type="button" disabled={!selectedCount} onClick={() => batchUpdate({ recommended: true })}>
                  <Sparkles size={16} />
                  批量推荐
                </button>
                <button type="button" disabled={!selectedCount} onClick={() => batchUpdate({ recommended: false })}>
                  取消推荐
                </button>
                <button type="button" disabled={!selectedCount} onClick={() => batchUpdate({ pinned: true })}>
                  <Star size={16} />
                  批量置顶
                </button>
                <button type="button" disabled={!selectedCount} onClick={() => batchUpdate({ pinned: false })}>
                  取消置顶
                </button>
                <button className="danger" type="button" disabled={!selectedCount} onClick={batchDelete}>
                  <Trash2 size={16} />
                  批量删除
                </button>
              </div>
            </div>

            {authError ? <div className="admin-error admin-inline-error">{authError}</div> : null}

            <div className="admin-grid">
              {filteredItems.map((item) => (
                <article key={item.id || `${item.post_number}-${item.image_index}-${item.image_url}`} className="admin-item-card">
                  <label className="admin-item-check">
                    <input
                      type="checkbox"
                      checked={Boolean(item.id && selectedIds.has(item.id))}
                      onChange={() => (item.id ? toggleSelected(item.id) : null)}
                      disabled={!item.id}
                    />
                  </label>
                  <div className="admin-item-thumb">
                    <img src={item.thumb_url || item.image_url} alt={item.title || "作品"} loading="lazy" />
                    {item.recommended ? (
                      <span className="recommend-ribbon admin-ribbon" aria-label="推荐">
                        <Sparkles size={14} />
                        推荐
                      </span>
                    ) : null}
                    {item.pinned ? <span className="admin-pin" title="置顶">置顶</span> : null}
                  </div>
                  <div className="admin-item-body">
                    <div className="admin-item-title">
                      <strong>{item.title || "未命名"}</strong>
                      <small>
                        #{item.post_number} · 图{item.image_index} · @{item.username}
                      </small>
                    </div>
                    <div className="admin-item-tags">
                      {(item.original_tags?.length ? item.original_tags : ["灵感"]).slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                    <div className="admin-item-controls">
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(item.recommended)}
                          onChange={(event) => {
                            if (!item.id) return;
                            updateOneFlag(item.id, { recommended: event.target.checked });
                          }}
                        />
                        <span>推荐</span>
                      </label>
                      <label className="admin-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(item.pinned)}
                          onChange={(event) => {
                            if (!item.id) return;
                            updateOneFlag(item.id, { pinned: event.target.checked });
                          }}
                        />
                        <span>置顶</span>
                      </label>
                      <div className="admin-item-actions">
                        <button type="button" onClick={() => openEdit(item)}>
                          <Pencil size={16} />
                          编辑
                        </button>
                        <button className="danger" type="button" onClick={() => deleteOne(item)}>
                          <Trash2 size={16} />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {!filteredItems.length && !loading ? (
                <div className="admin-empty">
                  <strong>暂无作品</strong>
                  <span className="muted">尝试清空搜索条件或新增作品。</span>
                </div>
              ) : null}
            </div>
            </section>
          ) : null}

          {activePage === "create" ? (
            <section className="admin-panel admin-editor-page" aria-label="新增作品">
              <div className="admin-panel-header">
                <div className="admin-panel-title">
                  <strong>{editorState.id ? "编辑作品" : "新增作品"}</strong>
                  <small className="muted">保存后会立即影响前台展示</small>
                </div>
                <div className="admin-panel-buttons">
                  <button className="admin-secondary admin-inline" type="button" onClick={() => setActivePage("items")} disabled={saving}>
                    返回作品管理
                  </button>
                  <button className="admin-secondary admin-inline" type="button" onClick={() => openCreate()} disabled={saving}>
                    重置表单
                  </button>
                </div>
              </div>

              <div className="admin-editor-body">
                <input
                  ref={uploadFileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0] || null;
                    if (file) {
                      setUploadImageAddMode("local");
                      await performUpload("data", { file });
                    }
                    if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
                  }}
                />
                <div className="admin-editor-flags">
                  <label className="admin-toggle">
                    <input type="checkbox" checked={editorState.recommended} onChange={(event) => setEditorState((s) => ({ ...s, recommended: event.target.checked }))} />
                    <span>推荐（前台显示角标）</span>
                  </label>
                  <label className="admin-toggle">
                    <input type="checkbox" checked={editorState.pinned} onChange={(event) => setEditorState((s) => ({ ...s, pinned: event.target.checked }))} />
                    <span>置顶（排序优先）</span>
                  </label>
                </div>

                <div className="admin-editor-grid">
                  <label className="admin-field admin-span-2">
                    <span>上传渠道（用于本地上传 / 外链转存）</span>
                    <select
                      value={activeUploadChannelId ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        const id = value ? Number(value) : null;
                        setActiveUploadChannelId(Number.isFinite(id as number) ? (id as number) : null);
                      }}
                      disabled={!uploadChannels.some((ch) => ch.enabled)}
                    >
                      {!uploadChannels.some((ch) => ch.enabled) ? <option value="">未配置可用渠道（请先去“上传渠道”新增）</option> : <option value="">请选择</option>}
                      {uploadChannels
                        .filter((ch) => ch.enabled)
                        .map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name}（{ch.type}{defaultUploadChannelId === ch.id ? " · 默认" : ""}）
                          </option>
                        ))}
                    </select>
                  </label>

                  <div className="admin-field admin-span-2">
                    <span>图片添加方式（3 选 1）</span>
                    <div className="admin-upload-box">
                      <div className="admin-upload-row">
                        <input value={uploadUrlInput} onChange={(event) => setUploadUrlInput(event.target.value)} placeholder="外链地址：https://..." />
                        <button
                          type="button"
                          className={`${uploadImageAddMode === "direct" ? "admin-primary" : "admin-secondary"} admin-inline`}
                          disabled={uploadBusy}
                          onClick={() => setUploadImageAddMode("direct")}
                        >
                          使用外链
                        </button>
                        <button
                          type="button"
                          className={`${uploadImageAddMode === "fetch" ? "admin-primary" : "admin-secondary"} admin-inline`}
                          disabled={uploadBusy}
                          onClick={() => setUploadImageAddMode("fetch")}
                        >
                          外链转存
                        </button>
                      </div>
                      <div className="admin-upload-row">
                        <button type="button" className="admin-secondary admin-inline" disabled={uploadBusy} onClick={() => uploadFileInputRef.current?.click()}>
                          选择文件上传
                        </button>
                        <div
                          className={`admin-upload-dropzone ${uploadBusy ? "disabled" : ""}`}
                          tabIndex={0}
                          role="button"
                          aria-label="粘贴上传"
                          onPaste={async (event) => {
                            if (uploadBusy) return;
                            const items = Array.from(event.clipboardData?.items || []);
                            const imageItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/")) || null;
                            const file = imageItem?.getAsFile() || null;
                            if (!file) return;
                            event.preventDefault();
                            setUploadImageAddMode("local");
                            await performUpload("data", { file });
                          }}
                        >
                          点击后粘贴截图/图片（Ctrl/⌘ + V）
                        </div>
                      </div>
                    </div>
                  </div>

                  <label className="admin-field admin-span-2">
                    <span>标题 title</span>
                    <input value={editorState.title} onChange={(event) => setEditorState((s) => ({ ...s, title: event.target.value }))} />
                  </label>

                  <label className="admin-field admin-span-2 required">
                    <span>图片链接 image_url</span>
                    <input required value={editorState.image_url} onChange={(event) => setEditorState((s) => ({ ...s, image_url: event.target.value }))} />
                  </label>
                  <label className="admin-field admin-span-2 required">
                    <span>Prompt / Metadata</span>
                    <textarea required value={editorState.prompt} onChange={(event) => setEditorState((s) => ({ ...s, prompt: event.target.value }))} rows={7} />
                  </label>

                  <label className="admin-field admin-span-2">
                    <span>原始标签 original_tags（逗号分隔）</span>
                    <input value={editorState.original_tags} onChange={(event) => setEditorState((s) => ({ ...s, original_tags: event.target.value }))} />
                    {configuredTagNames.length ? (
                      <div className="admin-tag-quick" role="group" aria-label="已配置标签快捷选择">
                        {configuredTagNames.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={`admin-tag-chip ${currentOriginalTags.includes(tag) ? "active" : ""}`}
                            onClick={() => toggleOriginalTag(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </label>

                  <label className="admin-field">
                    <span>楼层编号 post_number</span>
                    <input value={editorState.post_number} onChange={(event) => setEditorState((s) => ({ ...s, post_number: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label className="admin-field">
                    <span>图片序号 image_index</span>
                    <input value={editorState.image_index} onChange={(event) => setEditorState((s) => ({ ...s, image_index: event.target.value }))} inputMode="numeric" />
                  </label>
                  <label className="admin-field">
                    <span>用户 ID username</span>
                    <input value={editorState.username} onChange={(event) => setEditorState((s) => ({ ...s, username: event.target.value }))} />
                  </label>
                  <label className="admin-field">
                    <span>简介 info</span>
                    <input value={editorState.info} onChange={(event) => setEditorState((s) => ({ ...s, info: event.target.value }))} />
                  </label>
                  <label className="admin-field admin-span-2">
                    <span>帖子链接 post_url</span>
                    <input value={editorState.post_url} onChange={(event) => setEditorState((s) => ({ ...s, post_url: event.target.value }))} />
                  </label>
                  <label className="admin-field admin-span-2">
                    <span>缩略图 thumb_url（留空则使用 image_url）</span>
                    <input value={editorState.thumb_url} onChange={(event) => setEditorState((s) => ({ ...s, thumb_url: event.target.value }))} />
                  </label>
                  <label className="admin-field admin-span-2">
                    <span>用户标签 user_tags（逗号分隔）</span>
                    <input value={editorState.user_tags} onChange={(event) => setEditorState((s) => ({ ...s, user_tags: event.target.value }))} />
                  </label>
                </div>
              </div>

              <div className="admin-editor-footer">
                <button type="button" className="admin-primary" onClick={saveEditor} disabled={saving}>
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </section>
          ) : null}
        </main>

        <nav className="admin-mobile-nav" aria-label="管理菜单">
          <div className="admin-mobile-nav-inner">
            <button type="button" className={activePage === "items" ? "active" : ""} onClick={() => navigateTo("items")} aria-label="作品管理">
              <LayoutGrid size={18} />
              <span>作品</span>
            </button>
            <button type="button" className={activePage === "create" ? "active" : ""} onClick={() => navigateTo("create")} aria-label="新增作品">
              <Plus size={18} />
              <span>新增</span>
            </button>
            <button type="button" className={activePage === "categories" ? "active" : ""} onClick={() => navigateTo("categories")} aria-label="标签管理">
              <Tag size={18} />
              <span>标签</span>
            </button>
            <button type="button" className={activePage === "channels" ? "active" : ""} onClick={() => navigateTo("channels")} aria-label="上传渠道">
              <Upload size={18} />
              <span>上传</span>
            </button>
            <button type="button" className={activePage === "backup" ? "active" : ""} onClick={() => navigateTo("backup")} aria-label="备份与恢复">
              <Shield size={18} />
              <span>备份</span>
            </button>
          </div>
        </nav>

        <div className={`toast ${toast ? "toast-show" : ""}`} role="status" aria-live="polite">
          {toast}
        </div>
      </div>
    </div>
  );
}

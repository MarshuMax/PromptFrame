import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  ExternalLink,
  Filter,
  Flag,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Link2,
  List,
  Loader2,
  Maximize2,
  Moon,
  Palette,
  Save,
  Search,
  Sparkles,
  Star,
  SunMedium,
  Tag,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, GalleryItem, GalleryStats, SortMode, ThemeMode, ViewMode } from "./types";
import {
  computeStats,
  getAllTags,
  getDisplayTitle,
  getOriginalTags,
  getPromptPreview,
  itemKey,
  itemSearchText,
  matchesCategory,
  rankRelatedItems,
  topTags,
  truncateText,
} from "./utils";
import type { RelatedGalleryItem } from "./utils";

function joinBase(relativePath: string) {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.startsWith("/") ? base : `/${base}`;
  const baseWithSlash = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;
  const normalizedRelative = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  return `${baseWithSlash}${normalizedRelative}`;
}

const API_ITEMS_URL = joinBase("api/items");
const API_CATEGORIES_URL = joinBase("api/categories");
const FAVORITES_KEY = "linux-do-gallery:favorites";
const RECENT_SEARCHES_KEY = "linux-do-gallery:recent-searches";
const THEME_KEY = "linux-do-gallery:theme";
const USER_TAGS_KEY = "linux-do-gallery:user-tags";
const MOBILE_BREAKPOINT_QUERY = "(max-width: 640px)";

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
      // localStorage can fail in private mode; the app should keep working.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

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
    const id = typeof record.id === "number" && Number.isFinite(record.id) ? record.id : undefined;
    const postNumber = Number(record.post_number);
    const imageIndex = Number(record.image_index || 1);
    const imageUrl = String(record.image_url || "").trim();
    const username = String(record.username || "").trim();

    if (!Number.isFinite(postNumber) || !imageUrl || !username) {
      invalid += 1;
      continue;
    }

    items.push({
      id,
      post_number: postNumber,
      username,
      post_url: String(record.post_url || ""),
      image_url: imageUrl,
      thumb_url: String(record.thumb_url || imageUrl),
      title: String(record.title ?? "").trim(),
      info: String(record.info || ""),
      prompt: String(record.prompt || "未提供"),
      image_index: Number.isFinite(imageIndex) ? imageIndex : 1,
      recommended: Boolean(record.recommended),
      pinned: Boolean(record.pinned),
      original_tags: normalizeTagList(record.original_tags),
      user_tags: normalizeTagList(record.user_tags),
      created_at: typeof record.created_at === "string" ? record.created_at : undefined,
      updated_at: typeof record.updated_at === "string" ? record.updated_at : undefined,
    });
  }

  return { items, invalid };
}

async function requestGalleryItems() {
  const response = await fetch(API_ITEMS_URL);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return [];

  const payload = (await response.json()) as unknown;
  return normalizeImportedItems(payload).items;
}

async function requestCategories(): Promise<string[]> {
  const response = await fetch(API_CATEGORIES_URL);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return [];
  const payload = (await response.json()) as unknown;
  const categories = payload && typeof payload === "object" && "categories" in payload ? (payload as { categories?: unknown }).categories : [];
  if (!Array.isArray(categories)) return [];
  return categories.map((value) => String(value || "").trim()).filter(Boolean);
}

export default function App() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(["全部"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<Category>("全部");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [toast, setToast] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useStoredState<string[]>(FAVORITES_KEY, []);
  const [recentSearches, setRecentSearches] = useStoredState<string[]>(RECENT_SEARCHES_KEY, []);
  const [theme, setTheme] = useStoredState<ThemeMode>(THEME_KEY, "light");
  const [userTagsByItem, setUserTagsByItem] = useStoredState<Record<string, string[]>>(USER_TAGS_KEY, {});
  const [headerHidden, setHeaderHidden] = useState(false);
  const [compactSearchVisible, setCompactSearchVisible] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [favoriteDrawerOpen, setFavoriteDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileCategoryExpanded, setMobileCategoryExpanded] = useState(false);
  const [mobileSearchDraft, setMobileSearchDraft] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const lastScrollYRef = useRef(0);
  const favoriteEntryScrollYRef = useRef(0);
  const scrollGestureAnchorYRef = useRef(0);
  const scrollDirectionRef = useRef<-1 | 0 | 1>(0);

  function isMobileViewport() {
    return typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      try {
        setLoading(true);
        setError("");
        const [data, categoryList] = await Promise.all([requestGalleryItems(), requestCategories()]);
        if (!cancelled) {
          setItems(data);
          setCategories(["全部", ...(categoryList as Category[])]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "数据加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGallery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      const y = Math.max(window.scrollY, 0);
      const delta = y - lastScrollYRef.current;
      const searchBottom = searchPanelRef.current?.getBoundingClientRect().bottom ?? 9999;
      const mobileViewport = isMobileViewport();

      setCompactSearchVisible(searchBottom < 88);

      if (activeItem || headerSearchOpen || mobileSearchOpen || mobileCategoryExpanded) {
        setHeaderHidden(false);
        scrollGestureAnchorYRef.current = y;
        scrollDirectionRef.current = 0;
      } else if (mobileViewport) {
        const direction = delta > 1 ? 1 : delta < -1 ? -1 : 0;
        if (direction !== 0 && direction !== scrollDirectionRef.current) {
          scrollDirectionRef.current = direction;
          scrollGestureAnchorYRef.current = lastScrollYRef.current;
        }

        const traveled = Math.abs(y - scrollGestureAnchorYRef.current);

        if (!headerHidden && y > 160 && scrollDirectionRef.current === 1 && traveled >= 72) {
          setHeaderHidden(true);
          scrollGestureAnchorYRef.current = y;
          scrollDirectionRef.current = 0;
        } else if (headerHidden && (y <= 24 || (scrollDirectionRef.current === -1 && traveled >= 42))) {
          setHeaderHidden(false);
          scrollGestureAnchorYRef.current = y;
          scrollDirectionRef.current = 0;
        }
      } else if (y > 120 && delta > 8) {
        setHeaderHidden(true);
      } else if (delta < -8 || y <= 24) {
        setHeaderHidden(false);
      }

      lastScrollYRef.current = y;
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [activeItem, headerHidden, headerSearchOpen, mobileCategoryExpanded, mobileSearchOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow =
      activeItem || favoriteDrawerOpen || mobileSearchOpen || mobileCategoryExpanded ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeItem, favoriteDrawerOpen, mobileCategoryExpanded, mobileSearchOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setMobileSearchOpen(false);
        setMobileCategoryExpanded(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => computeStats(items), [items]);
  const popularTags = useMemo(() => topTags(items), [items]);
  const favoriteItems = useMemo(() => {
    const favoriteSet = new Set(favorites);
    return items.filter((item) => favoriteSet.has(itemKey(item)));
  }, [favorites, items]);
  const activeFavorite = activeItem ? favorites.includes(itemKey(activeItem)) : false;

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const favoriteSet = new Set(favorites);
    const filtered = items.filter((item) => {
      const favoriteMatched = !showFavoritesOnly || favoriteSet.has(itemKey(item));
      const categoryMatched = matchesCategory(item, category);
      const queryMatched =
        !query || itemSearchText(item, userTagsByItem[itemKey(item)] || item.user_tags || []).includes(query);
      return favoriteMatched && categoryMatched && queryMatched;
    });

    return filtered.sort((a, b) => {
      const pinnedDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinnedDelta) return pinnedDelta;
      const recommendedDelta = Number(Boolean(b.recommended)) - Number(Boolean(a.recommended));
      if (recommendedDelta) return recommendedDelta;
      const postDelta = sortMode === "newest" ? b.post_number - a.post_number : a.post_number - b.post_number;
      return postDelta || a.image_index - b.image_index;
    });
  }, [category, favorites, items, searchTerm, showFavoritesOnly, sortMode, userTagsByItem]);

  const mobileFilteredItems = useMemo(() => {
    const query = mobileSearchDraft.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!query) return true;
      return itemSearchText(item, userTagsByItem[itemKey(item)] || item.user_tags || []).includes(query);
    });

    return filtered.sort((a, b) => {
      const pinnedDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinnedDelta) return pinnedDelta;
      const recommendedDelta = Number(Boolean(b.recommended)) - Number(Boolean(a.recommended));
      if (recommendedDelta) return recommendedDelta;
      const postDelta = sortMode === "newest" ? b.post_number - a.post_number : a.post_number - b.post_number;
      return postDelta || a.image_index - b.image_index;
    });
  }, [items, mobileSearchDraft, sortMode, userTagsByItem]);

  function rememberSearch(query: string) {
    setRecentSearches((current) => [query, ...current.filter((item) => item !== query)].slice(0, 6));
  }

  function saveSearchQuery(query: string, showToast = true) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      if (showToast) setToast("请输入搜索关键词");
      return false;
    }

    rememberSearch(normalizedQuery);
    if (showToast) setToast("已保存当前搜索");
    return true;
  }

  function saveCurrentSearch() {
    saveSearchQuery(searchTerm);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") saveCurrentSearch();
  }

  function commitHeaderSearch() {
    saveSearchQuery(searchTerm, false);
    setHeaderSearchOpen(false);
  }

  function openSearchExperience() {
    setHeaderHidden(false);
    setMobileCategoryExpanded(false);
    if (isMobileViewport()) {
      setMobileSearchDraft(searchTerm);
      setMobileSearchOpen(true);
      return;
    }
    setHeaderSearchOpen(true);
  }

  function toggleFavorite(item: GalleryItem) {
    const key = itemKey(item);
    setFavorites((current) =>
      current.includes(key) ? current.filter((favorite) => favorite !== key) : [key, ...current],
    );
  }

  async function copyPrompt(item: GalleryItem) {
    const text = item.prompt || "未提供";
    try {
      await navigator.clipboard.writeText(text);
      setToast("提示词已复制");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand("copy");
        setToast("提示词已复制");
      } catch {
        setToast("复制失败，请手动复制");
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  function showFavoriteResults() {
    if (!favorites.length && !showFavoritesOnly) {
      setToast("收藏夹为空");
      return;
    }

    const scrollToPosition = (top: number) => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: "smooth" });
      });
    };

    if (showFavoritesOnly) {
      setShowFavoritesOnly(false);
      scrollToPosition(favoriteEntryScrollYRef.current);
    } else {
      favoriteEntryScrollYRef.current = window.scrollY;
      setSearchTerm("");
      setCategory("全部");
      setShowFavoritesOnly(true);
      scrollToPosition(0);
    }

    setViewMode("grid");
    setHeaderHidden(false);
  }

  function openFavoriteItem(item: GalleryItem) {
    setFavoriteDrawerOpen(false);
    setActiveItem(item);
  }

  function openRandomItem() {
    if (!filteredItems.length) {
      setToast("当前没有可随机的作品");
      return;
    }

    const index = Math.floor(Math.random() * filteredItems.length);
    setActiveItem(filteredItems[index]);
  }

  function addUserTag(item: GalleryItem, tag: string) {
    const nextTag = tag.trim();
    if (!nextTag) return;
    const key = itemKey(item);
    setUserTagsByItem((current) => ({
      ...current,
      [key]: Array.from(new Set([...(current[key] || []), nextTag])).slice(0, 24),
    }));
  }

  function removeUserTag(item: GalleryItem, tag: string) {
    const key = itemKey(item);
    setUserTagsByItem((current) => ({
      ...current,
      [key]: (current[key] || []).filter((value) => value !== tag),
    }));
  }

  return (
    <div
      className="app-shell"
      data-theme={theme}
      data-mobile-header-hidden={headerHidden ? "true" : "false"}
      data-mobile-favorites-only={showFavoritesOnly ? "true" : "false"}
    >
      <Header
        onRandom={openRandomItem}
        onShowFavorites={showFavoriteResults}
        showFavoritesOnly={showFavoritesOnly}
        compactSearchVisible={compactSearchVisible}
        headerHidden={headerHidden}
        headerSearchOpen={headerSearchOpen}
        onSearchSubmit={commitHeaderSearch}
        onActivateHeaderSearch={openSearchExperience}
        onCloseHeaderSearch={() => setHeaderSearchOpen(false)}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        theme={theme}
      />

      <main>
        <HeroSearch
          filteredCount={filteredItems.length}
          inputRef={searchInputRef}
          panelRef={searchPanelRef}
          onKeyDown={handleSearchKeyDown}
          onSave={saveCurrentSearch}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />

        <section className="page-section">
          <FilterBar
            category={category}
            categories={categories}
            expanded={mobileCategoryExpanded}
            filteredCount={filteredItems.length}
            onExpandedChange={setMobileCategoryExpanded}
            setCategory={setCategory}
            setSortMode={setSortMode}
            setViewMode={setViewMode}
            sortMode={sortMode}
            viewMode={viewMode}
          />
          <StatsCards stats={stats} />
        </section>

        <section className="content-shell">
          <GalleryGrid
            error={error}
            favoriteKeys={favorites}
            items={filteredItems}
            loading={loading}
            onCopy={copyPrompt}
            onOpen={setActiveItem}
            onToggleFavorite={toggleFavorite}
            userTagsByItem={userTagsByItem}
            viewMode={viewMode}
          />

          <Sidebar
            category={category}
            favoriteItems={favoriteItems}
            onClearRecent={() => setRecentSearches([])}
            onOpenFavorite={openFavoriteItem}
            onPickRecent={(query) => setSearchTerm(query)}
            onPickTag={(tag) => {
              if (categories.includes(tag as Category)) {
                setCategory((current) => (current === tag ? "全部" : (tag as Category)));
                setSearchTerm("");
              } else {
                setCategory("全部");
                setSearchTerm((current) => (current.trim() === tag ? "" : tag));
              }
            }}
            onSaveSearch={saveCurrentSearch}
            onShowAllFavorites={showFavoriteResults}
            popularTags={popularTags}
            recentSearches={recentSearches}
            showFavoritesOnly={showFavoritesOnly}
            totalFavorites={favorites.length}
          />
        </section>

        <CtaBand />
      </main>

      <FloatingFavoriteButton
        open={favoriteDrawerOpen}
        totalFavorites={favorites.length}
        onClick={() => {
          setHeaderHidden(false);
          setFavoriteDrawerOpen(true);
        }}
      />

      <FavoriteDrawer
        favoriteItems={favoriteItems}
        onClose={() => setFavoriteDrawerOpen(false)}
        onOpenFavorite={openFavoriteItem}
        onShowAllFavorites={() => {
          const shouldClose = Boolean(favorites.length || showFavoritesOnly);
          showFavoriteResults();
          if (shouldClose) setFavoriteDrawerOpen(false);
        }}
        open={favoriteDrawerOpen}
        showFavoritesOnly={showFavoritesOnly}
        totalFavorites={favorites.length}
      />

      <MobileSearchPage
        error={error}
        favoriteKeys={favorites}
        items={mobileFilteredItems}
        loading={loading}
        onClose={() => {
          setMobileSearchDraft("");
          setMobileSearchOpen(false);
        }}
        onCopy={copyPrompt}
        onOpen={(item) => {
          setMobileSearchDraft("");
          setMobileSearchOpen(false);
          setActiveItem(item);
        }}
        onPickRecent={setMobileSearchDraft}
        onSaveSearch={() => saveSearchQuery(mobileSearchDraft)}
        onToggleFavorite={toggleFavorite}
        open={mobileSearchOpen}
        recentSearches={recentSearches}
        searchTerm={mobileSearchDraft}
        setSearchTerm={setMobileSearchDraft}
        userTagsByItem={userTagsByItem}
      />

      <DetailModal
        allItems={items}
        favorite={activeFavorite}
        item={activeItem}
        items={filteredItems}
        onClose={() => setActiveItem(null)}
        onCopy={copyPrompt}
        onAddUserTag={addUserTag}
        onRemoveUserTag={removeUserTag}
        onSelect={setActiveItem}
        onToggleFavorite={toggleFavorite}
        userTagsByItem={userTagsByItem}
        userTags={activeItem ? userTagsByItem[itemKey(activeItem)] || activeItem.user_tags || [] : []}
      />

      <div className={`toast ${toast ? "toast-show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function Header({
  compactSearchVisible,
  headerHidden,
  headerSearchOpen,
  onRandom,
  onShowFavorites,
  showFavoritesOnly,
  onSearchSubmit,
  onActivateHeaderSearch,
  onCloseHeaderSearch,
  onToggleTheme,
  searchTerm,
  setSearchTerm,
  theme,
}: {
  compactSearchVisible: boolean;
  headerHidden: boolean;
  headerSearchOpen: boolean;
  onRandom: () => void;
  onShowFavorites: () => void;
  showFavoritesOnly: boolean;
  onSearchSubmit: () => void;
  onActivateHeaderSearch: () => void;
  onCloseHeaderSearch: () => void;
  onToggleTheme: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  theme: ThemeMode;
}) {
  const headerSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerSearchOpen) headerSearchInputRef.current?.focus();
  }, [headerSearchOpen]);

  return (
    <header className={`topbar ${headerHidden ? "topbar-hidden" : ""}`}>
      <div className="topbar-inner">
        <button
          className="circle-button xhs-mobile-theme"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        >
          {theme === "dark" ? <SunMedium size={20} /> : <Moon size={20} />}
        </button>

        <a className="brand" href="/" aria-label="返回首页">
          <span className="brand-mark">D</span>
          <span>
            <strong>GPT Image 2 画廊</strong>
            <small>作品浏览 · Prompt 学习 · 检索归档</small>
          </span>
        </a>

        {/* Mobile Xiaohongshu style tabs */}
        <div className="xhs-mobile-tabs">
          <button 
            type="button" 
            className={`xhs-tab ${showFavoritesOnly ? "active" : ""}`}
            onClick={onShowFavorites}
          >
            收藏
          </button>
          <button 
            type="button" 
            className={`xhs-tab ${!showFavoritesOnly ? "active" : ""}`}
            onClick={() => {
              if (showFavoritesOnly) onShowFavorites();
            }}
          >
            发现
          </button>
          <button 
            type="button" 
            className="xhs-tab"
            onClick={onRandom}
          >
            随机
          </button>
        </div>

        <nav className="top-actions" aria-label="顶部操作">
          <button
            className="circle-button xhs-mobile-search"
            type="button"
            onClick={onActivateHeaderSearch}
            aria-label="搜索"
          >
            <Search size={22} />
          </button>
          {compactSearchVisible ? (
            <div className="header-search-wrap">
              <button
                className={`circle-button header-search-trigger ${headerSearchOpen ? "active" : ""}`}
                type="button"
                onClick={onActivateHeaderSearch}
                aria-label="聚焦页眉搜索"
              >
                <Search size={20} />
              </button>
              <div className={`header-search-inline ${headerSearchOpen ? "active" : ""}`}>
                <input
                  ref={headerSearchInputRef}
                  value={searchTerm}
                  onFocus={onActivateHeaderSearch}
                  onBlur={onCloseHeaderSearch}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSearchSubmit();
                    if (event.key === "Escape") {
                      onCloseHeaderSearch();
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="搜索楼层 / 用户名 / Prompt 关键词"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setSearchTerm("")}
                    aria-label="清空搜索"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <button className="ghost-button" type="button" onClick={onRandom}>
            <Box size={18} />
            随机看看
          </button>
          <button
            className="circle-button theme-toggle"
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? <SunMedium size={20} /> : <Moon size={20} />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function HeroSearch({
  filteredCount,
  inputRef,
  panelRef,
  onKeyDown,
  onSave,
  searchTerm,
  setSearchTerm,
}: {
  filteredCount: number;
  inputRef: React.RefObject<HTMLInputElement>;
  panelRef: React.RefObject<HTMLDivElement>;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSave: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}) {
  return (
    <section className="hero">
      <div className="hero-art hero-art-left" aria-hidden="true">
        <span className="easel-frame" />
        <span className="easel-sun" />
        <span className="easel-hill hill-one" />
        <span className="easel-hill hill-two" />
        <span className="paint-brush" />
      </div>
      <div className="hero-art hero-art-right" aria-hidden="true">
        <span className="shape blob" />
        <span className="shape dot" />
        <span className="shape triangle" />
        <span className="shape coral" />
      </div>

      <div className="hero-copy">
        <p className="eyebrow">
          <Sparkles size={16} />
          社区作品灵感库
        </p>
        <h1>灵感画廊</h1>
        <p className="mobile-hero-subtitle">浏览作品 · 学习 Prompt · 检索归档</p>
      </div>

      <div className="search-panel" ref={panelRef}>
        <Search size={22} />
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索楼层 / 用户名 / Prompt 关键词..."
        />
        {searchTerm ? (
          <button className="clear-search" type="button" onClick={() => setSearchTerm("")} aria-label="清空搜索">
            <X size={16} />
          </button>
        ) : null}
        <kbd>⌘ K</kbd>
      </div>

      <div className="hero-meta">
        <span>当前匹配 {filteredCount} 张作品</span>
        <button type="button" onClick={onSave}>
          <Save size={16} />
          保存当前搜索
        </button>
      </div>
    </section>
  );
}

function FilterBar({
  category,
  categories,
  expanded,
  filteredCount,
  onExpandedChange,
  setCategory,
  setSortMode,
  setViewMode,
  sortMode,
  viewMode,
}: {
  category: Category;
  categories: Category[];
  expanded: boolean;
  filteredCount: number;
  onExpandedChange: (expanded: boolean) => void;
  setCategory: (category: Category) => void;
  setSortMode: (sortMode: SortMode) => void;
  setViewMode: (viewMode: ViewMode) => void;
  sortMode: SortMode;
  viewMode: ViewMode;
}) {
  function getCategoryIcon(name: Category): LucideIcon {
    if (name === "全部") return Grid3X3;
    if (name === "海报") return ImageIcon;
    if (name === "城市") return Layers;
    if (name === "人物") return Users;
    if (name === "插画") return Palette;
    if (name === "国风") return Sparkles;
    return Tag;
  }

  return (
    <div className="filter-row">
      <div className={`category-tabs-wrapper ${expanded ? "expanded" : ""}`}>
        {expanded && (
          <div className="category-expanded-header">
            <div className="title-row">
              <strong>我的频道</strong>
            </div>
            <button className="collapse-btn" type="button" onClick={() => onExpandedChange(false)} aria-label="收起分类">
              <ChevronUp size={20} />
            </button>
          </div>
        )}
        <div className="category-tabs" aria-label="分类筛选">
          {categories.map((item) => {
            const Icon = getCategoryIcon(item);
            return (
              <button
                className={item === category ? "active" : ""}
                key={item}
                type="button"
                onClick={() => {
                  setCategory(item === "全部" || category !== item ? item : "全部");
                  onExpandedChange(false);
                }}
              >
                <Icon className="mobile-category-icon" size={18} />
                {item}
              </button>
            );
          })}
        </div>
        {!expanded && (
          <button
            className="category-expand-btn"
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-label="展开全部分类"
          >
            <ChevronRight className={`expand-icon ${expanded ? "open" : ""}`} size={20} />
          </button>
        )}
      </div>

      <div className="mobile-match-row" aria-hidden="true">
        当前匹配 {filteredCount} 张作品
      </div>

      <div className="view-tools">
        <label className="sort-select">
          <span className="sr-only">排序</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="newest">最新发布</option>
            <option value="oldest">最早发布</option>
          </select>
        </label>
        <div className="view-switch" aria-label="视图切换">
          <button
            className={viewMode === "grid" ? "active" : ""}
            type="button"
            onClick={() => setViewMode("grid")}
            aria-label="网格视图"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            className={viewMode === "list" ? "active" : ""}
            type="button"
            onClick={() => setViewMode("list")}
            aria-label="列表视图"
          >
            <List size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileSearchPage({
  error,
  favoriteKeys,
  items,
  loading,
  onClose,
  onCopy,
  onOpen,
  onPickRecent,
  onSaveSearch,
  onToggleFavorite,
  open,
  recentSearches,
  searchTerm,
  setSearchTerm,
  userTagsByItem,
}: {
  error: string;
  favoriteKeys: string[];
  items: GalleryItem[];
  loading: boolean;
  onClose: () => void;
  onCopy: (item: GalleryItem) => void;
  onOpen: (item: GalleryItem) => void;
  onPickRecent: (query: string) => void;
  onSaveSearch: () => void;
  onToggleFavorite: (item: GalleryItem) => void;
  open: boolean;
  recentSearches: string[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  userTagsByItem: Record<string, string[]>;
}) {
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    mobileSearchInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <div className={`mobile-search-page ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="mobile-search-shell">
        <div className="mobile-search-header">
          <button type="button" onClick={onClose} aria-label="关闭搜索页面">
            <ChevronLeft size={22} />
          </button>
          <div className="mobile-search-input">
            <Search size={18} />
            <input
              ref={mobileSearchInputRef}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索作品、作者、Prompt 关键词"
            />
            {searchTerm ? (
              <button type="button" onClick={() => setSearchTerm("")} aria-label="清空搜索">
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mobile-search-body">
          <div className="mobile-search-meta">
            <strong>{searchTerm.trim() ? `找到 ${items.length} 张相关作品` : "输入关键词搜索作品"}</strong>
            <button type="button" onClick={onSaveSearch}>
              <Save size={15} />
              保存搜索
            </button>
          </div>

          {recentSearches.length ? (
            <div className="mobile-search-recent">
              <span>最近搜索</span>
              <div className="mobile-search-chip-row">
                {recentSearches.map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => {
                      setSearchTerm(query);
                      onPickRecent(query);
                    }}
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <GalleryGrid
            error={error}
            favoriteKeys={favoriteKeys}
            items={items}
            loading={loading}
            onCopy={onCopy}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            userTagsByItem={userTagsByItem}
            viewMode="list"
          />
        </div>
      </div>
    </div>
  );
}

function StatsCards({ stats }: { stats: GalleryStats }) {
  const cards = [
    { label: "总作品", value: stats.images, icon: ImageIcon, tone: "indigo", detail: "已归档图片" },
    { label: "作者", value: stats.users, icon: Users, tone: "mint", detail: "社区创作者" },
    { label: "可复制 Prompt", value: stats.copyablePrompts, icon: Copy, tone: "amber", detail: "可直接复用" },
    { label: "多图帖子", value: stats.multiImagePosts, icon: Layers, tone: "rose", detail: "组图灵感" },
  ];

  return (
    <div className="stats-grid">
      {cards.map(({ detail, icon: Icon, label, tone, value }) => (
        <article className={`stat-card ${tone}`} key={label}>
          <span className="stat-icon">
            <Icon size={24} />
          </span>
          <span className="stat-text">
            <small>{label}</small>
            <strong>{value}</strong>
            <em>{detail}</em>
          </span>
          <TrendingUp className="stat-trend" size={22} />
        </article>
      ))}
    </div>
  );
}

function GalleryGrid({
  error,
  favoriteKeys,
  items,
  loading,
  onCopy,
  onOpen,
  onToggleFavorite,
  userTagsByItem,
  viewMode,
}: {
  error: string;
  favoriteKeys: string[];
  items: GalleryItem[];
  loading: boolean;
  onCopy: (item: GalleryItem) => void;
  onOpen: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTagsByItem: Record<string, string[]>;
  viewMode: ViewMode;
}) {
  const favoriteSet = new Set(favoriteKeys);

  if (loading) {
    return (
      <div className="gallery-state">
        <Loader2 className="spin" size={28} />
        <span>正在加载画廊数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gallery-state error-state">
        <AlertCircle size={28} />
        <strong>数据加载失败</strong>
        <span>{error}</span>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="gallery-state">
        <Search size={28} />
        <strong>没有匹配结果</strong>
        <span>换个关键词或切换分类试试。</span>
      </div>
    );
  }

  return (
    <div className={`gallery-grid ${viewMode === "list" ? "gallery-list" : ""}`}>
      {items.map((item) => {
        const key = itemKey(item);
        return (
          <GalleryCard
            favorite={favoriteSet.has(key)}
            item={item}
            key={key}
            onCopy={onCopy}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            userTags={userTagsByItem[key] || item.user_tags || []}
            viewMode={viewMode}
          />
        );
      })}
    </div>
  );
}

function GalleryCard({
  favorite,
  item,
  onCopy,
  onOpen,
  onToggleFavorite,
  userTags,
  viewMode,
}: {
  favorite: boolean;
  item: GalleryItem;
  onCopy: (item: GalleryItem) => void;
  onOpen: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTags: string[];
  viewMode: ViewMode;
}) {
  const tags = getAllTags(item, userTags);

  if (viewMode === "list") {
    return (
      <article className="gallery-card list-card">
        <button className="image-button list-image-button" type="button" onClick={() => onOpen(item)} aria-label="查看作品详情">
          <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
          {item.pinned ? <span className="pinned-badge">置顶</span> : null}
          {item.recommended ? (
            <span className="recommend-ribbon" aria-label="推荐">
              <Sparkles size={14} />
              推荐
            </span>
          ) : null}
        </button>

        <div className="card-body list-card-body">
          <div className="list-card-copy">
            <h3>{getDisplayTitle(item)}</h3>
            <div className="card-meta card-meta-list">
              <span>
                #{item.post_number} · 图{item.image_index}
              </span>
              <span>@{item.username}</span>
            </div>
            <p>{getPromptPreview(item, 110)}</p>
            <div className="tag-row">
              {(tags.length ? tags : ["灵感"]).slice(0, 5).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="list-meta-row">
              <span>
                <Copy size={14} />
                {item.prompt && item.prompt !== "未提供" ? "Prompt 可复制" : "未提供 Prompt"}
              </span>
              <span>
                <Flag size={14} />
                来源活动帖
              </span>
            </div>
          </div>

          <div className="list-actions">
            <button className="detail-button" type="button" onClick={() => onOpen(item)}>
              查看详情
            </button>
            <button className="icon-action" type="button" onClick={() => onCopy(item)} aria-label="复制提示词">
              <Copy size={17} />
            </button>
            <button
              className={`icon-action ${favorite ? "active" : ""}`}
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label={favorite ? "取消收藏" : "收藏"}
            >
              {favorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="gallery-card">
      <button className="image-button" type="button" onClick={() => onOpen(item)} aria-label="查看作品详情">
        <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
        {item.pinned ? <span className="pinned-badge">置顶</span> : null}
        {item.recommended ? (
          <span className="recommend-ribbon" aria-label="推荐">
            <Sparkles size={14} />
            推荐
          </span>
        ) : null}
      </button>

      <div className="card-body">
        <div>
          <h3>{getDisplayTitle(item)}</h3>
          <div className="card-meta">
            <span className="card-meta-floor">
              #{item.post_number} · 图{item.image_index}
            </span>
            <span className="card-meta-author">
              <span className="author-avatar">{item.username.charAt(0).toUpperCase()}</span>
              {item.username}
            </span>
          </div>
          <p>{getPromptPreview(item)}</p>
        </div>

        <div className="tag-row">
          {(tags.length ? tags : ["灵感"]).slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="card-actions">
          <button className="detail-button" type="button" onClick={() => onOpen(item)}>
            详情
          </button>
          <button className="icon-action" type="button" onClick={() => onCopy(item)} aria-label="复制提示词">
            <Copy size={17} />
          </button>
          <button
            className={`icon-action ${favorite ? "active" : ""}`}
            type="button"
            onClick={() => onToggleFavorite(item)}
            aria-label={favorite ? "取消收藏" : "收藏"}
          >
            {favorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
        </div>
      </div>
    </article>
  );
}

function Sidebar({
  category,
  favoriteItems,
  onClearRecent,
  onOpenFavorite,
  onPickRecent,
  onPickTag,
  onSaveSearch,
  onShowAllFavorites,
  popularTags,
  recentSearches,
  showFavoritesOnly,
  totalFavorites,
}: {
  category: Category;
  favoriteItems: GalleryItem[];
  onClearRecent: () => void;
  onOpenFavorite: (item: GalleryItem) => void;
  onPickRecent: (query: string) => void;
  onPickTag: (tag: string) => void;
  onSaveSearch: () => void;
  onShowAllFavorites: () => void;
  popularTags: [string, number][];
  recentSearches: string[];
  showFavoritesOnly: boolean;
  totalFavorites: number;
}) {
  return (
    <aside className="sidebar">
      <section className="side-card">
        <div className="side-title">
          <strong>快速筛选</strong>
          <Filter size={18} />
        </div>
        <p>热门标签</p>
        <div className="hot-tags">
          {popularTags.map(([tag]) => (
            <button
              className={category === tag ? "active" : ""}
              key={tag}
              type="button"
              onClick={() => onPickTag(tag)}
            >
              <Tag size={13} />
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="side-card">
        <div className="side-title">
          <strong>最近搜索</strong>
          <button type="button" onClick={onClearRecent}>
            清空
          </button>
        </div>
        <div className="recent-list">
          {recentSearches.length ? (
            recentSearches.map((query) => (
              <button key={query} type="button" onClick={() => onPickRecent(query)}>
                <Clock3 size={15} />
                {query}
              </button>
            ))
          ) : (
            <span className="muted">按 Enter 或点击保存当前搜索。</span>
          )}
        </div>
        <button className="save-search-button" type="button" onClick={onSaveSearch}>
          <Save size={16} />
          保存当前搜索
        </button>
      </section>

      <FavoritesPanel
        favoriteItems={favoriteItems}
        onOpenFavorite={onOpenFavorite}
        onShowAllFavorites={onShowAllFavorites}
        showFavoritesOnly={showFavoritesOnly}
        totalFavorites={totalFavorites}
        variant="sidebar"
      />
    </aside>
  );
}

function FloatingFavoriteButton({
  open,
  onClick,
  totalFavorites,
}: {
  open: boolean;
  onClick: () => void;
  totalFavorites: number;
}) {
  return (
    <button
      className={`favorite-fab ${open ? "active" : ""}`}
      type="button"
      onClick={onClick}
      aria-label={`打开收藏夹，共 ${totalFavorites} 个收藏`}
    >
      <span className="favorite-fab-icon">
        <Star size={21} />
      </span>
      <span>收藏夹</span>
      <strong>{totalFavorites}</strong>
    </button>
  );
}

function FavoriteDrawer({
  favoriteItems,
  onClose,
  onOpenFavorite,
  onShowAllFavorites,
  open,
  showFavoritesOnly,
  totalFavorites,
}: {
  favoriteItems: GalleryItem[];
  onClose: () => void;
  onOpenFavorite: (item: GalleryItem) => void;
  onShowAllFavorites: () => void;
  open: boolean;
  showFavoritesOnly: boolean;
  totalFavorites: number;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <div
      className={`favorite-drawer-backdrop ${open ? "open" : ""}`}
      role="presentation"
      aria-hidden={!open}
      onClick={onClose}
    >
      <aside
        className="favorite-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="收藏夹"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="favorite-drawer-header">
          <div>
            <span>我的收藏</span>
            <strong>{totalFavorites} 个灵感作品</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭收藏夹">
            <X size={22} />
          </button>
        </div>

        <FavoritesPanel
          favoriteItems={favoriteItems}
          onOpenFavorite={onOpenFavorite}
          onShowAllFavorites={onShowAllFavorites}
          showFavoritesOnly={showFavoritesOnly}
          totalFavorites={totalFavorites}
          variant="drawer"
        />
      </aside>
    </div>
  );
}

function FavoritesPanel({
  favoriteItems,
  onOpenFavorite,
  onShowAllFavorites,
  showFavoritesOnly,
  totalFavorites,
  variant,
}: {
  favoriteItems: GalleryItem[];
  onOpenFavorite: (item: GalleryItem) => void;
  onShowAllFavorites: () => void;
  showFavoritesOnly: boolean;
  totalFavorites: number;
  variant: "sidebar" | "drawer";
}) {
  const visibleItems = variant === "sidebar" ? favoriteItems.slice(0, 4) : favoriteItems;
  const isDrawer = variant === "drawer";

  return (
    <section className={`favorites-panel ${isDrawer ? "drawer-favorites-panel" : "side-card desktop-favorites-card"}`}>
      <div className="side-title favorites-panel-title">
        <strong>
          <Star size={18} />
          收藏夹
        </strong>
        <button type="button" onClick={onShowAllFavorites} disabled={!totalFavorites && !showFavoritesOnly}>
          {showFavoritesOnly ? "退出收藏夹" : "查看全部"}
        </button>
      </div>
      {visibleItems.length ? (
        <div className={`favorite-grid ${isDrawer ? "favorite-grid-drawer" : ""}`}>
          {visibleItems.map((item) => (
            <button key={itemKey(item)} type="button" onClick={() => onOpenFavorite(item)}>
              <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
              {isDrawer ? (
                <span>
                  #{item.post_number} · 图{item.image_index}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="favorite-empty">
          <Bookmark size={22} />
          <span>还没有收藏作品</span>
          <small>点击作品卡片右下角书签，收藏会出现在这里。</small>
        </div>
      )}
      <p className="favorite-count">共 {totalFavorites} 个收藏</p>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="cta-band">
      <div className="palette-illustration" aria-hidden="true">
        <Palette size={62} />
      </div>
      <div>
        <h2>发现优质 Prompt，激发更多创作灵感</h2>
        <p>学习高手的提示词写法，复制、调整、应用到你的创作中。</p>
      </div>
      <a href="#root" className="cta-button">
        探索 Prompt 灵感库
        <ArrowRight size={20} />
      </a>
    </section>
  );
}

function DetailModal({
  allItems,
  favorite,
  item,
  items,
  onAddUserTag,
  onClose,
  onCopy,
  onRemoveUserTag,
  onSelect,
  onToggleFavorite,
  userTagsByItem,
  userTags,
}: {
  allItems: GalleryItem[];
  favorite: boolean;
  item: GalleryItem | null;
  items: GalleryItem[];
  onAddUserTag: (item: GalleryItem, tag: string) => void;
  onClose: () => void;
  onCopy: (item: GalleryItem) => void;
  onRemoveUserTag: (item: GalleryItem, tag: string) => void;
  onSelect: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTagsByItem: Record<string, string[]>;
  userTags: string[];
}) {
  const [imageSize, setImageSize] = useState("读取中");
  const [newTag, setNewTag] = useState("");
  const [relatedDrawerOpen, setRelatedDrawerOpen] = useState(false);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);

  useEffect(() => {
    if (!item) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (imagePreviewOpen) {
        setImagePreviewOpen(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imagePreviewOpen, item, onClose]);

  useEffect(() => {
    setImageSize("读取中");
    setNewTag("");
    setRelatedDrawerOpen(false);
    setImagePreviewOpen(false);
    setPromptExpanded(false);
  }, [item]);

  if (!item) return null;

  const originalTags = getOriginalTags(item);
  const currentKey = itemKey(item);
  const currentIndex = items.findIndex((candidate) => itemKey(candidate) === currentKey);
  const previousItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < items.length - 1 ? items[currentIndex + 1] : null;
  const samePostItems = allItems.filter((candidate) => candidate.post_number === item.post_number);
  const relatedResults = rankRelatedItems(item, allItems, userTagsByItem, 12);
  const relatedPreview = relatedResults.slice(0, 2);
  const hasPostUrl = Boolean(item.post_url && String(item.post_url).trim());
  const displayUsername = String(item.username || "").trim();
  const hasAuthor = Boolean(displayUsername && displayUsername.toLowerCase() !== "unknown");
  const promptText = String(item.prompt || "未提供");
  const promptCanExpand = promptText.length > 150;
  const visiblePrompt = promptExpanded || !promptCanExpand ? promptText : truncateText(promptText, 150);

  function selectRelatedItem(nextRelatedItem: GalleryItem) {
    setRelatedDrawerOpen(false);
    onSelect(nextRelatedItem);
  }

  return (
    <div className="modal-backdrop detail-backdrop" role="presentation" onClick={relatedDrawerOpen ? undefined : onClose}>
      <section
        className="modal-panel detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Prompt 详情"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-detail-topbar">
          <button type="button" onClick={onClose} aria-label="关闭详情">
            <ChevronLeft size={26} />
          </button>
          <strong>图片详情</strong>
          <span aria-hidden="true" />
        </div>

        <div className="detail-gallery">
          <div className="detail-image-frame">
            {previousItem ? (
              <button className="image-nav prev" type="button" onClick={() => onSelect(previousItem)} aria-label="上一张">
                <ChevronLeft size={24} />
              </button>
            ) : null}
            <button className="detail-image-click" type="button" onClick={() => setImagePreviewOpen(true)} aria-label="查看完整图片">
              <img
                src={item.image_url}
                alt={getDisplayTitle(item)}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setImageSize(`${image.naturalWidth}×${image.naturalHeight}`);
                }}
              />
            </button>
            {nextItem ? (
              <button className="image-nav next" type="button" onClick={() => onSelect(nextItem)} aria-label="下一张">
                <ChevronRight size={24} />
              </button>
            ) : null}
          </div>

          <div className="detail-thumbs">
            <button className="active" type="button" onClick={() => onSelect(item)} aria-label="当前作品">
              <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
            </button>
            {relatedPreview.map(({ item: candidate, reasons }) => (
              <button
                key={itemKey(candidate)}
                type="button"
                onClick={() => selectRelatedItem(candidate)}
                title={reasons.join(" / ") || "相关作品"}
              >
                <img src={candidate.thumb_url || candidate.image_url} alt={getDisplayTitle(candidate)} loading="lazy" />
              </button>
            ))}
            <button className="more-related" type="button" onClick={() => setRelatedDrawerOpen(true)}>
              <span>＋</span>
              更多相关作品
            </button>
          </div>
        </div>

        <div className="modal-side detail-side">
          <div className="detail-topline">
            <button className="detail-back-button" type="button" onClick={onClose}>
              <ChevronLeft size={18} />
              作品详情
            </button>
            <button className="detail-close" type="button" onClick={onClose} aria-label="关闭详情">
              <X size={22} />
            </button>
          </div>

          <div className="detail-heading">
            <div>
              <h2>
                第{item.post_number}层
                {hasAuthor ? (
                  <>
                    <span> · </span>@{displayUsername}
                  </>
                ) : null}
                <span> · </span>图{item.image_index}
                {item.pinned ? <span className="detail-badge pinned">置顶</span> : null}
                {item.recommended ? <span className="detail-badge recommended">推荐</span> : null}
              </h2>
              <p>
                发布于活动归档
                <span>·</span>
                可复制 Prompt
                <Copy size={15} />
              </p>
            </div>
            <button
              className={`detail-favorite ${favorite ? "active" : ""}`}
              type="button"
              onClick={() => onToggleFavorite(item)}
              aria-label={favorite ? "取消收藏" : "收藏"}
            >
              <Star size={28} />
            </button>
          </div>

          <div className="detail-metrics">
            <MetricCard icon={Flag} label="楼层" value={String(item.post_number)} tone="blue" />
            {hasAuthor ? <MetricCard icon={Users} label="作者" value={`@${displayUsername}`} tone="green" /> : null}
            <MetricCard icon={ImageIcon} label="图" value={`${item.image_index}/${Math.max(samePostItems.length, item.image_index)}`} tone="red" />
            <MetricCard icon={Palette} label="风格" value={originalTags[0] || "灵感"} tone="orange" />
            <MetricCard icon={Maximize2} label="尺寸" value={imageSize} tone="purple" />
          </div>

          <section className="detail-section prompt-detail">
            <h3>
              <Copy size={18} />
              <span className="desktop-prompt-title">Prompt / Metadata</span>
              <span className="mobile-prompt-title">Prompt / 提示词</span>
              {promptCanExpand ? (
                <button
                  type="button"
                  className="prompt-toggle"
                  onClick={() => setPromptExpanded((current) => !current)}
                  aria-label={promptExpanded ? "收起提示词" : "展开提示词"}
                >
                  {promptExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  {promptExpanded ? "收起" : "展开"}
                </button>
              ) : null}
            </h3>
            <div className={`detail-prompt-scroll ${promptExpanded ? "expanded" : ""}`}>{visiblePrompt}</div>
            <div className="modal-actions detail-actions">
              <button type="button" className="primary-action" onClick={() => onCopy(item)}>
                <Copy size={18} />
                复制提示词
              </button>
              {hasPostUrl ? (
                <a href={item.post_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={18} />
                  打开原帖
                </a>
              ) : null}
              <a href={item.image_url} target="_blank" rel="noopener noreferrer">
                <ImageIcon size={18} />
                下载原图
              </a>
            </div>
          </section>

          <section className="detail-section extra-detail">
            <h3>
              <Layers size={18} />
              附加信息
            </h3>
            <div className="extra-info-grid">
              <InfoCell icon={Flag} label="标题" value={`第${item.post_number}层 · 图${item.image_index}`} />
              <InfoCell icon={CalendarDays} label="发布时间" value="活动归档" />
              {hasPostUrl ? <InfoCell icon={Link2} label="原帖链接" value={item.post_url} /> : null}
              <InfoCell icon={ImageIcon} label="图片来源" value="活动归档" />
              <div className="info-cell tags-cell">
                <span className="info-icon">
                  <Tag size={18} />
                </span>
                <div>
                  <small>原始标签</small>
                  <div className="modal-tags detail-tags original-tags">
                    {(originalTags.length ? originalTags : ["灵感"]).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="info-cell tags-cell user-tags-cell">
                <span className="info-icon">
                  <Tag size={18} />
                </span>
                <div>
                  <small>我的标签</small>
                  <div className="modal-tags detail-tags user-tags">
                    {userTags.length ? (
                      userTags.map((tag) => (
                        <span className="editable-tag" key={tag}>
                          {tag}
                          <button type="button" onClick={() => onRemoveUserTag(item, tag)} aria-label={`删除 ${tag}`}>
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span>暂无</span>
                    )}
                  </div>
                  <form
                    className="tag-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onAddUserTag(item, newTag);
                      setNewTag("");
                    }}
                  >
                    <input
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      placeholder="新增自定义标签"
                      maxLength={18}
                    />
                    <button type="submit">添加</button>
                  </form>
                </div>
              </div>
            </div>
          </section>
        </div>

        <RelatedDrawer
          onClose={() => setRelatedDrawerOpen(false)}
          onSelect={selectRelatedItem}
          open={relatedDrawerOpen}
          relatedItems={relatedResults}
        />

        {imagePreviewOpen ? (
          <div className="image-preview-backdrop" role="presentation" onClick={() => setImagePreviewOpen(false)}>
            <section
              className="image-preview-panel"
              role="dialog"
              aria-modal="true"
              aria-label="图片预览"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="image-preview-topbar">
                <button type="button" onClick={() => setImagePreviewOpen(false)} aria-label="关闭图片预览">
                  <X size={26} />
                </button>
              </div>
              <div className="image-preview-stage">
                <img src={item.image_url} alt={getDisplayTitle(item)} />
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RelatedDrawer({
  onClose,
  onSelect,
  open,
  relatedItems,
}: {
  onClose: () => void;
  onSelect: (item: GalleryItem) => void;
  open: boolean;
  relatedItems: RelatedGalleryItem[];
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <div
      className={`related-drawer-backdrop ${open ? "open" : ""}`}
      role="presentation"
      aria-hidden={!open}
      onClick={onClose}
    >
      <aside
        className="related-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="更多相关作品"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="related-drawer-header">
          <div>
            <span>Related Works</span>
            <strong>更多相关作品</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭相关作品">
            <X size={22} />
          </button>
        </div>

        {relatedItems.length ? (
          <div className="related-grid">
            {relatedItems.map(({ item, reasons, score }) => {
              const tags = getAllTags(item).filter((tag) => tag !== "Prompt" && tag !== "组图");
              return (
                <button key={itemKey(item)} type="button" onClick={() => onSelect(item)}>
                  <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
                  <span className="related-card-body">
                    <strong>{getDisplayTitle(item)}</strong>
                    <small>
                      #{item.post_number} · @{item.username}
                    </small>
                    <em>{reasons.length ? reasons.join(" / ") : `相关度 ${score}`}</em>
                    <span className="related-card-tags">
                      {(tags.length ? tags : ["灵感"]).slice(0, 3).map((tag) => (
                        <i key={tag}>{tag}</i>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="related-empty">
            <Layers size={24} />
            <strong>暂无更多相关作品</strong>
            <span>当前作品暂时没有足够相似的标签、作者或 Prompt 线索。</span>
          </div>
        )}
      </aside>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: "blue" | "green" | "red" | "orange" | "purple";
  value: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>
        <Icon size={19} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function InfoCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="info-cell">
      <span className="info-icon">
        <Icon size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong title={value}>{value}</strong>
      </div>
    </div>
  );
}

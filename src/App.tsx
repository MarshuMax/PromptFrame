import { useEffect, useRef, useState } from "react";
import { CommandBar } from "./components/CommandBar";
import { FilterChips } from "./components/FilterChips";
import { Inspector } from "./components/Inspector";
import { Lightbox } from "./components/Lightbox";
import { MasonryGallery } from "./components/MasonryGallery";
import { MobileDock, MobileSheet } from "./components/MobileChrome";
import { Sidebar } from "./components/Sidebar";
import { Toast } from "./components/Toast";
import { useGalleryData } from "./hooks/useGalleryData";
import { useGalleryFilters } from "./hooks/useGalleryFilters";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useStoredState } from "./hooks/useStoredState";
import type { Category, GalleryItem, SortMode, ThemeMode, ViewMode } from "./types";
import { CATEGORIES, getOriginalTags, itemKey } from "./utils";

const FAVORITES_KEY = "linux-do-gallery:favorites";
const RECENT_SEARCHES_KEY = "linux-do-gallery:recent-searches";
const THEME_KEY = "linux-do-gallery:theme";
const USER_TAGS_KEY = "linux-do-gallery:user-tags";

export default function App() {
  const { error, importFile, items, loading } = useGalleryData();
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [toast, setToast] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"filters" | "favorites" | null>(null);
  const [favorites, setFavorites] = useStoredState<string[]>(FAVORITES_KEY, []);
  const [recentSearches, setRecentSearches] = useStoredState<string[]>(RECENT_SEARCHES_KEY, []);
  const [theme, setTheme] = useStoredState<ThemeMode>(THEME_KEY, "light");
  const [userTagsByItem, setUserTagsByItem] = useStoredState<Record<string, string[]>>(USER_TAGS_KEY, {});
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { favoriteItems, filteredItems, popularTags, stats } = useGalleryFilters({
    category,
    favorites,
    items,
    searchTerm,
    showFavoritesOnly,
    sortMode,
    userTagsByItem,
  });

  const activeFavorite = activeItem ? favorites.includes(itemKey(activeItem)) : false;

  useKeyboardShortcuts({
    onEscape: () => {
      setLightboxItem(null);
      setMobilePanel(null);
      if (window.matchMedia("(max-width: 900px)").matches) setActiveItem(null);
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
    onOpenLightbox: () => {
      if (activeItem) setLightboxItem(activeItem);
    },
    onToggleFavorite: () => {
      if (activeItem) toggleFavorite(activeItem);
    },
  });

  useEffect(() => {
    document.body.style.overflow = lightboxItem || mobilePanel ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxItem, mobilePanel]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1900);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function saveCurrentSearch() {
    const query = searchTerm.trim();
    if (!query) {
      setToast("Enter a search query first");
      return;
    }
    setRecentSearches((current) => [query, ...current.filter((item) => item !== query)].slice(0, 8));
    setToast("Search saved");
  }

  function toggleFavorite(item: GalleryItem) {
    const key = itemKey(item);
    setFavorites((current) => (current.includes(key) ? current.filter((favorite) => favorite !== key) : [key, ...current]));
  }

  async function copyPrompt(item: GalleryItem) {
    const text = item.prompt || "Not provided";
    try {
      await navigator.clipboard.writeText(text);
      setToast("Prompt copied");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setToast("Prompt copied");
      } catch {
        setToast("Copy failed. Please copy manually");
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  function exportCurrentResults() {
    const exportItems = filteredItems.map((item) => ({
      ...item,
      original_tags: getOriginalTags(item),
      user_tags: userTagsByItem[itemKey(item)] || item.user_tags || [],
    }));
    const blob = new Blob([JSON.stringify(exportItems, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompt-frame-${category}-${filteredItems.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("Current results exported");
  }

  async function importGalleryFile(file: File | null) {
    if (!file) return;
    try {
      const result = await importFile(file);
      setToast(`Imported ${Number(result.added || 0)} items, skipped ${Number(result.duplicated || 0) + Number(result.invalid || 0)}`);
    } catch (err) {
      setToast(err instanceof SyntaxError ? "Import failed: invalid JSON" : "Import failed: server write error");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function openRandomItem() {
    if (!filteredItems.length) {
      setToast("No item is available for random pick");
      return;
    }
    setActiveItem(filteredItems[Math.floor(Math.random() * filteredItems.length)]);
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

  function pickCategory(nextCategory: Category) {
    setCategory(nextCategory);
    setShowFavoritesOnly(false);
  }

  function pickTag(tag: string) {
    if (CATEGORIES.includes(tag as Category)) {
      pickCategory(category === tag ? "All" : (tag as Category));
      setSearchTerm("");
      return;
    }
    setCategory("All");
    setSearchTerm((current) => (current.trim() === tag ? "" : tag));
  }

  function clearFilters() {
    setSearchTerm("");
    setCategory("All");
    setShowFavoritesOnly(false);
  }

  return (
    <div className="app-frame" data-theme={theme}>
      <input
        ref={importInputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => importGalleryFile(event.target.files?.[0] || null)}
      />

      <Sidebar
        category={category}
        favoriteCount={favorites.length}
        onCategoryChange={pickCategory}
        onPickRecent={setSearchTerm}
        onToggleFavorites={() => setShowFavoritesOnly((current) => !current)}
        recentSearches={recentSearches}
        showFavoritesOnly={showFavoritesOnly}
        stats={stats}
      />

      <main className="main-stage">
        <CommandBar
          onExport={exportCurrentResults}
          onImport={() => importInputRef.current?.click()}
          onOpenMobileFilters={() => setMobilePanel("filters")}
          onRandom={openRandomItem}
          onSaveSearch={saveCurrentSearch}
          onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          resultCount={filteredItems.length}
          searchInputRef={searchInputRef}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          setSortMode={setSortMode}
          setViewMode={setViewMode}
          sortMode={sortMode}
          theme={theme}
          viewMode={viewMode}
        />

        <FilterChips
          category={category}
          onClearAll={clearFilters}
          onClearCategory={() => setCategory("All")}
          onClearFavorites={() => setShowFavoritesOnly(false)}
          onClearSearch={() => setSearchTerm("")}
          searchTerm={searchTerm}
          showFavoritesOnly={showFavoritesOnly}
          sortMode={sortMode}
        />

        <section className="quick-tags" aria-label="Popular tags">
          {popularTags.map(([tag, count]) => (
            <button key={tag} type="button" onClick={() => pickTag(tag)}>
              {tag}<span>{count}</span>
            </button>
          ))}
        </section>

        <MasonryGallery
          activeItem={activeItem}
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
      </main>

      <Inspector
        allItems={items}
        favorite={activeFavorite}
        item={activeItem}
        onAddUserTag={addUserTag}
        onClose={() => setActiveItem(null)}
        onCopy={copyPrompt}
        onOpenLightbox={() => setLightboxItem(activeItem)}
        onRemoveUserTag={removeUserTag}
        onSelect={setActiveItem}
        onToggleFavorite={toggleFavorite}
        userTags={activeItem ? userTagsByItem[itemKey(activeItem)] || activeItem.user_tags || [] : []}
        userTagsByItem={userTagsByItem}
      />

      <MobileDock
        favoriteCount={favorites.length}
        onFavorites={() => setMobilePanel("favorites")}
        onFilters={() => setMobilePanel("filters")}
        onImport={() => importInputRef.current?.click()}
        onRandom={openRandomItem}
      />

      <MobileSheet open={mobilePanel === "filters"} title="Filters" onClose={() => setMobilePanel(null)}>
        <div className="mobile-filter-list">
          {CATEGORIES.map((item) => (
            <button className={category === item && !showFavoritesOnly ? "active" : ""} key={item} type="button" onClick={() => pickCategory(item)}>
              {item}
            </button>
          ))}
          <button className={showFavoritesOnly ? "active" : ""} type="button" onClick={() => setShowFavoritesOnly((current) => !current)}>
            Favorites only
          </button>
        </div>
      </MobileSheet>

      <MobileSheet open={mobilePanel === "favorites"} title="Favorites" onClose={() => setMobilePanel(null)}>
        <div className="mobile-favorites">
          {favoriteItems.length ? favoriteItems.map((item) => (
            <button key={itemKey(item)} type="button" onClick={() => { setActiveItem(item); setMobilePanel(null); }}>
              <img src={item.thumb_url || item.image_url} alt="" />
              <span>#{item.post_number} · @{item.username}</span>
            </button>
          )) : <p>No favorites yet.</p>}
        </div>
      </MobileSheet>

      <Lightbox item={lightboxItem} items={filteredItems} onClose={() => setLightboxItem(null)} onCopy={copyPrompt} onSelect={setLightboxItem} />
      <Toast message={toast} />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { BackToTop } from "./components/BackToTop";
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
import { LANGUAGE_KEY, categoryLabel, formatMessage, translations } from "./i18n";
import type { Language } from "./i18n";
import type { Category, GalleryItem, SortMode, ThemeMode, ViewMode } from "./types";
import { CATEGORIES, getOriginalTags, hasPrompt, itemKey, normalizePrompt } from "./utils";

const FAVORITES_KEY = "linux-do-gallery:favorites";
const RECENT_SEARCHES_KEY = "linux-do-gallery:recent-searches";
const THEME_KEY = "linux-do-gallery:theme";
const USER_TAGS_KEY = "linux-do-gallery:user-tags";

function normalizeStoredStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, maxItems);
}

function validateFavorites(value: unknown) {
  return normalizeStoredStringList(value, 5000);
}

function validateRecentSearches(value: unknown) {
  return normalizeStoredStringList(value, 8);
}

function validateTheme(value: unknown): ThemeMode {
  return value === "dark" || value === "light" ? value : "light";
}

function validateLanguage(value: unknown): Language {
  return value === "zh" || value === "en" ? value : "en";
}

function validateUserTagsByItem(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string[]>>((result, [key, tags]) => {
    const cleanKey = key.trim();
    const cleanTags = normalizeStoredStringList(tags, 24);
    if (cleanKey && cleanTags.length) result[cleanKey] = cleanTags;
    return result;
  }, {});
}

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
  const [favorites, setFavorites] = useStoredState<string[]>(FAVORITES_KEY, [], validateFavorites);
  const [recentSearches, setRecentSearches] = useStoredState<string[]>(RECENT_SEARCHES_KEY, [], validateRecentSearches);
  const [theme, setTheme] = useStoredState<ThemeMode>(THEME_KEY, "light", validateTheme);
  const [language, setLanguage] = useStoredState<Language>(LANGUAGE_KEY, "en", validateLanguage);
  const [userTagsByItem, setUserTagsByItem] = useStoredState<Record<string, string[]>>(USER_TAGS_KEY, {}, validateUserTagsByItem);
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
  const t = translations[language];

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
      setToast(t.enterSearchFirst);
      return;
    }
    setRecentSearches((current) => [query, ...current.filter((item) => item !== query)].slice(0, 8));
    setToast(t.searchSaved);
  }

  function toggleFavorite(item: GalleryItem) {
    const key = itemKey(item);
    setFavorites((current) => (current.includes(key) ? current.filter((favorite) => favorite !== key) : [key, ...current]));
  }

  async function copyPrompt(item: GalleryItem) {
    if (!hasPrompt(item)) {
      setToast(t.noPromptToCopy);
      return;
    }

    const text = normalizePrompt(item.prompt);
    try {
      await navigator.clipboard.writeText(text);
      setToast(t.promptCopied);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setToast(t.promptCopied);
      } catch {
        setToast(t.copyFailed);
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
    setToast(t.currentResultsExported);
  }

  async function importGalleryFile(file: File | null) {
    if (!file) return;
    const token = window.prompt(t.enterImportToken);
    if (token === null) {
      setToast(t.cancelImport);
      if (importInputRef.current) importInputRef.current.value = "";
      return;
    }

    try {
      const result = await importFile(file, token);
      setToast(formatMessage(t.importedItems, { added: Number(result.added || 0), skipped: Number(result.duplicated || 0) + Number(result.invalid || 0) }));
    } catch (err) {
      setToast(err instanceof SyntaxError ? t.importFailedInvalidJson : t.importFailedServer);
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function openRandomItem() {
    if (!filteredItems.length) {
      setToast(t.noRandomItem);
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
        language={language}
        favoriteCount={favorites.length}
        onCategoryChange={pickCategory}
        onPickRecent={setSearchTerm}
        onToggleFavorites={() => setShowFavoritesOnly((current) => !current)}
        recentSearches={recentSearches}
        showFavoritesOnly={showFavoritesOnly}
        stats={stats}
        t={t}
      />

      <main className="main-stage">
        <CommandBar
          onExport={exportCurrentResults}
          onImport={() => importInputRef.current?.click()}
          onOpenMobileFilters={() => setMobilePanel("filters")}
          onRandom={openRandomItem}
          onSaveSearch={saveCurrentSearch}
          onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          onLanguageToggle={() => setLanguage((current) => (current === "en" ? "zh" : "en"))}
          resultCount={filteredItems.length}
          searchInputRef={searchInputRef}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          setSortMode={setSortMode}
          setViewMode={setViewMode}
          sortMode={sortMode}
          theme={theme}
          language={language}
          t={t}
          viewMode={viewMode}
        />

        <FilterChips
          category={category}
          language={language}
          onClearAll={clearFilters}
          onClearCategory={() => setCategory("All")}
          onClearFavorites={() => setShowFavoritesOnly(false)}
          onClearSearch={() => setSearchTerm("")}
          searchTerm={searchTerm}
          showFavoritesOnly={showFavoritesOnly}
          sortMode={sortMode}
          t={t}
        />

        <section className="quick-tags" aria-label={t.popularTags}>
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
          t={t}
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
        t={t}
        userTags={activeItem ? userTagsByItem[itemKey(activeItem)] || activeItem.user_tags || [] : []}
        userTagsByItem={userTagsByItem}
      />

      <MobileDock
        favoriteCount={favorites.length}
        onFavorites={() => setMobilePanel("favorites")}
        onFilters={() => setMobilePanel("filters")}
        onImport={() => importInputRef.current?.click()}
        onRandom={openRandomItem}
        t={t}
      />

      <MobileSheet open={mobilePanel === "filters"} title={t.filters} onClose={() => setMobilePanel(null)} t={t}>
        <div className="mobile-filter-list">
          {CATEGORIES.map((item) => (
            <button className={category === item && !showFavoritesOnly ? "active" : ""} key={item} type="button" onClick={() => pickCategory(item)}>
              {categoryLabel(language, item)}
            </button>
          ))}
          <button className={showFavoritesOnly ? "active" : ""} type="button" onClick={() => setShowFavoritesOnly((current) => !current)}>
            {t.favoritesOnly}
          </button>
        </div>
      </MobileSheet>

      <MobileSheet open={mobilePanel === "favorites"} title={t.favorites} onClose={() => setMobilePanel(null)} t={t}>
        <div className="mobile-favorites">
          {favoriteItems.length ? favoriteItems.map((item) => (
            <button key={itemKey(item)} type="button" onClick={() => { setActiveItem(item); setMobilePanel(null); }}>
              <img src={item.thumb_url || item.image_url} alt="" />
              <span>#{item.post_number} · @{item.username}</span>
            </button>
          )) : <p>{t.noFavorites}</p>}
        </div>
      </MobileSheet>

      <Lightbox item={lightboxItem} items={filteredItems} onClose={() => setLightboxItem(null)} onCopy={copyPrompt} onSelect={setLightboxItem} t={t} />
      <BackToTop t={t} />
      <Toast message={toast} />
    </div>
  );
}

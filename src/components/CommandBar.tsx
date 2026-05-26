import { FileDown, Grid3X3, Languages, LayoutList, Moon, Search, Shuffle, SlidersHorizontal, SunMedium, Upload } from "lucide-react";
import type { RefObject } from "react";
import type { Language, Translation } from "../i18n";
import type { SortMode, ThemeMode, ViewMode } from "../types";

export function CommandBar({
  onExport,
  onImport,
  onOpenMobileFilters,
  onLanguageToggle,
  onRandom,
  onSaveSearch,
  onThemeToggle,
  resultCount,
  searchInputRef,
  searchTerm,
  setSearchTerm,
  setSortMode,
  setViewMode,
  sortMode,
  language,
  t,
  theme,
  viewMode,
}: {
  onExport: () => void;
  onImport: () => void;
  onOpenMobileFilters: () => void;
  onLanguageToggle: () => void;
  onRandom: () => void;
  onSaveSearch: () => void;
  onThemeToggle: () => void;
  resultCount: number;
  searchInputRef: RefObject<HTMLInputElement>;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  setSortMode: (mode: SortMode) => void;
  setViewMode: (mode: ViewMode) => void;
  sortMode: SortMode;
  language: Language;
  t: Translation;
  theme: ThemeMode;
  viewMode: ViewMode;
}) {
  return (
    <header className="command-bar">
      <div className="command-search">
        <Search size={19} />
        <input
          ref={searchInputRef}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSaveSearch();
          }}
          placeholder={t.searchPlaceholder}
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="command-meta">
        <strong>{resultCount}</strong>
        <span>results</span>
      </div>

      <div className="command-actions">
        <button className="mobile-only" type="button" onClick={onOpenMobileFilters} aria-label="Open filters">
          <SlidersHorizontal size={18} />
        </button>
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label={t.sortOrder}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <div className="view-toggle" aria-label={t.viewMode}>
          <button className={viewMode === "grid" ? "active" : ""} type="button" onClick={() => setViewMode("grid")} aria-label={t.masonryView}>
            <Grid3X3 size={17} />
          </button>
          <button className={viewMode === "list" ? "active" : ""} type="button" onClick={() => setViewMode("list")} aria-label={t.listView}>
            <LayoutList size={17} />
          </button>
        </div>
        <button type="button" onClick={onRandom}><Shuffle size={17} />{t.random}</button>
        <button type="button" onClick={onImport}><Upload size={17} />{t.import}</button>
        <button type="button" onClick={onExport}><FileDown size={17} />{t.export}</button>
        <button className="language-button" type="button" onClick={onLanguageToggle} aria-label="Toggle language">
          <Languages size={17} />{language === "en" ? "ZH" : "EN"}
        </button>
        <button className="icon-button" type="button" onClick={onThemeToggle} aria-label={t.themeToggle}>
          {theme === "dark" ? <SunMedium size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}

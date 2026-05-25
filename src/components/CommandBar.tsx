import { Download, Grid3X3, Import, LayoutList, Moon, Search, Shuffle, SlidersHorizontal, SunMedium } from "lucide-react";
import type { RefObject } from "react";
import type { SortMode, ThemeMode, ViewMode } from "../types";

export function CommandBar({
  onExport,
  onImport,
  onOpenMobileFilters,
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
  theme,
  viewMode,
}: {
  onExport: () => void;
  onImport: () => void;
  onOpenMobileFilters: () => void;
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
          placeholder="Search prompts, creators, tags, floors..."
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
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort order">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <div className="view-toggle" aria-label="View mode">
          <button className={viewMode === "grid" ? "active" : ""} type="button" onClick={() => setViewMode("grid")} aria-label="Masonry view">
            <Grid3X3 size={17} />
          </button>
          <button className={viewMode === "list" ? "active" : ""} type="button" onClick={() => setViewMode("list")} aria-label="List view">
            <LayoutList size={17} />
          </button>
        </div>
        <button type="button" onClick={onRandom}><Shuffle size={17} />Random</button>
        <button type="button" onClick={onImport}><Import size={17} />Import</button>
        <button type="button" onClick={onExport}><Download size={17} />Export</button>
        <button className="icon-button" type="button" onClick={onThemeToggle} aria-label="Toggle theme">
          {theme === "dark" ? <SunMedium size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}

import { X } from "lucide-react";
import type { Language, Translation } from "../i18n";
import { categoryLabel } from "../i18n";
import type { Category, SortMode } from "../types";

export function FilterChips({
  category,
  language,
  onClearAll,
  onClearCategory,
  onClearFavorites,
  onClearSearch,
  searchTerm,
  showFavoritesOnly,
  sortMode,
  t,
}: {
  category: Category;
  language: Language;
  onClearAll: () => void;
  onClearCategory: () => void;
  onClearFavorites: () => void;
  onClearSearch: () => void;
  searchTerm: string;
  showFavoritesOnly: boolean;
  sortMode: SortMode;
  t: Translation;
}) {
  const chips = [
    searchTerm.trim() ? { label: `${t.search}: ${searchTerm.trim()}`, onClear: onClearSearch } : null,
    category !== "All" ? { label: `${t.category}: ${categoryLabel(language, category)}`, onClear: onClearCategory } : null,
    showFavoritesOnly ? { label: t.favoritesOnly, onClear: onClearFavorites } : null,
    { label: sortMode === "newest" ? t.newestFirst : t.oldFirst, onClear: undefined },
  ].filter(Boolean) as { label: string; onClear?: () => void }[];

  return (
    <div className="filter-chips" aria-label={t.activeFilters}>
      {chips.map((chip) => (
        <span key={chip.label}>
          {chip.label}
          {chip.onClear ? (
            <button type="button" onClick={chip.onClear} aria-label={`Remove ${chip.label}`}>
              <X size={13} />
            </button>
          ) : null}
        </span>
      ))}
      {chips.length > 1 ? <button type="button" onClick={onClearAll}>{t.clearFilters}</button> : null}
    </div>
  );
}

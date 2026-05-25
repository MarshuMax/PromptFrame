import { X } from "lucide-react";
import type { Category, SortMode } from "../types";

export function FilterChips({
  category,
  onClearAll,
  onClearCategory,
  onClearFavorites,
  onClearSearch,
  searchTerm,
  showFavoritesOnly,
  sortMode,
}: {
  category: Category;
  onClearAll: () => void;
  onClearCategory: () => void;
  onClearFavorites: () => void;
  onClearSearch: () => void;
  searchTerm: string;
  showFavoritesOnly: boolean;
  sortMode: SortMode;
}) {
  const chips = [
    searchTerm.trim() ? { label: `Search: ${searchTerm.trim()}`, onClear: onClearSearch } : null,
    category !== "All" ? { label: `Category: ${category}`, onClear: onClearCategory } : null,
    showFavoritesOnly ? { label: "Favorites only", onClear: onClearFavorites } : null,
    { label: sortMode === "newest" ? "Newest first" : "Oldest first", onClear: undefined },
  ].filter(Boolean) as { label: string; onClear?: () => void }[];

  return (
    <div className="filter-chips" aria-label="Active filters">
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
      {chips.length > 1 ? <button type="button" onClick={onClearAll}>Clear filters</button> : null}
    </div>
  );
}

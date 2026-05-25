import { useMemo } from "react";
import type { Category, GalleryItem, SortMode } from "../types";
import { computeStats, itemKey, itemSearchText, matchesCategory, topTags } from "../utils";

export function useGalleryFilters({
  category,
  favorites,
  items,
  searchTerm,
  showFavoritesOnly,
  sortMode,
  userTagsByItem,
}: {
  category: Category;
  favorites: string[];
  items: GalleryItem[];
  searchTerm: string;
  showFavoritesOnly: boolean;
  sortMode: SortMode;
  userTagsByItem: Record<string, string[]>;
}) {
  const stats = useMemo(() => computeStats(items), [items]);
  const popularTags = useMemo(() => topTags(items, 10), [items]);
  const favoriteItems = useMemo(() => {
    const favoriteSet = new Set(favorites);
    return items.filter((item) => favoriteSet.has(itemKey(item)));
  }, [favorites, items]);
  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const favoriteSet = new Set(favorites);
    const filtered = items.filter((item) => {
      const key = itemKey(item);
      return (
        (!showFavoritesOnly || favoriteSet.has(key)) &&
        matchesCategory(item, category) &&
        (!query || itemSearchText(item, userTagsByItem[key] || item.user_tags || []).includes(query))
      );
    });

    return filtered.sort((a, b) => {
      const postDelta = sortMode === "newest" ? b.post_number - a.post_number : a.post_number - b.post_number;
      return postDelta || a.image_index - b.image_index;
    });
  }, [category, favorites, items, searchTerm, showFavoritesOnly, sortMode, userTagsByItem]);

  return { favoriteItems, filteredItems, popularTags, stats };
}

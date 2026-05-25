import { Bookmark, Clock3, Grid2X2, Image, Layers, Palette, Sparkles, Users } from "lucide-react";
import type { Category, GalleryStats } from "../types";
import { CATEGORIES } from "../utils";

const categoryIcons = {
  All: Grid2X2,
  Posters: Image,
  Cities: Layers,
  People: Users,
  Illustration: Palette,
  Guofeng: Sparkles,
} satisfies Record<Category, typeof Grid2X2>;

export function Sidebar({
  category,
  favoriteCount,
  onCategoryChange,
  onPickRecent,
  onToggleFavorites,
  recentSearches,
  showFavoritesOnly,
  stats,
}: {
  category: Category;
  favoriteCount: number;
  onCategoryChange: (category: Category) => void;
  onPickRecent: (query: string) => void;
  onToggleFavorites: () => void;
  recentSearches: string[];
  showFavoritesOnly: boolean;
  stats: GalleryStats;
}) {
  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href="/" aria-label="PromptFrame home">
        <span>PF</span>
        <div>
          <strong>PromptFrame</strong>
          <small>Reference OS</small>
        </div>
      </a>

      <section className="sidebar-section">
        <div className="sidebar-title">Library</div>
        <nav className="nav-list" aria-label="Category navigation">
          {CATEGORIES.map((item) => {
            const Icon = categoryIcons[item];
            return (
              <button
                className={category === item && !showFavoritesOnly ? "active" : ""}
                key={item}
                type="button"
                onClick={() => onCategoryChange(item)}
              >
                <Icon size={17} />
                <span>{item}</span>
              </button>
            );
          })}
          <button className={showFavoritesOnly ? "active" : ""} type="button" onClick={onToggleFavorites}>
            <Bookmark size={17} />
            <span>Saved</span>
            <em>{favoriteCount}</em>
          </button>
        </nav>
      </section>

      <section className="sidebar-section stat-stack" aria-label="Library statistics">
        <div className="sidebar-title">Overview</div>
        <div className="mini-stats">
          <span><strong>{stats.images}</strong>Images</span>
          <span><strong>{stats.users}</strong>Creators</span>
          <span><strong>{stats.copyablePrompts}</strong>Prompt</span>
          <span><strong>{stats.multiImagePosts}</strong>Series</span>
        </div>
      </section>

      <section className="sidebar-section recent-section">
        <div className="sidebar-title">Recent</div>
        <div className="recent-searches">
          {recentSearches.length ? (
            recentSearches.slice(0, 7).map((query) => (
              <button key={query} type="button" onClick={() => onPickRecent(query)}>
                <Clock3 size={14} />
                <span>{query}</span>
              </button>
            ))
          ) : (
            <p>Saved searches will appear here.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

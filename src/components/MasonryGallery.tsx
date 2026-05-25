import { AlertCircle, Bookmark, BookmarkCheck, Copy, Image, Loader2, Search } from "lucide-react";
import type { GalleryItem, ViewMode } from "../types";
import { getAllTags, getDisplayTitle, getPromptPreview, itemKey } from "../utils";

export function MasonryGallery({
  activeItem,
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
  activeItem: GalleryItem | null;
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

  if (loading) return <GalleryState icon={Loader2} title="Building library view" text="Loading images and prompts from the local service." spin />;
  if (error) return <GalleryState icon={AlertCircle} title="Failed to load data" text={error} />;
  if (!items.length) return <GalleryState icon={Search} title="No matching results" text="Try another search, category, or favorite filter." />;

  return (
    <section className={`masonry-gallery ${viewMode === "list" ? "list" : ""}`} aria-label="Prompt image library">
      {items.map((item, index) => {
        const key = itemKey(item);
        return (
          <AssetCard
            active={activeItem ? itemKey(activeItem) === key : false}
            favorite={favoriteSet.has(key)}
            item={item}
            key={key}
            offset={index % 5}
            onCopy={onCopy}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            userTags={userTagsByItem[key] || item.user_tags || []}
            viewMode={viewMode}
          />
        );
      })}
    </section>
  );
}

function AssetCard({
  active,
  favorite,
  item,
  offset,
  onCopy,
  onOpen,
  onToggleFavorite,
  userTags,
  viewMode,
}: {
  active: boolean;
  favorite: boolean;
  item: GalleryItem;
  offset: number;
  onCopy: (item: GalleryItem) => void;
  onOpen: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTags: string[];
  viewMode: ViewMode;
}) {
  const tags = getAllTags(item, userTags);
  const ratioClass = viewMode === "list" ? "" : `ratio-${offset}`;

  return (
    <article className={`asset-card ${active ? "active" : ""} ${ratioClass}`} aria-current={active ? "true" : undefined}>
      <button className="asset-thumb" type="button" onClick={() => onOpen(item)} aria-label="View in inspector">
        <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
        <span className="asset-index">#{item.post_number}</span>
        {active ? <span className="asset-current-badge">Viewing</span> : null}
        {favorite ? <span className="asset-favorite"><BookmarkCheck size={15} /></span> : null}
      </button>
      <div className="asset-body">
        <div className="asset-heading">
          <h2>{getDisplayTitle(item)}</h2>
          <span>@{item.username}</span>
        </div>
        <p>{getPromptPreview(item, viewMode === "list" ? 180 : 96)}</p>
        <div className="asset-tags">
          {(tags.length ? tags : ["Inspiration"]).slice(0, viewMode === "list" ? 6 : 4).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="asset-actions">
          <button type="button" onClick={() => onOpen(item)}><Image size={16} />Details</button>
          <button type="button" onClick={() => onCopy(item)} aria-label="Copy prompt"><Copy size={16} /></button>
          <button className={favorite ? "active" : ""} type="button" onClick={() => onToggleFavorite(item)} aria-label={favorite ? "Remove favorite" : "Add favorite"}>
            {favorite ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>
    </article>
  );
}

function GalleryState({ icon: Icon, spin = false, text, title }: { icon: typeof Search; spin?: boolean; text: string; title: string }) {
  return (
    <section className="gallery-state">
      <Icon className={spin ? "spin" : ""} size={30} />
      <strong>{title}</strong>
      <span>{text}</span>
    </section>
  );
}

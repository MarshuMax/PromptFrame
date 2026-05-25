import { AlertCircle, Bookmark, BookmarkCheck, Copy, Image, Loader2, Search } from "lucide-react";
import type { Translation } from "../i18n";
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
  t,
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
  t: Translation;
  userTagsByItem: Record<string, string[]>;
  viewMode: ViewMode;
}) {
  const favoriteSet = new Set(favoriteKeys);

  if (loading) return <GalleryState icon={Loader2} title={t.buildingLibrary} text={t.loadingImages} spin />;
  if (error) return <GalleryState icon={AlertCircle} title={t.failedToLoadData} text={error} />;
  if (!items.length) return <GalleryState icon={Search} title={t.noMatchingResults} text={t.tryAnotherSearch} />;

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
            t={t}
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
  t,
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
  t: Translation;
  userTags: string[];
  viewMode: ViewMode;
}) {
  const tags = getAllTags(item, userTags);
  const ratioClass = viewMode === "list" ? "" : `ratio-${offset}`;

  return (
    <article className={`asset-card ${active ? "active" : ""} ${ratioClass}`} aria-current={active ? "true" : undefined}>
      <button className="asset-thumb" type="button" onClick={() => onOpen(item)} aria-label={t.viewInInspector}>
        <img src={item.thumb_url || item.image_url} alt={getDisplayTitle(item)} loading="lazy" />
        <span className="asset-index">#{item.post_number}</span>
        {active ? <span className="asset-current-badge">{t.viewing}</span> : null}
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
          <button type="button" onClick={() => onOpen(item)}><Image size={16} />{t.details}</button>
          <button type="button" onClick={() => onCopy(item)} aria-label={t.copyPrompt}><Copy size={16} /></button>
          <button className={favorite ? "active" : ""} type="button" onClick={() => onToggleFavorite(item)} aria-label={favorite ? t.removeFavorite : t.addFavorite}>
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

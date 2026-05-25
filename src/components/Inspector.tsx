import { Bookmark, BookmarkCheck, Copy, ExternalLink, Image, Maximize2, Plus, Tag, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GalleryItem } from "../types";
import { getAllTags, getDisplayTitle, getOriginalTags, itemKey, rankRelatedItems } from "../utils";

export function Inspector({
  allItems,
  favorite,
  item,
  onAddUserTag,
  onClose,
  onCopy,
  onOpenLightbox,
  onRemoveUserTag,
  onSelect,
  onToggleFavorite,
  userTags,
  userTagsByItem,
}: {
  allItems: GalleryItem[];
  favorite: boolean;
  item: GalleryItem | null;
  onAddUserTag: (item: GalleryItem, tag: string) => void;
  onClose: () => void;
  onCopy: (item: GalleryItem) => void;
  onOpenLightbox: () => void;
  onRemoveUserTag: (item: GalleryItem, tag: string) => void;
  onSelect: (item: GalleryItem) => void;
  onToggleFavorite: (item: GalleryItem) => void;
  userTags: string[];
  userTagsByItem: Record<string, string[]>;
}) {
  const [newTag, setNewTag] = useState("");
  const [imageSize, setImageSize] = useState("Loading");

  useEffect(() => {
    setNewTag("");
    setImageSize("Loading");
  }, [item]);

  if (!item) {
    return (
      <aside className="inspector empty-inspector">
        <div className="empty-inspector-art"><Image size={28} /></div>
        <h2>Select an item</h2>
        <p>Choose an image from the library to read its prompt, copy content, manage tags, and inspect related inspiration.</p>
      </aside>
    );
  }

  const originalTags = getOriginalTags(item);
  const relatedItems = rankRelatedItems(item, allItems, userTagsByItem, 8);
  const allTags = getAllTags(item, userTags);

  return (
    <aside className="inspector">
      <div className="inspector-toolbar">
        <span>Inspector</span>
        <button type="button" onClick={onClose} aria-label="Close inspector"><X size={18} /></button>
      </div>

      <section className="current-work" aria-label="Current selected item">
        <div className="current-work-label">
          <strong>Current item</strong>
          <span>Prompt below belongs to this image</span>
        </div>
        <button className="inspector-preview" type="button" onClick={onOpenLightbox} aria-label="Open fullscreen preview">
          <img
            src={item.image_url}
            alt={getDisplayTitle(item)}
            onLoad={(event) => setImageSize(`${event.currentTarget.naturalWidth}×${event.currentTarget.naturalHeight}`)}
          />
          <span><Maximize2 size={15} /> Open larger</span>
        </button>
        <div className="current-work-meta">
          <span>#{item.post_number}</span>
          <span>@{item.username}</span>
          <span>Image {item.image_index}</span>
          <span>{imageSize}</span>
        </div>
      </section>

      <div className="inspector-heading">
        <p>#{item.post_number} · Image {item.image_index} · @{item.username}</p>
        <h2>{getDisplayTitle(item)}</h2>
      </div>

      <div className="inspector-actions">
        <button className="primary" type="button" onClick={() => onCopy(item)}><Copy size={17} />Copy Prompt</button>
        <button className={favorite ? "active" : ""} type="button" onClick={() => onToggleFavorite(item)}>
          {favorite ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          {favorite ? "Saved" : "Save"}
        </button>
      </div>

      <section className="prompt-reader">
        <div className="section-title"><strong>Prompt for this image</strong><span>{item.prompt === "\u672a\u63d0\u4f9b" ? "empty" : "copyable"}</span></div>
        <div>{item.prompt || "Not provided"}</div>
      </section>

      <section className="metadata-grid">
        <span><strong>Size</strong>{imageSize}</span>
        <span><strong>Creator</strong>@{item.username}</span>
        <span><strong>Floor</strong>#{item.post_number}</span>
        <span><strong>Tags</strong>{allTags.length}</span>
      </section>

      <div className="external-links">
        <a href={item.post_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Source post</a>
        <a href={item.image_url} target="_blank" rel="noopener noreferrer"><Image size={16} />Original image</a>
      </div>

      <section className="inspector-section">
        <div className="section-title"><strong><Tag size={16} />Tags</strong></div>
        <div className="inspector-tags">
          {(originalTags.length ? originalTags : ["Inspiration"]).map((tag) => <span key={tag}>{tag}</span>)}
          {userTags.map((tag) => (
            <span className="user-tag" key={tag}>{tag}<button type="button" onClick={() => onRemoveUserTag(item, tag)} aria-label={`Remove ${tag}`}><X size={12} /></button></span>
          ))}
        </div>
        <form className="tag-editor" onSubmit={(event) => { event.preventDefault(); onAddUserTag(item, newTag); setNewTag(""); }}>
          <input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Add my tag" maxLength={18} />
          <button type="submit"><Plus size={16} />Add</button>
        </form>
      </section>

      <section className="inspector-section">
        <div className="section-title"><strong>Related works</strong></div>
        <div className="related-stack">
          {relatedItems.length ? relatedItems.map(({ item: related, reasons }) => (
            <button key={itemKey(related)} type="button" onClick={() => onSelect(related)}>
              <img src={related.thumb_url || related.image_url} alt={getDisplayTitle(related)} loading="lazy" />
              <span><strong>{getDisplayTitle(related)}</strong><small>{reasons.join(" / ") || "Related work"}</small></span>
            </button>
          )) : <p className="muted">No related works yet.</p>}
        </div>
      </section>
    </aside>
  );
}

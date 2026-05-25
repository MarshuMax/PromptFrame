import { ChevronLeft, ChevronRight, Copy, ExternalLink, X } from "lucide-react";
import type { Translation } from "../i18n";
import type { GalleryItem } from "../types";
import { getDisplayTitle, itemKey } from "../utils";

export function Lightbox({
  item,
  items,
  onClose,
  onCopy,
  onSelect,
  t,
}: {
  item: GalleryItem | null;
  items: GalleryItem[];
  onClose: () => void;
  onCopy: (item: GalleryItem) => void;
  onSelect: (item: GalleryItem) => void;
  t: Translation;
}) {
  if (!item) return null;

  const index = items.findIndex((candidate) => itemKey(candidate) === itemKey(item));
  const previousItem = index > 0 ? items[index - 1] : null;
  const nextItem = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  return (
    <div className="lightbox-backdrop" role="presentation" onClick={onClose}>
      <section className="lightbox" role="dialog" aria-modal="true" aria-label={t.fullscreenPreview} onClick={(event) => event.stopPropagation()}>
        <header className="lightbox-header">
          <div>
            <span>#{item.post_number} · @{item.username}</span>
            <strong>{getDisplayTitle(item)}</strong>
          </div>
          <nav>
            <button type="button" onClick={() => onCopy(item)}><Copy size={17} />{t.copy}</button>
            <a href={item.image_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />{t.original}</a>
            <button type="button" onClick={onClose} aria-label={t.closePreview}><X size={20} /></button>
          </nav>
        </header>
        <div className="lightbox-stage">
          {previousItem ? <button className="lightbox-nav prev" type="button" onClick={() => onSelect(previousItem)} aria-label={t.previousImage}><ChevronLeft size={28} /></button> : null}
          <img src={item.image_url} alt={getDisplayTitle(item)} />
          {nextItem ? <button className="lightbox-nav next" type="button" onClick={() => onSelect(nextItem)} aria-label={t.nextImage}><ChevronRight size={28} /></button> : null}
        </div>
      </section>
    </div>
  );
}

import { Bookmark, Import, Shuffle, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Translation } from "../i18n";

export function MobileDock({
  favoriteCount,
  onFavorites,
  onFilters,
  onImport,
  onRandom,
  t,
}: {
  favoriteCount: number;
  onFavorites: () => void;
  onFilters: () => void;
  onImport: () => void;
  onRandom: () => void;
  t: Translation;
}) {
  return (
    <nav className="mobile-dock" aria-label={t.mobileQuickActions}>
      <button type="button" onClick={onFilters}><SlidersHorizontal size={20} />{t.filters}</button>
      <button type="button" onClick={onRandom}><Shuffle size={20} />{t.random}</button>
      <button type="button" onClick={onImport}><Import size={20} />{t.import}</button>
      <button type="button" onClick={onFavorites}><Bookmark size={20} />{t.saved} {favoriteCount}</button>
    </nav>
  );
}

export function MobileSheet({ children, onClose, open, title, t }: { children: ReactNode; onClose: () => void; open: boolean; title: string; t: Translation }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.close}><X size={22} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

import { Bookmark, Import, Shuffle, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

export function MobileDock({
  favoriteCount,
  onFavorites,
  onFilters,
  onImport,
  onRandom,
}: {
  favoriteCount: number;
  onFavorites: () => void;
  onFilters: () => void;
  onImport: () => void;
  onRandom: () => void;
}) {
  return (
    <nav className="mobile-dock" aria-label="Mobile quick actions">
      <button type="button" onClick={onFilters}><SlidersHorizontal size={20} />Filters</button>
      <button type="button" onClick={onRandom}><Shuffle size={20} />Random</button>
      <button type="button" onClick={onImport}><Import size={20} />Import</button>
      <button type="button" onClick={onFavorites}><Bookmark size={20} />Saved {favoriteCount}</button>
    </nav>
  );
}

export function MobileSheet({ children, onClose, open, title }: { children: ReactNode; onClose: () => void; open: boolean; title: string }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

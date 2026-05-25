import { useEffect } from "react";

export function useKeyboardShortcuts(shortcuts: {
  onEscape?: () => void;
  onFocusSearch?: () => void;
  onToggleFavorite?: () => void;
  onOpenLightbox?: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        shortcuts.onFocusSearch?.();
        return;
      }

      if (event.key === "Escape") shortcuts.onEscape?.();
      if (!typing && event.key.toLowerCase() === "f") shortcuts.onToggleFavorite?.();
      if (!typing && (event.key === "Enter" || event.key.toLowerCase() === "v")) shortcuts.onOpenLightbox?.();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}

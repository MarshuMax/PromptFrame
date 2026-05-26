import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { Translation } from "../i18n";

type BackToTopProps = {
  t: Translation;
};

export function BackToTop({ t }: BackToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 120);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button className={`back-to-top${visible ? " show" : ""}`} type="button" onClick={scrollToTop} aria-label={t.backToTop} title={t.backToTop}>
      <ArrowUp size={20} />
      <span>{t.backToTop}</span>
    </button>
  );
}

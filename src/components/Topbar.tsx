import { Menu, ChevronRight, Globe } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface TopbarProps {
  onToggleSidebar: () => void;
}

const PAGE_NAMES: Record<string, Record<"en" | "es", string>> = {
  "/":         { en: "Dashboard",  es: "Dashboard" },
  "/projects": { en: "Projects",   es: "Proyectos" },
  "/finance":  { en: "Finance",    es: "Pagos" },
  "/metrics":  { en: "Metrics",    es: "Métricas" },
  "/studio":   { en: "AI Studio",  es: "AI Studio" },
  "/settings": { en: "Settings",   es: "Ajustes" },
  "/contacts": { en: "Contacts",   es: "Contactos" },
};

export const Topbar = ({ onToggleSidebar }: TopbarProps) => {
  const location = useLocation();
  const { lang, setLang } = useLanguage();

  const pageName =
    PAGE_NAMES[location.pathname]?.[lang] ??
    (location.pathname.replace("/", "").replace(/-/g, " ") || "Dashboard");

  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4 sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground font-medium">NEBU</span>
          <ChevronRight size={14} className="text-muted-foreground" />
          <span className="font-semibold text-foreground">{pageName}</span>
        </nav>
      </div>

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === "en" ? "es" : "en")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Toggle language"
      >
        <Globe size={14} />
        <span className="uppercase">{lang}</span>
      </button>
    </header>
  );
};

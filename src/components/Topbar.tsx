import { Menu, ChevronRight, Globe } from "lucide-react";
import type { Page } from "./AppSidebar";
import { useLanguage } from "@/contexts/LanguageContext";

interface TopbarProps {
  onToggleSidebar: () => void;
  activePage: Page;
}

const pageLabels: Record<Page, Record<"es" | "en", string>> = {
  dashboard: { es: "Dashboard", en: "Dashboard" },
  proyectos: { es: "Proyectos", en: "Projects" },
  pagos: { es: "Pagos", en: "Payments" },
  metricas: { es: "Metricas", en: "Metrics" },
  "ai-studio": { es: "AI Studio", en: "AI Studio" },
  settings: { es: "Ajustes", en: "Settings" },
};

const Topbar = ({ onToggleSidebar, activePage }: TopbarProps) => {
  const { lang, toggleLang } = useLanguage();
  return (
    <header className="h-14 flex items-center justify-between px-6 z-50 shrink-0 bg-background border-b border-border">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded transition-opacity hover:opacity-80"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} className="text-foreground" />
        </button>
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">NEBU</span>
          <ChevronRight size={14} className="text-muted-foreground" />
          <span className="font-semibold text-foreground">
            {pageLabels[activePage]?.[lang] || activePage}
          </span>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-card border border-border text-foreground hover:border-primary transition-colors"
        >
          <Globe size={13} className="text-muted-foreground" />
          {lang === "es" ? "EN" : "ES"}
        </button>
      </div>
    </header>
  );
};

export default Topbar;)}}
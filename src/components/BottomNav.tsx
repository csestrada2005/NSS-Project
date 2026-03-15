import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderOpen, CreditCard, BarChart3, Bot } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const navItems = [
  {
    id: "dashboard",
    label: { es: "Dashboard", en: "Dashboard" },
    icon: LayoutDashboard,
    path: "/",
  },
  {
    id: "proyectos",
    label: { es: "Proyectos", en: "Projects" },
    icon: FolderOpen,
    path: "/projects",
  },
  {
    id: "pagos",
    label: { es: "Pagos", en: "Payments" },
    icon: CreditCard,
    path: "/finance",
  },
  {
    id: "metricas",
    label: { es: "Métricas", en: "Metrics" },
    icon: BarChart3,
    path: "/metrics",
  },
  {
    id: "ai-studio",
    label: { es: "AI Studio", en: "AI Studio" },
    icon: Bot,
    path: "/ai-studio",
  },
];

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguage();

  return (
    <nav className="lg:hidden h-16 border-t border-border bg-background flex items-center justify-around px-2">
      {navItems.map((item) => {
        const isActive =
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon size={20} strokeWidth={1.5} />
            <span className="text-[10px] font-medium">{item.label[lang]}</span>
          </button>
        );
      })}
    </nav>
  );
};

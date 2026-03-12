import { LayoutDashboard, FolderOpen, CreditCard, BarChart3, Bot, Settings, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth, type Role } from "@/contexts/AuthContext";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type Page = "dashboard" | "proyectos" | "pagos" | "metricas" | "ai-studio" | "settings";

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  id: Page;
  label: Record<"es" | "en", string>;
  icon: React.ElementType;
  badge?: string;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: { es: "Dashboard", en: "Dashboard" }, icon: LayoutDashboard },
  { id: "proyectos", label: { es: "Proyectos", en: "Projects" }, icon: FolderOpen },
  { id: "pagos", label: { es: "Pagos", en: "Payments" }, icon: CreditCard },
  { id: "metricas", label: { es: "Métricas", en: "Metrics" }, icon: BarChart3 },
  { id: "ai-studio", label: { es: "AI Studio", en: "AI Studio" }, icon: Bot, badge: "AI" },
  { id: "settings", label: { es: "Ajustes", en: "Settings" }, icon: Settings },
];

const ROLE_LABELS: Record<Role, Record<"es" | "en", string>> = {
  admin: { es: "Admin", en: "Admin" },
  vendedor: { es: "Vendedor", en: "Sales" },
  dev: { es: "Dev", en: "Dev" },
  cliente: { es: "Cliente", en: "Client" },
};

const routeMapping: Record<Page, string> = {
  dashboard: "/",
  proyectos: "/projects",
  pagos: "/finance",
  metricas: "/metrics",
  "ai-studio": "/ai-studio",
  settings: "/settings",
};

const AppSidebar = ({ open, onClose }: AppSidebarProps) => {
  const { lang } = useLanguage();
  const { role, setRole, hasAccess, setIsLoggedIn } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const sidebarWidth = collapsed ? 64 : 220;

  const visibleItems = navItems.filter((item) => hasAccess(item.id));

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={onClose} />}
      <aside
        className={`fixed lg:static top-0 left-0 z-50 h-full flex flex-col transition-all duration-200 ease-in-out ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ width: sidebarWidth, backgroundColor: "hsl(var(--sidebar-background))", borderRight: "1px solid hsl(var(--border))" }}
      >
        {/* Logo + collapse */}
        <div className="h-14 flex items-center justify-between px-4 shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-foreground">
              NEBU
            </span>
          )}
          {collapsed && (
            <span className="text-lg font-bold tracking-tight text-foreground mx-auto">
              N
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Role selector (dev/demo) */}
        {!collapsed && (
          <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
            <label className="text-[9px] font-medium uppercase tracking-widest block mb-1 text-muted-foreground">
              {lang === "es" ? "Vista como" : "View as"}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-2 py-1.5 rounded-md text-xs outline-none bg-secondary text-secondary-foreground border border-border"
            >
              {(["admin", "vendedor", "dev", "cliente"] as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r][lang]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1">
          {visibleItems.map((item) => {
            const path = routeMapping[item.id];
            const active = location.pathname === path || (path !== "/" && location.pathname.startsWith(path));
            return (
              <button
                key={item.id}
                onClick={() => { navigate(path); onClose(); }}
                className={`w-full flex items-center gap-3 rounded-lg text-[13px] transition-all duration-150 group ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"} ${active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                title={collapsed ? item.label[lang] : undefined}
              >
                <item.icon size={18} strokeWidth={active ? 2 : 1.5} />
                {!collapsed && <span>{item.label[lang]}</span>}
                {!collapsed && item.badge && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 shrink-0 space-y-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
          {!collapsed ? (
            <>
              <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-primary/10 text-primary">
                  U
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-foreground">{lang === "es" ? "Usuario" : "User"}</p>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {ROLE_LABELS[role][lang]}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsLoggedIn(false)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <LogOut size={14} />
                {lang === "es" ? "Cerrar sesión" : "Log out"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsLoggedIn(false)}
              className="w-full flex items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-primary transition-colors"
              title={lang === "es" ? "Cerrar sesión" : "Log out"}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default AppSidebar;

import { LayoutDashboard, FolderOpen, CreditCard, BarChart3, Bot, Settings } from "lucide-react";
import type { Page } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";

interface BottomNavProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const items: { id: Page; icon: React.ElementType }[] = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "proyectos", icon: FolderOpen },
  { id: "pagos", icon: CreditCard },
  { id: "metricas", icon: BarChart3 },
  { id: "ai-studio", icon: Bot },
  { id: "settings", icon: Settings },
];

const BottomNav = ({ activePage, onNavigate }: BottomNavProps) => {
  const { hasAccess } = useAuth();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-14 lg:hidden bg-background border-t border-border">
      {items.filter(item => hasAccess(item.id)).map((item) => {
        const active = activePage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
          >
            <item.icon size={20} strokeWidth={active ? 2 : 1.5} />
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;)})})}]}
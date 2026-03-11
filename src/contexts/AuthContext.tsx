import { createContext, useContext, useState, ReactNode } from "react";
import type { Page } from "@/components/AppSidebar";

export type Role = "admin" | "vendedor" | "dev" | "cliente";

interface AuthContextType {
  role: Role;
  setRole: (role: Role) => void;
  hasAccess: (page: Page) => boolean;
  isLoggedIn: boolean;
  setIsLoggedIn: (v: boolean) => void;
}

const ACCESS_MAP: Record<Role, Page[]> = {
  admin: ["dashboard", "proyectos", "pagos", "metricas", "ai-studio", "settings"],
  vendedor: ["dashboard", "proyectos", "pagos", "metricas", "ai-studio"],
  dev: ["dashboard", "proyectos", "ai-studio", "settings"],
  cliente: ["dashboard", "proyectos"],
};

const AuthContext = createContext<AuthContextType>({
  role: "admin",
  setRole: () => {},
  hasAccess: () => true,
  isLoggedIn: false,
  setIsLoggedIn: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<Role>("admin");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const hasAccess = (page: Page): boolean => {
    return ACCESS_MAP[role]?.includes(page) ?? false;
  };
  return (
    <AuthContext.Provider value={{ role, setRole, hasAccess, isLoggedIn, setIsLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Briefcase, DollarSign, Clock, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getAdminKPIs, getRecentSignups, getActiveProjects } from "@/services/data/supabaseData";
import type { AdminKPIs, Profile, Project } from "@/types";

const STATUS_COLORS: Record<Project["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-blue-500/10 text-blue-500",
  paused: "bg-amber-500/10 text-amber-500",
  cancelled: "bg-rose-500/10 text-rose-500",
};

const STATUS_LABELS: Record<Project["status"], { es: string; en: string }> = {
  active: { es: "Activo", en: "Active" },
  completed: { es: "Completado", en: "Completed" },
  paused: { es: "Pausado", en: "Paused" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
};

const ROLE_LABELS: Record<string, { es: string; en: string }> = {
  admin: { es: "Admin", en: "Admin" },
  dev: { es: "Dev", en: "Dev" },
  vendedor: { es: "Vendedor", en: "Sales" },
  cliente: { es: "Cliente", en: "Client" },
};

const formatCurrency = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

const DEFAULT_KPIS: AdminKPIs = {
  totalUsers: 0,
  activeProjects: 0,
  monthlyRevenue: 0,
  pendingPayments: 0,
};

const AdminDashboard = () => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<AdminKPIs>(DEFAULT_KPIS);
  const [recentSignups, setRecentSignups] = useState<Profile[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [kpiData, signups, projects] = await Promise.all([
          getAdminKPIs(),
          getRecentSignups(),
          getActiveProjects(),
        ]);
        if (!cancelled) {
          setKpis(kpiData);
          setRecentSignups(signups);
          setActiveProjects(projects);
        }
      } catch (err) {
        console.error("Admin dashboard fetch failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpiCards = [
    {
      label: { es: "Total usuarios", en: "Total users" },
      value: String(kpis.totalUsers),
      icon: Users,
    },
    {
      label: { es: "Proyectos activos", en: "Active projects" },
      value: String(kpis.activeProjects),
      icon: Briefcase,
    },
    {
      label: { es: "Ingresos del mes", en: "Monthly revenue" },
      value: formatCurrency(kpis.monthlyRevenue, lang),
      icon: DollarSign,
    },
    {
      label: { es: "Pagos pendientes", en: "Pending payments" },
      value: formatCurrency(kpis.pendingPayments, lang),
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {lang === "es" ? "Panel de Administración" : "Admin Dashboard"}
        </h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          {lang === "es"
            ? "Vista global del sistema"
            : "System-wide overview"}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label.es}
            className="rounded-xl p-5 bg-card border border-border group hover:border-primary/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {kpi.label[lang]}
              </span>
              <kpi.icon
                size={15}
                strokeWidth={1.5}
                className="text-muted-foreground group-hover:text-primary transition-colors"
              />
            </div>
            {isLoading ? (
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signups */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Registros recientes" : "Recent signups"}
            </h2>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : recentSignups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {lang === "es" ? "Sin registros aún" : "No signups yet"}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">
                      {lang === "es" ? "Nombre" : "Name"}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {lang === "es" ? "Rol" : "Role"}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {lang === "es" ? "Fecha" : "Date"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentSignups.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {p.full_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {ROLE_LABELS[p.role]?.[lang] ?? p.role}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString(
                          lang === "es" ? "es-MX" : "en-US",
                          { day: "numeric", month: "short", year: "numeric" }
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Active projects */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Proyectos activos" : "Active projects"}
            </h2>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {lang === "es" ? "Sin proyectos activos" : "No active projects"}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activeProjects.map((project) => (
                  <li
                    key={project.id}
                    onClick={() => navigate('/projects')}
                    className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {project.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(project.created_at).toLocaleDateString(
                          lang === "es" ? "es-MX" : "en-US",
                          { day: "numeric", month: "short", year: "numeric" }
                        )}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[project.status]}`}
                    >
                      {STATUS_LABELS[project.status][lang]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

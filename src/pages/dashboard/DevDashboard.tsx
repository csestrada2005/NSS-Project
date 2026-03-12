import { useState, useEffect } from "react";
import {
  Briefcase,
  DollarSign,
  Clock,
  Users,
  FolderOpen,
  ListChecks,
  Activity,
  Bot,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/EmptyState";
import { getRecentProjects, getDashboardKPIs } from "@/services/data/supabaseData";
import type { Project, DashboardKPIs } from "@/types";

const STATUS_LABELS: Record<Project["status"], { es: string; en: string }> = {
  active: { es: "Activo", en: "Active" },
  completed: { es: "Completado", en: "Completed" },
  paused: { es: "Pausado", en: "Paused" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
};

const STATUS_COLORS: Record<Project["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-blue-500/10 text-blue-500",
  paused: "bg-amber-500/10 text-amber-500",
  cancelled: "bg-rose-500/10 text-rose-500",
};

const formatCurrency = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

const DEFAULT_KPIS: DashboardKPIs = {
  activeProjects: 0,
  monthlyRevenue: 0,
  pendingPayments: 0,
  pipelineLeads: 0,
};

const DevDashboard = () => {
  const { lang } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<DashboardKPIs>(DEFAULT_KPIS);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [kpiData, projectsData] = await Promise.all([
          getDashboardKPIs(),
          getRecentProjects(),
        ]);
        if (!cancelled) {
          setKpis(kpiData);
          setRecentProjects(projectsData);
        }
      } catch (err) {
        console.error("Dashboard data fetch failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    lang === "es"
      ? hour < 12
        ? "Buenos días"
        : hour < 18
          ? "Buenas tardes"
          : "Buenas noches"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";

  const dateStr = now.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const kpiCards = [
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
    {
      label: { es: "Leads en pipeline", en: "Pipeline leads" },
      value: String(kpis.pipelineLeads),
      icon: Users,
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{greeting} 👋</h1>
        <p className="text-sm mt-0.5 text-muted-foreground capitalize">
          {dateStr}
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

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent projects — 2 cols */}
        <div className="lg:col-span-2 rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Proyectos recientes" : "Recent projects"}
            </h2>
            <button className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              {lang === "es" ? "Ver todos" : "View all"}{" "}
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : recentProjects.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title={{ es: "Sin proyectos aún", en: "No projects yet" }}
                subtitle={{
                  es: "Crea tu primer proyecto para verlo aquí.",
                  en: "Create your first project to see it here.",
                }}
              />
            ) : (
              <ul className="divide-y divide-border">
                {recentProjects.map((project) => (
                  <li
                    key={project.id}
                    className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors"
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

        {/* NOVY card */}
        <div className="rounded-xl bg-card border border-border p-5 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10">
              <Bot size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">NOVY</h3>
              <p className="text-[11px] text-muted-foreground">
                {lang === "es" ? "Tu asistente IA" : "Your AI assistant"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4 flex-1">
            {lang === "es"
              ? "Pregúntale por el estado de tus proyectos, genera cotizaciones o redacta mensajes."
              : "Ask about your project status, generate quotes or draft messages."}
          </p>
          <button className="w-full py-2.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex items-center justify-center gap-2">
            <Bot size={14} />
            {lang === "es" ? "Abrir AI Studio" : "Open AI Studio"}
          </button>
        </div>
      </div>

      {/* Bottom sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Next steps */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Próximos pasos" : "Next steps"}
            </h2>
          </div>
          <div className="p-2">
            <EmptyState
              icon={ListChecks}
              title={{ es: "Sin tareas pendientes", en: "No pending tasks" }}
              subtitle={{
                es: "Tus próximos pasos aparecerán aquí.",
                en: "Your next steps will appear here.",
              }}
            />
          </div>
        </div>

        {/* Activity */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Actividad reciente" : "Recent activity"}
            </h2>
          </div>
          <div className="p-2">
            <EmptyState
              icon={Activity}
              title={{ es: "Sin actividad aún", en: "No activity yet" }}
              subtitle={{
                es: "Tu timeline de actividad aparecerá aquí.",
                en: "Your activity timeline will appear here.",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevDashboard;

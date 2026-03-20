import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Code,
  Globe,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import EmptyState from "@/components/EmptyState";
import { getRecentProjects, getDashboardKPIs } from "@/services/data/supabaseData";
import { SupabaseService } from "@/services/SupabaseService";
import type { Project, DashboardKPIs } from "@/types";

interface ForgeProject {
  id: string;
  name: string;
  updated_at: string;
  deployment_url: string | null;
  ai_call_count: number;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<DashboardKPIs>(DEFAULT_KPIS);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [forgeProjects, setForgeProjects] = useState<ForgeProject[]>([]);
  const [forgeLoading, setForgeLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 8000);
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
      clearTimeout(safetyTimer);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const safetyTimerForge = setTimeout(() => {
      if (!cancelled) setForgeLoading(false);
    }, 8000);
    const loadForge = async () => {
      setForgeLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data } = await supabase
          .from('forge_projects')
          .select('id, name, updated_at, deployment_url, ai_call_count')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(3);
        if (!cancelled && data) setForgeProjects(data as ForgeProject[]);
      } catch (err) {
        console.error('Forge projects fetch failed:', err);
      } finally {
        if (!cancelled) setForgeLoading(false);
      }
    };
    loadForge();
    return () => { cancelled = true; clearTimeout(safetyTimerForge); };
  }, [user?.id]);

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
              <Loader2 size={20} className="animate-spin text-primary" />
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
            <button onClick={() => navigate('/projects')} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              {lang === "es" ? "Ver todos" : "View all"}{" "}
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-primary" />
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

        {/* NOVY & Wyrd Forge cards stack */}
        <div className="flex flex-col gap-6">
          {/* Wyrd Forge card */}
          <div className="rounded-xl bg-card border border-border p-5 flex flex-col flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-500/10">
                <Code size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Wyrd Forge</h3>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "es" ? "Web Builder" : "Web Builder"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4 flex-1">
              {lang === "es"
                ? "Construye sitios web funcionales con la ayuda de IA."
                : "Build functional websites with the help of AI."}
            </p>
            <button onClick={() => navigate('/forge')} className="w-full py-2.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2">
              <Code size={14} />
              {lang === "es" ? "Abrir Wyrd Forge" : "Open Wyrd Forge"}
            </button>
          </div>

          {/* NOVY card */}
          <div className="rounded-xl bg-card border border-border p-5 flex flex-col flex-1">
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
            <button onClick={() => navigate('/ai-studio')} className="w-full py-2.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex items-center justify-center gap-2">
              <Bot size={14} />
              {lang === "es" ? "Abrir AI Studio" : "Open AI Studio"}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Forge Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Code size={16} className="text-red-500" />
            <h2 className="text-base font-semibold text-foreground">
              {lang === "es" ? "Proyectos Forge recientes" : "Recent Forge Projects"}
            </h2>
          </div>
          <button
            onClick={() => navigate('/forge')}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            {lang === "es" ? "Ver todos" : "View all"} <ArrowRight size={12} />
          </button>
        </div>

        {forgeLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : forgeProjects.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-8 flex flex-col items-center gap-3">
            <Code size={32} className="text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground text-center">
              {lang === "es" ? "Aún no tienes proyectos Forge." : "No Forge projects yet."}
            </p>
            <button
              onClick={() => navigate('/forge')}
              className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/15 text-xs font-medium rounded-lg transition-colors"
            >
              {lang === "es" ? "Crear proyecto" : "Create a project"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {forgeProjects.map((fp) => (
              <div
                key={fp.id}
                className="rounded-xl bg-card border border-border p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{fp.name}</p>
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${fp.deployment_url ? 'bg-emerald-500' : 'bg-gray-500'}`}
                    title={fp.deployment_url ? 'Deployed' : 'Not deployed'}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "es" ? "Actualizado" : "Updated"} {relativeTime(fp.updated_at)}
                </p>
                <button
                  onClick={() => navigate(`/studio/${fp.id}`)}
                  className="mt-auto w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/15 text-xs font-medium rounded-lg transition-colors"
                >
                  <Globe size={12} />
                  {lang === "es" ? "Abrir" : "Open"}
                </button>
              </div>
            ))}
          </div>
        )}
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

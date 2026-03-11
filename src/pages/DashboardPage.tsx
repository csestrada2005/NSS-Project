import { Briefcase, DollarSign, Clock, Users, FolderOpen, ListChecks, Activity, Bot, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/EmptyState";

const DashboardPage = () => {
  const { lang } = useLanguage();
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    lang === "es"
      ? hour < 12 ? "Buenos dias" : hour < 18 ? "Buenas tardes" : "Buenas noches"
      : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const dateStr = now.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
});

  const kpis = [
    { label: { es: "Proyectos activos", en: "Active projects" }, value: "0", icon: Briefcase },
    { label: { es: "Ingresos del mes", en: "Monthly revenue" }, value: "$0", icon: DollarSign },
    { label: { es: "Pagos pendientes", en: "Pending payments" }, value: "$0", icon: Clock },
    { label: { es: "Leads en pipeline", en: "Pipeline leads" }, value: "0", icon: Users },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{greeting} </h1>
        <p className="text-sm mt-0.5 text-muted-foreground capitalize">{dateStr}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label.es} className="rounded-xl p-5 bg-card border border-border group hover:border-primary/20 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {kpi.label[lang]}
              </span>
              <kpi.icon size={15} strokeWidth={1.5} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Proyectos recientes" : "Recent projects"}
            </h2>
            <button className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              {lang === "es" ? "Ver todos" : "View all"}
              <ArrowRight size={12} />
            </button>
          </div>
          <div className="p-2">
            <EmptyState
              icon={FolderOpen}
              title={{ es: "Sin proyectos aun", en: "No projects yet" }}
              subtitle={{ es: "Crea tu primer proyecto para verlo aqui.", en: "Create your first project to see it here." }}
            />
          </div>
        </div>
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
              ? "Preguntale por el estado de tus proyectos, genera cotizaciones o redacta mensajes."
              : "Ask about your project status, generate quotes or draft messages."}
          </p>
          <button className="w-full py-2.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex items-center justify-center gap-2">
            <Bot size={14} />
            {lang === "es" ? "Abrir AI Studio" : "Open AI Studio"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Proximos pasos" : "Next steps"}
            </h2>
          </div>
          <div className="p-2">
            <EmptyState
              icon={ListChecks}
              title={{ es: "Sin tareas pendientes", en: "No pending tasks" }}
              subtitle={{ es: "Tus proximos pasos apareceran aqui.", en: "Your next steps will appear here." }}
            />
          </div>
        </div>
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Actividad reciente" : "Recent activity"}
            </h2>
          </div>
          <div className="p-2">
            <EmptyState
              icon={Activity}
              title={{ es: "Sin actividad aun", en: "No activity yet" }}
              subtitle={{ es: "Tu timeline de actividad aparecer aqui.", en: "Your activity timeline will appear here." }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;}))})]})}
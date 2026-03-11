import { useState } from "react";
import { FolderOpen, List, Kanban, Clock, Plus, Search, X, FileText, CheckSquare, Upload, CreditCard, Eye, StickyNote, ArrowLeft, MoreHorizontal } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/EmptyState";

type ViewMode = "list" | "kanban" | "timeline";
type FilterStatus = "all" | "in-progress" | "completed" | "archived";

const KANBAN_COLS = [
  { id: "lead", label: { es: "Lead", en: "Lead" } },
  { id: "propuesta", label: { es: "Propuesta", en: "Proposal" } },
  { id: "en-proceso", label: { es: "En proceso", en: "In progress" } },
  { id: "revision", label: { es: "Revision", en: "Review" } },
  { id: "completado", label: { es: "Completado", en: "Completed" } },
];

const PROJECT_TYPES = [
  { es: "Web", en: "Web" },
  { es: "E-commerce", en: "E-commerce" },
  { es: "Branding", en: "Branding" },
  { es: "Marketing", en: "Marketing" },
  { es: "SEO", en: "SEO" },
];

type DetailTab = "general" | "tareas" | "archivos" | "pagos" | "portal" | "notas";

const DETAIL_TABS: { id: DetailTab; label: Record<"es" | "en", string>; icon: React.ElementType }[] = [
  { id: "general", label: { es: "General", en: "General" }, icon: FileText },
  { id: "tareas", label: { es: "Tareas", en: "Tasks" }, icon: CheckSquare },
  { id: "archivos", label: { es: "Archivos", en: "Files" }, icon: Upload },
  { id: "pagos", label: { es: "Pagos", en: "Payments" }, icon: CreditCard },
  { id: "portal", label: { es: "Portal", en: "Portal" }, icon: Eye },
  { id: "notas", label: { es: "Notas", en: "Notes" }, icon: StickyNote },
];

const ProjectsPage = () => {
  const { lang } = useLanguage();
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("general");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", client: "", type: PROJECT_TYPES[0][lang], value: "", dueDate: "" });

  const filters: { id: FilterStatus; label: Record<"es" | "en", string> }[] = [
    { id: "all", label: { es: "Todos", en: "All" } },
    { id: "in-progress", label: { es: "En progreso", en: "In progress" } },
    { id: "completed", label: { es: "Completados", en: "Completed" } },
    { id: "archived", label: { es: "Archivados", en: "Archived" } },
  ];

  if (selectedProject) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedProject(null)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">{selectedProject}</h1>
            <p className="text-xs text-muted-foreground">{lang === "es" ? "Detalle del proyecto" : "Project detail"}</p>
          </div>
          <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <MoreHorizontal size={18} />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDetailTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs whitespace-nowrap transition-colors ${detailTab === tab.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              <tab.icon size={14} strokeWidth={1.5} />
              {tab.label[lang]}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-card border border-border min-h-[400px]">
          {detailTab === "general" && (
            <EmptyState icon={FileText} title={{ es: "Informacion del proyecto", en: "Project information" }} subtitle={{ es: "Aqui apareceran los detalles del proyecto, cliente, fechas y valor.", en: "Project details, client, dates and value will appear here." }} />
          )}
          {detailTab === "tareas" && (
            <EmptyState icon={CheckSquare} title={{ es: "Sin tareas aun", en: "No tasks yet" }} subtitle={{ es: "Agrega tareas y asigna a tu equipo.", en: "Add tasks and assign to your team." }} ctaLabel={{ es: "+ Nueva tarea", en: "+ New task" }} />
          )}
          {detailTab === "archivos" && (
            <EmptyState icon={Upload} title={{ es: "Sin archivos aun", en: "No files yet" }} subtitle={{ es: "Sube archivos y entregas del proyecto.", en: "Upload files and project deliverables." }} ctaLabel={{ es: "+ Subir archivo", en: "+ Upload file" }} />
          )}
          {detailTab === "pagos" && (
            <EmptyState icon={CreditCard} title={{ es: "Sin pagos registrados", en: "No payments recorded" }} subtitle={{ es: "Aqui veras cotizaciones, pagos recibidos y saldo pendiente.", en: "Here you will see quotes, payments received and pending balance." }} ctaLabel={{ es: "+ Registrar pago", en: "+ Record payment" }} />
          )}
          {detailTab === "portal" && (
            <EmptyState icon={Eye} title={{ es: "Portal del cliente", en: "Client portal" }} subtitle={{ es: "Vista previa de lo que ve tu cliente.", en: "Preview of what your client sees." }} />
          )}
          {detailTab === "notas" && (
            <EmptyState icon={StickyNote} title={{ es: "Sin notas aun", en: "No notes yet" }} subtitle={{ es: "Agrega notas internas para tu equipo.", en: "Add internal notes for your team." }} ctaLabel={{ es: "+ Nueva nota", en: "+ New note" }} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{lang === "es" ? "Proyectos" : "Projects"}</h1>
          <p className="text-sm mt-0.5 text-muted-foreground">
            {lang === "es" ? "Gestiona tus proyectos, entregas y clientes" : "Manage your projects, deliveries and clients"}
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors self-start"
        >
          <Plus size={16} />
          {lang === "es" ? "Nuevo proyecto" : "New project"}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center bg-card border border-border rounded-lg p-0.5">
          {([
            { id: "list" as ViewMode, icon: List, label: lang === "es" ? "Lista" : "List" },
            { id: "kanban" as ViewMode, icon: Kanban, label: "Kanban" },
            { id: "timeline" as ViewMode, icon: Clock, label: "Timeline" },
          ]).map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${view === v.id ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              <v.icon size={14} />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${filter === f.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              {f.label[lang]}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg text-xs bg-card border border-border text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary transition-colors w-full sm:w-48"
            placeholder={lang === "es" ? "Buscar proyecto..." : "Search project..."}
          />
        </div>
      </div>
      {view === "list" && (
        <div className="rounded-xl bg-card border border-border">
          <EmptyState
            icon={FolderOpen}
            title={{ es: "Crea tu primer proyecto", en: "Create your first project" }}
            subtitle={{ es: "Gestiona proyectos, tareas, entregas y pagos desde un solo lugar.", en: "Manage projects, tasks, deliveries and payments from one place." }}
            ctaLabel={{ es: "+ Nuevo proyecto", en: "+ New project" }}
            onCta={() => setShowNewModal(true)}
          />
        </div>
      )}
      {view === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLS.map((col) => (
            <div key={col.id} className="min-w-[260px] w-[260px] shrink-0 rounded-xl bg-card border border-border flex flex-col">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{col.label[lang]}</span>
                <span className="text-[10px] font-medium text-muted-foreground bg-accent px-1.5 py-0.5 rounded-full">0</span>
              </div>
              <div className="flex-1 min-h-[280px] flex items-center justify-center p-4">
                <p className="text-[11px] text-muted-foreground/50 text-center">
                  {lang === "es" ? "Arrastra proyectos aqui" : "Drag projects here"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {view === "timeline" && (
        <div className="rounded-xl bg-card border border-border">
          <EmptyState
            icon={Clock}
            title={{ es: "Timeline vacio", en: "Empty timeline" }}
            subtitle={{ es: "Crea proyectos con fechas de entrega para verlos en el timeline.", en: "Create projects with due dates to see them on the timeline." }}
            ctaLabel={{ es: "+ Nuevo proyecto", en: "+ New project" }}
            onCta={() => setShowNewModal(true)}
          />
        </div>
      )}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewModal(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-card border border-border p-6 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                {lang === "es" ? "Nuevo proyecto" : "New project"}
              </h2>
              <button onClick={() => setShowNewModal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{lang === "es" ? "Nombre del proyecto" : "Project name"}</label>
                <input
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                  placeholder={lang === "es" ? "Ej: Rediseno web Acme" : "e.g. Acme website redesign"}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{lang === "es" ? "Cliente" : "Client"}</label>
                <input
                  value={newProject.client}
                  onChange={(e) => setNewProject({ ...newProject, client: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                  placeholder={lang === "es" ? "Nombre del cliente" : "Client name"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{lang === "es" ? "Tipo" : "Type"}</label>
                  <select
                    value={newProject.type}
                    onChange={(e) => setNewProject({ ...newProject, type: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground outline-none focus:border-primary transition-colors"
                  >
                    {PROJECT_TYPES.map((t) => (<option key={t.es} value={t[lang]}>{t[lang]}</option>))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{lang === "es" ? "Valor ($)" : "Value ($)"}</label>
                  <input
                    type="number"
                    value={newProject.value}
                    onChange={(e) => setNewProject({ ...newProject, value: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{lang === "es" ? "Fecha de entrega" : "Due date"}</label>
                <input
                  type="date"
                  value={newProject.dueDate}
                  onChange={(e) => setNewProject({ ...newProject, dueDate: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg text-sm bg-background border border-border text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowNewModal(false)} className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                {lang === "es" ? "Cancelar" : "Cancel"}
              </button>
              <button onClick={() => setShowNewModal(false)} className="px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                {lang === "es" ? "Guardar" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;)})}))})})}))}))])}))})})})})})}))})}]}]]]
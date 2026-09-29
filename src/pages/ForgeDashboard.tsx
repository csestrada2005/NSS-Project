import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Layers, Flame, Plus, Search, Trash2, LayoutDashboard, Share2, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SupabaseService } from "@/services/SupabaseService";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectMemoryService } from "@/services/ProjectMemoryService";
import { ShareProjectModal } from "@/components/forge/ShareProjectModal";
import CreditBalance from "@/components/forge/CreditBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/EmptyState";
import { LangToggle } from "@/components/forge/LangToggle";
import NewProjectModal from "@/components/forge/NewProjectModal";
import NebuLoader from '../components/brand/NebuLoader';
import { useForgeLang } from "@/i18n/forge/useForgeLang";
import { t as tNow } from "@/i18n/forge/lang";
import { formatRelativeDate } from "@/i18n/forge/format";

interface ForgeProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deployment_url: string | null;
  preview_html: string | null;
}

const ForgeDashboard = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareProject, setShareProject] = useState<ForgeProject | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [projectSummaries, setProjectSummaries] = useState<Map<string, {
    componentCount: number;
    routeCount: number;
    techStack: string[];
  } | null>>(new Map());
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { lang, t, tn } = useForgeLang();

  const supabase = SupabaseService.getInstance().client;

  const loadProjects = async () => {
    if (!user) return;
    setIsLoadingProjects(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("forge_projects")
        .select("id, name, description, created_at, updated_at, deployment_url, preview_html")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (fetchError) throw fetchError;
      if (data) {
        setProjects(data as ForgeProject[]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : tNow('dashboard.loadFailed');
      setError(msg);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setError(tNow('dashboard.notAuthenticated'));
      setIsLoadingProjects(false);
      return;
    }
    loadProjects();
  }, [user, authLoading]);

  useEffect(() => {
    if (projects.length === 0) return;
    Promise.all(
      projects.map(p =>
        ProjectMemoryService.getProjectSummary(p.id).then(summary => ({ id: p.id, summary }))
      )
    ).then(results => {
      const map = new Map(results.map(r => [r.id, r.summary]));
      setProjectSummaries(map);
    });
  }, [projects]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openProject = (project: ForgeProject) => {
    navigate(`/studio/${project.id}`);
  };

  const openHub = (e: React.MouseEvent, project: ForgeProject) => {
    e.stopPropagation();
    navigate(`/projects/${project.id}/hub`);
  };

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!window.confirm(t('dashboard.deleteConfirm'))) return;
    const { error } = await supabase
      .from("forge_projects")
      .delete()
      .eq("id", projectId);
    if (!error) {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    }
  };

  const shareProjectFn = (e: React.MouseEvent, project: ForgeProject) => {
    e.stopPropagation();
    setShareProject(project);
  };

  const formatDate = (iso: string) => formatRelativeDate(iso, lang);

  if (error) {
    return (
      <div className="nebu-modal flex flex-col h-screen bg-background items-center justify-center p-6">
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-5 py-4 text-sm max-w-md w-full text-center">
          <p className="font-semibold mb-1">{t('dashboard.loadFailed')}</p>
          <p>{error}</p>
          <Button
            variant="outline"
            className="mt-4 border-red-500/30 hover:bg-red-500/10 text-red-300"
            onClick={() => {
              setError(null);
              loadProjects();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="nebu-modal flex flex-col h-screen bg-background">
      <AnimatePresence>
        {shareProject && (
          <ShareProjectModal
            projectId={shareProject.id}
            projectName={shareProject.name}
            onClose={() => setShareProject(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewProjectModal && (
          <NewProjectModal
            onClose={() => setShowNewProjectModal(false)}
            onCreated={(projectId, _, initialPrompt, designHints) => {
              setShowNewProjectModal(false);
              navigate(`/studio/${projectId}`, { state: { initialPrompt, designHints } });
            }}
          />
        )}
      </AnimatePresence>

      {/* Top header bar */}
      <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Flame size={20} className="text-primary" />
          <span className="font-bold text-foreground">Wyrd Forge</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {tn('dashboard.projectCount', projects.length)}
          </span>
          <CreditBalance />
          <LangToggle className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors" />
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft size={16} />
            {t('dashboard.backToNebu')}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t('dashboard.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tn('dashboard.projectCount', filteredProjects.length)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('dashboard.searchPlaceholder')}
                className="pl-9 w-56"
              />
            </div>
            <Button
              onClick={() => setShowNewProjectModal(true)}
              size="sm"
              className="nebu-cta"
            >
              <Plus size={16} />
              {t('dashboard.newProject')}
            </Button>
          </div>
        </div>

        {isLoadingProjects ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-5">
            <NebuLoader size={140} />
            <span>{t('dashboard.loading')}</span>
          </div>
        ) : filteredProjects.length === 0 && !searchQuery ? (
          <EmptyState
            icon={Layers}
            title={t('dashboard.empty.title')}
            subtitle={t('dashboard.empty.subtitle')}
            ctaLabel={t('dashboard.newProject')}
            onCta={() => setShowNewProjectModal(true)}
          />
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
            <Layers size={32} className="text-muted-foreground/40" />
            <p className="text-sm">{t('dashboard.noMatches')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, i) => (
              <div
                key={project.id}
                className="nebu-card relative text-left rounded-xl border border-border bg-card overflow-hidden transition-colors duration-200 hover:border-primary group cursor-pointer"
                onClick={() => openProject(project)}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Delete button */}
                <button
                  onClick={(e) => deleteProject(e, project.id)}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-background/80 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  title={t('dashboard.deleteProject')}
                  aria-label={t('dashboard.deleteProject')}
                >
                  <Trash2 size={14} />
                </button>

                {/* Thumbnail — última foto del preview compilado (guardada
                    automáticamente desde StudioEngine.tsx en cada compile
                    exitoso, sin depender de haber publicado el proyecto). */}
                <div className="relative w-full aspect-video bg-muted overflow-hidden border-b border-border">
                  {project.preview_html ? (
                    <iframe
                      srcDoc={project.preview_html}
                      sandbox="allow-scripts"
                      tabIndex={-1}
                      title={t('dashboard.previewOf', { name: project.name })}
                      className="absolute top-0 left-0 origin-top-left pointer-events-none"
                      style={{ width: '400%', height: '400%', transform: 'scale(0.25)' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <Layers size={28} />
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <h3 className="text-sm font-semibold text-foreground truncate pr-8">{project.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dashboard.updated', { when: formatDate(project.updated_at) })}
                  </p>
                  {(() => {
                    const summary = projectSummaries.get(project.id);
                    if (!summary) return <div className="h-4 mt-1" />;
                    return (
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {tn('dashboard.componentCount', summary.componentCount)} · {tn('dashboard.routeCount', summary.routeCount)}
                      </p>
                    );
                  })()}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openProject(project); }}
                      className="flex-1 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                    >
                      {t('dashboard.open')}
                    </button>
                    <button
                      onClick={(e) => openHub(e, project)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-accent text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                    >
                      <LayoutDashboard size={11} />
                      Hub
                    </button>
                    <button
                      onClick={(e) => shareProjectFn(e, project)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-accent text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                      title={t('dashboard.shareProject')}
                      aria-label={t('dashboard.shareProject')}
                    >
                      <Share2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ForgeDashboard;

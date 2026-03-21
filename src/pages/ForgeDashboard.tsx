import { useState, useEffect } from "react";
import { Layers, Flame, Plus, Search, Trash2, Loader2, LayoutDashboard, Share2, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SupabaseService } from "@/services/SupabaseService";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectMemoryService } from "@/services/ProjectMemoryService";
import { ShareProjectModal } from "@/components/forge/ShareProjectModal";
import CreditBalance from "@/components/forge/CreditBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/EmptyState";
import NewProjectModal from "@/components/forge/NewProjectModal";

interface ForgeProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deployment_url: string | null;
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

  const supabase = SupabaseService.getInstance().client;

  const loadProjects = async () => {
    if (!user) return;
    setIsLoadingProjects(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("forge_projects")
        .select("id, name, description, created_at, updated_at, deployment_url")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (fetchError) throw fetchError;
      if (data) {
        setProjects(data as ForgeProject[]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load projects';
      setError(msg);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setError('User not authenticated');
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
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  if (error) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center p-6">
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm max-w-md w-full text-center">
          <p className="font-semibold mb-1">Failed to load projects</p>
          <p>{error}</p>
          <Button
            variant="outline"
            className="mt-4 border-red-700 hover:bg-red-900/40 text-red-300"
            onClick={() => {
              setError(null);
              loadProjects();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {shareProject && (
        <ShareProjectModal
          projectId={shareProject.id}
          projectName={shareProject.name}
          onClose={() => setShareProject(null)}
        />
      )}
      {showNewProjectModal && (
        <NewProjectModal
          onClose={() => setShowNewProjectModal(false)}
          onCreated={(projectId, _, initialPrompt) => {
            setShowNewProjectModal(false);
            navigate(`/studio/${projectId}`, { state: { initialPrompt } });
          }}
        />
      )}

      {/* Top header bar */}
      <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Flame size={20} className="text-primary" />
          <span className="font-bold text-foreground">Wyrd Forge</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
          <CreditBalance />
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft size={16} />
            Back to Nebu
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
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
                placeholder="Search projects..."
                className="pl-9 w-56"
              />
            </div>
            <Button
              onClick={() => setShowNewProjectModal(true)}
              size="sm"
            >
              <Plus size={16} />
              New Project
            </Button>
          </div>
        </div>

        {isLoadingProjects ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground gap-3">
            <Loader2 size={22} className="animate-spin" />
            <span>Loading projects...</span>
          </div>
        ) : filteredProjects.length === 0 && !searchQuery ? (
          <EmptyState
            icon={Layers}
            title={{ en: 'No projects yet', es: 'Sin proyectos aún' }}
            subtitle={{ en: 'Create your first project to start building with AI.', es: 'Crea tu primer proyecto para empezar a construir con IA.' }}
            ctaLabel={{ en: 'New Project', es: 'Nuevo Proyecto' }}
            onCta={() => setShowNewProjectModal(true)}
          />
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
            <Layers size={32} className="text-muted-foreground/40" />
            <p className="text-sm">No projects match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, i) => (
              <div
                key={project.id}
                className="relative text-left rounded-xl border border-border bg-card p-5 transition-colors duration-200 hover:border-primary group cursor-pointer"
                onClick={() => openProject(project)}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Delete button */}
                <button
                  onClick={(e) => deleteProject(e, project.id)}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete project"
                >
                  <Trash2 size={14} />
                </button>

                <h3 className="text-sm font-semibold text-foreground truncate pr-8">{project.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Updated {formatDate(project.updated_at)}
                </p>
                {(() => {
                  const summary = projectSummaries.get(project.id);
                  if (!summary) return <div className="h-4 mt-1" />;
                  return (
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {summary.componentCount} components · {summary.routeCount} routes
                    </p>
                  );
                })()}

                {/* Action buttons */}
                <div className="flex gap-2 mt-4 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openProject(project); }}
                    className="flex-1 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                  >
                    Open
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
                    title="Share project"
                  >
                    <Share2 size={11} />
                  </button>
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

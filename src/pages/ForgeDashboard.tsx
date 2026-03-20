import { useState, useEffect } from "react";
import { Layers, Flame, Plus, Search, Settings, LogOut, Trash2, Loader2, LayoutDashboard, Share2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SupabaseService } from "@/services/SupabaseService";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectMemoryService } from "@/services/ProjectMemoryService";
import { ShareProjectModal } from "@/components/forge/ShareProjectModal";

interface ForgeProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deployment_url: string | null;
}

const ForgeDashboard = () => {
  const [activeTab, setActiveTab] = useState<"projects" | "forge">("projects");
  const [forgeInput, setForgeInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [shareProject, setShareProject] = useState<ForgeProject | null>(null);
  const [projectSummaries, setProjectSummaries] = useState<Map<string, {
    componentCount: number;
    routeCount: number;
    techStack: string[];
  } | null>>(new Map());
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const supabase = SupabaseService.getInstance().client;

  useEffect(() => {
    if (!user) return;
    const fetchProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const { data, error } = await supabase
          .from("forge_projects")
          .select("id, name, description, created_at, updated_at, deployment_url")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        if (!error && data) {
          setProjects(data as ForgeProject[]);
        }
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [user]);

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

  const createAndOpenProject = async (name: string, description?: string) => {
    if (!user) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("forge_projects")
        .insert({ user_id: user.id, name, description: description ?? null })
        .select("id, name")
        .single();
      if (error || !data) throw error;
      navigate(`/studio/${data.id}`);
    } catch (e) {
      console.error("[ForgeDashboard] Failed to create project:", e);
    } finally {
      setIsCreating(false);
    }
  };

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

  const handleNewProject = async () => {
    const name = window.prompt("Project name:");
    if (name?.trim()) {
      await createAndOpenProject(name.trim());
    }
  };

  const handleForge = async () => {
    if (!forgeInput.trim()) return;
    const prompt = forgeInput.trim();
    const projectName = prompt.slice(0, 60);
    if (!user) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("forge_projects")
        .insert({ user_id: user.id, name: projectName, description: null })
        .select("id")
        .single();
      if (error || !data) throw error;
      navigate(`/studio/${data.id}`, { state: { initialPrompt: prompt } });
    } catch (e) {
      console.error("[ForgeDashboard] Failed to create project:", e);
    } finally {
      setIsCreating(false);
    }
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

  return (
    <div className="flex h-screen bg-gray-950">
      {shareProject && (
        <ShareProjectModal
          projectId={shareProject.id}
          projectName={shareProject.name}
          onClose={() => setShareProject(null)}
        />
      )}
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-widest text-red-500 uppercase">
            Wyrd Forge
          </h1>
          <p className="text-xs mt-1 text-gray-500">AI Web Builder</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <button
            onClick={() => setActiveTab("projects")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "projects"
                ? "bg-red-600/15 text-red-500"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Layers size={18} />
            Projects
          </button>
          <button
            onClick={() => setActiveTab("forge")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "forge"
                ? "bg-red-600/15 text-red-500"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Flame size={18} />
            Forge
          </button>
        </nav>

        <div className="p-3 space-y-1 border-t border-gray-800">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <Settings size={18} />
            Settings
          </button>
          <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-950">
        {activeTab === "projects" ? (
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white">Projects</h2>
                <p className="text-sm mt-1 text-gray-400">
                  {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search projects..."
                    className="pl-9 pr-4 py-2 rounded-lg text-sm border border-gray-800 bg-gray-900 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
                <button
                  onClick={handleNewProject}
                  disabled={isCreating}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  New Project
                </button>
              </div>
            </div>

            {isLoadingProjects ? (
              <div className="flex items-center justify-center h-48 text-gray-500 gap-3">
                <Loader2 size={22} className="animate-spin" />
                <span>Loading projects...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-gray-500 gap-3">
                <Layers size={32} className="text-gray-700" />
                <p className="text-sm">
                  {searchQuery
                    ? "No projects match your search."
                    : "No projects yet. Head to the Forge tab to create your first one!"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((project, i) => (
                  <div
                    key={project.id}
                    className="relative text-left rounded-xl border border-gray-800 bg-gray-900 p-4 transition-all duration-200 hover:border-red-500/40 hover:bg-gray-800/80 group cursor-pointer"
                    onClick={() => openProject(project)}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {/* Deployment status dot */}
                    <div
                      className={`absolute top-3 left-3 w-2 h-2 rounded-full ${project.deployment_url ? 'bg-emerald-500' : 'bg-gray-600'}`}
                      title={project.deployment_url ? 'Deployed' : 'Not deployed'}
                    />

                    {/* Delete button */}
                    <button
                      onClick={(e) => deleteProject(e, project.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>

                    <div className="w-full h-24 rounded-lg mb-3 flex items-center justify-center bg-gray-800 group-hover:bg-gray-700 transition-colors">
                      <Layers size={24} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                    </div>

                    <div className="flex items-start justify-between pr-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{project.name}</h3>
                        {project.description && (
                          <p className="text-xs mt-0.5 text-gray-500 truncate">{project.description}</p>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-600 mb-1">
                      Updated {formatDate(project.updated_at)}
                    </p>
                    {(() => {
                      const summary = projectSummaries.get(project.id);
                      if (!summary) return <div className="h-4 mb-3" />; // spacer
                      return (
                        <p className="text-[11px] text-gray-600 font-mono mb-3">
                          {summary.componentCount} components · {summary.routeCount} routes
                        </p>
                      );
                    })()}

                    {/* Action buttons */}
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openProject(project); }}
                        className="flex-1 py-1.5 text-xs font-medium bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={(e) => openHub(e, project)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      >
                        <LayoutDashboard size={11} />
                        Hub
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShareProject(project); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                        title="Share project"
                      >
                        <Share2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Forge View */
          <div className="flex flex-col items-center justify-center h-full px-8">
            <div className="text-center max-w-2xl w-full">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600/10 border border-red-500/20 mb-6">
                <Flame size={32} className="text-red-500" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">
                What are we building today?
              </h2>
              <p className="text-sm mb-8 text-gray-400">
                Describe your vision and let the AI forge it into reality.
              </p>

              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-1 focus-within:border-red-500/50 focus-within:ring-1 focus-within:ring-red-500/30 transition-all duration-300">
                <textarea
                  value={forgeInput}
                  onChange={(e) => setForgeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleForge();
                    }
                  }}
                  placeholder="A landing page for a coffee subscription service with dark theme..."
                  rows={3}
                  className="w-full bg-transparent px-4 py-3 text-sm resize-none focus:outline-none text-white placeholder-gray-600"
                />
                <div className="flex justify-end px-3 pb-2">
                  <button
                    onClick={handleForge}
                    disabled={!forgeInput.trim() || isCreating}
                    className="px-5 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isCreating && <Loader2 size={14} className="animate-spin" />}
                    Forge →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ForgeDashboard;

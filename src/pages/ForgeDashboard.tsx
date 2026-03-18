import { useState } from "react";
import { Layers, Flame, Plus, Search, Settings, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

const mockProjects = [
  { id: "1", name: "Coffee Landing", url: "coffeesub.com", updated: "2 hours ago", status: "Live" },
  { id: "2", name: "Portfolio Site", url: "myportfolio.dev", updated: "1 day ago", status: "Draft" },
  { id: "3", name: "SaaS Dashboard", url: "analytics.io", updated: "3 days ago", status: "Live" },
  { id: "4", name: "E-commerce Store", url: "shopnow.com", updated: "1 week ago", status: "Draft" },
  { id: "5", name: "Blog Platform", url: "devblog.co", updated: "2 weeks ago", status: "Live" },
  { id: "6", name: "Fitness App", url: "fittrack.app", updated: "3 weeks ago", status: "Draft" },
];

const ForgeDashboard = () => {
  const [activeTab, setActiveTab] = useState<"projects" | "forge">("projects");
  const [forgeInput, setForgeInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const filteredProjects = mockProjects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleForge = () => {
    if (forgeInput.trim()) {
      sessionStorage.setItem("studio_initial_prompt", forgeInput.trim());
      navigate("/studio");
    }
  };

  return (
    <div className="flex h-screen bg-gray-950">
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
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
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
                  onClick={() => navigate("/studio")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  <Plus size={16} />
                  New Project
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project, i) => (
                <button
                  key={project.id}
                  onClick={() => navigate("/studio")}
                  className="text-left rounded-xl border border-gray-800 bg-gray-900 p-4 transition-all duration-200 hover:border-red-500/40 hover:scale-[1.02] hover:bg-gray-800/80 group"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="w-full h-32 rounded-lg mb-3 flex items-center justify-center bg-gray-800 group-hover:bg-gray-700 transition-colors">
                    <Layers size={24} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{project.name}</h3>
                      <p className="text-xs mt-0.5 text-gray-500">{project.url}</p>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        project.status === "Live"
                          ? "bg-red-600/15 text-red-400"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <p className="text-[11px] mt-2 text-gray-600">Updated {project.updated}</p>
                </button>
              ))}
            </div>
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
                    disabled={!forgeInput.trim()}
                    className="px-5 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
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

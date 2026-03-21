import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, Code2, Database, Globe, Mail,
  BarChart3, Gauge, Settings, Layers, Loader2, CheckCircle, Circle, Trash2, Sparkles
} from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { DatabaseOverview } from '@/components/settings/db/DatabaseOverview';
import { AIHistoryPanel } from '@/components/settings/AIHistoryPanel';
import { SchemaViewer } from '@/components/settings/db/SchemaViewer';
import { UsersManager } from '@/components/settings/db/UsersManager';
import { SQLEditor } from '@/components/settings/db/SQLEditor';
import { DomainsPanel } from '@/components/settings/DomainsPanel';
import { EmailPanel } from '@/components/settings/EmailPanel';
import { TrafficCharts } from '@/components/settings/analytics/TrafficCharts';
import { LighthousePanel } from '@/components/settings/analytics/LighthousePanel';
import { TopPagesTable } from '@/components/settings/analytics/TopPagesTable';

interface ForgeProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deployment_url: string | null;
  last_deployed_at: string | null;
  last_active_at: string | null;
  ai_call_count: number | null;
  supabase_project_url: string | null;
}

type HubTab = 'overview' | 'database' | 'domains' | 'email' | 'analytics' | 'performance' | 'ai_history' | 'settings';

const HUB_TABS: { id: HubTab; label: string; Icon: React.ComponentType<any> }[] = [
  { id: 'overview', label: 'Overview', Icon: Layers },
  { id: 'database', label: 'Database', Icon: Database },
  { id: 'domains', label: 'Domains', Icon: Globe },
  { id: 'email', label: 'Email', Icon: Mail },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'performance', label: 'Performance', Icon: Gauge },
  { id: 'ai_history', label: 'AI History', Icon: Sparkles },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const DB_SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema', label: 'Schema' },
  { id: 'users', label: 'Users' },
  { id: 'sql', label: 'SQL' },
] as const;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
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
}

export default function ProjectHubPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ForgeProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [dbSubTab, setDbSubTab] = useState<typeof DB_SUB_TABS[number]['id']>('overview');
  const [isDeleting, setIsDeleting] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const [dateRange] = useState(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { start, end };
  });

  useEffect(() => {
    if (!projectId) return;
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setIsLoading(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('forge_projects')
        .select('id, name, description, created_at, updated_at, deployment_url, last_deployed_at, last_active_at, ai_call_count, supabase_project_url')
        .eq('id', projectId)
        .single();
      if (data) {
        setProject(data as ForgeProject);
        setNewName(data.name);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectId || !window.confirm(`Delete "${project?.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase.from('forge_projects').delete().eq('id', projectId);
      navigate('/forge');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveName = async () => {
    if (!projectId || !newName.trim()) return;
    setIsSavingName(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase.from('forge_projects').update({ name: newName.trim() }).eq('id', projectId);
      setProject(prev => prev ? { ...prev, name: newName.trim() } : null);
    } finally {
      setIsSavingName(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 gap-3">
        <Loader2 size={22} className="animate-spin" />
        <span>Loading project hub...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500">
        Project not found.
      </div>
    );
  }

  const isDeployed = !!project.deployment_url;

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-gray-800 bg-gray-900 shrink-0">
        <div className="p-4 border-b border-gray-800">
          <button onClick={() => navigate('/forge')} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors mb-3">
            <ArrowLeft size={14} />
            Back to projects
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isDeployed ? 'bg-emerald-500' : 'bg-gray-600'}`} title={isDeployed ? 'Deployed' : 'Not deployed'} />
            <h1 className="text-sm font-semibold text-white truncate">{project.name}</h1>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {HUB_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id ? 'bg-blue-600/15 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800 space-y-2">
          <button
            onClick={() => navigate(`/studio/${project.id}`)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Code2 size={15} />
            Open in Forge
          </button>
          {project.deployment_url && (
            <a
              href={project.deployment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <ExternalLink size={15} />
              Visit site
            </a>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-3xl">
            <h2 className="text-xl font-bold text-white">Overview</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Deployment status</p>
                <div className="flex items-center gap-2 mt-1">
                  {isDeployed
                    ? <CheckCircle size={14} className="text-emerald-400" />
                    : <Circle size={14} className="text-gray-600" />}
                  <span className={`text-sm font-medium ${isDeployed ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {isDeployed ? 'Deployed' : 'Not deployed'}
                  </span>
                </div>
                {project.deployment_url && (
                  <a href={project.deployment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-2 block truncate">
                    {project.deployment_url}
                  </a>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Last deployed</p>
                <p className="text-sm font-medium text-white mt-1">{formatDate(project.last_deployed_at)}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Last AI activity</p>
                <p className="text-sm font-medium text-white mt-1">{formatDate(project.last_active_at)}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Total AI calls</p>
                <p className="text-2xl font-bold text-white mt-1">{project.ai_call_count ?? 0}</p>
              </div>
            </div>

            {project.supabase_project_url && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Project database</p>
                <code className="text-sm text-emerald-400">{project.supabase_project_url}</code>
              </div>
            )}
          </div>
        )}

        {/* Database tab */}
        {activeTab === 'database' && (
          <div className="max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-6">Database</h2>
            <div className="flex gap-1 border-b border-zinc-700 mb-4 overflow-x-auto pb-px">
              {DB_SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDbSubTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${dbSubTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {dbSubTab === 'overview' && <DatabaseOverview projectId={projectId!} />}
            {dbSubTab === 'schema' && <SchemaViewer projectId={projectId!} />}
            {dbSubTab === 'users' && <UsersManager />}
            {dbSubTab === 'sql' && <SQLEditor projectId={projectId!} />}
          </div>
        )}

        {/* Domains tab */}
        {activeTab === 'domains' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Domains</h2>
            <DomainsPanel projectId={projectId ?? null} />
          </div>
        )}

        {/* Email tab */}
        {activeTab === 'email' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Email</h2>
            <EmailPanel projectId={projectId ?? null} />
          </div>
        )}

        {/* Analytics tab */}
        {activeTab === 'analytics' && (
          <div className="max-w-4xl space-y-6">
            <h2 className="text-xl font-bold text-white">Analytics</h2>
            <TrafficCharts projectId={projectId ?? null} dateRange={dateRange} />
            <TopPagesTable projectId={projectId ?? null} dateRange={dateRange} />
          </div>
        )}

        {/* Performance tab */}
        {activeTab === 'performance' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Performance</h2>
            <LighthousePanel projectId={projectId ?? null} initialUrl={project?.deployment_url ?? ''} />
          </div>
        )}

        {/* AI History tab */}
        {activeTab === 'ai_history' && (
          <div className="max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-6">AI History</h2>
            <AIHistoryPanel projectId={projectId ?? null} />
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-8">
            <h2 className="text-xl font-bold text-white">Settings</h2>

            {/* Rename */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">Project Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleSaveName}
                  disabled={isSavingName || !newName.trim()}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
                >
                  {isSavingName ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="border border-red-900/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h3>
              <p className="text-xs text-gray-500 mb-4">Deleting this project is permanent and cannot be undone.</p>
              <button
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

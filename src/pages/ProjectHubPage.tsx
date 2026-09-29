import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, Code2, Database, Globe, Mail,
  BarChart3, Gauge, Settings, Layers, CheckCircle, Circle, Trash2, Sparkles
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
import NebuLoader from '../components/brand/NebuLoader';
import LoadingSquares from '../components/brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { formatRelativeDate } from '@/i18n/forge/format';
import type { ForgeKey } from '@/i18n/forge/en';

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

const HUB_TABS: { id: HubTab; label: ForgeKey; Icon: React.ComponentType<any> }[] = [
  { id: 'overview', label: 'hub.tab.overview', Icon: Layers },
  { id: 'database', label: 'hub.tab.database', Icon: Database },
  { id: 'domains', label: 'hub.tab.domains', Icon: Globe },
  { id: 'email', label: 'hub.tab.email', Icon: Mail },
  { id: 'analytics', label: 'hub.tab.analytics', Icon: BarChart3 },
  { id: 'performance', label: 'hub.tab.performance', Icon: Gauge },
  { id: 'ai_history', label: 'hub.tab.aiHistory', Icon: Sparkles },
  { id: 'settings', label: 'hub.tab.settings', Icon: Settings },
];

const DB_SUB_TABS: readonly { id: 'overview' | 'schema' | 'users' | 'sql'; label: ForgeKey }[] = [
  { id: 'overview', label: 'hub.tab.overview' },
  { id: 'schema', label: 'hub.db.schema' },
  { id: 'users', label: 'hub.db.users' },
  { id: 'sql', label: 'hub.db.sql' },
];

export default function ProjectHubPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { lang, t } = useForgeLang();
  const formatDate = (iso: string | null | undefined) => (iso ? formatRelativeDate(iso, lang) : t('hub.never'));
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
    if (!projectId || !window.confirm(t('hub.deleteConfirm', { name: project?.name ?? '' }))) return;
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
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-500 gap-5">
        <NebuLoader size={160} />
        <span>{t('hub.loading')}</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500">
        {t('hub.notFound')}
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
            {t('hub.back')}
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isDeployed ? 'bg-emerald-500' : 'bg-gray-600'}`} title={isDeployed ? t('hub.deployed') : t('hub.notDeployed')} />
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
              {t(label)}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800 space-y-2">
          <button
            onClick={() => navigate(`/studio/${project.id}`)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Code2 size={15} />
            {t('hub.openInForge')}
          </button>
          {project.deployment_url && (
            <a
              href={project.deployment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <ExternalLink size={15} />
              {t('hub.visitSite')}
            </a>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-3xl">
            <h2 className="text-xl font-bold text-white">{t('hub.tab.overview')}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{t('hub.deployStatus')}</p>
                <div className="flex items-center gap-2 mt-1">
                  {isDeployed
                    ? <CheckCircle size={14} className="text-emerald-400" />
                    : <Circle size={14} className="text-gray-600" />}
                  <span className={`text-sm font-medium ${isDeployed ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {isDeployed ? t('hub.deployed') : t('hub.notDeployed')}
                  </span>
                </div>
                {project.deployment_url && (
                  <a href={project.deployment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline mt-2 block truncate">
                    {project.deployment_url}
                  </a>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{t('hub.lastDeployed')}</p>
                <p className="text-sm font-medium text-white mt-1">{formatDate(project.last_deployed_at)}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{t('hub.lastAi')}</p>
                <p className="text-sm font-medium text-white mt-1">{formatDate(project.last_active_at)}</p>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{t('hub.totalAi')}</p>
                <p className="text-2xl font-bold text-white mt-1">{project.ai_call_count ?? 0}</p>
              </div>
            </div>

            {project.supabase_project_url && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{t('hub.projectDb')}</p>
                <code className="text-sm text-emerald-400">{project.supabase_project_url}</code>
              </div>
            )}
          </div>
        )}

        {/* Database tab */}
        {activeTab === 'database' && (
          <div className="max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-6">{t('hub.tab.database')}</h2>
            <div className="flex gap-1 border-b border-zinc-700 mb-4 overflow-x-auto pb-px">
              {DB_SUB_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDbSubTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${dbSubTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                >
                  {t(tab.label)}
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
            <h2 className="text-xl font-bold text-white mb-6">{t('hub.tab.domains')}</h2>
            <DomainsPanel projectId={projectId ?? null} />
          </div>
        )}

        {/* Email tab */}
        {activeTab === 'email' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-6">{t('hub.tab.email')}</h2>
            <EmailPanel projectId={projectId ?? null} />
          </div>
        )}

        {/* Analytics tab */}
        {activeTab === 'analytics' && (
          <div className="max-w-4xl space-y-6">
            <h2 className="text-xl font-bold text-white">{t('hub.tab.analytics')}</h2>
            <TrafficCharts projectId={projectId ?? null} dateRange={dateRange} />
            <TopPagesTable projectId={projectId ?? null} dateRange={dateRange} />
          </div>
        )}

        {/* Performance tab */}
        {activeTab === 'performance' && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-6">{t('hub.tab.performance')}</h2>
            <LighthousePanel projectId={projectId ?? null} initialUrl={project?.deployment_url ?? ''} />
          </div>
        )}

        {/* AI History tab */}
        {activeTab === 'ai_history' && (
          <div className="max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-6">{t('hub.tab.aiHistory')}</h2>
            <AIHistoryPanel projectId={projectId ?? null} />
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-8">
            <h2 className="text-xl font-bold text-white">{t('hub.tab.settings')}</h2>

            {/* Rename */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">{t('newProject.nameLabel')}</label>
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
                  {isSavingName ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="border border-red-900/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-2">{t('hub.danger')}</h3>
              <p className="text-xs text-gray-500 mb-4">{t('hub.dangerText')}</p>
              <button
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
              >
                {isDeleting ? <LoadingSquares size={14} /> : <Trash2 size={14} />}
                {isDeleting ? t('hub.deleting') : t('dashboard.deleteProject')}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

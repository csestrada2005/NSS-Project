import { useState } from 'react';
import { X, Lock, Github, Rocket, Database, Globe, Mail, BarChart3 } from 'lucide-react';
import { DeployManager } from '../deploy/DeployManager';
import { gitHubService } from '../../services/GitHubService';
import type { FileSystemTree } from '@webcontainer/api';
import { DatabaseOverview } from './db/DatabaseOverview';
import { SchemaViewer } from './db/SchemaViewer';
import { SQLEditor } from './db/SQLEditor';
import { EdgeFunctionsPanel } from './db/EdgeFunctionsPanel';
import { SecretsPanel } from './db/SecretsPanel';
import { TrafficCharts } from './analytics/TrafficCharts';
import { LighthousePanel } from './analytics/LighthousePanel';
import { TopPagesTable } from './analytics/TopPagesTable';
import { DomainsPanel } from './DomainsPanel';
import { EmailPanel } from './EmailPanel';

interface SettingsModalProps {
  onClose: () => void;
  fileTree: FileSystemTree;
  files?: Map<string, string>;
  projectId?: string | null;
}

type MainTab = 'secrets' | 'github' | 'deploy' | 'domains' | 'database' | 'email' | 'analytics';
type DbSubTab = 'overview' | 'schema' | 'sql' | 'functions' | 'secrets';

const DB_SUB_TABS: { id: DbSubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema', label: 'Schema' },
  { id: 'sql', label: 'SQL' },
  { id: 'functions', label: 'Functions' },
  { id: 'secrets', label: 'Secrets' },
];

export function SettingsModal({ onClose, fileTree, files, projectId: propProjectId }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('secrets');
  const [dbSubTab, setDbSubTab] = useState<DbSubTab>('overview');

  const projectId = propProjectId ?? sessionStorage.getItem('forge_project_id');

  // Analytics date range state
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { start, end };
  });

  const setQuickRange = (days: number) => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setDateRange({ start, end });
  };

  // GitHub State
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('Update from Open Lovable Builder');
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleGitHubPush = async () => {
    setIsPushing(true);
    setPushStatus(null);
    try {
      const url = await gitHubService.pushToRepo(repoName, branch, fileTree, commitMessage);
      setPushStatus({ success: true, message: `Successfully pushed to ${url}` });
    } catch (error: any) {
      setPushStatus({ success: false, message: error.message });
    } finally {
      setIsPushing(false);
    }
  };

  const TAB_BUTTON = (id: MainTab, label: string, Icon: React.ComponentType<any>) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === id ? 'bg-gray-800 text-white border-b-2 border-primary' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-4xl p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800 pb-1 overflow-x-auto">
          {TAB_BUTTON('secrets', 'Secrets', Lock)}
          {TAB_BUTTON('github', 'GitHub', Github)}
          {TAB_BUTTON('deploy', 'Deploy', Rocket)}
          {TAB_BUTTON('domains', 'Domains', Globe)}
          {TAB_BUTTON('database', 'Database', Database)}
          {TAB_BUTTON('email', 'Email', Mail)}
          {TAB_BUTTON('analytics', 'Analytics', BarChart3)}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
          {/* Secrets tab */}
          {activeTab === 'secrets' && (
            <SecretsPanel projectId={projectId} />
          )}

          {/* GitHub tab */}
          {activeTab === 'github' && (
            <div className="space-y-6">
              <div className="bg-gray-950/50 rounded-lg p-4 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                  <Github className="text-white" size={20} />
                  Push to GitHub
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  Commit and push your changes directly to a GitHub repository.
                  Requires <code>GITHUB_TOKEN</code> in secrets.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Repository (username/repo)</label>
                    <input type="text" placeholder="e.g. jules/my-app" value={repoName} onChange={(e) => setRepoName(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                    <input type="text" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Commit Message</label>
                    <input type="text" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none" />
                  </div>
                  <button onClick={handleGitHubPush} disabled={isPushing || !repoName || !branch}
                    className="w-full py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-gray-700">
                    {isPushing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Github size={16} />}
                    {isPushing ? 'Pushing...' : 'Push Changes'}
                  </button>
                  {pushStatus && (
                    <div className={`p-3 rounded border text-sm ${pushStatus.success ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
                      {pushStatus.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Deploy tab */}
          {activeTab === 'deploy' && (
            <DeployManager files={files} projectId={projectId} />
          )}

          {/* Domains tab */}
          {activeTab === 'domains' && (
            <DomainsPanel projectId={projectId} />
          )}

          {/* Email tab */}
          {activeTab === 'email' && (
            <EmailPanel projectId={projectId} />
          )}

          {/* Analytics tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500">From</label>
                  <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500">To</label>
                  <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none" />
                </div>
                <div className="flex gap-1">
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => setQuickRange(d)}
                      className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded transition-colors">
                      {d}D
                    </button>
                  ))}
                </div>
              </div>
              <TrafficCharts projectId={projectId} dateRange={dateRange} />
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Performance Audit</h3>
                  <LighthousePanel projectId={projectId} />
                </div>
                <div className="lg:col-span-2">
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Top Pages & Speed</h3>
                  <TopPagesTable projectId={projectId} dateRange={dateRange} />
                </div>
              </div>
            </div>
          )}

          {/* Database tab */}
          {activeTab === 'database' && (
            <div>
              {/* Sub-tab bar */}
              <div className="flex gap-1 border-b border-zinc-700 mb-4 overflow-x-auto pb-px">
                {DB_SUB_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDbSubTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${dbSubTab === tab.id ? 'border-primary text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div>
                {dbSubTab === 'overview' && <DatabaseOverview projectId={projectId} />}
                {dbSubTab === 'schema' && <SchemaViewer projectId={projectId} />}
                {dbSubTab === 'sql' && <SQLEditor projectId={projectId} />}
                {dbSubTab === 'functions' && <EdgeFunctionsPanel fileTree={fileTree} />}
                {dbSubTab === 'secrets' && <SecretsPanel projectId={projectId} />}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-800 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

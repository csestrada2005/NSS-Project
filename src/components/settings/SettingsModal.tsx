import { useState, useEffect } from 'react';
import { X, Lock, Github, Rocket, Eye, EyeOff, Plus, Trash2, Save, Database } from 'lucide-react';
import { webContainerService } from '../../services/WebContainerService';
import { DeployManager } from '../deploy/DeployManager';
import { gitHubService } from '../../services/GitHubService';
import type { FileSystemTree } from '@webcontainer/api';
import { DatabaseOverview } from './db/DatabaseOverview';
import { SchemaViewer } from './db/SchemaViewer';
import { UsersManager } from './db/UsersManager';
import { SQLEditor } from './db/SQLEditor';
import { EdgeFunctionsPanel } from './db/EdgeFunctionsPanel';
import { LogsViewer } from './db/LogsViewer';
import { SecretsPanel } from './db/SecretsPanel';
import { UsagePanel } from './db/UsagePanel';
import { TrafficCharts } from './analytics/TrafficCharts';
import { LighthousePanel } from './analytics/LighthousePanel';
import { TopPagesTable } from './analytics/TopPagesTable';
import { BarChart3 } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  fileTree: FileSystemTree;
}

interface Secret {
  key: string;
  value: string;
}

type MainTab = 'secrets' | 'github' | 'deploy' | 'database' | 'analytics';
type DbSubTab = 'overview' | 'schema' | 'users' | 'sql' | 'functions' | 'logs' | 'secrets' | 'usage';

const DB_SUB_TABS: { id: DbSubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema', label: 'Schema' },
  { id: 'users', label: 'Users' },
  { id: 'sql', label: 'SQL' },
  { id: 'functions', label: 'Functions' },
  { id: 'logs', label: 'Logs' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'usage', label: 'Usage' },
];

export function SettingsModal({ onClose, fileTree }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('secrets');
  const [dbSubTab, setDbSubTab] = useState<DbSubTab>('overview');

  const projectId = sessionStorage.getItem('forge_project_id');

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

  // Secrets State (legacy localStorage tab kept for secrets main tab)
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});

  // GitHub State
  const [repoName, setRepoName] = useState('');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('Update from Open Lovable Builder');
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('secrets');
    if (stored) {
      try {
        setSecrets(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse secrets', e);
      }
    }
  }, []);

  const handleSaveSecrets = () => {
    localStorage.setItem('secrets', JSON.stringify(secrets));
    const env: Record<string, string> = {};
    secrets.forEach(s => {
      if (s.key) env[s.key] = s.value;
    });
    webContainerService.setEnv(env);
  };

  const addSecret = () => {
    if (!newKey.trim()) return;
    setSecrets([...secrets, { key: newKey.trim(), value: newValue }]);
    setNewKey('');
    setNewValue('');
  };

  const removeSecret = (index: number) => {
    const newSecrets = [...secrets];
    newSecrets.splice(index, 1);
    setSecrets(newSecrets);
  };

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
        <div className="flex gap-2 mb-6 border-b border-gray-800 pb-1">
            <button
                onClick={() => setActiveTab('secrets')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'secrets' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
                <Lock size={16} />
                Secrets
            </button>
            <button
                onClick={() => setActiveTab('github')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'github' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
                <Github size={16} />
                GitHub Sync
            </button>
            <button
                onClick={() => setActiveTab('deploy')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'deploy' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
                <Rocket size={16} />
                Deploy
            </button>
            <button
                onClick={() => setActiveTab('database')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'database' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
                <Database size={16} />
                Database
            </button>
            <button
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'analytics' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
            >
                <BarChart3 size={16} />
                Analytics
            </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
            {activeTab === 'secrets' && (
                <div className="space-y-6">
                    <div className="bg-gray-950/50 rounded-lg p-4 border border-gray-800">
                        <p className="text-sm text-gray-400 mb-4">
                            Environment variables stored here will be injected into the WebContainer process.
                            They are stored locally in your browser.
                        </p>

                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                placeholder="KEY (e.g. VERCEL_TOKEN)"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            />
                            <input
                                type="password"
                                placeholder="VALUE"
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                onClick={addSecret}
                                disabled={!newKey.trim()}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <Plus size={16} />
                                Add
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {secrets.length === 0 ? (
                            <div className="text-center text-gray-500 py-4">No secrets added yet.</div>
                        ) : (
                            secrets.map((secret, index) => (
                                <div key={index} className="flex items-center gap-2 bg-gray-800/50 p-3 rounded border border-gray-800 group hover:border-gray-700 transition-colors">
                                    <div className="flex-1 font-mono text-sm text-blue-400 truncate" title={secret.key}>
                                        {secret.key}
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-900 px-2 py-1 rounded border border-gray-800 max-w-[200px]">
                                        <span className="font-mono text-xs text-gray-300 truncate">
                                            {showValues[index] ? secret.value : '••••••••••••••••'}
                                        </span>
                                        <button
                                            onClick={() => setShowValues(prev => ({ ...prev, [index]: !prev[index] }))}
                                            className="text-gray-500 hover:text-white transition-colors"
                                        >
                                            {showValues[index] ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removeSecret(index)}
                                        className="p-2 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

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
                                <input
                                    type="text"
                                    placeholder="e.g. jules/my-app"
                                    value={repoName}
                                    onChange={(e) => setRepoName(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                                <input
                                    type="text"
                                    placeholder="main"
                                    value={branch}
                                    onChange={(e) => setBranch(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Commit Message</label>
                                <input
                                    type="text"
                                    placeholder="Update from Open Lovable Builder"
                                    value={commitMessage}
                                    onChange={(e) => setCommitMessage(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <button
                                onClick={handleGitHubPush}
                                disabled={isPushing || !repoName || !branch}
                                className="w-full py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-gray-700"
                            >
                                {isPushing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Github size={16} />}
                                {isPushing ? 'Pushing...' : 'Push Changes'}
                            </button>

                            {pushStatus && (
                                <div className={`p-3 rounded border text-sm ${pushStatus.success ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
                                    {pushStatus.message}
                                    {pushStatus.success && pushStatus.message.includes('http') && (
                                         <a href={pushStatus.message.split('to ')[1]} target="_blank" rel="noopener noreferrer" className="underline ml-1">View on GitHub</a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'deploy' && (
                <DeployManager />
            )}

            {activeTab === 'analytics' && (
                <div className="space-y-6">
                    {/* Date range picker */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-zinc-500">From</label>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-zinc-500">To</label>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-1">
                            {[7, 30, 90].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setQuickRange(d)}
                                    className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded transition-colors"
                                >
                                    {d}D
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Traffic charts */}
                    <TrafficCharts projectId={projectId} dateRange={dateRange} />

                    {/* Lighthouse + Top Pages */}
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

            {activeTab === 'database' && (
                <div>
                    {/* Sub-tab bar */}
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

                    {/* Sub-tab content */}
                    <div>
                        {dbSubTab === 'overview' && <DatabaseOverview projectId={projectId} />}
                        {dbSubTab === 'schema' && <SchemaViewer />}
                        {dbSubTab === 'users' && <UsersManager />}
                        {dbSubTab === 'sql' && <SQLEditor />}
                        {dbSubTab === 'functions' && <EdgeFunctionsPanel fileTree={fileTree} />}
                        {dbSubTab === 'logs' && <LogsViewer />}
                        {dbSubTab === 'secrets' && <SecretsPanel projectId={projectId} />}
                        {dbSubTab === 'usage' && <UsagePanel />}
                    </div>
                </div>
            )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-800 mt-4">
             {activeTab === 'secrets' && (
                <button
                    onClick={handleSaveSecrets}
                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-green-900/20"
                >
                    <Save size={16} />
                    Save Secrets
                </button>
             )}
            <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
}

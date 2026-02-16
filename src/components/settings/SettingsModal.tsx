import { useState, useEffect } from 'react';
import { X, Save, Lock, Github, Rocket, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { webContainerService } from '../../services/WebContainerService';
import { DeployManager } from '../deploy/DeployManager';
import { gitHubService } from '../../services/GitHubService';
import type { FileSystemTree } from '@webcontainer/api';

interface SettingsModalProps {
  onClose: () => void;
  fileTree: FileSystemTree;
}

interface Secret {
  key: string;
  value: string;
}

export function SettingsModal({ onClose, fileTree }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'secrets' | 'github' | 'deploy'>('secrets');

  // Secrets State
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-3xl p-6 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

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

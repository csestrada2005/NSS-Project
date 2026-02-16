import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, Save } from 'lucide-react';
import { webContainerService } from '../../services/WebContainerService';

interface Secret {
  key: string;
  value: string;
}

interface SecretsManagerProps {
  onClose: () => void;
}

export function SecretsManager({ onClose }: SecretsManagerProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});

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

  const handleSave = () => {
    localStorage.setItem('secrets', JSON.stringify(secrets));

    // Convert to Record<string, string> for WebContainerService
    const env: Record<string, string> = {};
    secrets.forEach(s => {
      if (s.key) env[s.key] = s.value;
    });

    webContainerService.setEnv(env);
    onClose();
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

  const toggleShowValue = (index: number) => {
    setShowValues(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Secrets Vault</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="bg-gray-950/50 rounded-lg p-4 border border-gray-800 mb-6">
            <p className="text-sm text-gray-400 mb-4">
                Environment variables stored here will be injected into the WebContainer process.
                They are stored locally in your browser and are never sent to our servers.
            </p>

            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    placeholder="KEY (e.g. VITE_SUPABASE_KEY)"
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

        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 mb-6 pr-2 custom-scrollbar">
            {secrets.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                    No secrets added yet.
                </div>
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
                                onClick={() => toggleShowValue(index)}
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

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={handleSave}
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-green-900/20"
            >
                <Save size={16} />
                Save Changes
            </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Eye, EyeOff, Save, CheckCircle, Circle, Loader2 } from 'lucide-react';
import { platformService } from '../../services/PlatformService';

interface Secret {
  key: string;
  value: string;
}

interface SecretsManagerProps {
  onClose: () => void;
}

const PLATFORM_MANAGED_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_PSI_KEY',
  'VERCEL_TOKEN',
  'CLOUDFLARE_API_KEY',
  'RESEND_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

export function SecretsManager({ onClose }: SecretsManagerProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [platformServices, setPlatformServices] = useState<Record<string, boolean> | null>(null);
  const [loadingPlatform, setLoadingPlatform] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('secrets');
    if (stored) {
      try {
        const parsed: Secret[] = JSON.parse(stored);
        // Filter out platform-managed keys
        setSecrets(parsed.filter(s => !PLATFORM_MANAGED_KEYS.has(s.key)));
      } catch (e) {
        console.error('Failed to parse secrets', e);
      }
    }

    platformService.checkPlatformServices()
      .then(setPlatformServices)
      .catch(() => setPlatformServices({}))
      .finally(() => setLoadingPlatform(false));
  }, []);

  const handleSave = () => {
    // Secrets are stored in localStorage for future use.
    // They are not actively injected anywhere until WebContainers is re-enabled.
    localStorage.setItem('secrets', JSON.stringify(secrets));
    onClose();
  };

  const addSecret = () => {
    if (!newKey.trim()) return;
    if (PLATFORM_MANAGED_KEYS.has(newKey.trim())) {
      alert(`"${newKey.trim()}" is a platform-managed key and cannot be added here.`);
      return;
    }
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

  const PLATFORM_LABELS: Record<string, string> = {
    anthropic: 'Anthropic (Claude AI)',
    googlePsi: 'Google PageSpeed',
    cloudflare: 'Cloudflare',
    vercel: 'Vercel',
    resend: 'Resend (Email)',
    supabase: 'Supabase (Platform DB)',
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

        {/* Platform services (read-only) */}
        <div className="bg-blue-950/30 rounded-lg p-4 border border-blue-800/40 mb-4">
          <h3 className="text-sm font-semibold text-blue-300 mb-3">Platform Services</h3>
          {loadingPlatform ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" />
              Checking...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PLATFORM_LABELS).map(([key, label]) => {
                const connected = platformServices?.[key] ?? false;
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {connected
                      ? <CheckCircle size={12} className="text-emerald-400 shrink-0" />
                      : <Circle size={12} className="text-gray-600 shrink-0" />}
                    <span className={connected ? 'text-gray-300' : 'text-gray-500'}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">Platform keys are managed server-side and are never exposed to the client.</p>
        </div>

        {/* User-managed secrets */}
        <div className="bg-gray-950/50 rounded-lg p-4 border border-gray-800 mb-4">
          <p className="text-sm text-gray-400 mb-4">
            User-managed secrets (e.g. <code>GITHUB_TOKEN</code>, custom API keys) are stored locally and injected into the WebContainer.
          </p>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="KEY (e.g. GITHUB_TOKEN)"
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
            <div className="text-center text-gray-500 py-8">No user secrets added yet.</div>
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
                  <button onClick={() => toggleShowValue(index)} className="text-gray-500 hover:text-white transition-colors">
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
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors">
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

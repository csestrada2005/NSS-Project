import { useState, useEffect } from 'react';
import { Eye, EyeOff, Plus, Trash2, Save, Cloud, CheckCircle, Circle, Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { webContainerService } from '@/services/WebContainerService';
import { platformService } from '@/services/PlatformService';

interface Secret {
  key: string;
  value: string;
}

interface SecretsPanelProps {
  projectId: string | null;
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

const PLATFORM_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude AI)',
  googlePsi: 'Google PageSpeed',
  cloudflare: 'Cloudflare',
  vercel: 'Vercel',
  resend: 'Resend (Email)',
  supabase: 'Supabase (Platform DB)',
};

export function SecretsPanel({ projectId }: SecretsPanelProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isCloud, setIsCloud] = useState(false);
  const [platformServices, setPlatformServices] = useState<Record<string, boolean> | null>(null);
  const [loadingPlatform, setLoadingPlatform] = useState(true);

  useEffect(() => {
    loadSecrets();
    platformService.checkPlatformServices()
      .then(setPlatformServices)
      .catch(() => setPlatformServices({}))
      .finally(() => setLoadingPlatform(false));
  }, [projectId]);

  const loadSecrets = async () => {
    if (projectId) {
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data } = await supabase
          .from('forge_secrets')
          .select('key, value')
          .eq('project_id', projectId)
          .order('key');
        if (data) {
          // Filter out platform-managed keys from display
          setSecrets(data.filter((s: Secret) => !PLATFORM_MANAGED_KEYS.has(s.key)));
          setIsCloud(true);
          return;
        }
      } catch {
        // fallback to localStorage
      }
    }
    const stored = localStorage.getItem('secrets');
    if (stored) {
      try {
        const parsed: Secret[] = JSON.parse(stored);
        setSecrets(parsed.filter(s => !PLATFORM_MANAGED_KEYS.has(s.key)));
      } catch { /* ignore */ }
    }
    setIsCloud(false);
  };

  const saveSecrets = async () => {
    setIsSaving(true);
    try {
      if (projectId) {
        const supabase = SupabaseService.getInstance().client;
        for (const s of secrets) {
          await supabase.from('forge_secrets').upsert(
            { project_id: projectId, key: s.key, value: s.value },
            { onConflict: 'project_id,key' }
          );
        }
      } else {
        localStorage.setItem('secrets', JSON.stringify(secrets));
      }
      const env: Record<string, string> = {};
      secrets.forEach(s => { if (s.key) env[s.key] = s.value; });
      webContainerService.setEnv(env);
    } finally {
      setIsSaving(false);
    }
  };

  const addSecret = () => {
    if (!newKey.trim()) return;
    if (PLATFORM_MANAGED_KEYS.has(newKey.trim())) {
      alert(`"${newKey.trim()}" is a platform-managed key. It is configured server-side.`);
      return;
    }
    setSecrets(prev => [...prev, { key: newKey.trim(), value: newValue }]);
    setNewKey('');
    setNewValue('');
  };

  const removeSecret = async (index: number) => {
    const toRemove = secrets[index];
    const newSecrets = secrets.filter((_, i) => i !== index);
    setSecrets(newSecrets);

    if (projectId && toRemove) {
      try {
        const supabase = SupabaseService.getInstance().client;
        await supabase
          .from('forge_secrets')
          .delete()
          .eq('project_id', projectId)
          .eq('key', toRemove.key);
      } catch (e) {
        console.error('[SecretsPanel] delete error:', e);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform services (read-only) */}
      <div className="bg-blue-950/30 rounded-xl p-4 border border-blue-800/40">
        <h3 className="text-sm font-semibold text-blue-300 mb-3">Platform Services</h3>
        {loadingPlatform ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 size={12} className="animate-spin" />
            Checking platform services...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PLATFORM_LABELS).map(([key, label]) => {
              const connected = platformServices?.[key] ?? false;
              return (
                <div key={key} className="flex items-center gap-2 text-xs">
                  {connected
                    ? <CheckCircle size={12} className="text-emerald-400 shrink-0" />
                    : <Circle size={12} className="text-zinc-600 shrink-0" />}
                  <span className={connected ? 'text-zinc-300' : 'text-zinc-500'}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-zinc-600 mt-3">Platform keys are managed server-side and never exposed to the client.</p>
      </div>

      {!projectId && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 text-sm text-amber-300 flex items-center gap-2">
          <Cloud size={14} />
          Save your project to enable cloud secrets sync.
        </div>
      )}

      {isCloud && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Cloud size={12} />
          Synced to cloud
        </div>
      )}

      {/* User-managed secrets */}
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
        <p className="text-sm text-zinc-400 mb-1">
          Project secrets (e.g. <code>GITHUB_TOKEN</code>, custom API keys) are injected into the WebContainer.
        </p>
        <div className="flex gap-2 mb-4 mt-4">
          <input
            type="text"
            placeholder="KEY (e.g. GITHUB_TOKEN)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="VALUE"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={addSecret}
            disabled={!newKey.trim()}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {secrets.length === 0 ? (
          <div className="text-center text-zinc-500 py-4">No project secrets added yet.</div>
        ) : (
          secrets.map((secret, index) => (
            <div key={index} className="flex items-center gap-2 bg-zinc-800/50 p-3 rounded border border-zinc-800 group hover:border-zinc-700 transition-colors">
              <div className="flex-1 font-mono text-sm text-blue-400 truncate" title={secret.key}>
                {secret.key}
              </div>
              <div className="flex items-center gap-2 bg-zinc-900 px-2 py-1 rounded border border-zinc-800 max-w-[200px]">
                <span className="font-mono text-xs text-zinc-300 truncate">
                  {showValues[index] ? secret.value : '••••••••••••••••'}
                </span>
                <button
                  onClick={() => setShowValues(prev => ({ ...prev, [index]: !prev[index] }))}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  {showValues[index] ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <button
                onClick={() => removeSecret(index)}
                className="p-2 text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={saveSecrets}
        disabled={isSaving}
        className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
      >
        <Save size={16} />
        {isSaving ? 'Saving...' : 'Save Secrets'}
      </button>
    </div>
  );
}

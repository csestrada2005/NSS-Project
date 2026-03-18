import { useState, useEffect } from 'react';
import { Eye, EyeOff, Plus, Trash2, Save, Cloud } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { webContainerService } from '@/services/WebContainerService';

interface Secret {
  key: string;
  value: string;
}

interface SecretsPanelProps {
  projectId: string | null;
}

export function SecretsPanel({ projectId }: SecretsPanelProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isCloud, setIsCloud] = useState(false);

  useEffect(() => {
    loadSecrets();
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
          setSecrets(data);
          setIsCloud(true);
          return;
        }
      } catch {
        // fallback to localStorage
      }
    }
    const stored = localStorage.getItem('secrets');
    if (stored) {
      try { setSecrets(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setIsCloud(false);
  };

  const saveSecrets = async () => {
    setIsSaving(true);
    try {
      if (projectId) {
        const supabase = SupabaseService.getInstance().client;
        // Upsert each secret
        for (const s of secrets) {
          await supabase.from('forge_secrets').upsert(
            { project_id: projectId, key: s.key, value: s.value },
            { onConflict: 'project_id,key' }
          );
        }
      } else {
        localStorage.setItem('secrets', JSON.stringify(secrets));
      }
      // Inject into WebContainer
      const env: Record<string, string> = {};
      secrets.forEach(s => { if (s.key) env[s.key] = s.value; });
      webContainerService.setEnv(env);
    } finally {
      setIsSaving(false);
    }
  };

  const addSecret = () => {
    if (!newKey.trim()) return;
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

      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
        <p className="text-sm text-zinc-400 mb-4">
          Environment variables are injected into the WebContainer process.
        </p>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="KEY (e.g. VERCEL_TOKEN)"
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {secrets.length === 0 ? (
          <div className="text-center text-zinc-500 py-4">No secrets added yet.</div>
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
        className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
      >
        <Save size={16} />
        {isSaving ? 'Saving...' : 'Save Secrets'}
      </button>
    </div>
  );
}

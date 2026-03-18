import { useState, useEffect } from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import type { FileSystemTree } from '@webcontainer/api';

interface EdgeFunction {
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | string;
  created_at: string;
}

interface EdgeFunctionsPanelProps {
  fileTree?: FileSystemTree;
}

function getLocalFunctions(fileTree?: FileSystemTree): string[] {
  if (!fileTree) return [];
  const names: string[] = [];
  const walk = (node: FileSystemTree, path: string) => {
    for (const [name, entry] of Object.entries(node)) {
      const p = path ? `${path}/${name}` : name;
      if ('directory' in entry) {
        walk(entry.directory, p);
      } else if ('file' in entry && p.startsWith('supabase/functions/') && p.endsWith('/index.ts')) {
        const parts = p.split('/');
        if (parts.length === 4) names.push(parts[2]);
      }
    }
  };
  walk(fileTree, '');
  return names;
}

export function EdgeFunctionsPanel({ fileTree }: EdgeFunctionsPanelProps) {
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [hasServiceKey, setHasServiceKey] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: secrets } = await supabase
        .from('forge_secrets')
        .select('key, value')
        .ilike('key', 'SUPABASE_%');

      const serviceKey = secrets?.find(s => s.key === 'SUPABASE_SERVICE_ROLE_KEY')?.value;

      if (serviceKey && projectRef) {
        setHasServiceKey(true);
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
          headers: { Authorization: `Bearer ${serviceKey}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFunctions(Array.isArray(data) ? data : []);
        } else {
          fallbackToLocal();
        }
      } else {
        fallbackToLocal();
      }
    } catch {
      fallbackToLocal();
    } finally {
      setIsLoading(false);
    }
  };

  const fallbackToLocal = () => {
    const localFns = getLocalFunctions(fileTree);
    setFunctions(localFns.map(name => ({ name, status: 'INACTIVE', created_at: '' })));
  };

  const handleDeploy = async (name: string) => {
    setDeployingId(name);
    try {
      await SupabaseService.getInstance().deployEdgeFunction(name, '');
    } finally {
      setDeployingId(null);
    }
  };

  if (!hasServiceKey) {
    return (
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 text-sm text-amber-300">
        Add <code className="font-mono bg-amber-900/30 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> to secrets to manage edge functions.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center text-zinc-500 text-sm py-8">Loading functions...</div>;
  }

  if (functions.length === 0) {
    return (
      <div className="text-center text-zinc-500 text-sm py-8">
        <Zap size={24} className="mx-auto mb-2 text-zinc-600" />
        No edge functions found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {functions.map((fn) => (
        <div key={fn.name} className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <div className="flex items-center gap-3">
            <Zap size={14} className="text-zinc-400" />
            <span className="text-sm text-zinc-200 font-mono">{fn.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${fn.status === 'ACTIVE' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-zinc-700 text-zinc-500 border-zinc-600'}`}>
              {fn.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {fn.created_at && (
              <span className="text-xs text-zinc-500">{new Date(fn.created_at).toLocaleDateString()}</span>
            )}
            <button
              onClick={() => handleDeploy(fn.name)}
              disabled={deployingId === fn.name}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={deployingId === fn.name ? 'animate-spin' : ''} />
              Deploy
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

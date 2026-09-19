import { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { SupabaseService, type RemoteEdgeFunctionSummary } from '@/services/SupabaseService';
import { isEdgeFunctionEntrypoint, edgeFunctionSlug } from '../../../utils/edgeFunctionPath.js';

interface LocalEdgeFunction {
  slug: string;
  code: string;
}

interface EdgeFunctionsPanelProps {
  projectId?: string | null;
  files?: Map<string, string>;
}

type DeployState = 'idle' | 'deploying' | 'deployed' | 'error';

function getLocalFunctions(files?: Map<string, string>): LocalEdgeFunction[] {
  if (!files) return [];
  const found: LocalEdgeFunction[] = [];
  for (const [path, content] of files.entries()) {
    if (!isEdgeFunctionEntrypoint(path)) continue;
    const slug = edgeFunctionSlug(path);
    if (slug) found.push({ slug, code: content });
  }
  return found;
}

export function EdgeFunctionsPanel({ projectId, files }: EdgeFunctionsPanelProps) {
  const localFunctions = getLocalFunctions(files);
  const [remote, setRemote] = useState<RemoteEdgeFunctionSummary[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deployState, setDeployState] = useState<Record<string, DeployState>>({});

  const load = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await SupabaseService.getInstance().listEdgeFunctions(projectId);
    if (result.ok) {
      setRemote(result.functions);
      setRemoteError(null);
    } else {
      setRemote([]);
      setRemoteError(result.reason);
    }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeploy = async (fn: LocalEdgeFunction) => {
    if (!projectId) return;
    setDeployState((s) => ({ ...s, [fn.slug]: 'deploying' }));
    const result = await SupabaseService.getInstance().deployEdgeFunction(projectId, fn.slug, fn.code);
    setDeployState((s) => ({ ...s, [fn.slug]: result.ok ? 'deployed' : 'error' }));
    if (result.ok) load();
  };

  if (!projectId) {
    return (
      <div className="text-center text-zinc-500 text-sm py-8">
        Save your project first to manage edge functions.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center text-zinc-500 text-sm py-8">Loading functions...</div>;
  }

  if (localFunctions.length === 0) {
    return (
      <div className="text-center text-zinc-500 text-sm py-8">
        <Zap size={24} className="mx-auto mb-2 text-zinc-600" />
        No edge functions found in this project
      </div>
    );
  }

  const remoteBySlug = new Map(remote.map((fn) => [fn.slug, fn]));

  return (
    <div className="space-y-2">
      {remoteError && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 text-xs text-amber-300">
          Couldn't reach live status ({remoteError}) — showing functions detected in the project's code.
        </div>
      )}
      {localFunctions.map((fn) => {
        const remoteInfo = remoteBySlug.get(fn.slug);
        const state = deployState[fn.slug] ?? 'idle';
        const statusLabel = remoteInfo?.status ?? (state === 'deployed' ? 'ACTIVE' : 'NOT DEPLOYED');
        const isActive = statusLabel === 'ACTIVE';
        return (
          <div key={fn.slug} className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Zap size={14} className="text-zinc-400" />
              <span className="text-sm text-zinc-200 font-mono">{fn.slug}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${isActive ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-zinc-700 text-zinc-500 border-zinc-600'}`}>
                {statusLabel}
              </span>
            </div>
            <button
              onClick={() => handleDeploy(fn)}
              disabled={state === 'deploying'}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={state === 'deploying' ? 'animate-spin' : ''} />
              {state === 'error' ? 'Retry' : 'Deploy'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

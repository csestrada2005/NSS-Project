import { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { SupabaseService, type RemoteEdgeFunctionSummary } from '@/services/SupabaseService';
import { isEdgeFunctionEntrypoint, edgeFunctionSlug } from '../../../utils/edgeFunctionPath.js';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

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
  const { t } = useForgeLang();
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
      <div className="text-center text-neutral-500 text-sm py-8">
        {t('edge.needProject')}
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center text-neutral-500 text-sm py-8">{t('edge.loading')}</div>;
  }

  if (localFunctions.length === 0) {
    return (
      <div className="text-center text-neutral-500 text-sm py-8">
        <Zap size={24} className="mx-auto mb-2 text-neutral-600" />
        {t('edge.empty')}
      </div>
    );
  }

  const remoteBySlug = new Map(remote.map((fn) => [fn.slug, fn]));

  return (
    <div className="space-y-2">
      {remoteError && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 text-xs text-amber-300">
          {t('edge.remoteError', { error: remoteError })}
        </div>
      )}
      {localFunctions.map((fn) => {
        const remoteInfo = remoteBySlug.get(fn.slug);
        const state = deployState[fn.slug] ?? 'idle';
        const status = remoteInfo?.status ?? (state === 'deployed' ? 'ACTIVE' : 'NOT DEPLOYED');
        const isActive = status === 'ACTIVE';
        // El estado remoto llega en inglés desde Supabase; sólo se traducen los dos conocidos.
        const statusLabel = status === 'ACTIVE' ? t('edge.active') : status === 'NOT DEPLOYED' ? t('edge.notDeployed') : status;
        return (
          <div key={fn.slug} className="flex items-center justify-between p-3 bg-neutral-800/50 border border-neutral-700 rounded-lg">
            <div className="flex items-center gap-3">
              <Zap size={14} className="text-neutral-400" />
              <span className="text-sm text-neutral-200 font-mono">{fn.slug}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${isActive ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-neutral-700 text-neutral-500 border-neutral-600'}`}>
                {statusLabel}
              </span>
            </div>
            <button
              onClick={() => handleDeploy(fn)}
              disabled={state === 'deploying'}
              className="flex items-center gap-1 px-2 py-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 text-xs rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={state === 'deploying' ? 'animate-spin' : ''} />
              {state === 'error' ? t('common.retry') : t('settings.tab.deploy')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

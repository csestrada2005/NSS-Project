import { useState, useEffect } from 'react';
import { Database, Zap, Radio, HardDrive, Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface UsagePanelProps {
  projectId?: string | null;
}

/**
 * El panel original mostraba "Database Size" / "Storage Used" / "Bandwidth"
 * leyendo campos (db_size_bytes, storage_size_bytes, bandwidth_bytes) que no
 * existen en ningún endpoint documentado de la Management API de Supabase —
 * nunca fueron reales. Lo único documentado y verificado
 * (GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts) es un
 * conteo de requests por servicio; este panel muestra eso.
 */
export function UsagePanel({ projectId }: UsagePanelProps) {
  const [snapshot, setSnapshot] = useState<{
    total_rest_requests: number;
    total_auth_requests: number;
    total_storage_requests: number;
    total_realtime_requests: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }
    const load = async () => {
      setIsLoading(true);
      const result = await SupabaseService.getInstance().getProjectUsage(projectId);
      if (result.ok) {
        const latest = result.snapshots[result.snapshots.length - 1] ?? null;
        setSnapshot(latest);
        setError(latest ? null : 'No usage data available yet');
      } else {
        setSnapshot(null);
        setError(result.reason);
      }
      setIsLoading(false);
    };
    load();
  }, [projectId]);

  const kpis = [
    { label: 'REST Requests', value: snapshot?.total_rest_requests, icon: <Database size={18} className="text-zinc-400" /> },
    { label: 'Auth Requests', value: snapshot?.total_auth_requests, icon: <Zap size={18} className="text-zinc-400" /> },
    { label: 'Storage Requests', value: snapshot?.total_storage_requests, icon: <HardDrive size={18} className="text-zinc-400" /> },
    { label: 'Realtime Requests', value: snapshot?.total_realtime_requests, icon: <Radio size={18} className="text-zinc-400" /> },
  ];

  if (!projectId) {
    return <div className="text-center text-zinc-500 text-sm py-8">Save your project first to view usage.</div>;
  }

  return (
    <div className="space-y-4">
      {error && !isLoading && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 text-sm text-amber-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500">{kpi.label}</span>
              {kpi.icon}
            </div>
            {isLoading ? (
              <Loader2 size={16} className="animate-spin text-zinc-500" />
            ) : (
              <p className="text-2xl font-bold text-zinc-200">
                {kpi.value !== undefined && kpi.value !== null ? kpi.value.toLocaleString() : '--'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

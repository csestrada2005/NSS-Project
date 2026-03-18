import { useState, useEffect } from 'react';
import { HardDrive, Archive, Zap, Wifi, Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface UsageData {
  dbSizeMb: number | null;
  storageMb: number | null;
  functionInvocations: number | null;
  bandwidthGb: number | null;
}

export function UsagePanel() {
  const [usage, setUsage] = useState<UsageData>({ dbSizeMb: null, storageMb: null, functionInvocations: null, bandwidthGb: null });
  const [isLoading, setIsLoading] = useState(true);
  const [fromApi, setFromApi] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data: secrets } = await supabase
          .from('forge_secrets')
          .select('key, value')
          .eq('key', 'SUPABASE_SERVICE_ROLE_KEY');
        const serviceKey = secrets?.[0]?.value;

        if (serviceKey && projectRef) {
          const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/usage`, {
            headers: { Authorization: `Bearer ${serviceKey}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUsage({
              dbSizeMb: data?.db_size_bytes ? Math.round(data.db_size_bytes / 1024 / 1024) : null,
              storageMb: data?.storage_size_bytes ? Math.round(data.storage_size_bytes / 1024 / 1024) : null,
              functionInvocations: data?.function_invocations ?? null,
              bandwidthGb: data?.bandwidth_bytes ? Math.round(data.bandwidth_bytes / 1024 / 1024 / 1024 * 10) / 10 : null,
            });
            setFromApi(true);
          }
        }
      } catch {
        // silently use placeholder
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const kpis = [
    { label: 'Database Size', value: usage.dbSizeMb !== null ? `${usage.dbSizeMb} MB` : '--', icon: <HardDrive size={18} className="text-zinc-400" /> },
    { label: 'Storage Used', value: usage.storageMb !== null ? `${usage.storageMb} MB` : '--', icon: <Archive size={18} className="text-zinc-400" /> },
    { label: 'Fn Invocations', value: usage.functionInvocations !== null ? usage.functionInvocations.toLocaleString() : '--', icon: <Zap size={18} className="text-zinc-400" /> },
    { label: 'Bandwidth', value: usage.bandwidthGb !== null ? `${usage.bandwidthGb} GB` : '--', icon: <Wifi size={18} className="text-zinc-400" /> },
  ];

  return (
    <div className="space-y-4">
      {!fromApi && !isLoading && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3 text-sm text-amber-300">
          Add <code className="font-mono bg-amber-900/30 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> to secrets to view live usage data.
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
              <p className="text-2xl font-bold text-zinc-200">{kpi.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

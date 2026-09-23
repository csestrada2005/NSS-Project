import { useState, useEffect } from 'react';
import { Database, CheckCircle, XCircle, Loader2, Activity } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface DatabaseOverviewProps {
  projectId: string | null;
}

interface KPI {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

export function DatabaseOverview({ projectId }: DatabaseOverviewProps) {
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [tableCount, setTableCount] = useState<number | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [snapshotCount, setSnapshotCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  const maskedUrl = projectRef ? `${projectRef.slice(0, 8)}...supabase.co` : '—';

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      const supabase = SupabaseService.getInstance().client;

      // Connection test
      try {
        const start = Date.now();
        await supabase.from('profiles').select('id', { count: 'exact', head: true });
        setLatencyMs(Date.now() - start);
        setConnectionOk(true);
      } catch {
        setConnectionOk(false);
      }

      // Table count
      try {
        const { data } = await supabase.rpc('get_table_count');
        setTableCount(data ?? null);
      } catch {
        setTableCount(null);
      }

      // User count
      try {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        setUserCount(count ?? 0);
      } catch {
        setUserCount(null);
      }

      // Snapshot count
      if (projectId) {
        try {
          const { count } = await supabase
            .from('forge_snapshots')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId);
          setSnapshotCount(count ?? 0);
        } catch {
          setSnapshotCount(null);
        }
      }

      setIsLoading(false);
    };

    run();
  }, [projectId]);

  const kpis: KPI[] = [
    { label: 'Tables', value: tableCount !== null ? tableCount : '--', icon: <Database size={16} className="text-muted-foreground" /> },
    { label: 'Active Users', value: userCount !== null ? userCount : '--', icon: <Activity size={16} className="text-muted-foreground" /> },
    { label: 'Snapshots', value: snapshotCount !== null ? snapshotCount : '--', icon: <Database size={16} className="text-muted-foreground" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Connection Card */}
      <div className="bg-background/50 border border-border border-l-4 border-l-primary rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Connection</h3>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Project URL</span>
          <span className="text-xs font-mono text-foreground">{maskedUrl}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          {isLoading ? (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          ) : connectionOk === true ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle size={14} className="text-emerald-500" />
              <span className="text-xs text-emerald-500">{latencyMs}ms</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <XCircle size={14} className="text-red-400" />
              <span className="text-xs text-red-400">Error</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-background/50 border border-border border-l-4 border-l-primary rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
              {kpi.icon}
            </div>
            {isLoading ? (
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            ) : (
              <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

type LogSource = 'postgres' | 'auth' | 'edge-functions';

interface LogLine {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

const SAMPLE_LOGS: Record<LogSource, LogLine[]> = {
  postgres: [
    { timestamp: new Date().toISOString(), level: 'INFO', message: 'Database ready. Add SUPABASE_SERVICE_ROLE_KEY to secrets to view live logs.' },
  ],
  auth: [
    { timestamp: new Date().toISOString(), level: 'INFO', message: 'Auth service ready. Add SUPABASE_SERVICE_ROLE_KEY to secrets to view live logs.' },
  ],
  'edge-functions': [
    { timestamp: new Date().toISOString(), level: 'INFO', message: 'Edge Functions ready. Add SUPABASE_SERVICE_ROLE_KEY to secrets to view live logs.' },
  ],
};

export function LogsViewer() {
  const [source, setSource] = useState<LogSource>('postgres');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: secrets } = await supabase
        .from('forge_secrets')
        .select('key, value')
        .eq('key', 'SUPABASE_SERVICE_ROLE_KEY');
      const serviceKey = secrets?.[0]?.value;

      if (serviceKey && projectRef) {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/logs?source=${source}`, {
          headers: { Authorization: `Bearer ${serviceKey}` }
        });
        if (res.ok) {
          const data = await res.json();
          const rows: LogLine[] = (data?.result ?? []).map((r: any) => ({
            timestamp: r.timestamp ?? new Date().toISOString(),
            level: r.level?.toUpperCase() ?? 'INFO',
            message: r.event_message ?? r.message ?? JSON.stringify(r),
          }));
          setLogs(rows);
          return;
        }
      }

      setLogs(SAMPLE_LOGS[source]);
    } catch {
      setLogs(SAMPLE_LOGS[source]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [source]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, source]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const LEVEL_COLORS = { INFO: 'text-blue-400', WARN: 'text-amber-400', ERROR: 'text-red-400' };

  return (
    <div className="space-y-3">
      {/* Source tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['postgres', 'auth', 'edge-functions'] as LogSource[]).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${source === s ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            >
              {s === 'edge-functions' ? 'Edge Fn' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className="bg-black rounded-xl font-mono text-xs h-64 overflow-y-auto p-4 space-y-1 relative">
        {isLoading && (
          <div className="absolute top-2 right-2">
            <Loader2 size={12} className="animate-spin text-zinc-500" />
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-green-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span className={`shrink-0 font-bold ${LEVEL_COLORS[log.level] ?? 'text-zinc-400'}`}>[{log.level}]</span>
            <span className="text-zinc-300 break-all">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && !isLoading && (
          <span className="text-zinc-600">No logs available</span>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

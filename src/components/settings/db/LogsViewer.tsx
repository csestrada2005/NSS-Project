import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

type LogSource = 'postgres' | 'auth' | 'edge-functions';

interface LogLine {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

interface LogsViewerProps {
  projectId?: string | null;
}

export function LogsViewer({ projectId }: LogsViewerProps) {
  const [source, setSource] = useState<LogSource>('postgres');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    const result = await SupabaseService.getInstance().getProjectLogs(projectId, source);
    if (result.ok) {
      setLogs(
        result.logs.map((r) => ({
          timestamp: r.timestamp ?? new Date().toISOString(),
          level: 'INFO',
          message: r.event_message ?? JSON.stringify(r),
        }))
      );
      setError(null);
    } else {
      setLogs([]);
      setError(result.reason);
    }
    setIsLoading(false);
  }, [projectId, source]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const LEVEL_COLORS = { INFO: 'text-blue-400', WARN: 'text-amber-400', ERROR: 'text-red-400' };

  if (!projectId) {
    return <div className="text-center text-zinc-500 text-sm py-8">Save your project first to view logs.</div>;
  }

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
        {logs.length === 0 && !isLoading && !error && (
          <span className="text-zinc-600">No logs available</span>
        )}
        {error && !isLoading && (
          <span className="text-amber-400">{error}</span>
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

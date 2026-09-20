import { useState, useEffect } from 'react';
import { SupabaseService } from '@/services/SupabaseService';
import { Sparkles, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AIHistoryPanelProps {
  projectId: string | null;
}

interface AIHistoryRecord {
  id: string;
  prompt: string | null;
  user_prompt: string | null;
  intent_type: string | null;
  intent_risk: string | null;
  plan_steps: { description: string }[] | null;
  modified_files: string[] | null;
  outcome: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

const colorMap: Record<string, string> = {
  new_feature: 'bg-pink-900/40 text-pink-400 border-pink-500/30',
  style_change: 'bg-purple-900/40 text-purple-400 border-purple-500/30',
  fix_bug: 'bg-amber-900/40 text-amber-400 border-amber-500/30',
  modify_existing: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  add_page: 'bg-green-900/40 text-green-400 border-green-500/30',
  database_change: 'bg-orange-900/40 text-orange-400 border-orange-500/30',
  refactor: 'bg-indigo-900/40 text-indigo-400 border-indigo-500/30',
};

const riskColorMap: Record<string, string> = {
  low: 'bg-green-900/40 text-green-400 border-green-500/30',
  medium: 'bg-amber-900/40 text-amber-400 border-amber-500/30',
  high: 'bg-red-900/40 text-red-400 border-red-500/30',
};

export function AIHistoryPanel({ projectId }: AIHistoryPanelProps) {
  const [history, setHistory] = useState<AIHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data, error } = await supabase
          .from('forge_intent_log')
          .select('id, prompt, user_prompt, intent_type, intent_risk, plan_steps, modified_files, outcome, error_message, duration_ms, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.error('[AIHistoryPanel] Fetch error:', error);
          return;
        }

        if (data) {
          setHistory(data as AIHistoryRecord[]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [projectId]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse bg-zinc-800 rounded-lg h-14 w-full" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/50 border border-zinc-800 rounded-xl text-center">
        <Sparkles className="w-12 h-12 text-zinc-600 mb-4" />
        <h3 className="text-lg font-semibold text-zinc-300 mb-1">No AI actions yet</h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Start building to see the history of every change the AI makes to your project.
        </p>
      </div>
    );
  }

  // Stats calculation
  const totalActions = history.length;
  const successCount = history.filter(h => h.outcome === 'success').length;
  const successRate = Math.round((successCount / totalActions) * 100);

  const durations = history.filter(h => h.duration_ms != null).map(h => h.duration_ms!);
  const avgDuration = durations.length > 0
    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) / 1000 * 10) / 10
    : 0;

  const intentCounts: Record<string, number> = {};
  history.forEach(h => {
    if (h.intent_type) {
      intentCounts[h.intent_type] = (intentCounts[h.intent_type] || 0) + 1;
    }
  });

  let mostCommonIntent = '—';
  let maxCount = 0;
  for (const [intent, count] of Object.entries(intentCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonIntent = intent;
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Total Actions</p>
          <p className="text-xl font-bold text-white">{totalActions}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Success Rate</p>
          <p className="text-xl font-bold text-white">{successRate}%</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Avg Duration</p>
          <p className="text-xl font-bold text-white">{avgDuration}s</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Top Intent</p>
          <p className="text-sm font-bold text-white truncate capitalize mt-1.5">{mostCommonIntent.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {history.map(record => {
          const isExpanded = expandedIds.has(record.id);
          const promptText = record.prompt ?? record.user_prompt ?? 'Unknown prompt';
          const truncatedPrompt = promptText.length > 80 ? promptText.slice(0, 80) + '...' : promptText;
          const durationStr = record.duration_ms ? `${Math.round(record.duration_ms / 1000)}s` : '';

          return (
            <div key={record.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden transition-all">
              {/* Header (Collapsed State) */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                onClick={() => toggleExpand(record.id)}
              >
                <div className="shrink-0">
                  {record.outcome === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : record.outcome === 'failed' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate font-medium">{truncatedPrompt}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
                  <span>{formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}</span>
                  {durationStr && <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">{durationStr}</span>}
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 pt-0 border-t border-zinc-800 bg-zinc-900/50 space-y-4">
                  <div className="mt-4">
                    <p className="text-sm text-zinc-300">{promptText}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {record.intent_type && (
                      <span className={`text-xs px-2 py-1 rounded-md border ${colorMap[record.intent_type] || colorMap['modify_existing']}`}>
                        Intent: {record.intent_type.replace('_', ' ')}
                      </span>
                    )}
                    {record.intent_risk && (
                      <span className={`text-xs px-2 py-1 rounded-md border capitalize ${riskColorMap[record.intent_risk] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                        Risk: {record.intent_risk}
                      </span>
                    )}
                  </div>

                  {record.modified_files && record.modified_files.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Modified Files</p>
                      <div className="flex flex-wrap gap-1.5">
                        {record.modified_files.map(file => (
                          <span key={file} className="font-mono text-[11px] bg-zinc-950 border border-zinc-800 text-zinc-300 px-2 py-1 rounded">
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {record.plan_steps && Array.isArray(record.plan_steps) && record.plan_steps.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Plan Steps</p>
                      <ul className="space-y-1">
                        {record.plan_steps.map((step, idx) => (
                          <li key={idx} className="flex gap-2 text-sm text-zinc-400">
                            <span className="text-green-500 mt-0.5">✓</span>
                            <span>{step.description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {record.error_message && (
                    <div className="mt-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Error Trace</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(record.error_message!);
                          }}
                          className="flex items-center gap-1 text-red-400/70 hover:text-red-400 transition-colors text-xs"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <pre className="text-[10px] text-red-300/80 font-mono whitespace-pre-wrap">{record.error_message}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

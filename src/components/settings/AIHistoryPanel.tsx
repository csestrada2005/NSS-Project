import { useState, useEffect } from 'react';
import { SupabaseService } from '@/services/SupabaseService';
import { Sparkles, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { formatRelativeDate } from '@/i18n/forge/format';
import type { ForgeKey } from '@/i18n/forge/en';

interface AIHistoryPanelProps {
  projectId: string | null;
}

interface AIHistoryRecord {
  id: string;
  prompt: string | null;
  user_prompt: string | null;
  intent_type: string | null;
  intent_risk: string | null;
  plan_steps: { description: string; summary?: string }[] | null;
  modified_files: string[] | null;
  outcome: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

const colorMap: Record<string, string> = {
  // Sistema (5.5): el tipo de pedido es información, no un estado — todos
  // neutros; la severidad ya la codifica la etiqueta de riesgo.
  new_feature: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  style_change: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  fix_bug: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  modify_existing: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  add_page: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  database_change: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  refactor: 'bg-neutral-800 text-neutral-300 border-neutral-700',
};

const riskColorMap: Record<string, string> = {
  low: 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-900/40 text-amber-400 border-amber-500/30',
  high: 'bg-red-900/40 text-red-400 border-red-500/30',
};

export function AIHistoryPanel({ projectId }: AIHistoryPanelProps) {
  const [history, setHistory] = useState<AIHistoryRecord[]>([]);
  const { lang, t } = useForgeLang();
  // Etiqueta traducida de un intent/riesgo; valores desconocidos se muestran tal cual.
  const enumLabel = (prefix: string, value: string) => {
    const key = `${prefix}.${value}` as ForgeKey;
    const out = t(key);
    return out === key ? value.replace('_', ' ') : out;
  };
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
          <div key={i} className="animate-pulse bg-neutral-800 rounded-lg h-14 w-full" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-neutral-900/50 border border-neutral-800 rounded-xl text-center">
        <Sparkles className="w-12 h-12 text-neutral-600 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-300 mb-1">{t('aiHistory.empty')}</h3>
        <p className="text-sm text-neutral-500 max-w-sm">
          {t('aiHistory.emptyHint')}
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
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">{t('aiHistory.total')}</p>
          <p className="text-lg font-bold text-white">{totalActions}</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">{t('aiHistory.successRate')}</p>
          <p className="text-lg font-bold text-white">{successRate}%</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">{t('aiHistory.avgDuration')}</p>
          <p className="text-lg font-bold text-white">{avgDuration}s</p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <p className="text-xs text-neutral-500 mb-1">{t('aiHistory.topIntent')}</p>
          <p className="text-sm font-bold text-white truncate capitalize mt-1.5">{mostCommonIntent === '—' ? '—' : enumLabel('aiHistory.intent', mostCommonIntent)}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {history.map(record => {
          const isExpanded = expandedIds.has(record.id);
          const promptText = record.prompt ?? record.user_prompt ?? t('aiHistory.unknownPrompt');
          const truncatedPrompt = promptText.length > 80 ? promptText.slice(0, 80) + '...' : promptText;
          const durationStr = record.duration_ms ? `${Math.round(record.duration_ms / 1000)}s` : '';

          return (
            <div key={record.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden transition-all">
              {/* Header (Collapsed State) */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-neutral-800/50 transition-colors"
                onClick={() => toggleExpand(record.id)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpand(record.id);
                  }
                }}
              >
                <div className="shrink-0">
                  {record.outcome === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : record.outcome === 'failed' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-200 truncate font-medium">{truncatedPrompt}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs text-neutral-500">
                  <span>{formatRelativeDate(record.created_at, lang)}</span>
                  {durationStr && <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded">{durationStr}</span>}
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 pt-0 border-t border-neutral-800 bg-neutral-900/50 space-y-4">
                  <div className="mt-4">
                    <p className="text-sm text-neutral-300">{promptText}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {record.intent_type && (
                      <span className={`text-xs px-2 py-1 rounded-md border ${colorMap[record.intent_type] || colorMap['modify_existing']}`}>
                        {t('aiHistory.intentLabel')}: {enumLabel('aiHistory.intent', record.intent_type)}
                      </span>
                    )}
                    {record.intent_risk && (
                      <span className={`text-xs px-2 py-1 rounded-md border capitalize ${riskColorMap[record.intent_risk] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}>
                        {t('aiHistory.riskLabel')}: {enumLabel('aiHistory.risk', record.intent_risk)}
                      </span>
                    )}
                  </div>

                  {record.modified_files && record.modified_files.length > 0 && (
                    <div>
                      <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wider">{t('aiHistory.modifiedFiles')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {record.modified_files.map(file => (
                          <span key={file} className="font-mono text-xs bg-neutral-950 border border-neutral-800 text-neutral-300 px-2 py-1 rounded">
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {record.plan_steps && Array.isArray(record.plan_steps) && record.plan_steps.length > 0 && (
                    <div>
                      <p className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wider">{t('aiHistory.planSteps')}</p>
                      <ul className="space-y-1">
                        {record.plan_steps.map((step, idx) => (
                          <li key={idx} className="flex gap-2 text-sm text-neutral-400">
                            <span className="text-emerald-500 mt-0.5">✓</span>
                            <span>{step.summary || step.description}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {record.error_message && (
                    <div className="mt-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">{t('aiHistory.errorTrace')}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(record.error_message!);
                          }}
                          className="flex items-center gap-1 text-red-400/70 hover:text-red-400 transition-colors text-xs"
                        >
                          <Copy className="w-3 h-3" />
                          {t('aiHistory.copy')}
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <pre className="text-xs text-red-300/80 font-mono whitespace-pre-wrap">{record.error_message}</pre>
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

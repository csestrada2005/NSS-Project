import { useEffect, useState, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SupabaseService } from '@/services/SupabaseService';

const supabase = SupabaseService.getInstance().client;

// ── Helpers ───────────────────────────────────────────────────────────────────

const toYMD = (d: Date): string => d.toISOString().slice(0, 10);

const defaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: toYMD(start), end: toYMD(end) };
};

const fmtDate = (iso: string): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface NpsRow {
  score: number;
  comment: string | null;
  responded_at: string;
  project_id: string | null;
}

interface Milestone {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  due_date: string | null;
  completed_at: string | null;
  project_id: string | null;
  projects: { title: string } | null;
}

interface PerformanceData {
  nps: number | null;
  total_responses: number;
  promoters: number;
  detractors: number;
  nps_rows: NpsRow[];
  milestones: Milestone[];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="bg-zinc-800 rounded-xl p-5 animate-pulse">
    <div className="h-3 w-24 bg-zinc-700 rounded mb-3" />
    <div className="h-7 w-32 bg-zinc-700 rounded mb-2" />
    <div className="h-3 w-16 bg-zinc-700 rounded" />
  </div>
);

const SkeletonChart = () => (
  <div className="bg-zinc-800 rounded-xl p-5 animate-pulse">
    <div className="h-4 w-40 bg-zinc-700 rounded mb-4" />
    <div className="h-48 bg-zinc-700 rounded" />
  </div>
);

// ── Labels ────────────────────────────────────────────────────────────────────

const labels = {
  title: { en: 'Performance', es: 'Rendimiento' },
  npsScore: { en: 'NPS Score', es: 'Puntuación NPS' },
  totalResponses: { en: 'Total Responses', es: 'Respuestas Totales' },
  promoters: { en: 'Promoters', es: 'Promotores' },
  detractors: { en: 'Detractors', es: 'Detractores' },
  excellent: { en: 'Excellent', es: 'Excelente' },
  good: { en: 'Good', es: 'Bueno' },
  needsWork: { en: 'Needs Work', es: 'Necesita Mejoras' },
  critical: { en: 'Critical', es: 'Crítico' },
  noData: { en: 'No data', es: 'Sin datos' },
  milestones: { en: 'Milestones', es: 'Hitos' },
  colTitle: { en: 'Title', es: 'Título' },
  colProject: { en: 'Project', es: 'Proyecto' },
  colStatus: { en: 'Status', es: 'Estado' },
  colDueDate: { en: 'Due Date', es: 'Fecha Límite' },
  colCompleted: { en: 'Completed', es: 'Completado' },
  npsResponses: { en: 'NPS Responses', es: 'Respuestas NPS' },
  noMilestones: { en: 'No milestones in this period.', es: 'Sin hitos en este período.' },
  noResponses: { en: 'No NPS responses in this period.', es: 'Sin respuestas NPS en este período.' },
  applyBtn: { en: 'Apply', es: 'Aplicar' },
  toLabel: { en: 'to', es: 'a' },
  noComment: { en: '—', es: '—' },
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

const milestoneBadgeClass: Record<Milestone['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  blocked: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const milestoneBadgeLabel: Record<Milestone['status'], { en: string; es: string }> = {
  pending: { en: 'Pending', es: 'Pendiente' },
  in_progress: { en: 'In Progress', es: 'En Progreso' },
  completed: { en: 'Completed', es: 'Completado' },
  blocked: { en: 'Blocked', es: 'Bloqueado' },
};

const npsScoreBadgeClass = (score: number): string => {
  if (score >= 9) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (score >= 7) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
};

// ── Main Component ─────────────────────────────────────────────────────────────

const Performance = () => {
  const { user } = useAuth();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [pendingRange, setPendingRange] = useState(defaultDateRange);

  const l = (key: keyof typeof labels) => labels[key][lang];

  const loadData = useCallback(
    async (range: { start: string; end: string }) => {
      if (!user) return;
      setError(null);
      setLoading(true);
      try {
        const { data: result, error: fnError } = await supabase.functions.invoke('performance-data', {
          body: { user_id: user.id, start_date: range.start, end_date: range.end },
        });
        if (fnError) throw fnError;
        setData(result as PerformanceData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch performance data';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    loadData(dateRange);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyRange = () => {
    setDateRange(pendingRange);
    loadData(pendingRange);
  };

  // ── NPS helpers ──
  const npsColor = (nps: number | null): string => {
    if (nps === null) return 'text-zinc-400';
    if (nps >= 50) return 'text-emerald-400';
    if (nps >= 0) return 'text-amber-400';
    return 'text-rose-400';
  };

  const npsCategory = (nps: number | null): string => {
    if (nps === null) return l('noData');
    if (nps >= 50) return l('excellent');
    if (nps >= 0) return l('good');
    if (nps >= -50) return l('needsWork');
    return l('critical');
  };

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm">
          {error}
        </div>
      )}

      {/* Date range bar */}
      <div className="bg-zinc-800 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-zinc-400 text-sm font-medium">{l('title')}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={pendingRange.start}
            max={pendingRange.end}
            onChange={(e) => setPendingRange((p) => ({ ...p, start: e.target.value }))}
            className="bg-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 border border-zinc-600 focus:outline-none focus:border-emerald-500"
          />
          <span className="text-zinc-500 text-xs">{l('toLabel')}</span>
          <input
            type="date"
            value={pendingRange.end}
            min={pendingRange.start}
            onChange={(e) => setPendingRange((p) => ({ ...p, end: e.target.value }))}
            className="bg-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 border border-zinc-600 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleApplyRange}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {l('applyBtn')}
          </button>
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonChart />
          <SkeletonChart />
        </>
      )}

      {!loading && data && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* NPS Score */}
            <div className="bg-zinc-800 rounded-xl p-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">{l('npsScore')}</p>
              <p className={`text-2xl font-bold ${npsColor(data.nps)}`}>
                {data.nps !== null ? data.nps : '—'}
              </p>
            </div>
            {/* Total Responses */}
            <div className="bg-zinc-800 rounded-xl p-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">{l('totalResponses')}</p>
              <p className="text-2xl font-bold text-blue-400">{data.total_responses}</p>
            </div>
            {/* Promoters */}
            <div className="bg-zinc-800 rounded-xl p-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">{l('promoters')}</p>
              <p className="text-2xl font-bold text-emerald-400">{data.promoters}</p>
            </div>
            {/* Detractors */}
            <div className="bg-zinc-800 rounded-xl p-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">{l('detractors')}</p>
              <p className="text-2xl font-bold text-rose-400">{data.detractors}</p>
            </div>
          </div>

          {/* NPS Gauge (centered text display) */}
          <div className="bg-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center gap-2">
            <p className={`text-7xl font-black tracking-tight ${npsColor(data.nps)}`}>
              {data.nps !== null ? data.nps : '—'}
            </p>
            <p className="text-zinc-400 text-sm font-medium mt-1">{npsCategory(data.nps)}</p>
            <div className="flex items-center gap-6 mt-4 text-xs text-zinc-500">
              <span>-100</span>
              <div className="flex gap-1">
                <span className="inline-block w-8 h-1.5 rounded bg-rose-500/60" />
                <span className="inline-block w-8 h-1.5 rounded bg-amber-500/60" />
                <span className="inline-block w-8 h-1.5 rounded bg-emerald-500/60" />
              </div>
              <span>100</span>
            </div>
          </div>

          {/* Milestones Table */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-200 mb-4">{l('milestones')}</p>
            {data.milestones.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">{l('noMilestones')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs">{l('colTitle')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colProject')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colStatus')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colDueDate')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colCompleted')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.milestones.map((m) => (
                    <TableRow key={m.id} className="border-zinc-700 hover:bg-zinc-700/30">
                      <TableCell className="text-zinc-200 text-sm font-medium">{m.title}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {m.projects?.title ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${milestoneBadgeClass[m.status]}`}>
                          {milestoneBadgeLabel[m.status][lang]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {m.due_date ? fmtDate(m.due_date) : '—'}
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {m.completed_at ? fmtDate(m.completed_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* NPS Responses */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-200 mb-4">{l('npsResponses')}</p>
            {data.nps_rows.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">{l('noResponses')}</p>
            ) : (
              <div className="space-y-2">
                {data.nps_rows.map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 py-2.5 border-b border-zinc-700 last:border-0"
                  >
                    <Badge className={`text-xs border shrink-0 ${npsScoreBadgeClass(row.score)}`}>
                      {row.score}
                    </Badge>
                    <p className="text-zinc-300 text-sm flex-1">
                      {row.comment
                        ? row.comment.length > 80
                          ? row.comment.slice(0, 80) + '…'
                          : row.comment
                        : <span className="text-zinc-600">—</span>}
                    </p>
                    <span className="text-zinc-500 text-xs shrink-0">
                      {fmtDate(row.responded_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Performance;

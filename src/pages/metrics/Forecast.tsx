import { useEffect, useState, useCallback } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
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

const fmtCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const fmtDate = (iso: string): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

const OPEN_STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation'];

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

interface Deal {
  id: string;
  title: string;
  value: number;
  stage: Stage;
  probability: number;
  expected_close: string;
  contacts: { name: string } | null;
}

interface MonthData {
  month: number;
  target: number;
  actual: number;
}

interface ForecastData {
  deals: Deal[];
  months: MonthData[];
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
  title: { en: 'Revenue Forecast', es: 'Pronóstico de Ingresos' },
  yearSelector: { en: 'Year', es: 'Año' },
  weightedPipeline: { en: 'Weighted Pipeline', es: 'Pipeline Ponderado' },
  chartTitle: { en: 'Revenue vs Target', es: 'Ingresos vs Objetivo' },
  actual: { en: 'Actual', es: 'Real' },
  target: { en: 'Target', es: 'Objetivo' },
  dealsTitle: { en: 'Pipeline Deals', es: 'Negocios en Pipeline' },
  colTitle: { en: 'Title', es: 'Título' },
  colContact: { en: 'Contact', es: 'Contacto' },
  colValue: { en: 'Value', es: 'Valor' },
  colStage: { en: 'Stage', es: 'Etapa' },
  colProbability: { en: 'Probability', es: 'Probabilidad' },
  colExpectedClose: { en: 'Expected Close', es: 'Cierre Esperado' },
  noDeals: { en: 'No deals in pipeline.', es: 'Sin negocios en pipeline.' },
  openDealsOnly: { en: 'Open deals only (excl. closed)', es: 'Solo negocios abiertos (excl. cerrados)' },
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

const stageBadgeClass: Record<Stage, string> = {
  prospecting: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  qualification: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  proposal: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  negotiation: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  closed_won: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  closed_lost: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const stageBadgeLabel: Record<Stage, { en: string; es: string }> = {
  prospecting: { en: 'Prospecting', es: 'Prospección' },
  qualification: { en: 'Qualification', es: 'Calificación' },
  proposal: { en: 'Proposal', es: 'Propuesta' },
  negotiation: { en: 'Negotiation', es: 'Negociación' },
  closed_won: { en: 'Closed Won', es: 'Cerrado Ganado' },
  closed_lost: { en: 'Closed Lost', es: 'Cerrado Perdido' },
};

// ── Main Component ─────────────────────────────────────────────────────────────

const Forecast = () => {
  const { user } = useAuth();
  const { lang } = useLanguage();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ForecastData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const l = (key: keyof typeof labels) => labels[key][lang];

  const loadData = useCallback(
    async (selectedYear: number) => {
      if (!user) return;
      setError(null);
      setLoading(true);
      try {
        const { data: result, error: fnError } = await supabase.functions.invoke('forecast-data', {
          body: { user_id: user.id, year: selectedYear },
        });
        if (fnError) throw fnError;
        setData(result as ForecastData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch forecast data';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    loadData(year);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = Number(e.target.value);
    setYear(y);
    loadData(y);
  };

  // ── Derived values ──
  const weightedPipeline = data
    ? data.deals
        .filter((d) => OPEN_STAGES.includes(d.stage))
        .reduce((sum, d) => sum + (d.value * d.probability) / 100, 0)
    : 0;

  const monthNames = lang === 'es' ? MONTH_NAMES_ES : MONTH_NAMES_EN;

  const chartData = data
    ? data.months.map((m) => ({
        name: monthNames[m.month - 1],
        actual: m.actual,
        target: m.target,
      }))
    : [];

  const sortedDeals = data
    ? [...data.deals].sort((a, b) => {
        if (!a.expected_close) return 1;
        if (!b.expected_close) return -1;
        return a.expected_close.localeCompare(b.expected_close);
      })
    : [];

  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm">
          {error}
        </div>
      )}

      {/* Header bar */}
      <div className="bg-zinc-800 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-zinc-400 text-sm font-medium">{l('title')}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-zinc-400 text-xs">{l('yearSelector')}:</label>
          <select
            value={year}
            onChange={handleYearChange}
            className="bg-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 border border-zinc-600 focus:outline-none focus:border-emerald-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <>
          <SkeletonCard />
          <SkeletonChart />
          <SkeletonChart />
        </>
      )}

      {!loading && data && (
        <>
          {/* Weighted Pipeline KPI */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
              {l('weightedPipeline')}
            </p>
            <p className="text-3xl font-bold text-emerald-400">{fmtCurrency(weightedPipeline)}</p>
            <p className="text-xs text-zinc-500 mt-1">{l('openDealsOnly')}</p>
          </div>

          {/* Revenue Chart */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-200 mb-4">{l('chartTitle')}</p>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => fmtCurrency(v)}
                />
                <Tooltip
                  contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, color: '#e4e4e7' }}
                  labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
                  formatter={(value: number) => fmtCurrency(value)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa', paddingTop: 8 }} />
                <Bar dataKey="actual" fill="#10b981" name={l('actual')} radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="target"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name={l('target')}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Deals Table */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-200 mb-4">{l('dealsTitle')}</p>
            {sortedDeals.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">{l('noDeals')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs">{l('colTitle')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colContact')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colValue')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colStage')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colProbability')}</TableHead>
                    <TableHead className="text-zinc-400 text-xs">{l('colExpectedClose')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDeals.map((deal) => (
                    <TableRow key={deal.id} className="border-zinc-700 hover:bg-zinc-700/30">
                      <TableCell className="text-zinc-200 text-sm font-medium">{deal.title}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {deal.contacts?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-zinc-200 text-sm font-semibold">
                        {fmtCurrency(deal.value)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${stageBadgeClass[deal.stage]}`}>
                          {stageBadgeLabel[deal.stage][lang]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-400 text-sm">{deal.probability}%</TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {deal.expected_close ? fmtDate(deal.expected_close) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Forecast;

import { useState, useEffect } from 'react';
import { Users, Eye, Layers, TrendingDown, Loader2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ComposedChart,
  Bar,
  Legend,
} from 'recharts';
import { SupabaseService } from '@/services/SupabaseService';

interface TrafficChartsProps {
  projectId: string | null;
  dateRange: { start: string; end: string };
}

interface AnalyticsRow {
  date: string;
  visitors: number;
  pageviews: number;
  visit_duration_seconds: number;
  bounce_rate: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TrafficCharts({ projectId, dateRange }: TrafficChartsProps) {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!projectId) { setIsLoading(false); return; }
    const load = async () => {
      setIsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data } = await supabase
          .from('forge_analytics')
          .select('date, visitors, pageviews, visit_duration_seconds, bounce_rate')
          .eq('project_id', projectId)
          .gte('date', dateRange.start)
          .lte('date', dateRange.end)
          .order('date');
        setRows((data ?? []) as AnalyticsRow[]);
      } catch (e) {
        console.error('[TrafficCharts]', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [projectId, dateRange.start, dateRange.end]);

  const totalVisitors = rows.reduce((s, r) => s + (r.visitors ?? 0), 0);
  const totalPageviews = rows.reduce((s, r) => s + (r.pageviews ?? 0), 0);
  const avgViewsPerVisit = totalVisitors > 0 ? (totalPageviews / totalVisitors).toFixed(1) : '0';
  const avgBounce = rows.length > 0 ? (rows.reduce((s, r) => s + Number(r.bounce_rate ?? 0), 0) / rows.length).toFixed(1) : '0';

  const chartData = rows.map(r => ({
    date: formatDate(r.date),
    visitors: r.visitors,
    pageviews: r.pageviews,
    duration: r.visit_duration_seconds,
    bounce: Number(r.bounce_rate),
  }));

  const kpis = [
    { label: 'Total Visitors', value: totalVisitors.toLocaleString(), icon: <Users size={16} className="text-zinc-400" /> },
    { label: 'Total Pageviews', value: totalPageviews.toLocaleString(), icon: <Eye size={16} className="text-zinc-400" /> },
    { label: 'Avg Views/Visit', value: avgViewsPerVisit, icon: <Layers size={16} className="text-zinc-400" /> },
    { label: 'Avg Bounce Rate', value: `${avgBounce}%`, icon: <TrendingDown size={16} className="text-zinc-400" /> },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-zinc-500" /></div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-500">
        <Eye size={32} className="mx-auto mb-2 text-zinc-600" />
        <p>No visitor data yet. Deploy your project to start collecting analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">{kpi.label}</span>
              {kpi.icon}
            </div>
            <p className="text-xl font-bold text-zinc-200">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Visitors + Pageviews chart */}
      <div className="bg-zinc-800/30 border border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Visitors & Pageviews</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
            <Legend />
            <Line type="monotone" dataKey="visitors" stroke="#10b981" strokeWidth={2} dot={false} name="Visitors" />
            <Line type="monotone" dataKey="pageviews" stroke="#3b82f6" strokeWidth={2} dot={false} name="Pageviews" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Duration + Bounce chart */}
      <div className="bg-zinc-800/30 border border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Visit Duration & Bounce Rate</h3>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#71717a', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} />
            <Legend />
            <Bar yAxisId="left" dataKey="duration" fill="#6366f1" name="Avg Duration (s)" />
            <Line yAxisId="right" type="monotone" dataKey="bounce" stroke="#f59e0b" strokeWidth={2} dot={false} name="Bounce %" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

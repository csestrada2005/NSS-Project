import { useState, useEffect } from 'react';
import { Users, Eye, Layers, TrendingDown } from 'lucide-react';
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
import NebuLoader from '../../brand/NebuLoader';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { getForgeLang } from '@/i18n/forge/lang';

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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(getForgeLang(), { month: 'short', day: 'numeric' });
}

export function TrafficCharts({ projectId, dateRange }: TrafficChartsProps) {
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const { lang, t } = useForgeLang();
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
    { label: t('traffic.visitors'), value: totalVisitors.toLocaleString(lang), icon: <Users size={16} className="text-neutral-400" /> },
    { label: t('traffic.pageviews'), value: totalPageviews.toLocaleString(lang), icon: <Eye size={16} className="text-neutral-400" /> },
    { label: t('traffic.viewsPerVisit'), value: avgViewsPerVisit, icon: <Layers size={16} className="text-neutral-400" /> },
    { label: t('traffic.bounceRate'), value: `${avgBounce}%`, icon: <TrendingDown size={16} className="text-neutral-400" /> },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><NebuLoader size={96} /></div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 text-neutral-500">
        <Eye size={32} className="mx-auto mb-2 text-neutral-600" />
        <p>{t('traffic.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-500">{kpi.label}</span>
              {kpi.icon}
            </div>
            <p className="text-lg font-bold text-neutral-200">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Visitors + Pageviews chart */}
      <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-4">{t('traffic.chart1')}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#9A9A9A', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9A9A9A', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 4 }} />
            <Legend />
            <Line type="monotone" dataKey="visitors" stroke="#D62828" strokeWidth={2} dot={false} name={t('traffic.legendVisitors')} />
            <Line type="monotone" dataKey="pageviews" stroke="#E8E8E8" strokeWidth={2} dot={false} name={t('traffic.legendPageviews')} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Duration + Bounce chart */}
      <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-4">
        <h3 className="text-sm font-medium text-neutral-300 mb-4">{t('traffic.chart2')}</h3>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="date" tick={{ fill: '#9A9A9A', fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: '#9A9A9A', fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9A9A9A', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 4 }} />
            <Legend />
            <Bar yAxisId="left" dataKey="duration" fill="#3A3A3A" name={t('traffic.legendDuration')} />
            <Line yAxisId="right" type="monotone" dataKey="bounce" stroke="#D62828" strokeWidth={2} dot={false} name={t('traffic.legendBounce')} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

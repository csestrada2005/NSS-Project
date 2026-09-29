import { useState, useEffect } from 'react';
import { SupabaseService } from '@/services/SupabaseService';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

interface TopPagesTableProps {
  projectId: string | null;
  dateRange: { start: string; end: string };
}

interface PageStat {
  path: string;
  views: number;
  avgDuration: number;
  bounceRate: number;
}

export function TopPagesTable({ projectId, dateRange }: TopPagesTableProps) {
  const [pages, setPages] = useState<PageStat[]>([]);
  const { t } = useForgeLang();
  const [isLoading, setIsLoading] = useState(true);
  const [avgTTFB, setAvgTTFB] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) { setIsLoading(false); return; }
    const load = async () => {
      setIsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;

        // Sessions — aggregate stats (no per-path data in forge_sessions)
        const { data: sessions } = await supabase
          .from('forge_sessions')
          .select('date, duration_seconds, is_bounce')
          .eq('project_id', projectId)
          .gte('date', dateRange.start)
          .lte('date', dateRange.end);

        const total = sessions?.length ?? 0;
        const avgDur = total > 0
          ? Math.round((sessions ?? []).reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / total)
          : 0;
        const bounces = (sessions ?? []).filter(s => s.is_bounce).length;
        const bounceRate = total > 0 ? Math.round((bounces / total) * 100) : 0;

        setPages(total > 0 ? [{ path: '/', views: total, avgDuration: avgDur, bounceRate }] : []);

        // TTFB from analytics
        const { data: analytics } = await supabase
          .from('forge_analytics')
          .select('ttfb_ms')
          .eq('project_id', projectId)
          .gte('date', dateRange.start)
          .lte('date', dateRange.end)
          .not('ttfb_ms', 'is', null);

        if (analytics && analytics.length > 0) {
          const avg = Math.round(analytics.reduce((s, r) => s + (r.ttfb_ms ?? 0), 0) / analytics.length);
          setAvgTTFB(avg);
        }
      } catch (e) {
        console.error('[TopPagesTable]', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [projectId, dateRange.start, dateRange.end]);

  const speedLabel = (ttfb: number | null) => {
    if (ttfb === null) return null;
    if (ttfb < 200) return { label: t('pages.fast'), cls: 'bg-emerald-600/20 text-emerald-400' };
    if (ttfb < 600) return { label: t('pages.moderate'), cls: 'bg-amber-600/20 text-amber-400' };
    return { label: t('pages.slow'), cls: 'bg-red-600/20 text-red-400' };
  };

  const speed = speedLabel(avgTTFB);

  return (
    <div className="space-y-4">
      {avgTTFB !== null && speed && (
        <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-500">{t('pages.avgTtfb')}</p>
            <p className="text-lg font-bold text-neutral-200">{avgTTFB}ms</p>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded ${speed.cls}`}>{speed.label}</span>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-neutral-500 text-sm py-6">{t('common.loading')}</div>
      ) : pages.length === 0 ? (
        <div className="text-center text-neutral-500 text-sm py-6">{t('pages.empty')}</div>
      ) : (
        <div className="overflow-x-auto border border-neutral-700 rounded-xl">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-700 text-neutral-500">
                <th className="text-left px-4 py-2 font-medium">#</th>
                <th className="text-left px-4 py-2 font-medium">{t('pages.path')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('pages.sessions')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('pages.avgDur')}</th>
                <th className="text-right px-4 py-2 font-medium">{t('pages.bounce')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {pages.map((p, i) => (
                <tr key={p.path} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-neutral-600">{i + 1}</td>
                  <td className="px-4 py-2.5 text-neutral-300 font-mono">{p.path}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-200">{p.views}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-400">{p.avgDuration}s</td>
                  <td className="px-4 py-2.5 text-right text-neutral-400">{p.bounceRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

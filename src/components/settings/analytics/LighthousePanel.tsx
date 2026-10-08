import { useState, useEffect } from 'react';
import { SupabaseService } from '@/services/SupabaseService';
import LoadingSquares from '../../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import { useBusy } from '@/utils/busyRegistry';

interface LighthousePanelProps {
  projectId: string | null;
}

interface Scores {
  perf: number | null;
  a11y: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
  ttfb: number | null;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'rgba(255,255,255,0.3)';
  if (score >= 90) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function ScoreGauge({ label, score }: { label: string; score: number | null }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = score !== null ? Math.min(score, 100) / 100 : 0;
  const offset = circ * (1 - pct);
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
        />
        <text x="44" y="48" textAnchor="middle" fontSize="18" fontWeight="bold" fill={color}>
          {score !== null ? score : '--'}
        </text>
      </svg>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

interface CWV {
  label: string;
  value: number | null;
  unit: string;
  target: number;
  targetLabel: string;
}

function CWVRow({ label, value, unit, target, targetLabel }: CWV) {
  const pass = value !== null && value <= target;
  const { t } = useForgeLang();
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground font-mono">{value !== null ? `${value}${unit}` : '--'}</span>
        <span className="text-xs text-muted-foreground">{t('audit.target')} &lt;{targetLabel}</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${pass ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
          {pass ? t('audit.pass') : t('audit.fail')}
        </span>
      </div>
    </div>
  );
}

export function LighthousePanel({ projectId, initialUrl }: LighthousePanelProps & { initialUrl?: string }) {
  const [scores, setScores] = useState<Scores>({ perf: null, a11y: null, bestPractices: null, seo: null, lcp: null, tbt: null, cls: null, ttfb: null });
  const [deployedUrl, setDeployedUrl] = useState(initialUrl || '');
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [isRunning, setIsRunning] = useState(false);
  useBusy('lighthouse', isRunning);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { lang, t } = useForgeLang();

  useEffect(() => {
    if (initialUrl) setDeployedUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('forge_analytics')
        .select('perf_score, a11y_score, best_practices_score, seo_score, lcp_ms, tbt_ms, cls, ttfb_ms, created_at')
        .eq('project_id', projectId)
        .not('perf_score', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const r = data[0];
        setScores({ perf: r.perf_score, a11y: r.a11y_score, bestPractices: r.best_practices_score, seo: r.seo_score, lcp: r.lcp_ms, tbt: r.tbt_ms, cls: r.cls, ttfb: r.ttfb_ms });
        setLastRun(new Date(r.created_at));
      }
    };
    load();
  }, [projectId]);

  const runAudit = async () => {
    if (!deployedUrl || !projectId) return;
    setIsRunning(true);
    setError(null);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data, error: fnErr } = await supabase.functions.invoke('forge-lighthouse', {
        body: { project_id: projectId, url: deployedUrl, strategy }
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      setScores({ perf: data.perf_score, a11y: data.a11y_score, bestPractices: data.best_practices_score, seo: data.seo_score, lcp: data.lcp_ms, tbt: data.tbt_ms, cls: data.cls, ttfb: data.ttfb_ms });
      setLastRun(new Date());
    } catch (e: any) {
      setError(e.message ?? t('audit.failed'));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* URL + strategy */}
      <div className="flex gap-2">
        <input
          type="url"
          placeholder={t('audit.urlPlaceholder')}
          value={deployedUrl}
          onChange={(e) => setDeployedUrl(e.target.value)}
          className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-primary placeholder-neutral-500"
        />
        <button
          onClick={() => setStrategy(s => s === 'mobile' ? 'desktop' : 'mobile')}
          className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
        >
          {strategy === 'mobile' ? t('audit.mobile') : t('audit.desktop')}
        </button>
        <button
          onClick={runAudit}
          disabled={isRunning || !deployedUrl || !projectId}
          className="nebu-cta px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          {isRunning ? <LoadingSquares size={14} /> : null}
          {isRunning ? t('audit.running') : t('audit.run')}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}

      {lastRun && (
        <p className="text-xs text-neutral-500">{t('audit.lastRun', { when: lastRun.toLocaleString(lang) })}</p>
      )}

      {/* Gauges */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-background/50 border border-border border-l-4 border-l-primary rounded-xl p-4 flex justify-around">
          <ScoreGauge label={t('hub.tab.performance')} score={scores.perf} />
          <ScoreGauge label={t('audit.accessibility')} score={scores.a11y} />
        </div>
        <div className="bg-background/50 border border-border border-l-4 border-l-primary rounded-xl p-4 flex justify-around">
          <ScoreGauge label={t('audit.bestPractices')} score={scores.bestPractices} />
          <ScoreGauge label="SEO" score={scores.seo} />
        </div>
      </div>

      {/* Core Web Vitals */}
      <div className="bg-background/50 border border-border border-l-4 border-l-primary rounded-xl p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Core Web Vitals</h3>
        <CWVRow label="LCP" value={scores.lcp} unit="ms" target={2500} targetLabel="2500ms" />
        <CWVRow label={t('audit.tbt')} value={scores.tbt} unit="ms" target={200} targetLabel="200ms" />
        <CWVRow label="CLS" value={scores.cls !== null ? Math.round(scores.cls * 1000) / 1000 : null} unit="" target={0.1} targetLabel="0.1" />
        <CWVRow label="TTFB" value={scores.ttfb} unit="ms" target={800} targetLabel="800ms" />
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import WebAnalytics from './metrics/WebAnalytics';
import MetaAds from './metrics/MetaAds';
import Performance from './metrics/Performance';
import Forecast from './metrics/Forecast';
import AIReports from './metrics/AIReports';
import { TrafficCharts } from '../components/settings/analytics/TrafficCharts';
import { LighthousePanel } from '../components/settings/analytics/LighthousePanel';
import { SupabaseService } from '../services/SupabaseService';
import { useLanguage } from '@/contexts/LanguageContext';

const TABS = [
  { id: 'website', en: 'Website Analytics', es: 'Analytics Web' },
  { id: 'meta', en: 'Meta Ads', es: 'Meta Ads' },
  { id: 'performance', en: 'Performance', es: 'Rendimiento' },
  { id: 'forecast', en: 'Forecast', es: 'Pronóstico' },
  { id: 'aireports', en: 'AI Reports', es: 'Reportes IA' },
  { id: 'forge', en: 'Forge Analytics', es: 'Analytics Forge' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface ForgeProject {
  id: string;
  name: string;
}

function ForgeAnalyticsSummary() {
  const [projects, setProjects] = useState<ForgeProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const defaultEnd = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateRange = { start: defaultStart, end: defaultEnd };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('forge_projects')
          .select('id, name')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (data && data.length > 0) {
          setProjects(data);
          setSelectedProjectId(data[0].id);
        }
      } catch (e) {
        console.error('[ForgeAnalyticsSummary]', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return <div className="text-center text-muted-foreground py-10">Loading projects...</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>No Forge projects found.</p>
        <p className="text-sm mt-1">Create a project in the Wyrd Forge studio to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {projects.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-400">Project:</label>
          <select
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <TrafficCharts projectId={selectedProjectId} dateRange={dateRange} />

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Performance Audit</h3>
        <LighthousePanel projectId={selectedProjectId} />
      </div>
    </div>
  );
}

const MetricsPage = () => {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('website');

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {lang === 'es' ? 'Métricas' : 'Metrics'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {lang === 'es' ? 'Monitorea el rendimiento en todos tus canales' : 'Track performance across all your channels'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-800">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-primary text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {lang === 'es' ? tab.es : tab.en}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'website' && <WebAnalytics />}
      {activeTab === 'meta' && <MetaAds />}
      {activeTab === 'performance' && <Performance />}
      {activeTab === 'forecast' && <Forecast />}
      {activeTab === 'aireports' && <AIReports />}
      {activeTab === 'forge' && <ForgeAnalyticsSummary />}
    </div>
  );
};

export default MetricsPage;

import { useState, useEffect } from 'react';
import WebAnalytics from './metrics/WebAnalytics';
import MetaAds from './metrics/MetaAds';
import Performance from './metrics/Performance';
import Forecast from './metrics/Forecast';
import AIReports from './metrics/AIReports';
import { TrafficCharts } from '../components/settings/analytics/TrafficCharts';
import { LighthousePanel } from '../components/settings/analytics/LighthousePanel';
import { SupabaseService } from '../services/SupabaseService';

const TABS = [
  'Website Analytics',
  'Meta Ads',
  'Performance',
  'Forecast',
  'AI Reports',
  'Forge Analytics',
] as const;

type Tab = (typeof TABS)[number];

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
  const [activeTab, setActiveTab] = useState<Tab>('Website Analytics');

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Metrics</h1>
        <p className="text-muted-foreground mt-1">Track performance across all your channels</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-800">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'Website Analytics' && <WebAnalytics />}
      {activeTab === 'Meta Ads' && <MetaAds />}
      {activeTab === 'Performance' && <Performance />}
      {activeTab === 'Forecast' && <Forecast />}
      {activeTab === 'AI Reports' && <AIReports />}
      {activeTab === 'Forge Analytics' && <ForgeAnalyticsSummary />}
    </div>
  );
};

export default MetricsPage;

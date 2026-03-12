import { useState } from 'react';
import WebAnalytics from './metrics/WebAnalytics';

const TABS = [
  'Website Analytics',
  'Meta Ads',
  'Performance',
  'Forecast',
  'Reports',
] as const;

type Tab = (typeof TABS)[number];

const ComingSoon = ({ label }: { label: string }) => (
  <div className="bg-zinc-800 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
    <p className="text-zinc-400 font-medium">{label}</p>
    <p className="text-zinc-600 text-sm">Coming soon</p>
  </div>
);

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
      {activeTab === 'Meta Ads' && <ComingSoon label="Meta Ads" />}
      {activeTab === 'Performance' && <ComingSoon label="Performance" />}
      {activeTab === 'Forecast' && <ComingSoon label="Forecast" />}
      {activeTab === 'Reports' && <ComingSoon label="Reports" />}
    </div>
  );
};

export default MetricsPage;

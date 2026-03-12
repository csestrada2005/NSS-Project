import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMetaConnection,
  disconnectMeta,
  initiateMetaOAuth,
  fetchMetaData,
  parseMetaData,
  type MetaConnection,
  type MetaDailyRow,
} from '@/services/data/metaAdsService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const toYMD = (d: Date): string => d.toISOString().slice(0, 10);

const defaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: toYMD(start), end: toYMD(end) };
};

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};

const fmtCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const fmtNumber = (n: number): string =>
  new Intl.NumberFormat('en-US').format(n);

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

// ── Main Component ─────────────────────────────────────────────────────────────

const MetaAds = () => {
  const { user, isCliente } = useAuth();

  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaData, setMetaData] = useState<MetaDailyRow[]>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [pendingRange, setPendingRange] = useState(defaultDateRange);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  // Handle URL params on mount (after OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_success') === 'true') {
      showToast('success', 'Meta Ads connected successfully!');
    } else if (params.get('meta_error')) {
      showToast('error', `Connection failed: ${params.get('meta_error')}`);
    }
    if (params.has('meta_success') || params.has('meta_error')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('meta_success');
      url.searchParams.delete('meta_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const loadData = useCallback(
    async (conn: MetaConnection, range: { start: string; end: string }) => {
      if (!user) return;
      setError(null);
      try {
        const raw = await fetchMetaData(user.id, range.start, range.end);
        const parsed = parseMetaData(raw);
        setMetaData(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch Meta Ads data';
        setError(msg);
      }
    },
    [user]
  );

  // Load connection on mount
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      setLoading(true);
      try {
        const conn = await getMetaConnection(user.id);
        setConnection(conn);
        if (conn) {
          await loadData(conn, dateRange);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load connection';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      await initiateMetaOAuth(user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate connection';
      showToast('error', msg);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user) return;
    setDisconnecting(true);
    try {
      await disconnectMeta(user.id);
      setConnection(null);
      setMetaData([]);
      setError(null);
      showToast('success', 'Meta Ads disconnected.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect';
      showToast('error', msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleApplyRange = async () => {
    if (!user || !connection) return;
    setDateRange(pendingRange);
    setLoading(true);
    await loadData(connection, pendingRange);
    setLoading(false);
  };

  // ── Aggregates ──
  const totalSpend = metaData.reduce((s, r) => s + r.spend, 0);
  const totalImpressions = metaData.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = metaData.reduce((s, r) => s + r.clicks, 0);
  const avgCTR = metaData.length > 0
    ? metaData.reduce((s, r) => s + r.ctr, 0) / metaData.length
    : 0;
  const avgCPM = metaData.length > 0
    ? metaData.reduce((s, r) => s + r.cpm, 0) / metaData.length
    : 0;
  const avgROAS = metaData.length > 0
    ? metaData.reduce((s, r) => s + r.roas, 0) / metaData.length
    : 0;

  const chartData = metaData.map((r) => ({ ...r, dateLabel: fmtDate(r.date) }));

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm">
          {error}
        </div>
      )}

      {/* ── CONNECTION BANNER ── */}
      {!loading && !connection && (
        <div className="bg-zinc-800 rounded-xl p-8 flex flex-col items-center text-center gap-4 max-w-lg mx-auto">
          <div className="bg-zinc-700 rounded-full p-4">
            <span className="text-2xl font-bold text-white tracking-tight">Meta Ads</span>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Connect your Meta Ads account to view ad performance data including spend, impressions, CTR, and ROAS.
          </p>
          {isCliente ? (
            <p className="text-zinc-500 text-sm italic">
              Your account has not been connected yet. Contact your account manager.
            </p>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              {connecting ? 'Redirecting…' : 'Connect Meta Ads'}
            </button>
          )}
        </div>
      )}

      {/* ── CONNECTED HEADER ── */}
      {!loading && connection && (
        <div className="bg-zinc-800 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-2 flex-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-emerald-400 text-sm font-medium">Connected</span>
            {connection.account_name && (
              <span className="text-zinc-500 text-xs ml-2">· {connection.account_name}</span>
            )}
          </div>

          {/* Date range picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={pendingRange.start}
              max={pendingRange.end}
              onChange={(e) => setPendingRange((p) => ({ ...p, start: e.target.value }))}
              className="bg-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 border border-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <span className="text-zinc-500 text-xs">to</span>
            <input
              type="date"
              value={pendingRange.end}
              min={pendingRange.start}
              onChange={(e) => setPendingRange((p) => ({ ...p, end: e.target.value }))}
              className="bg-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 border border-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleApplyRange}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-zinc-300 text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      )}

      {/* ── LOADING SKELETONS ── */}
      {loading && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonChart />
        </>
      )}

      {/* ── KPI CARDS ── */}
      {!loading && connection && metaData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Total Spend</p>
            <p className="text-2xl font-bold text-rose-400">{fmtCurrency(totalSpend)}</p>
          </div>
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Impressions</p>
            <p className="text-2xl font-bold text-blue-400">{fmtNumber(totalImpressions)}</p>
          </div>
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Clicks</p>
            <p className="text-2xl font-bold text-emerald-400">{fmtNumber(totalClicks)}</p>
          </div>
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Avg CTR</p>
            <p className="text-2xl font-bold text-amber-400">{avgCTR.toFixed(2)}%</p>
          </div>
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Avg CPM</p>
            <p className="text-2xl font-bold text-purple-400">{fmtCurrency(avgCPM)}</p>
          </div>
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Avg ROAS</p>
            <p className="text-2xl font-bold text-cyan-400">{avgROAS.toFixed(2)}x</p>
          </div>
        </div>
      )}

      {/* ── CHART ── */}
      {!loading && connection && metaData.length > 0 && (
        <div className="bg-zinc-800 rounded-xl p-5">
          <p className="text-sm font-semibold text-zinc-200 mb-4">Spend &amp; Clicks Over Time</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#a1a1aa', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, color: '#e4e4e7' }}
                labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa', paddingTop: 8 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="spend"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={false}
                name="Spend ($)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="clicks"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="Clicks"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && connection && !error && metaData.length === 0 && (
        <div className="bg-zinc-800 rounded-xl p-10 text-center text-zinc-500 text-sm">
          No data available for this date range.
        </div>
      )}
    </div>
  );
};

export default MetaAds;

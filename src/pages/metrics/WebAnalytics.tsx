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
  getAnalyticsConnection,
  disconnectAnalytics,
  initiateGAOAuth,
  fetchGAData,
  parseGAData,
  type AnalyticsConnection,
  type GADailyRow,
} from '@/services/data/analyticsService';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const fmtDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
};

const fmtCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

const fmtNumber = (n: number): string =>
  new Intl.NumberFormat('en-US').format(n);

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Main Component ────────────────────────────────────────────────────────────

const WebAnalytics = () => {
  const { user, isCliente } = useAuth();

  const [connection, setConnection] = useState<AnalyticsConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [gaData, setGaData] = useState<GADailyRow[]>([]);
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

  // Handle URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ga_success') === 'true') {
      showToast('success', 'Google Analytics connected successfully!');
    } else if (params.get('ga_error')) {
      showToast('error', `Connection failed: ${params.get('ga_error')}`);
    }
    if (params.has('ga_success') || params.has('ga_error')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('ga_success');
      url.searchParams.delete('ga_error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const loadData = useCallback(
    async (conn: AnalyticsConnection, range: { start: string; end: string }) => {
      if (!user) return;
      setError(null);
      try {
        const raw = await fetchGAData(user.id, range.start, range.end);
        const parsed = parseGAData(raw);
        setGaData(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch analytics data';
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
        const conn = await getAnalyticsConnection(user.id);
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
      await initiateGAOAuth(user.id);
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
      await disconnectAnalytics(user.id);
      setConnection(null);
      setGaData([]);
      setError(null);
      showToast('success', 'Google Analytics disconnected.');
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
  const totalSessions = gaData.reduce((s, r) => s + r.sessions, 0);
  const totalUsers = gaData.reduce((s, r) => s + r.users, 0);
  const avgBounceRate =
    gaData.length > 0
      ? gaData.reduce((s, r) => s + r.bounceRate, 0) / gaData.length
      : 0;
  const totalConversions = gaData.reduce((s, r) => s + r.conversions, 0);
  const avgSessionDuration =
    gaData.length > 0
      ? gaData.reduce((s, r) => s + r.avgSessionDuration, 0) / gaData.length
      : 0;
  const totalRevenue = gaData.reduce((s, r) => s + r.revenue, 0);

  const chartData = gaData.map((r) => ({ ...r, dateLabel: fmtDate(r.date) }));

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
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
            <span className="text-2xl font-bold text-white tracking-tight">Google Analytics</span>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Connect your Google Analytics 4 property to view website performance data
          </p>
          {isCliente ? (
            <p className="text-zinc-500 text-sm italic">
              Your account has not been connected yet. Contact your account manager.
            </p>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              {connecting ? 'Redirecting…' : 'Connect Google Analytics'}
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
            {connection.property_id && (
              <span className="text-zinc-500 text-xs ml-2">· {connection.property_id}</span>
            )}
          </div>

          {/* Date range picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={pendingRange.start}
              max={pendingRange.end}
              onChange={(e) => setPendingRange((p) => ({ ...p, start: e.target.value }))}
              className="bg-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-1.5 border border-zinc-600 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-zinc-500 text-xs">to</span>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3"><SkeletonChart /></div>
            <div className="lg:col-span-2"><SkeletonChart /></div>
          </div>
        </>
      )}

      {/* ── KPI CARDS ── */}
      {!loading && connection && gaData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Sessions */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Total Sessions</p>
            <p className="text-2xl font-bold text-blue-400">{fmtNumber(totalSessions)}</p>
          </div>
          {/* Users */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Total Users</p>
            <p className="text-2xl font-bold text-emerald-400">{fmtNumber(totalUsers)}</p>
          </div>
          {/* Bounce Rate */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Avg Bounce Rate</p>
            <p className="text-2xl font-bold text-amber-400">{avgBounceRate.toFixed(1)}%</p>
          </div>
          {/* Conversions */}
          <div className="bg-zinc-800 rounded-xl p-5">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Total Conversions</p>
            <p className="text-2xl font-bold text-rose-400">{fmtNumber(totalConversions)}</p>
          </div>
        </div>
      )}

      {/* ── CHARTS ROW ── */}
      {!loading && connection && gaData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Line chart — 60% */}
          <div className="lg:col-span-3 bg-zinc-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-zinc-200 mb-4">Sessions &amp; Users Over Time</p>
            <ResponsiveContainer width="100%" height={220}>
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
                  tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, color: '#e4e4e7' }}
                  labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#a1a1aa', paddingTop: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Sessions"
                />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Users"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Summary stats — 40% */}
          <div className="lg:col-span-2 bg-zinc-800 rounded-xl p-5 flex flex-col gap-4">
            <p className="text-sm font-semibold text-zinc-200">Summary</p>
            <div className="flex flex-col gap-3 flex-1 justify-center">
              <div className="flex justify-between items-center border-b border-zinc-700 pb-3">
                <span className="text-xs text-zinc-400">Avg Session Duration</span>
                <span className="text-sm font-semibold text-zinc-200">{fmtDuration(avgSessionDuration)}</span>
              </div>
              {totalRevenue > 0 && (
                <div className="flex justify-between items-center border-b border-zinc-700 pb-3">
                  <span className="text-xs text-zinc-400">Total Revenue</span>
                  <span className="text-sm font-semibold text-emerald-400">{fmtCurrency(totalRevenue)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-b border-zinc-700 pb-3">
                <span className="text-xs text-zinc-400">Conversions</span>
                <span className="text-sm font-semibold text-zinc-200">{fmtNumber(totalConversions)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">Date Range</span>
                <span className="text-xs text-zinc-400">
                  {fmtDate(dateRange.start)} – {fmtDate(dateRange.end)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && connection && !error && gaData.length === 0 && (
        <div className="bg-zinc-800 rounded-xl p-10 text-center text-zinc-500 text-sm">
          No data available for this date range.
        </div>
      )}
    </div>
  );
};

export default WebAnalytics;

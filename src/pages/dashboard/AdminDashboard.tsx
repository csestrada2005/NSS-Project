import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Briefcase, DollarSign, Clock, Loader2, Flame, Zap, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getAdminKPIs, getRecentSignups, getActiveProjects } from "@/services/data/supabaseData";
import { SupabaseService } from "@/services/SupabaseService";
import type { AdminKPIs, Profile, Project } from "@/types";

const STATUS_COLORS: Record<Project["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-blue-500/10 text-blue-500",
  paused: "bg-amber-500/10 text-amber-500",
  cancelled: "bg-rose-500/10 text-rose-500",
};

const STATUS_LABELS: Record<Project["status"], { es: string; en: string }> = {
  active: { es: "Activo", en: "Active" },
  completed: { es: "Completado", en: "Completed" },
  paused: { es: "Pausado", en: "Paused" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
};

const ROLE_LABELS: Record<string, { es: string; en: string }> = {
  admin: { es: "Admin", en: "Admin" },
  dev: { es: "Dev", en: "Dev" },
  vendedor: { es: "Vendedor", en: "Sales" },
  cliente: { es: "Cliente", en: "Client" },
};

const formatCurrency = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

const DEFAULT_KPIS: AdminKPIs = {
  totalUsers: 0,
  activeProjects: 0,
  monthlyRevenue: 0,
  pendingPayments: 0,
};

interface ForgeStats {
  totalForgeProjects: number;
  deployedProjects: number;
  totalAICalls: number;
  totalSnapshots: number;
  mostActiveProjects: { name: string; ai_call_count: number; last_active_at: string }[];
}

interface CreditStats {
  revenueAllTime: number;
  creditsSpentMTD: number;
  activeWallets: number;
}

interface PlatformUsageRow {
  full_name: string | null;
  total_spent: number;
}

interface PlatformUsage {
  topSpenders: PlatformUsageRow[];
  totalAICallsMTD: number;
  totalActiveForgeProjects: number;
}

const AdminDashboard = () => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<AdminKPIs>(DEFAULT_KPIS);
  const [recentSignups, setRecentSignups] = useState<Profile[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [forgeVisitorsMTD, setForgeVisitorsMTD] = useState<number | string>('--');
  const [forgeStats, setForgeStats] = useState<ForgeStats | null>(null);
  const [forgeStatsLoading, setForgeStatsLoading] = useState(true);
  const [creditStats, setCreditStats] = useState<CreditStats | null>(null);
  const [creditStatsLoading, setCreditStatsLoading] = useState(true);
  const [platformUsage, setPlatformUsage] = useState<PlatformUsage | null>(null);
  const [platformUsageLoading, setPlatformUsageLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

        const [kpiData, signups, projects] = await Promise.all([
          getAdminKPIs(),
          getRecentSignups(),
          getActiveProjects(),
        ]);
        if (!cancelled) {
          setKpis(kpiData);
          setRecentSignups(signups);
          setActiveProjects(projects);
        }

        // Forge Analytics MTD visitors
        try {
          const supabase = SupabaseService.getInstance().client;
          const { data } = await supabase
            .from('forge_analytics')
            .select('visitors')
            .gte('date', startOfMonth)
            .lt('date', startOfNextMonth);
          if (!cancelled && data) {
            const total = data.reduce((s: number, r: any) => s + (r.visitors ?? 0), 0);
            setForgeVisitorsMTD(total);
          }
        } catch {
          // Table may not exist yet — keep '--'
        }
      } catch (err) {
        console.error("Admin dashboard fetch failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Wyrd Forge platform stats
  useEffect(() => {
    let cancelled = false;
    const loadForgeStats = async () => {
      setForgeStatsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [
          { count: totalForgeProjects },
          { count: deployedProjects },
          { data: aiCallsData },
          { count: totalSnapshots },
          { data: mostActiveProjects },
        ] = await Promise.all([
          supabase.from('forge_projects').select('*', { count: 'exact', head: true }),
          supabase.from('forge_projects').select('*', { count: 'exact', head: true }).not('deployment_url', 'is', null),
          supabase.from('forge_projects').select('ai_call_count'),
          supabase.from('forge_snapshots').select('*', { count: 'exact', head: true }),
          supabase.from('forge_projects')
            .select('name, ai_call_count, last_active_at')
            .gte('last_active_at', thirtyDaysAgo)
            .order('last_active_at', { ascending: false })
            .limit(5),
        ]);

        const totalAICalls = (aiCallsData ?? []).reduce((sum: number, p: any) => sum + (p.ai_call_count ?? 0), 0);

        if (!cancelled) {
          setForgeStats({
            totalForgeProjects: totalForgeProjects ?? 0,
            deployedProjects: deployedProjects ?? 0,
            totalAICalls,
            totalSnapshots: totalSnapshots ?? 0,
            mostActiveProjects: mostActiveProjects ?? [],
          });
        }
      } catch {
        // forge_projects may not have all columns yet — fail gracefully
      } finally {
        if (!cancelled) setForgeStatsLoading(false);
      }
    };
    loadForgeStats();
    return () => { cancelled = true; };
  }, []);

  // Credit revenue + usage stats
  useEffect(() => {
    let cancelled = false;
    const loadCreditStats = async () => {
      setCreditStatsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const [
          { data: purchaseData },
          { data: spendData },
          { count: activeWallets },
        ] = await Promise.all([
          supabase
            .from('forge_credit_transactions')
            .select('amount_credits')
            .eq('type', 'purchase'),
          supabase
            .from('forge_credit_transactions')
            .select('amount_credits')
            .eq('type', 'spend')
            .gte('created_at', startOfMonth),
          supabase
            .from('forge_credit_wallets')
            .select('*', { count: 'exact', head: true })
            .gt('balance_credits', 0),
        ]);

        const revenueAllTime = (purchaseData ?? []).reduce(
          (sum: number, r: any) => sum + (r.amount_credits ?? 0) * 0.01,
          0
        );
        const creditsSpentMTD = (spendData ?? []).reduce(
          (sum: number, r: any) => sum + Math.abs(r.amount_credits ?? 0),
          0
        );

        if (!cancelled) {
          setCreditStats({
            revenueAllTime,
            creditsSpentMTD,
            activeWallets: activeWallets ?? 0,
          });
        }
      } catch {
        // Tables may not exist yet — fail gracefully
      } finally {
        if (!cancelled) setCreditStatsLoading(false);
      }
    };
    loadCreditStats();
    return () => { cancelled = true; };
  }, []);

  // Platform usage stats (MTD)
  useEffect(() => {
    let cancelled = false;
    const loadPlatformUsage = async () => {
      setPlatformUsageLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const [
          { data: spendersData },
          { data: aiCallsData },
          { count: activeForgeProjects },
        ] = await Promise.all([
          supabase
            .from('forge_credit_transactions')
            .select('user_id, amount_credits, profiles!inner(full_name)')
            .eq('type', 'spend')
            .gte('created_at', startOfMonth),
          supabase
            .from('forge_projects')
            .select('ai_call_count')
            .gte('updated_at', startOfMonth),
          supabase
            .from('forge_projects')
            .select('*', { count: 'exact', head: true })
            .gte('updated_at', startOfMonth),
        ]);

        // Aggregate top spenders
        const spenderMap = new Map<string, { full_name: string | null; total: number }>();
        for (const row of spendersData ?? []) {
          const profile = (row as any).profiles;
          const name = profile?.full_name ?? row.user_id;
          const existing = spenderMap.get(row.user_id) ?? { full_name: name, total: 0 };
          existing.total += Math.abs(row.amount_credits ?? 0);
          spenderMap.set(row.user_id, existing);
        }
        const topSpenders = Array.from(spenderMap.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
          .map((s) => ({ full_name: s.full_name, total_spent: s.total }));

        const totalAICallsMTD = (aiCallsData ?? []).reduce(
          (sum: number, p: any) => sum + (p.ai_call_count ?? 0),
          0
        );

        if (!cancelled) {
          setPlatformUsage({
            topSpenders,
            totalAICallsMTD,
            totalActiveForgeProjects: activeForgeProjects ?? 0,
          });
        }
      } catch {
        // Fail gracefully
      } finally {
        if (!cancelled) setPlatformUsageLoading(false);
      }
    };
    loadPlatformUsage();
    return () => { cancelled = true; };
  }, []);

  const kpiCards = [
    { label: { es: "Total usuarios", en: "Total users" }, value: String(kpis.totalUsers), icon: Users },
    { label: { es: "Proyectos activos", en: "Active projects" }, value: String(kpis.activeProjects), icon: Briefcase },
    { label: { es: "Ingresos del mes", en: "Monthly revenue" }, value: formatCurrency(kpis.monthlyRevenue, lang), icon: DollarSign },
    { label: { es: "Pagos pendientes", en: "Pending payments" }, value: formatCurrency(kpis.pendingPayments, lang), icon: Clock },
    { label: { es: "Visitas Forge (mes)", en: "Site Visitors (MTD)" }, value: String(forgeVisitorsMTD), icon: Users },
  ];

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {lang === "es" ? "Panel de Administración" : "Admin Dashboard"}
        </h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          {lang === "es" ? "Vista global del sistema" : "System-wide overview"}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label.es}
            className="rounded-xl p-5 bg-card border border-border group hover:border-primary/20 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {kpi.label[lang]}
              </span>
              <kpi.icon size={15} strokeWidth={1.5} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            {isLoading ? (
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signups */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Registros recientes" : "Recent signups"}
            </h2>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : recentSignups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {lang === "es" ? "Sin registros aún" : "No signups yet"}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">{lang === "es" ? "Nombre" : "Name"}</th>
                    <th className="text-left px-3 py-2 font-medium">{lang === "es" ? "Rol" : "Role"}</th>
                    <th className="text-left px-3 py-2 font-medium">{lang === "es" ? "Fecha" : "Date"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentSignups.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-foreground">{p.full_name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{ROLE_LABELS[p.role]?.[lang] ?? p.role}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Active projects */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Proyectos activos" : "Active projects"}
            </h2>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {lang === "es" ? "Sin proyectos activos" : "No active projects"}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {activeProjects.map((project) => (
                  <li
                    key={project.id}
                    onClick={() => navigate('/projects')}
                    className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{project.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(project.created_at).toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <span className={`ml-3 shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[project.status]}`}>
                      {STATUS_LABELS[project.status][lang]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Wyrd Forge Platform section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Flame size={16} className="text-red-500" />
          <h2 className="text-base font-semibold text-foreground">
            {lang === "es" ? "Plataforma Wyrd Forge" : "Wyrd Forge Platform"}
          </h2>
        </div>

        {/* Forge KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: { es: 'Total proyectos Forge', en: 'Total Forge projects' }, value: forgeStats?.totalForgeProjects ?? '--', icon: Flame },
            { label: { es: 'Proyectos desplegados', en: 'Deployed projects' }, value: forgeStats?.deployedProjects ?? '--', icon: Globe },
            { label: { es: 'Total llamadas IA', en: 'Total AI calls' }, value: forgeStats?.totalAICalls ?? '--', icon: Zap },
            { label: { es: 'Total snapshots', en: 'Total snapshots' }, value: forgeStats?.totalSnapshots ?? '--', icon: Briefcase },
          ].map((card) => (
            <div key={card.label.es} className="rounded-xl p-5 bg-card border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {card.label[lang]}
                </span>
                <card.icon size={15} strokeWidth={1.5} className="text-muted-foreground" />
              </div>
              {forgeStatsLoading ? (
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{String(card.value)}</p>
              )}
            </div>
          ))}
        </div>

        {/* Credit KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            {
              label: { es: 'Ingresos créditos (total)', en: 'Credits Revenue (all time)' },
              value: creditStats ? formatCurrency(creditStats.revenueAllTime, lang) : '--',
              icon: DollarSign,
            },
            {
              label: { es: 'Créditos gastados (mes)', en: 'Credits Spent (MTD)' },
              value: creditStats ? creditStats.creditsSpentMTD.toLocaleString() : '--',
              icon: Zap,
            },
            {
              label: { es: 'Wallets activas', en: 'Active Wallets' },
              value: creditStats ? String(creditStats.activeWallets) : '--',
              icon: Users,
            },
          ].map((card) => (
            <div key={card.label.es} className="rounded-xl p-5 bg-card border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {card.label[lang]}
                </span>
                <card.icon size={15} strokeWidth={1.5} className="text-muted-foreground" />
              </div>
              {creditStatsLoading ? (
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Most active projects */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Proyectos más activos (30 días)" : "Most active projects (30 days)"}
            </h2>
          </div>
          <div className="p-2">
            {forgeStatsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : !forgeStats?.mostActiveProjects.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No forge activity yet</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Project</th>
                    <th className="text-left px-3 py-2 font-medium">AI Calls</th>
                    <th className="text-left px-3 py-2 font-medium">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {forgeStats.mostActiveProjects.map((p, i) => (
                    <tr key={i} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-foreground truncate max-w-[200px]">{p.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.ai_call_count ?? 0}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.last_active_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Platform Usage section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-amber-500" />
          <h2 className="text-base font-semibold text-foreground">
            {lang === "es" ? "Uso de la plataforma (mes)" : "Platform Usage (MTD)"}
          </h2>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl p-5 bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {lang === "es" ? "Llamadas IA (mes)" : "AI Calls (MTD)"}
              </span>
              <Zap size={15} strokeWidth={1.5} className="text-muted-foreground" />
            </div>
            {platformUsageLoading ? (
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {platformUsage?.totalAICallsMTD?.toLocaleString() ?? 0}
              </p>
            )}
          </div>
          <div className="rounded-xl p-5 bg-card border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {lang === "es" ? "Proyectos Forge activos" : "Active Forge Projects"}
              </span>
              <Flame size={15} strokeWidth={1.5} className="text-muted-foreground" />
            </div>
            {platformUsageLoading ? (
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {platformUsage?.totalActiveForgeProjects ?? 0}
              </p>
            )}
          </div>
        </div>

        {/* Top spenders table */}
        <div className="rounded-xl bg-card border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              {lang === "es" ? "Top usuarios por créditos gastados (mes)" : "Top users by credit spend (MTD)"}
            </h2>
          </div>
          <div className="p-2">
            {platformUsageLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : !platformUsage?.topSpenders.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {lang === "es" ? "Sin actividad este mes" : "No credit activity this month"}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">{lang === "es" ? "Nombre" : "Name"}</th>
                    <th className="text-right px-3 py-2 font-medium">{lang === "es" ? "Créditos gastados" : "Credits Spent"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {platformUsage.topSpenders.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2.5 text-muted-foreground font-mono">{i + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground">{row.full_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground font-mono">
                        {row.total_spent.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

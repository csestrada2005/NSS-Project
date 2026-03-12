import { SupabaseService } from '../SupabaseService';
import type { Item, Profile, Project, Payment, DashboardKPIs, AdminKPIs } from '../../types';

const supabase = SupabaseService.getInstance().client;

export const fetchItems = async (): Promise<Item[]> => {
  const { data, error } = await supabase
    .from('items')
    .select('*');

  if (error) {
    console.error('Error fetching items:', error);
    return [];
  }
  return data as Item[];
};

export const fetchProfile = async (id: string): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data as Profile;
};

export const getRecentProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching recent projects:', error);
    return [];
  }
  return (data ?? []) as Project[];
};

export const getDashboardKPIs = async (): Promise<DashboardKPIs> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [activeProjectsRes, monthlyRevenueRes, pendingPaymentsRes, pipelineLeadsRes] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', startOfMonth)
        .lt('created_at', startOfNextMonth),

      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'pending'),

      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'lead'),
    ]);

  if (activeProjectsRes.error) console.error('Error fetching active projects count:', activeProjectsRes.error);
  if (monthlyRevenueRes.error) console.error('Error fetching monthly revenue:', monthlyRevenueRes.error);
  if (pendingPaymentsRes.error) console.error('Error fetching pending payments:', pendingPaymentsRes.error);
  if (pipelineLeadsRes.error) console.error('Error fetching pipeline leads count:', pipelineLeadsRes.error);

  const monthlyRevenue = (monthlyRevenueRes.data ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + (row.amount ?? 0),
    0
  );

  const pendingPayments = (pendingPaymentsRes.data ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + (row.amount ?? 0),
    0
  );

  return {
    activeProjects: activeProjectsRes.count ?? 0,
    monthlyRevenue,
    pendingPayments,
    pipelineLeads: pipelineLeadsRes.count ?? 0,
  };
};

export const getAdminKPIs = async (): Promise<AdminKPIs> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [totalUsersRes, activeProjectsRes, monthlyRevenueRes, pendingPaymentsRes] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true }),

      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', startOfMonth)
        .lt('created_at', startOfNextMonth),

      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'pending'),
    ]);

  if (totalUsersRes.error) console.error('Error fetching total users:', totalUsersRes.error);
  if (activeProjectsRes.error) console.error('Error fetching active projects:', activeProjectsRes.error);
  if (monthlyRevenueRes.error) console.error('Error fetching monthly revenue:', monthlyRevenueRes.error);
  if (pendingPaymentsRes.error) console.error('Error fetching pending payments:', pendingPaymentsRes.error);

  const monthlyRevenue = (monthlyRevenueRes.data ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + (row.amount ?? 0),
    0
  );

  const pendingPayments = (pendingPaymentsRes.data ?? []).reduce(
    (sum: number, row: { amount: number }) => sum + (row.amount ?? 0),
    0
  );

  return {
    totalUsers: totalUsersRes.count ?? 0,
    activeProjects: activeProjectsRes.count ?? 0,
    monthlyRevenue,
    pendingPayments,
  };
};

export const getRecentSignups = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching recent signups:', error);
    return [];
  }
  return (data ?? []) as Profile[];
};

export const getActiveProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching active projects:', error);
    return [];
  }
  return (data ?? []) as Project[];
};

export const getClientProjects = async (): Promise<Project[]> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('client_profile_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client projects:', error);
    return [];
  }
  return (data ?? []) as Project[];
};

export const getClientPayments = async (projectIds: string[]): Promise<Payment[]> => {
  if (projectIds.length === 0) return [];

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client payments:', error);
    return [];
  }
  return (data ?? []) as Payment[];
};

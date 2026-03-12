import { SupabaseService } from '../SupabaseService';
import type { Item, Profile, Project, DashboardKPIs } from '../../types';

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

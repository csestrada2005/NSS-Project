import { SupabaseService } from '../SupabaseService';
import type { Item, Profile, Project, Payment, DashboardKPIs, AdminKPIs, Contact, Report, Deal } from '../../types';

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
  try {
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
  } catch (err) {
    console.error('getDashboardKPIs failed:', err);
    return { activeProjects: 0, monthlyRevenue: 0, pendingPayments: 0, pipelineLeads: 0 };
  }
};

export const getAdminKPIs = async (): Promise<AdminKPIs> => {
  try {
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
  } catch (err) {
    console.error('getAdminKPIs failed:', err);
    return { totalUsers: 0, activeProjects: 0, monthlyRevenue: 0, pendingPayments: 0 };
  }
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

export const getContacts = async (
  page: number = 1,
  pageSize: number = 20,
  search: string = ''
): Promise<{ data: Contact[]; count: number }> => {
  const offset = (page - 1) * pageSize;
  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching contacts:', error);
    return { data: [], count: 0 };
  }
  return { data: (data ?? []) as Contact[], count: count ?? 0 };
};

export const getMyContactRecord = async (email: string): Promise<Contact | null> => {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    console.error('Error fetching contact record:', error);
    return null;
  }
  return data as Contact;
};

export const createContact = async (data: {
  name: string;
  email?: string;
  phone?: string;
  type: 'lead' | 'client' | 'partner';
  status?: string;
}): Promise<Contact | null> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({ ...data, user_id: user?.id })
    .select()
    .single();

  if (error) {
    console.error('Error creating contact:', error);
    return null;
  }
  return created as Contact;
};

export const updateContact = async (
  id: string,
  data: Partial<Pick<Contact, 'name' | 'email' | 'phone' | 'type' | 'status'>>
): Promise<Contact | null> => {
  const { data: updated, error } = await supabase
    .from('contacts')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating contact:', error);
    return null;
  }
  return updated as Contact;
};

export const deleteContact = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting contact:', error);
    return false;
  }
  return true;
};

// Used internally by project queries
type ProjectWithClient = Project & { contacts: { name: string } | null };

export const getProjects = async (
  page: number = 1,
  pageSize: number = 20,
  search: string = ''
): Promise<{ data: ProjectWithClient[]; count: number }> => {
  const offset = (page - 1) * pageSize;
  let query = supabase
    .from('projects')
    .select('*, contacts(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching projects:', error);
    return { data: [], count: 0 };
  }
  return { data: (data ?? []) as ProjectWithClient[], count: count ?? 0 };
};

export const getProjectsForClient = async (): Promise<ProjectWithClient[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('*, contacts(name)')
    .eq('client_profile_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client projects:', error);
    return [];
  }
  return (data ?? []) as ProjectWithClient[];
};

export const getContactsForDropdown = async (): Promise<{ id: string; name: string }[]> => {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching contacts for dropdown:', error);
    return [];
  }
  return (data ?? []) as { id: string; name: string }[];
};

export const createProject = async (data: {
  title: string;
  description?: string;
  status: Project['status'];
  client_id?: string | null;
}): Promise<ProjectWithClient | null> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: created, error } = await supabase
    .from('projects')
    .insert({ ...data, user_id: user?.id })
    .select('*, contacts(name)')
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return null;
  }
  return created as ProjectWithClient;
};

export const updateProject = async (
  id: string,
  data: Partial<Pick<Project, 'title' | 'description' | 'status'> & { client_id?: string | null }>
): Promise<ProjectWithClient | null> => {
  const { data: updated, error } = await supabase
    .from('projects')
    .update(data)
    .eq('id', id)
    .select('*, contacts(name)')
    .single();

  if (error) {
    console.error('Error updating project:', error);
    return null;
  }
  return updated as ProjectWithClient;
};

export const deleteProject = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting project:', error);
    return false;
  }
  return true;
};

// ─── Finance / Payments ───────────────────────────────────────────────────────

type PaymentWithProject = Payment & { projects: { title: string } | null };

export const getPayments = async (
  page: number = 1,
  pageSize: number = 20,
  search: string = ''
): Promise<{ data: PaymentWithProject[]; count: number }> => {
  const offset = (page - 1) * pageSize;
  let query = supabase
    .from('payments')
    .select('*, projects(title)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.or(`invoice_number.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching payments:', error);
    return { data: [], count: 0 };
  }
  return { data: (data ?? []) as PaymentWithProject[], count: count ?? 0 };
};

export const getPaymentsForClient = async (): Promise<PaymentWithProject[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('client_profile_id', user.id);

  if (projectError) {
    console.error('Error fetching client projects for payments:', projectError);
    return [];
  }

  const projectIds = (projectData ?? []).map((p: { id: string }) => p.id);
  if (projectIds.length === 0) return [];

  const { data, error } = await supabase
    .from('payments')
    .select('*, projects(title)')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching client payments:', error);
    return [];
  }
  return (data ?? []) as PaymentWithProject[];
};

export const getProjectsForPaymentDropdown = async (): Promise<{ id: string; title: string }[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title')
    .order('title', { ascending: true });

  if (error) {
    console.error('Error fetching projects for payment dropdown:', error);
    return [];
  }
  return (data ?? []) as { id: string; title: string }[];
};

export const getStaffFinanceKPIs = async (): Promise<{
  totalCollected: number;
  pending: number;
  overdue: number;
  monthlyRevenue: number;
}> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [collectedRes, pendingRes, overdueRes, monthlyRes] = await Promise.all([
    supabase.from('payments').select('amount').eq('status', 'paid'),
    supabase.from('payments').select('amount').eq('status', 'pending'),
    supabase.from('payments').select('amount').eq('status', 'overdue'),
    supabase.from('payments').select('amount').eq('status', 'paid').gte('created_at', startOfMonth),
  ]);

  if (collectedRes.error) console.error('Error fetching total collected:', collectedRes.error);
  if (pendingRes.error) console.error('Error fetching pending total:', pendingRes.error);
  if (overdueRes.error) console.error('Error fetching overdue total:', overdueRes.error);
  if (monthlyRes.error) console.error('Error fetching monthly revenue:', monthlyRes.error);

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + (r.amount ?? 0), 0);

  return {
    totalCollected: sum(collectedRes.data),
    pending: sum(pendingRes.data),
    overdue: sum(overdueRes.data),
    monthlyRevenue: sum(monthlyRes.data),
  };
};

export const getClientFinanceKPIs = async (
  projectIds: string[]
): Promise<{ totalBilled: number; paid: number; pending: number }> => {
  if (projectIds.length === 0) return { totalBilled: 0, paid: 0, pending: 0 };

  const [billedRes, paidRes, pendingRes] = await Promise.all([
    supabase.from('payments').select('amount').in('project_id', projectIds),
    supabase.from('payments').select('amount').in('project_id', projectIds).eq('status', 'paid'),
    supabase.from('payments').select('amount').in('project_id', projectIds).eq('status', 'pending'),
  ]);

  if (billedRes.error) console.error('Error fetching total billed:', billedRes.error);
  if (paidRes.error) console.error('Error fetching paid total:', paidRes.error);
  if (pendingRes.error) console.error('Error fetching pending total:', pendingRes.error);

  const sum = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + (r.amount ?? 0), 0);

  return {
    totalBilled: sum(billedRes.data),
    paid: sum(paidRes.data),
    pending: sum(pendingRes.data),
  };
};

export const createPayment = async (data: {
  invoice_number?: string;
  description?: string;
  amount: number;
  status: Payment['status'];
  due_date?: string | null;
  project_id?: string | null;
  recipient_profile_id?: string | null;
}): Promise<PaymentWithProject | null> => {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: created, error } = await supabase
    .from('payments')
    .insert({ ...data, user_id: user?.id })
    .select('*, projects(title)')
    .single();

  if (error) {
    console.error('Error creating payment:', error);
    return null;
  }
  return created as PaymentWithProject;
};

export const updatePayment = async (
  id: string,
  data: Partial<Pick<Payment, 'invoice_number' | 'description' | 'amount' | 'status' | 'due_date'> & { project_id?: string | null }>
): Promise<PaymentWithProject | null> => {
  const { data: updated, error } = await supabase
    .from('payments')
    .update(data)
    .eq('id', id)
    .select('*, projects(title)')
    .single();

  if (error) {
    console.error('Error updating payment:', error);
    return null;
  }
  return updated as PaymentWithProject;
};

export const deletePayment = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting payment:', error);
    return false;
  }
  return true;
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export const getReports = async (userId: string): Promise<Report[]> => {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching reports:', error);
    return [];
  }
  return (data ?? []) as Report[];
};

export const createReport = async (data: {
  user_id: string;
  title: string;
  prompt: string;
}): Promise<Report | null> => {
  const { data: created, error } = await supabase
    .from('reports')
    .insert({ ...data, status: 'pending' })
    .select()
    .single();

  if (error) {
    console.error('Error creating report:', error);
    return null;
  }
  return created as Report;
};

export const getReportById = async (id: string): Promise<Report | null> => {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching report:', error);
    return null;
  }
  return data as Report;
};

// ─── Deals ────────────────────────────────────────────────────────────────────

type DealWithContact = Deal & { contacts: { name: string } | null };

export const getDeals = async (
  page: number = 1,
  pageSize: number = 20,
  search: string = ''
): Promise<{ data: DealWithContact[]; count: number }> => {
  const offset = (page - 1) * pageSize;
  let query = supabase
    .from('deals')
    .select('*, contacts(name), status, scope_description, timeline, client_profile_id, deposit_paid, forge_project_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) { console.error('Error fetching deals:', error); return { data: [], count: 0 }; }
  return { data: (data ?? []) as DealWithContact[], count: count ?? 0 };
};

export const createDeal = async (data: {
  title: string;
  value: number;
  stage: Deal['stage'];
  probability: number;
  expected_close: string | null;
  contact_id: string | null;
  client_profile_id?: string | null;
  scope_description?: string | null;
  timeline?: string | null;
}): Promise<DealWithContact | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: created, error } = await supabase
    .from('deals')
    .insert({ ...data, user_id: user?.id })
    .select('*, contacts(name)')
    .single();
  if (error) { console.error('Error creating deal:', error); return null; }
  return created as DealWithContact;
};

export const updateDeal = async (
  id: string,
  data: Partial<Pick<Deal, 'title' | 'value' | 'stage' | 'probability' | 'expected_close'> & { contact_id?: string | null; client_profile_id?: string | null; scope_description?: string | null; timeline?: string | null; }>
): Promise<DealWithContact | null> => {
  const { data: updated, error } = await supabase
    .from('deals')
    .update(data)
    .eq('id', id)
    .select('*, contacts(name)')
    .single();
  if (error) { console.error('Error updating deal:', error); return null; }
  return updated as DealWithContact;
};

export const deleteDeal = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from('deals').delete().eq('id', id);
  if (error) { console.error('Error deleting deal:', error); return false; }
  return true;
};

export const getDealRevisions = async (dealId: string) => {
  const { data } = await supabase
    .from('deal_revisions')
    .select('*, profiles!submitted_by(full_name, role)')
    .eq('deal_id', dealId)
    .order('revision_number', { ascending: false });
  return data ?? [];
};

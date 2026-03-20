
export interface Item {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'dev' | 'vendedor' | 'cliente' | null;
  email: string | null;
  avatar_url: string | null;
  last_seen: string | null;
  created_at: string;
  email_alerts?: boolean;
  push_notifications?: boolean;
  pending_role?: 'admin' | 'dev' | 'cliente' | null;
  role_approved?: boolean | null;
}

export interface DataInterface {
  fetchItems: () => Promise<Item[]>;
  fetchProfile: (id: string) => Promise<Profile | null>;
}

export interface Project {
  id: string;
  user_id: string;
  client_profile_id: string | null;
  title: string;
  description: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  created_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  project_id: string | null;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  description: string | null;
  invoice_number: string | null;
  due_date?: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: 'lead' | 'client' | 'partner';
  status: string | null;
  created_at: string;
}

export interface DashboardKPIs {
  activeProjects: number;
  monthlyRevenue: number;
  pendingPayments: number;
  pipelineLeads: number;
}

export interface AdminKPIs {
  totalUsers: number;
  activeProjects: number;
  monthlyRevenue: number;
  pendingPayments: number;
}

export interface Report {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  content: string | null;
  status: 'pending' | 'generating' | 'done' | 'error';
  error_msg: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  value: number;
  stage: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  probability: number;
  expected_close: string | null;
  created_at: string;
}

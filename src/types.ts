
export interface Item {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string;
}

export interface DataInterface {
  fetchItems: () => Promise<Item[]>;
  fetchProfile: (id: string) => Promise<Profile | null>;
}

export interface Project {
  id: string;
  user_id: string;
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
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
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

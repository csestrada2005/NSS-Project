import { SupabaseService } from './SupabaseService';

// Aprobación de roles de la plataforma: SIEMPRE por el servidor. La base
// rechaza cualquier cambio de `role`/`role_approved` hecho desde el navegador
// (candado protect_profile_privileges), y además un admin sólo puede leer su
// propia fila de `profiles` — la lista de pendientes también viene de aquí.

export interface PendingProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  pending_role: 'admin' | 'dev' | 'cliente' | null;
  avatar_url: string | null;
}

async function authHeaders() {
  const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
  return { 'Content-Type': 'application/json', Authorization };
}

export const AdminService = {
  async getPendingUsers(): Promise<PendingProfile[]> {
    const response = await fetch('/api/admin/pending-users', { headers: await authHeaders() });
    if (!response.ok) throw new Error(`pending-users ${response.status}`);
    const data = await response.json();
    return Array.isArray(data?.users) ? data.users : [];
  },

  async decideRole(userId: string, decision: 'approve' | 'reject'): Promise<void> {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role-decision`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `role-decision ${response.status}`);
    }
  },
};

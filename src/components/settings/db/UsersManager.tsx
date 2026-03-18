import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  email: string | null;
  last_seen: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-600/20 text-red-400 border-red-600/30',
  dev: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  vendedor: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  cliente: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
};

const ROLES = ['admin', 'dev', 'vendedor', 'cliente'];

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const PAGE_SIZE = 20;

export function UsersManager() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [page]);

  const load = async () => {
    setIsLoading(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data, count } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, last_seen, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      setProfiles(data ?? []);
      setTotal(count ?? 0);
    } catch (e) {
      console.error('[UsersManager] load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
      setSuccessId(userId);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (e) {
      console.error('[UsersManager] update role error:', e);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-center text-zinc-500 text-sm py-8">Loading users...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="text-left py-2 px-3 font-medium">User</th>
                <th className="text-left py-2 px-3 font-medium">Email</th>
                <th className="text-left py-2 px-3 font-medium">Role</th>
                <th className="text-left py-2 px-3 font-medium">Last seen</th>
                <th className="text-left py-2 px-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 shrink-0">
                        {getInitials(p.full_name)}
                      </div>
                      <span className="text-zinc-200 font-medium">{p.full_name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-400">{p.email ?? '—'}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={p.role}
                        onChange={(e) => updateRole(p.id, e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      {successId === p.id && (
                        <span className="text-emerald-400 text-[10px]">Saved!</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-zinc-500">{relativeTime(p.last_seen)}</td>
                  <td className="py-2.5 px-3 text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-zinc-500">{total} users</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-zinc-400">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

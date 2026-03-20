import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, UserPlus, Loader2, ChevronDown } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { CollaboratorService, type Collaborator } from '@/services/CollaboratorService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface SearchResult {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
}

interface PendingInvite {
  user: SearchResult;
  role: 'read' | 'edit';
}

interface Props {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

function Avatar({ name, avatarUrl, size = 8 }: { name: string | null; avatarUrl?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ''}
        className={`w-${size} h-${size} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div
      className={`w-${size} h-${size} rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0`}
    >
      {initials}
    </div>
  );
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500/10 text-red-400',
  dev: 'bg-blue-500/10 text-blue-400',
  vendedor: 'bg-purple-500/10 text-purple-400',
  cliente: 'bg-emerald-500/10 text-emerald-400',
};

export function ShareProjectModal({ projectId, projectName, onClose }: Props) {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [sending, setSending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load existing collaborators
  useEffect(() => {
    CollaboratorService.getCollaborators(projectId).then(setCollaborators);
  }, [projectId]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_url')
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .not('role', 'is', null)
        .neq('id', user?.id ?? '')
        .limit(10);
      setSearchResults((data ?? []) as SearchResult[]);
    } catch (e) {
      console.error('[ShareProjectModal] search error:', e);
    } finally {
      setSearching(false);
    }
  }, [user?.id]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch]);

  const addToPending = (result: SearchResult) => {
    if (pendingInvites.some((p) => p.user.id === result.id)) return;
    if (collaborators.some((c) => c.user_id === result.id)) return;
    setPendingInvites((prev) => [...prev, { user: result, role: 'read' }]);
    setQuery('');
    setSearchResults([]);
  };

  const removePending = (userId: string) => {
    setPendingInvites((prev) => prev.filter((p) => p.user.id !== userId));
  };

  const updatePendingRole = (userId: string, role: 'read' | 'edit') => {
    setPendingInvites((prev) =>
      prev.map((p) => (p.user.id === userId ? { ...p, role } : p))
    );
  };

  const handleSend = async () => {
    if (!user || pendingInvites.length === 0) return;
    setSending(true);
    try {
      await CollaboratorService.inviteUsers(
        projectId,
        user.id,
        pendingInvites.map((p) => ({ userId: p.user.id, role: p.role })),
        projectName,
        profile?.full_name ?? 'Someone'
      );
      toast.success('Invitations sent');
      setPendingInvites([]);
      // Refresh collaborators list
      const updated = await CollaboratorService.getCollaborators(projectId);
      setCollaborators(updated);
    } catch {
      toast.error('Failed to send invitations');
    } finally {
      setSending(false);
    }
  };

  const handleRevokeCollaborator = async (collaboratorId: string) => {
    await CollaboratorService.revokeAccess(collaboratorId);
    setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
    toast.success('Access revoked');
  };

  const handleUpdateCollaboratorRole = async (collaboratorId: string, newRole: 'read' | 'edit') => {
    await CollaboratorService.updateRole(collaboratorId, newRole);
    setCollaborators((prev) =>
      prev.map((c) => (c.id === collaboratorId ? { ...c, role: newRole } : c))
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
            <h2 className="text-base font-semibold text-white">Share Project</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Current collaborators */}
            {collaborators.filter((c) => c.status === 'accepted' || c.status === 'pending').length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Current Collaborators
                </p>
                <div className="space-y-2">
                  {collaborators
                    .filter((c) => c.status !== 'declined')
                    .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50"
                      >
                        <Avatar name={c.profile?.full_name ?? null} avatarUrl={c.profile?.avatar_url} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {c.profile?.full_name ?? c.user_id}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{c.profile?.email}</p>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            c.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {c.status}
                        </span>
                        {/* Role selector */}
                        <div className="relative">
                          <select
                            value={c.role}
                            onChange={(e) =>
                              handleUpdateCollaboratorRole(c.id, e.target.value as 'read' | 'edit')
                            }
                            className="appearance-none text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-red-500"
                          >
                            <option value="read">Read Only</option>
                            <option value="edit">Can Edit</option>
                          </select>
                          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        </div>
                        <button
                          onClick={() => handleRevokeCollaborator(c.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-red-400/10"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Invite People
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-gray-800 border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500"
                />
                {searching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                )}
              </div>

              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="mt-2 rounded-xl border border-gray-700 bg-gray-800 divide-y divide-gray-700 overflow-hidden">
                  {searchResults.map((result) => {
                    const alreadyAdded = pendingInvites.some((p) => p.user.id === result.id);
                    const alreadyCollaborator = collaborators.some((c) => c.user_id === result.id);
                    return (
                      <button
                        key={result.id}
                        onClick={() => addToPending(result)}
                        disabled={alreadyAdded || alreadyCollaborator}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Avatar name={result.full_name} avatarUrl={result.avatar_url} />
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {result.full_name ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{result.email}</p>
                        </div>
                        {result.role && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[result.role] ?? 'bg-gray-700 text-gray-400'}`}
                          >
                            {result.role}
                          </span>
                        )}
                        {alreadyCollaborator ? (
                          <span className="text-xs text-gray-500">Added</span>
                        ) : alreadyAdded ? (
                          <span className="text-xs text-gray-500">Pending</span>
                        ) : (
                          <UserPlus size={14} className="text-gray-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Pending Invites
                </p>
                <div className="space-y-2">
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.user.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700/50"
                    >
                      <Avatar name={invite.user.full_name} avatarUrl={invite.user.avatar_url} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {invite.user.full_name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{invite.user.email}</p>
                      </div>
                      {/* Role selector */}
                      <div className="relative">
                        <select
                          value={invite.role}
                          onChange={(e) =>
                            updatePendingRole(invite.user.id, e.target.value as 'read' | 'edit')
                          }
                          className="appearance-none text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded-lg px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-red-500"
                        >
                          <option value="read">Read Only</option>
                          <option value="edit">Can Edit</option>
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                      </div>
                      <button
                        onClick={() => removePending(invite.user.id)}
                        className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-800 shrink-0">
            <button
              onClick={handleSend}
              disabled={pendingInvites.length === 0 || sending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending && <Loader2 size={14} className="animate-spin" />}
              Send Invitations
              {pendingInvites.length > 0 && ` (${pendingInvites.length})`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

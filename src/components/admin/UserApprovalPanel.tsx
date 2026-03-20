import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Shield, Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { toast } from 'sonner';

interface PendingProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  pending_role: 'admin' | 'dev' | 'cliente' | null;
  avatar_url: string | null;
}

interface UserApprovalPanelProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500/15 text-red-400 border-red-500/20',
  dev: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  cliente: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function UserApprovalPanel({ open, onClose }: UserApprovalPanelProps) {
  const [pendingUsers, setPendingUsers] = useState<PendingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const supabase = SupabaseService.getInstance().client;

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, pending_role, avatar_url')
        .not('pending_role', 'is', null)
        .is('role', null)
        .eq('role_approved', false);
      setPendingUsers((data as PendingProfile[]) ?? []);
    } catch (e) {
      console.error('[UserApprovalPanel] fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPendingUsers();
    }
  }, [open]);

  const handleApprove = async (user: PendingProfile) => {
    if (!user.pending_role) return;
    setProcessingId(user.id);
    try {
      await supabase
        .from('profiles')
        .update({ role: user.pending_role, role_approved: true, pending_role: null })
        .eq('id', user.id);

      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'role_approved',
        title: 'Access granted',
        body: `Your account has been approved. You now have ${user.pending_role} access.`,
        read: false,
      });

      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success(`Approved ${user.full_name ?? 'user'} as ${user.pending_role}`);
    } catch (e) {
      console.error('[UserApprovalPanel] approve error:', e);
      toast.error('Failed to approve user');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (user: PendingProfile) => {
    setProcessingId(user.id);
    try {
      await supabase
        .from('profiles')
        .update({ pending_role: null, role_approved: false })
        .eq('id', user.id);

      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'role_rejected',
        title: 'Access request declined',
        body: 'Your access request was reviewed. Please contact your administrator.',
        read: false,
      });

      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success(`Rejected ${user.full_name ?? 'user'}'s request`);
    } catch (e) {
      console.error('[UserApprovalPanel] reject error:', e);
      toast.error('Failed to reject user');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-30" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-[#111116] border-l border-border z-40 flex flex-col shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">User Approvals</h2>
            {pendingUsers.length > 0 && (
              <span className="min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white px-1.5">
                {pendingUsers.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground">No pending approval requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((user) => {
                const isProcessing = processingId === user.id;
                const initials = getInitials(user.full_name);
                const roleBadge = user.pending_role ? ROLE_BADGE[user.pending_role] : '';

                return (
                  <div
                    key={user.id}
                    className="p-4 rounded-xl border border-border bg-card space-y-3"
                  >
                    {/* User info */}
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.full_name ?? ''}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                          {initials}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {user.full_name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      {user.pending_role && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${roleBadge}`}>
                          {user.pending_role}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(user)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(user)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <XCircle size={12} />
                        )}
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default UserApprovalPanel;

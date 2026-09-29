import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Shield } from 'lucide-react';
import { AdminService, type PendingProfile } from '@/services/AdminService';
import { toast } from 'sonner';
import LoadingSquares from '../brand/LoadingSquares';

interface UserApprovalPanelProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500/15 text-red-400 border-red-500/20',
  dev: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/20',
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

  // Todo por el servidor (AdminService): la base ya no deja escribir `role`
  // desde el navegador, y un admin sólo puede leer su propia fila de profiles.
  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      setPendingUsers(await AdminService.getPendingUsers());
    } catch (e) {
      console.error('[UserApprovalPanel] fetch error:', e);
      toast.error('Failed to load pending users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPendingUsers();
    }
  }, [open]);

  const decide = async (user: PendingProfile, decision: 'approve' | 'reject') => {
    if (decision === 'approve' && !user.pending_role) return;
    setProcessingId(user.id);
    try {
      await AdminService.decideRole(user.id, decision);
      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success(
        decision === 'approve'
          ? `Approved ${user.full_name ?? 'user'} as ${user.pending_role}`
          : `Rejected ${user.full_name ?? 'user'}'s request`
      );
    } catch (e) {
      console.error(`[UserApprovalPanel] ${decision} error:`, e);
      toast.error(decision === 'approve' ? 'Failed to approve user' : 'Failed to reject user');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = (user: PendingProfile) => decide(user, 'approve');
  const handleReject = (user: PendingProfile) => decide(user, 'reject');

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-neutral-800 border-l border-neutral-700 z-40 flex flex-col shadow-xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">User Approvals</h2>
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
              <LoadingSquares size={32} />
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
                    className="p-4 rounded-xl border border-neutral-700 bg-neutral-800 space-y-3"
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
                          <LoadingSquares size={12} />
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
                          <LoadingSquares size={12} />
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

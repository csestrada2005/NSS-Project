import {
  Bell,
  Check,
  CheckCheck,
  Info,
  UserPlus,
  AlertCircle,
  Loader2,
  Shield,
  CheckCircle,
  XCircle,
  Briefcase,
  CreditCard,
  DollarSign,
  Flag,
  MessageSquare,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '@/hooks/useNotifications';
import { SupabaseService } from '@/services/SupabaseService';
import { toast } from 'sonner';
import type { Notification } from '@/services/NotificationService';

function notificationIcon(type: string) {
  switch (type) {
    case 'project_invitation':
      return <UserPlus size={16} className="text-blue-400" />;
    case 'role_approved':
      return <CheckCircle size={16} className="text-emerald-400" />;
    case 'role_rejected':
      return <XCircle size={16} className="text-red-400" />;
    case 'role_request':
      return <Shield size={16} className="text-amber-400" />;
    case 'project_status':
      return <Briefcase size={16} className="text-blue-400" />;
    case 'payment_created':
      return <CreditCard size={16} className="text-blue-400" />;
    case 'payment_paid':
      return <DollarSign size={16} className="text-emerald-400" />;
    case 'milestone_added':
      return <Flag size={16} className="text-amber-400" />;
    case 'milestone_completed':
      return <CheckCircle size={16} className="text-emerald-400" />;
    case 'milestone_note':
      return <MessageSquare size={16} className="text-gray-400" />;
    case 'warning':
      return <AlertCircle size={16} className="text-amber-400" />;
    // legacy
    case 'role_approved_legacy':
      return <Check size={16} className="text-emerald-400" />;
    default:
      return <Info size={16} className="text-gray-400" />;
  }
}

function InvitationActions({
  notification,
  onAction,
}: {
  notification: Notification;
  onAction: () => void;
}) {
  const payload = notification.payload as {
    project_id?: string;
    collaborator_id?: string;
  } | null;

  const handleAccept = async () => {
    if (!payload?.collaborator_id) return;
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('forge_project_collaborators')
        .update({ status: 'accepted' })
        .eq('id', payload.collaborator_id);
      onAction();
      toast.success('Invitation accepted');
    } catch {
      toast.error('Failed to accept invitation');
    }
  };

  const handleDecline = async () => {
    if (!payload?.collaborator_id) return;
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('forge_project_collaborators')
        .update({ status: 'declined' })
        .eq('id', payload.collaborator_id);
      onAction();
      toast.success('Invitation declined');
    } catch {
      toast.error('Failed to decline invitation');
    }
  };

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={handleAccept}
        className="px-3 py-1.5 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-lg transition-colors"
      >
        Accept
      </button>
      <button
        onClick={handleDecline}
        className="px-3 py-1.5 text-xs font-medium bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/20 rounded-lg transition-colors"
      >
        Decline
      </button>
    </div>
  );
}

const NotificationsPage = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
  };

  const handleInvitationAction = async (notification: Notification) => {
    await markAsRead(notification.id);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-0.5 text-muted-foreground">
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-accent"
          >
            <CheckCheck size={14} />
            Mark all as read
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Bell size={36} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`flex gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                n.read
                  ? 'bg-card border-border hover:border-border/80'
                  : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
              }`}
            >
              {/* Icon */}
              <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                {notificationIcon(n.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium ${n.read ? 'text-foreground' : 'text-foreground'}`}>
                    {n.title}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    )}
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>

                {/* Invitation actions */}
                {n.type === 'project_invitation' && !n.read && (
                  <InvitationActions
                    notification={n}
                    onAction={() => handleInvitationAction(n)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;

import { useState, useEffect, useCallback } from 'react';
import { NotificationService, type Notification } from '@/services/NotificationService';
import { useAuth } from '@/contexts/AuthContext';

const ALWAYS_SHOW_TYPES = ['role_approved', 'role_rejected', 'role_request'];

export function useNotifications() {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const data = await NotificationService.getNotifications(user.id);
    setNotifications(data);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = NotificationService.subscribe(user.id, (newNotification) => {
      const alwaysShow = ALWAYS_SHOW_TYPES.includes(newNotification.type);
      if (alwaysShow || profile?.push_notifications !== false) {
        setNotifications((prev) => [newNotification, ...prev]);
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id, profile?.push_notifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await NotificationService.markAsRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    await NotificationService.markAllAsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [user?.id]);

  return { notifications, unreadCount, markAsRead, markAllAsRead, loading, refetch: fetchNotifications };
}

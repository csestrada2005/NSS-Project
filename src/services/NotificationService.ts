import { SupabaseService } from './SupabaseService';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface CreateNotificationParams {
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

export class NotificationService {
  static async getNotifications(userId: string): Promise<Notification[]> {
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as Notification[];
    } catch (e) {
      console.error('[NotificationService] getNotifications error:', e);
      return [];
    }
  }

  static async markAsRead(notificationId: string): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);
    } catch (e) {
      console.error('[NotificationService] markAsRead error:', e);
    }
  }

  static async markAllAsRead(userId: string): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
    } catch (e) {
      console.error('[NotificationService] markAllAsRead error:', e);
    }
  }

  static async createNotification(params: CreateNotificationParams): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase.from('notifications').insert({
        user_id: params.user_id,
        type: params.type,
        title: params.title,
        body: params.body,
        payload: params.payload ?? null,
        read: false,
      });
    } catch (e) {
      console.error('[NotificationService] createNotification error:', e);
    }
  }

  static subscribe(
    userId: string,
    callback: (notification: Notification) => void
  ): RealtimeChannel {
    const supabase = SupabaseService.getInstance().client;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callback(payload.new as Notification);
        }
      )
      .subscribe();

    return channel;
  }
}

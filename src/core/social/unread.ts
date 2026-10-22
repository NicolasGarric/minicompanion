import { create } from 'zustand';
import { supabase } from '../auth/supabase';

/**
 * Unread counters for the header (notifications and messages). Refreshed every minute while
 * signed in and when the tab gets focus; no realtime channel needed.
 */
export const useUnread = create<{ notifications: number; refresh: () => Promise<void> }>((set) => ({
  notifications: 0,
  refresh: async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return set({ notifications: 0 });
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    set({ notifications: count ?? 0 });
  },
}));

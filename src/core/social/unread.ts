import { create } from 'zustand';
import { supabase } from '../auth/supabase';

/**
 * Unread counter for the header bell. Refreshed on realtime inserts, when the tab gets focus,
 * and every two minutes as a fallback.
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

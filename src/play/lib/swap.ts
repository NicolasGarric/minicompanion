import { thumbOf, uploadPhoto } from '../../core/lib/photo';
import { supabase } from '../../core/auth/supabase';

/** Swap board (supabase/migrations/*_hobby_community.sql). No payment in the app. */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export type SwapKind = 'offer' | 'want';
export interface SwapPost {
  id: string;
  user_id: string;
  kind: SwapKind;
  title: string;
  details: string | null;
  condition: string | null;
  city: string;
  meet_place: string | null;
  photo_path: string | null;
  status: 'open' | 'closed';
  is_hidden: boolean;
  created_at: string;
  author?: { display_name: string; handle: string } | null;
}
export type NewSwap = Pick<SwapPost, 'kind' | 'title' | 'details' | 'condition' | 'city' | 'meet_place'>;

export async function listSwaps(f: { kind: SwapKind; city?: string; mine?: string }): Promise<SwapPost[]> {
  let q = db().from('swap_posts').select('*, author:profiles!swap_posts_user_id_fkey(display_name, handle)').order('created_at', { ascending: false }).limit(100);
  if (f.mine) q = q.eq('user_id', f.mine);
  else q = q.eq('kind', f.kind);
  if (f.city?.trim()) q = q.ilike('city', `%${f.city.trim()}%`);
  return must(await q) as SwapPost[];
}
export const swapPhotoUrl = (path: string) => db().storage.from('swap').getPublicUrl(path).data.publicUrl;
export const swapThumbUrl = (path: string) => swapPhotoUrl(thumbOf(path));

export async function createSwap(me: string, p: NewSwap, photo: Blob | null) {
  let photo_path: string | null = null;
  if (photo) photo_path = await uploadPhoto('swap', me, photo);
  must(await db().from('swap_posts').insert({ user_id: me, ...p, photo_path }));
}
export async function closeSwap(id: string) {
  must(await db().from('swap_posts').update({ status: 'closed' }).eq('id', id));
}
export async function deleteSwap(id: string) {
  must(await db().from('swap_posts').delete().eq('id', id));
}
export async function reportSwap(id: string, reason: string) {
  must(await db().rpc('report_swap', { p_post: id, p_reason: reason }));
}
export async function adminHideSwap(id: string, hidden: boolean) {
  must(await db().rpc('admin_hide_swap', { p_post: id, p_hidden: hidden }));
}

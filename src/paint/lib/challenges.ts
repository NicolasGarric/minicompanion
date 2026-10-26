import { supabase } from '../../core/auth/supabase';

/** Seasonal painting challenges (supabase/migrations/*_hobby_community.sql). */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export interface Challenge {
  id: string;
  theme_key: string;
  palette: string[];
  starts_on: string;
  ends_on: string;
}
export interface ChallengeEntry {
  id: string;
  title: string;
  photo_path: string;
  author_name: string;
  author_handle: string;
  likes: number;
  liked: boolean;
  is_mine: boolean;
  is_hidden: boolean;
  created_at: string;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const isOpen = (c: Challenge) => c.starts_on <= today() && today() <= c.ends_on;

export async function challenges(): Promise<Challenge[]> {
  return must(await db().from('season_challenges').select('*').order('starts_on')) as Challenge[];
}
export async function entriesOf(id: string): Promise<ChallengeEntry[]> {
  return must(await db().rpc('challenge_entries_of', { p_challenge: id })) as ChallengeEntry[];
}
export const photoUrl = (path: string) => db().storage.from('challenges').getPublicUrl(path).data.publicUrl;

export async function submit(id: string, title: string, photo: Blob) {
  const path = `${id}/${crypto.randomUUID()}.jpg`;
  must(await db().storage.from('challenges').upload(path, photo, { contentType: 'image/jpeg' }));
  must(await db().rpc('submit_challenge_entry', { p_challenge: id, p_title: title, p_photo: path, p_rights: true }));
}
export async function withdraw(id: string) {
  must(await db().rpc('withdraw_challenge_entry', { p_challenge: id }));
}
export async function toggleLike(entry: string): Promise<boolean> {
  return must(await db().rpc('toggle_challenge_like', { p_entry: entry })) as boolean;
}
export async function report(entry: string, reason: string) {
  must(await db().rpc('report_challenge_entry', { p_entry: entry, p_reason: reason }));
}

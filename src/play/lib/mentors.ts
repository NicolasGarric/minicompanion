import { supabase } from '../../core/auth/supabase';

/** Mentoring (supabase/migrations/*_hobby_community.sql). */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export const STEPS = ['met', 'first_paint', 'first_game', 'first_tournament'] as const;
export type Step = (typeof STEPS)[number];

export interface Mentor { user_id: string; display_name: string; handle: string; games: string; availability: string; area: string; mentees: number }
export interface Mentorship {
  id: string;
  role: 'mentor' | 'mentee';
  other_id: string;
  other_name: string;
  other_handle: string;
  status: 'requested' | 'active' | 'declined' | 'ended';
  message: string | null;
  met_at: string | null;
  first_paint_at: string | null;
  first_game_at: string | null;
  first_tournament_at: string | null;
  created_at: string;
}
export interface MentorProfile { games: string; availability: string; area: string; active: boolean }

export const stepAt = (m: Mentorship, s: Step) => m[`${s}_at` as const];

export async function mentors(): Promise<Mentor[]> {
  return must(await db().rpc('mentors_list')) as Mentor[];
}
export async function myMentorships(): Promise<Mentorship[]> {
  return must(await db().rpc('my_mentorships')) as Mentorship[];
}
export async function myMentorProfile(me: string): Promise<MentorProfile | null> {
  return must(await db().from('mentor_profiles').select('games, availability, area, active').eq('user_id', me).maybeSingle()) as MentorProfile | null;
}
export async function saveMentorProfile(me: string, p: MentorProfile) {
  // Update first (the id column cannot be rewritten), insert when there is no profile yet
  const rows = must(await db().from('mentor_profiles').update({ ...p, updated_at: new Date().toISOString() }).eq('user_id', me).select('user_id')) as unknown[];
  if (!rows.length) must(await db().from('mentor_profiles').insert({ user_id: me, ...p }));
}
export async function requestMentor(mentor: string, message: string) {
  must(await db().rpc('request_mentor', { p_mentor: mentor, p_message: message }));
}
export async function answer(id: string, accept: boolean) {
  must(await db().rpc('answer_mentorship', { p_id: id, p_accept: accept }));
}
export async function markStep(id: string, step: Step, done: boolean) {
  must(await db().rpc('mark_mentorship_step', { p_id: id, p_step: step, p_done: done }));
}
export async function endMentorship(id: string) {
  must(await db().rpc('end_mentorship', { p_id: id }));
}

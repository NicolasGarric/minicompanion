import { supabase } from '../../core/auth/supabase';
import { thumbOf, uploadPhoto } from '../../core/lib/photo';

/** Painting contest (supabase/migrations/*_painting_contest.sql). */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export type ContestKind = 'single' | 'squad' | 'vehicle' | 'beginner';

export interface Category {
  id: string;
  tournament_id: string;
  kind: ContestKind;
  voting_closes_at: string;
  jury_enabled: boolean;
}

export interface Entry {
  id: string;
  title: string;
  photo_paths: string[];
  is_mine: boolean;
  my_vote: boolean;
  is_hidden: boolean;
  author_name: string | null;
  author_handle: string | null;
  votes: number | null;
}

export interface ResultRow {
  entry_id: string;
  title: string;
  photo_paths: string[];
  author_name: string;
  author_handle: string;
  votes: number;
  public_rank: number;
  jury_score: number | null;
  jury_rank: number | null;
}

/** Demo photos ("demo/…") are served by the app itself; entries live in the public "contest" bucket. */
export const photoUrl = (path: string) =>
  path.startsWith('demo/') ? `${import.meta.env.BASE_URL}${path}` : db().storage.from('contest').getPublicUrl(path).data.publicUrl;
/** The 400 px thumbnail for grids (older photos have none: the photo itself). */
export const thumbUrl = (path: string) => photoUrl(thumbOf(path));

export const isClosed = (c: Category) => Date.parse(c.voting_closes_at) <= Date.now();

export async function categories(tournamentId: string): Promise<Category[]> {
  return must(await db().from('contest_categories').select('*').eq('tournament_id', tournamentId).order('kind')) as Category[];
}
export async function entriesOf(categoryId: string): Promise<Entry[]> {
  return must(await db().rpc('contest_entries_of', { p_category: categoryId })) as Entry[];
}
export async function results(categoryId: string): Promise<ResultRow[]> {
  return must(await db().rpc('contest_results', { p_category: categoryId })) as ResultRow[];
}
export async function vote(entryId: string) {
  must(await db().rpc('cast_contest_vote', { p_entry: entryId }));
}

/** Uploads the photos (shrunk, with thumbnails) into the category folder, then records the entry. */
export async function submitEntry(categoryId: string, title: string, photos: Blob[], keep: string[]): Promise<void> {
  const paths = [...keep];
  for (const blob of photos.slice(0, 5 - keep.length)) paths.push(await uploadPhoto('contest', categoryId, blob));
  must(await db().rpc('submit_contest_entry', { p_category: categoryId, p_title: title, p_photos: paths, p_rights: true }));
}
export async function withdrawEntry(categoryId: string) {
  must(await db().rpc('withdraw_contest_entry', { p_category: categoryId }));
}

export async function isJuror(categoryId: string): Promise<boolean> {
  const { data } = await db().rpc('is_juror', { p_category: categoryId });
  return !!data;
}
export interface JuryScore {
  entry_id: string;
  technique: number;
  composition: number;
  originality: number;
}
export async function myScores(juror: string): Promise<JuryScore[]> {
  return must(await db().from('jury_scores').select('entry_id, technique, composition, originality').eq('juror_id', juror)) as JuryScore[];
}
export async function saveScore(juror: string, s: JuryScore) {
  must(await db().from('jury_scores').upsert({ ...s, juror_id: juror }));
}

// Organiser
export async function addCategory(tournamentId: string, kind: ContestKind, closesAt: string, jury: boolean) {
  must(await db().from('contest_categories').insert({ tournament_id: tournamentId, kind, voting_closes_at: closesAt, jury_enabled: jury }));
}
export async function setHidden(entryId: string, hidden: boolean) {
  must(await db().from('contest_entries').update({ is_hidden: hidden }).eq('id', entryId));
}
export async function jury(tournamentId: string): Promise<{ user_id: string; profile: { display_name: string; handle: string } | null }[]> {
  return must(
    await db().from('jury_members').select('user_id, profile:profiles!jury_members_user_id_fkey(display_name, handle)').eq('tournament_id', tournamentId),
  ) as unknown as { user_id: string; profile: { display_name: string; handle: string } | null }[];
}
export async function addJuror(tournamentId: string, handle: string) {
  const p = must(await db().from('profiles').select('id').eq('handle', handle.trim().replace(/^@/, '').toLowerCase()).maybeSingle()) as { id: string } | null;
  if (!p) throw new Error('unknown_player');
  must(await db().from('jury_members').insert({ tournament_id: tournamentId, user_id: p.id }));
}
export async function removeJuror(tournamentId: string, userId: string) {
  must(await db().from('jury_members').delete().eq('tournament_id', tournamentId).eq('user_id', userId));
}

import { supabase } from '../../core/auth/supabase';
import { computeStandings, pairSwiss, type PlayedMatch, type Pairing, type Standing } from './pairing';

/**
 * Tournament flow (supabase/migrations/*_tournament_flow.sql): registrations, rounds, matches,
 * score reports, standings and pairings. Pairings are computed here with the tested Swiss engine.
 */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export type TournamentStatus = 'draft' | 'published' | 'in_progress' | 'finished' | 'cancelled';
export type MatchStatus = 'scheduled' | 'reported' | 'confirmed' | 'disputed' | 'resolved';
export type MatchResult = 'a_win' | 'b_win' | 'draw';

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  organiser_id: string;
  store_id: string | null;
  venue_name: string;
  address: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  list_deadline: string;
  format_id: string;
  type: string;
  language: 'en' | 'ja' | 'both';
  max_players: number;
  rounds_planned: number;
  lists_visibility: 'hidden_until_start' | 'public';
  status: TournamentStatus;
  twitch_channel: string | null;
  game_system: string | null;
  format?: { points_limit: number; round_minutes: number } | null;
}

export interface Registration {
  id: string;
  user_id: string;
  status: 'registered' | 'waitlist' | 'withdrawn' | 'dropped';
  checked_in_at: string | null;
  created_at: string;
  profile?: { display_name: string; handle: string } | null;
  /** One-to-one in the database: PostgREST returns an object (an array on older versions). */
  list?: ArmyList | ArmyList[] | null;
}

export interface ArmyList {
  id: string;
  parsed_faction: string | null;
  parsed_points: number | null;
  status: 'submitted' | 'approved' | 'rejected';
  raw_text: string;
  organiser_comment: string | null;
}
export const listOf = (r: Registration): ArmyList | null => (Array.isArray(r.list) ? r.list[0] ?? null : r.list ?? null);

export interface Round {
  id: string;
  number: number;
  status: 'pending' | 'active' | 'finished';
  started_at: string | null;
}

export interface Match {
  id: string;
  round_id: string;
  table_id: string | null;
  player_a_id: string;
  player_b_id: string | null;
  a_primary: number | null;
  a_secondary: number | null;
  b_primary: number | null;
  b_secondary: number | null;
  result: MatchResult | null;
  status: MatchStatus;
  reported_by: string | null;
  dispute_note: string | null;
}

export async function getTournament(slug: string): Promise<Tournament | null> {
  return must(await db().from('tournaments').select('*, format:formats(points_limit, round_minutes)').eq('slug', slug).maybeSingle()) as Tournament | null;
}

export async function registrations(tournamentId: string): Promise<Registration[]> {
  return must(
    await db()
      .from('registrations')
      .select('id, user_id, status, checked_in_at, created_at, profile:profiles!registrations_user_id_fkey(display_name, handle), list:army_lists(id, parsed_faction, parsed_points, status, raw_text, organiser_comment)')
      .eq('tournament_id', tournamentId)
      .in('status', ['registered', 'waitlist', 'dropped'])
      .order('created_at'),
  ) as unknown as Registration[];
}

export async function rounds(tournamentId: string): Promise<Round[]> {
  return must(await db().from('rounds').select('id, number, status, started_at').eq('tournament_id', tournamentId).order('number')) as Round[];
}

export async function matches(tournamentId: string): Promise<Match[]> {
  return must(
    await db()
      .from('matches')
      .select('id, round_id, table_id, player_a_id, player_b_id, a_primary, a_secondary, b_primary, b_secondary, result, status, reported_by, dispute_note')
      .eq('tournament_id', tournamentId),
  ) as Match[];
}

export async function tables(tournamentId: string): Promise<Map<string, number>> {
  const rows = must(await db().rpc('tournament_tables', { p_tournament: tournamentId })) as { id: string; number: number }[];
  return new Map(rows.map((r) => [r.id, r.number]));
}

/** Organiser only (RLS): tables with the token printed in their QR code. */
export async function tableTokens(tournamentId: string): Promise<{ number: number; qr_token: string }[]> {
  return must(await db().from('game_tables').select('number, qr_token').eq('tournament_id', tournamentId).order('number')) as {
    number: number;
    qr_token: string;
  }[];
}

const score = (p: number | null, s: number | null) => (p ?? 0) + (s ?? 0);
const counts = (m: Match) => m.status === 'confirmed' || m.status === 'resolved';

/** Standings of every player who played (dropped ones included), from confirmed results. */
export function standingsOf(regs: Registration[], all: Match[]): Standing[] {
  const players = regs.filter((r) => r.status === 'registered' || r.status === 'dropped').map((r) => r.user_id);
  const played: PlayedMatch[] = all.map((m) => ({
    a: m.player_a_id,
    b: m.player_b_id,
    result: counts(m) ? m.result : null,
    aScore: counts(m) ? score(m.a_primary, m.a_secondary) : undefined,
    bScore: counts(m) ? score(m.b_primary, m.b_secondary) : undefined,
  }));
  return computeStandings(players, played);
}

/** Next Swiss round for the players still in the event (history kept to avoid rematches). */
export function nextPairings(regs: Registration[], all: Match[]): { pairings: Pairing[]; rematches: boolean } {
  const active = new Set(regs.filter((r) => r.status === 'registered').map((r) => r.user_id));
  return pairSwiss(standingsOf(regs, all).filter((s) => active.has(s.playerId)));
}

const rpc = async (fn: string, args: Record<string, unknown>) => must(await db().rpc(fn, args));
export const startTournament = (id: string) => rpc('start_tournament', { p_tournament: id });
export const createRound = (id: string, pairings: Pairing[]) => rpc('create_round', { p_tournament: id, p_pairings: pairings.map(([a, b]) => ({ a, b })) });
export const finishRound = (id: string) => rpc('finish_round', { p_tournament: id });
export const finishTournament = (id: string) => rpc('finish_tournament', { p_tournament: id });
export const setRegistration = (id: string, user: string, checkedIn: boolean, dropped: boolean) =>
  rpc('set_registration', { p_tournament: id, p_user: user, p_checked_in: checkedIn, p_dropped: dropped });
export const reportMatch = (id: string, s: { ap: number; as: number; bp: number; bs: number; result: MatchResult }) =>
  rpc('report_match', { p_match: id, p_a_primary: s.ap, p_a_secondary: s.as, p_b_primary: s.bp, p_b_secondary: s.bs, p_result: s.result });
export const confirmMatch = (id: string, agree: boolean, note?: string) => rpc('confirm_match', { p_match: id, p_agree: agree, p_note: note ?? null });
export const register = (id: string) => rpc('register_for_tournament', { p_tournament: id });
export const withdraw = (id: string) => rpc('withdraw_from_tournament', { p_tournament: id });
export const submitList = (id: string, text: string, faction: string | null, points: number | null) =>
  rpc('submit_army_list', { p_tournament: id, p_raw_text: text, p_faction: faction, p_points: points });
export const reviewList = (listId: string, status: 'approved' | 'rejected', comment: string | null) =>
  rpc('review_army_list', { p_list: listId, p_status: status, p_comment: comment });

export interface TableMatch {
  tournament_slug: string;
  tournament_name: string;
  table_number: number;
  round_number: number | null;
  match_id: string | null;
  player_a: string | null;
  player_a_name: string | null;
  player_b: string | null;
  player_b_name: string | null;
  status: MatchStatus | null;
  a_primary: number | null;
  a_secondary: number | null;
  b_primary: number | null;
  b_secondary: number | null;
  result: MatchResult | null;
  reported_by: string | null;
}
export async function tableMatch(token: string): Promise<TableMatch | null> {
  const rows = must(await db().rpc('table_match', { p_token: token })) as TableMatch[];
  return rows[0] ?? null;
}

export interface NewTournament {
  slug: string;
  name: string;
  description: string | null;
  organiser_id: string;
  store_id: string | null;
  venue_name: string;
  address: string;
  location: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  list_deadline: string;
  format_id: string;
  type: string;
  language: string;
  max_players: number;
  rounds_planned: number;
  lists_visibility: string;
  pairing_system: 'swiss';
  twitch_channel: string | null;
  game_system: string | null;
  status: 'draft' | 'published';
}
export async function createTournament(t: NewTournament): Promise<string> {
  const row = must(await db().from('tournaments').insert(t).select('slug').single()) as { slug: string };
  return row.slug;
}
export async function publishTournament(id: string) {
  must(await db().from('tournaments').update({ status: 'published' }).eq('id', id));
}
export async function storesWithPlace(): Promise<{ id: string; name: string; address: string; city: string; location: string }[]> {
  return must(await db().from('stores').select('id, name, address, city, location').order('name')) as {
    id: string;
    name: string;
    address: string;
    city: string;
    location: string;
  }[];
}

/** Realtime: any change to the matches or rounds of a tournament. */
export function onTournamentChange(tournamentId: string, cb: () => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  const ch = client
    .channel(`tournament:${tournamentId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `tournament_id=eq.${tournamentId}` }, cb)
    .subscribe();
  return () => {
    client.removeChannel(ch);
  };
}

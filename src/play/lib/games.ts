import { supabase } from '../../core/auth/supabase';
import type { Lang } from '../../core/i18n';

/** Quick play: casual games hosted by players (see supabase/migrations/*_quick_play.sql). */
export type GameLevel = 'beginner' | 'casual' | 'competitive';
export type GameStatus = 'open' | 'full' | 'cancelled';
export type JoinStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';
/** Language spoken at the table: any app language, or 'both' (Japanese and English). */
export type GameLanguage = Lang | 'both';

export interface Game {
  id: string;
  host_id: string;
  game_system: string;
  format: string | null;
  points: number | null;
  starts_at: string;
  duration_minutes: number;
  max_players: number;
  players_count: number;
  level: GameLevel;
  language: GameLanguage;
  country: string;
  city: string;
  area: string | null;
  store_id: string | null;
  note: string | null;
  status: GameStatus;
  league_id: string | null;
  host?: { display_name: string; handle: string } | null;
  store?: { name: string } | null;
}

export interface GamePlayer {
  player_id: string;
  status: JoinStatus;
  message: string | null;
  created_at: string;
  profile?: { display_name: string; handle: string } | null;
}

export interface GameFilters {
  game?: string;
  format?: string;
  country?: string;
  city?: string;
  level?: GameLevel | '';
  openOnly?: boolean;
}

const GAME_COLUMNS = '*, host:profiles!games_host_id_fkey(display_name, handle), store:stores(name)';

const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};

/** Upcoming games, soonest first. Text filters are case-insensitive "contains". */
export async function listGames(f: GameFilters = {}): Promise<Game[]> {
  let q = db().from('games').select(GAME_COLUMNS).gte('starts_at', new Date().toISOString()).neq('status', 'cancelled');
  const like = (s: string) => `%${s.trim().replace(/[%_]/g, '')}%`;
  if (f.game?.trim()) q = q.ilike('game_system', like(f.game));
  if (f.format?.trim()) q = q.ilike('format', like(f.format));
  if (f.country) q = q.eq('country', f.country);
  if (f.city?.trim()) q = q.ilike('city', like(f.city));
  if (f.level) q = q.eq('level', f.level);
  if (f.openOnly) q = q.eq('status', 'open');
  const { data, error } = await q.order('starts_at').limit(100);
  if (error) throw error;
  return data as Game[];
}

export async function getGame(id: string): Promise<{ game: Game; players: GamePlayer[]; address: string | null } | null> {
  const { data, error } = await db().from('games').select(GAME_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [players, priv] = await Promise.all([
    db()
      .from('game_players')
      .select('player_id, status, message, created_at, profile:profiles!game_players_player_id_fkey(display_name, handle)')
      .eq('game_id', id)
      .order('created_at'),
    // Only the host and accepted players get a row back (RLS).
    db().from('game_private').select('address').eq('game_id', id).maybeSingle(),
  ]);
  if (players.error) throw players.error;
  return { game: data as Game, players: (players.data ?? []) as unknown as GamePlayer[], address: priv.data?.address ?? null };
}

/** Games the user hosts or asked to join (upcoming and past). */
export async function myGames(userId: string): Promise<{ hosted: Game[]; joined: (Game & { my_status: JoinStatus })[] }> {
  const hosted = await db().from('games').select(GAME_COLUMNS).eq('host_id', userId).order('starts_at', { ascending: false }).limit(100);
  if (hosted.error) throw hosted.error;
  const mine = await db().from('game_players').select('game_id, status').eq('player_id', userId).neq('status', 'withdrawn');
  if (mine.error) throw mine.error;
  const status = new Map((mine.data ?? []).map((r) => [r.game_id as string, r.status as JoinStatus]));
  let joined: (Game & { my_status: JoinStatus })[] = [];
  if (status.size) {
    const g = await db().from('games').select(GAME_COLUMNS).in('id', [...status.keys()]).order('starts_at', { ascending: false });
    if (g.error) throw g.error;
    joined = (g.data as Game[]).map((x) => ({ ...x, my_status: status.get(x.id)! }));
  }
  return { hosted: hosted.data as Game[], joined };
}

export interface NewGame {
  game_system: string;
  format: string;
  points: number | null;
  starts_at: string;
  duration_minutes: number;
  max_players: number;
  level: GameLevel;
  language: GameLanguage;
  country: string;
  city: string;
  area: string;
  address: string;
  store_id: string | null;
  note: string;
  league_id: string | null;
}

export async function createGame(g: NewGame): Promise<string> {
  const { data, error } = await db().rpc('create_game', {
    p_game_system: g.game_system,
    p_format: g.format,
    p_points: g.points,
    p_starts_at: g.starts_at,
    p_duration_minutes: g.duration_minutes,
    p_max_players: g.max_players,
    p_level: g.level,
    p_language: g.language,
    p_country: g.country,
    p_city: g.city,
    p_area: g.area,
    p_address: g.address,
    p_store: g.store_id,
    p_note: g.note,
    p_league: g.league_id,
  });
  if (error) throw error;
  return data as string;
}

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data;
};
export const requestJoin = (id: string, message: string) => call('request_join_game', { p_game: id, p_message: message });
export const respondJoin = (id: string, player: string, accept: boolean) => call('respond_join_game', { p_game: id, p_player: player, p_accept: accept });
export const leaveGame = (id: string) => call('leave_game', { p_game: id });
export const cancelGame = (id: string) => call('cancel_game', { p_game: id });

/** What players typed most (games, or formats of one game), for the form suggestions. */
export async function popularTexts(game?: string): Promise<{ game_system: string; format: string | null; games: number }[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc('popular_game_texts', { p_game: game?.trim() || null });
  return (data ?? []) as { game_system: string; format: string | null; games: number }[];
}

export async function listStores(): Promise<{ id: string; name: string; city: string }[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('stores').select('id, name, city').order('name');
  return data ?? [];
}

/**
 * Error code for the UI: a code raised by the SQL functions (e.g. "game_full"), "not_installed"
 * when the database misses the PLAY migrations, or null. Every error is also logged to the console.
 */
export function playError(e: unknown): string | null {
  console.error('[play]', e);
  const err = e as { message?: string; code?: string };
  const m = err?.message ?? '';
  // PostgREST: unknown table / function (schema cache), Postgres: undefined table / function
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(err?.code ?? '') || m.includes('schema cache')) return 'not_installed';
  const known = [
    'not_authenticated', 'starts_in_past', 'too_many_games', 'not_open', 'is_host', 'not_host', 'no_request', 'game_full',
    'registration_closed', 'not_participant', 'not_played_yet', 'already_confirmed', 'bad_results', 'bad_photos', 'no_report',
    'no_opponent', 'rate_limited', 'not_league_member', 'not_organiser', 'bad_status', 'not_enough_players',
    'round_not_finished', 'all_rounds_played', 'bad_pairings', 'no_match', 'not_in_match', 'match_closed',
    'nothing_to_confirm', 'no_active_round', 'matches_pending', 'not_registered', 'list_locked', 'forbidden',
    'contest_closed', 'own_entry', 'email_not_confirmed', 'no_entry', 'rights_required',
    'challenge_closed', 'own_mentor', 'no_mentor', 'already_mentored', 'bad_step', 'campaign_exists', 'not_member',
    'no_conquest', 'no_territory', 'already_yours', 'bad_pick', 'own_match', 'prediction_closed', 'no_post', 'suspended',
  ];
  return known.find((k) => m.includes(k)) ?? null;
}
export const gameError = playError;

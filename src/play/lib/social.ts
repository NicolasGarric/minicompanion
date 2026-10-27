import { supabase } from '../../core/auth/supabase';
import { uploadPhoto, withThumbs } from '../../core/lib/photo';
import { playError, type Game, type GameLevel } from './games';

/**
 * PLAY social layer (supabase/migrations/*_play_social.sql): battle reports, ratings, profiles,
 * "looking for a game" posts, messages, notifications, leagues and store nights.
 */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

// --- Battle reports -----------------------------------------------------------------------------
export type ReportStatus = 'reported' | 'confirmed' | 'disputed';

export interface GameResult {
  player_id: string;
  score: number | null;
  placement: number;
  gallery_item_id: string | null;
  army: string | null;
  agreed: boolean | null;
  profile?: { display_name: string; handle: string } | null;
  item?: { image_path: string; title: string } | null;
}

export interface GameReport {
  game_id: string;
  reported_by: string;
  summary: string | null;
  photos: string[];
  status: ReportStatus;
  created_at: string;
  confirmed_at: string | null;
  results: GameResult[];
}

export async function getReport(gameId: string): Promise<GameReport | null> {
  const rep = must(await db().from('game_reports').select('*').eq('game_id', gameId).maybeSingle());
  if (!rep) return null;
  const results = must(
    await db()
      .from('game_results')
      .select('player_id, score, placement, gallery_item_id, army, agreed, profile:profiles!game_results_player_id_fkey(display_name, handle), item:gallery_items(image_path, title)')
      .eq('game_id', gameId)
      .order('placement'),
  ) as unknown as GameResult[];
  return { ...(rep as Omit<GameReport, 'results'>), results };
}

export interface ResultInput {
  player_id: string;
  placement: number;
  score: number | null;
  gallery_item_id: string | null;
  army: string | null;
}

export async function submitReport(gameId: string, results: ResultInput[], summary: string, photos: string[]) {
  return must(await db().rpc('submit_game_report', { p_game: gameId, p_results: results, p_summary: summary, p_photos: photos }));
}
export async function answerReport(gameId: string, agree: boolean) {
  return must(await db().rpc('answer_game_report', { p_game: gameId, p_agree: agree }));
}

/** Uploads a report photo (shrunk, with its thumbnail) into the game folder of the "reports" bucket. */
export const uploadReportPhoto = (gameId: string, photo: Blob): Promise<string> => uploadPhoto('reports', gameId, photo);
/** Report photos are private files: signed URLs work when the uploader's profile is public or for the players.
 * Thumbnails are signed too: read them with `thumbOf(path)`, falling back to the path for older photos. */
export async function reportPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await db().storage.from('reports').createSignedUrls(withThumbs(paths), 3600);
  return new Map((data ?? []).flatMap((u) => (u.signedUrl ? [[u.path ?? '', u.signedUrl] as [string, string]] : [])));
}

/** Gallery images are private files: signed URLs work for the owner and for public items. */
export async function galleryUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await db().storage.from('gallery').createSignedUrls(withThumbs(paths), 3600);
  return new Map((data ?? []).flatMap((u) => (u.signedUrl ? [[u.path ?? '', u.signedUrl] as [string, string]] : [])));
}

export async function myGalleryItems(userId: string): Promise<{ id: string; title: string; image_path: string }[]> {
  return (must(await db().from('gallery_items').select('id, title, image_path').eq('owner_id', userId).order('created_at', { ascending: false }).limit(50)) ?? []) as { id: string; title: string; image_path: string }[];
}

// --- Profiles, ratings, stats, badges -----------------------------------------------------------
export interface PublicProfile {
  id: string;
  handle: string;
  display_name: string;
  home_city: string | null;
  factions: string[];
  is_public: boolean;
}

export interface Rating {
  game_key: string;
  game_name: string;
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface Stats {
  played: number;
  wins: number;
  hosted: number;
  systems: number;
  painted: number;
  leagues: number;
  gallery: number;
}

export async function profileByHandle(handle: string): Promise<PublicProfile | null> {
  // City and armies come back only for public profiles (or my own).
  const card = await db().rpc('player_card', { p_handle: handle });
  if (!card.error) return ((card.data as PublicProfile[])[0] ?? null);
  // Database set up before the security migration: the old direct read still works there.
  return must(await db().from('profiles').select('id, handle, display_name, home_city, factions, is_public').eq('handle', handle).maybeSingle());
}
export async function ratingsOf(userId: string): Promise<Rating[]> {
  return (must(await db().from('player_ratings').select('*').eq('player_id', userId).order('games', { ascending: false })) ?? []) as Rating[];
}
export async function statsOf(userId: string): Promise<Stats | null> {
  return must(await db().rpc('player_stats', { p_user: userId })) as Stats | null;
}

/** Confirmed games of a player, newest first, with every result. */
export async function historyOf(userId: string): Promise<{ game: Game; results: GameResult[] }[]> {
  const mine = must(await db().from('game_results').select('game_id').eq('player_id', userId)) as { game_id: string }[];
  const ids = mine.map((r) => r.game_id);
  if (!ids.length) return [];
  const reports = must(await db().from('game_reports').select('game_id').in('game_id', ids).eq('status', 'confirmed')) as { game_id: string }[];
  const confirmed = reports.map((r) => r.game_id);
  if (!confirmed.length) return [];
  const games = must(await db().from('games').select('*').in('id', confirmed).order('starts_at', { ascending: false }).limit(20)) as Game[];
  const results = must(
    await db().from('game_results').select('game_id, player_id, score, placement, profile:profiles!game_results_player_id_fkey(display_name, handle)').in('game_id', confirmed),
  ) as unknown as (GameResult & { game_id: string })[];
  return games.map((game) => ({ game, results: results.filter((r) => r.game_id === game.id).sort((a, b) => a.placement - b.placement) }));
}

export async function publicGallery(userId: string): Promise<{ id: string; title: string; image_path: string }[]> {
  return (must(await db().from('gallery_items').select('id, title, image_path').eq('owner_id', userId).eq('is_public', true).order('created_at', { ascending: false }).limit(24)) ?? []) as { id: string; title: string; image_path: string }[];
}

export interface Badge {
  id: string;
  earned: boolean;
}
/** Badges are computed from the stats (nothing stored). */
export function badgesFrom(s: Stats): Badge[] {
  return [
    { id: 'firstGame', earned: s.played >= 1 },
    { id: 'tenGames', earned: s.played >= 10 },
    { id: 'firstWin', earned: s.wins >= 1 },
    { id: 'host', earned: s.hosted >= 1 },
    { id: 'explorer', earned: s.systems >= 3 },
    { id: 'painted', earned: s.painted >= 1 },
    { id: 'league', earned: s.leagues >= 1 },
    { id: 'artist', earned: s.gallery >= 5 },
  ];
}

export async function setProfilePublic(userId: string, isPublic: boolean) {
  must(await db().from('profiles').update({ is_public: isPublic }).eq('id', userId));
}
export async function setGalleryItemPublic(id: string, isPublic: boolean) {
  must(await db().from('gallery_items').update({ is_public: isPublic }).eq('id', id));
}

// --- Looking for a game ---------------------------------------------------------------------------
export interface LfgPost {
  id: string;
  author_id: string;
  game_system: string;
  format: string | null;
  level: GameLevel;
  country: string;
  city: string | null;
  area: string | null;
  from_date: string;
  to_date: string;
  note: string | null;
  is_open: boolean;
  created_at: string;
  author?: { display_name: string; handle: string } | null;
}

export async function listPosts(f: { game?: string; country?: string; city?: string; level?: string; author?: string }): Promise<LfgPost[]> {
  let q = db()
    .from('lfg_posts')
    .select('*, author:profiles!lfg_posts_author_id_fkey(display_name, handle)')
    .gte('to_date', new Date().toISOString().slice(0, 10));
  const like = (s: string) => `%${s.trim().replace(/[%_]/g, '')}%`;
  if (f.author) q = q.eq('author_id', f.author);
  else q = q.eq('is_open', true);
  if (f.game?.trim()) q = q.ilike('game_system', like(f.game));
  if (f.country) q = q.eq('country', f.country);
  if (f.city?.trim()) q = q.ilike('city', like(f.city));
  if (f.level) q = q.eq('level', f.level);
  return must(await q.order('from_date').limit(100)) as LfgPost[];
}

export type NewPost = Omit<LfgPost, 'id' | 'is_open' | 'created_at' | 'author'>;
export async function createPost(p: NewPost) {
  must(await db().from('lfg_posts').insert(p));
}
export async function closePost(id: string) {
  must(await db().from('lfg_posts').update({ is_open: false }).eq('id', id));
}

// --- Messages -----------------------------------------------------------------------------------
export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  other: { id: string; display_name: string; handle: string };
  last: DirectMessage;
  unread: number;
}

export async function conversations(me: string): Promise<Conversation[]> {
  const msgs = must(
    await db().from('direct_messages').select('*').or(`sender_id.eq.${me},recipient_id.eq.${me}`).order('created_at', { ascending: false }).limit(300),
  ) as DirectMessage[];
  const byOther = new Map<string, { last: DirectMessage; unread: number }>();
  for (const m of msgs) {
    const other = m.sender_id === me ? m.recipient_id : m.sender_id;
    const c = byOther.get(other) ?? { last: m, unread: 0 };
    if (m.recipient_id === me && !m.read_at) c.unread++;
    byOther.set(other, c);
  }
  if (!byOther.size) return [];
  const people = must(await db().from('profiles').select('id, display_name, handle').in('id', [...byOther.keys()])) as Conversation['other'][];
  return people
    .map((p) => ({ other: p, ...byOther.get(p.id)! }))
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}

export async function thread(me: string, other: string): Promise<DirectMessage[]> {
  const msgs = must(
    await db()
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
      .order('created_at')
      .limit(500),
  ) as DirectMessage[];
  if (msgs.some((m) => m.recipient_id === me && !m.read_at)) {
    await db().from('direct_messages').update({ read_at: new Date().toISOString() }).eq('recipient_id', me).eq('sender_id', other).is('read_at', null);
  }
  return msgs;
}

export async function sendMessage(me: string, to: string, body: string, context: { game_id?: string; lfg_post_id?: string } = {}) {
  must(await db().from('direct_messages').insert({ sender_id: me, recipient_id: to, body: body.trim(), ...context }));
}
export async function canMessage(to: string): Promise<boolean> {
  const { data } = await db().rpc('can_message', { p_to: to });
  return !!data;
}

export interface GameMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: { display_name: string } | null;
}
export async function gameChat(gameId: string): Promise<GameMessage[]> {
  return must(
    await db().from('game_messages').select('id, sender_id, body, created_at, sender:profiles!game_messages_sender_id_fkey(display_name)').eq('game_id', gameId).order('created_at').limit(300),
  ) as unknown as GameMessage[];
}
export async function sendGameMessage(gameId: string, me: string, body: string) {
  must(await db().from('game_messages').insert({ game_id: gameId, sender_id: me, body: body.trim() }));
}

// --- Notifications ------------------------------------------------------------------------------
export interface AppNotification {
  id: string;
  kind:
    | 'join_request' | 'join_answer' | 'game_match' | 'report_to_confirm' | 'report_answer' | 'message' | 'game_message' | 'league_game'
    | 'round_paired' | 'match_to_confirm' | 'match_answer' | 'round_schedule';
  payload: Record<string, string>;
  read_at: string | null;
  created_at: string;
}
export async function notifications(): Promise<AppNotification[]> {
  return must(await db().from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) as AppNotification[];
}
export async function unreadCount(): Promise<number> {
  const { count } = await db().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}
export async function markAllRead(me: string) {
  must(await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', me).is('read_at', null));
}

// --- Leagues and stores ---------------------------------------------------------------------------
export interface League {
  id: string;
  organiser_id: string;
  name: string;
  game_system: string;
  store_id: string | null;
  city: string | null;
  starts_on: string;
  ends_on: string;
  description: string | null;
  store?: { name: string } | null;
  members?: { count: number }[];
}
export interface Standing {
  player_id: string;
  display_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export async function listLeagues(f: { current?: boolean; store?: string } = {}): Promise<League[]> {
  let q = db().from('leagues').select('*, store:stores(name), members:league_members(count)');
  if (f.current) q = q.gte('ends_on', new Date().toISOString().slice(0, 10));
  if (f.store) q = q.eq('store_id', f.store);
  return must(await q.order('starts_on', { ascending: false }).limit(50)) as League[];
}
export async function getLeague(id: string): Promise<League | null> {
  return must(await db().from('leagues').select('*, store:stores(name), members:league_members(count)').eq('id', id).maybeSingle()) as League | null;
}
export async function standings(id: string): Promise<Standing[]> {
  return must(await db().rpc('league_standings', { p_league: id })) as Standing[];
}
export async function myLeagues(me: string): Promise<string[]> {
  const rows = must(await db().from('league_members').select('league_id').eq('player_id', me)) as { league_id: string }[];
  return rows.map((r) => r.league_id);
}
export async function joinLeague(id: string, me: string) {
  must(await db().from('league_members').insert({ league_id: id, player_id: me }));
}
export async function leaveLeague(id: string, me: string) {
  must(await db().from('league_members').delete().eq('league_id', id).eq('player_id', me));
}
export async function createLeague(l: Omit<League, 'id' | 'store' | 'members'>): Promise<string> {
  const row = must(await db().from('leagues').insert(l).select('id').single()) as { id: string };
  await joinLeague(row.id, l.organiser_id);
  return row.id;
}
export async function leagueGames(id: string): Promise<Game[]> {
  return must(await db().from('games').select('*, host:profiles!games_host_id_fkey(display_name, handle), store:stores(name)').eq('league_id', id).neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(50)) as Game[];
}

export interface StoreSlot {
  id: string;
  store_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  tables: number | null;
  note: string | null;
}
export async function getStore(id: string) {
  return must(await db().from('stores').select('id, name, address, city, website').eq('id', id).maybeSingle()) as
    | { id: string; name: string; address: string; city: string; website: string | null }
    | null;
}
export async function storeSlots(id: string): Promise<StoreSlot[]> {
  return must(await db().from('store_slots').select('*').eq('store_id', id).order('weekday').order('starts_at')) as StoreSlot[];
}
export async function addSlot(s: Omit<StoreSlot, 'id'>) {
  must(await db().from('store_slots').insert(s));
}
export async function removeSlot(id: string) {
  must(await db().from('store_slots').delete().eq('id', id));
}
export async function isStoreStaff(storeId: string): Promise<boolean> {
  const { data } = await db().rpc('is_store_staff', { p_store: storeId });
  return !!data;
}
export async function storeGames(id: string): Promise<Game[]> {
  return must(
    await db().from('games').select('*, host:profiles!games_host_id_fkey(display_name, handle), store:stores(name)').eq('store_id', id).gte('starts_at', new Date().toISOString()).neq('status', 'cancelled').order('starts_at').limit(30),
  ) as Game[];
}
export async function storeTournaments(id: string) {
  return must(await db().from('tournaments').select('id, slug, name, starts_at').eq('store_id', id).gte('starts_at', new Date().toISOString()).order('starts_at').limit(20)) as {
    id: string;
    slug: string;
    name: string;
    starts_at: string;
  }[];
}

/**
 * Realtime: calls `onChange` when a row is inserted in `table` (matching `filter`, PostgREST syntax).
 * RLS applies, so only rows the user may read arrive. Returns the unsubscribe function.
 */
export function onInsert(table: 'direct_messages' | 'game_messages' | 'notifications', filter: string, onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  const channel = client
    .channel(`${table}:${filter}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, () => onChange())
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

export { playError };

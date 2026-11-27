import { supabase } from '../../core/auth/supabase';

/** Companies (player groups), supabase/migrations/*_companies.sql. Every write goes through a SQL function. */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export type CompanyRole = 'leader' | 'officer' | 'member' | 'recruit';
export const ROLES: CompanyRole[] = ['leader', 'officer', 'member', 'recruit'];

/** Built-in crest: indexes into the generator's shapes, divisions, patterns, symbols and inks (see Crest.tsx). */
export interface CrestSpec { shape: number; division: number; pattern: number; symbol: number; inks: [number, number, number] }
export const CREST_RANGES = { shape: 6, division: 6, pattern: 6, symbol: 12 } as const;
export const DEFAULT_CREST: CrestSpec = { shape: 0, division: 1, pattern: 0, symbol: 0, inks: [1, 0, 2] };

export function cleanCrest(v: unknown): CrestSpec {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, max: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(Math.max(Math.floor(x), 0), max - 1) : 0);
  const inks = Array.isArray(o.inks) ? o.inks : [];
  return {
    shape: n(o.shape, CREST_RANGES.shape),
    division: n(o.division, CREST_RANGES.division),
    pattern: n(o.pattern, CREST_RANGES.pattern),
    symbol: n(o.symbol, CREST_RANGES.symbol),
    inks: [0, 1, 2].map((i) => (typeof inks[i] === 'number' ? n(inks[i], 6) : DEFAULT_CREST.inks[i])) as CrestSpec['inks'],
  };
}

/** A random crest, from a seed (the name) so the first proposal is stable. */
export function randomCrest(seed = Math.random().toString()): CrestSpec {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const next = (max: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return h % max;
  };
  const a = next(6);
  let b = next(6);
  if (b === a) b = (b + 1) % 6;
  let c = next(6);
  while (c === a || c === b) c = (c + 1) % 6;
  return { shape: next(6), division: next(6), pattern: next(6), symbol: next(12), inks: [a, b, c] };
}

export interface CompanyCard {
  id: string;
  slug: string;
  name: string;
  motto: string;
  crest: unknown;
  city: string | null;
  country?: string | null;
  is_online: boolean;
  languages?: string[];
  games?: string;
  is_public?: boolean;
  join_open?: boolean;
  members: number;
  member_limit?: number;
}
export interface MyCompany extends CompanyCard { role: CompanyRole; is_main: boolean }
export interface CompanyInvite { company_id: string; slug: string; name: string; crest: unknown; invited_by: string | null; created_at: string }

export interface CompanyMember { user_id: string; display_name: string; handle: string; role: CompanyRole; joined_at: string }
export interface Company {
  id: string;
  slug: string;
  name: string;
  motto: string;
  description: string;
  city: string | null;
  country: string | null;
  is_online: boolean;
  languages: string[];
  games: string;
  crest: unknown;
  is_public: boolean;
  join_open: boolean;
  join_invite: boolean;
  join_link: boolean;
  member_limit: number;
  limit_ceiling: number;
  competitive: boolean;
  is_hidden: boolean;
  created_at: string;
  my_role: CompanyRole | null;
  invited: boolean;
  members_count: number;
  can_see: boolean;
  members: CompanyMember[] | null;
  invites: { user_id: string; display_name: string; handle: string }[] | null;
  next_event: { id: string; title: string; starts_at: string } | null;
}

/** Fields a leader or an officer can write (create_company / update_company). */
export interface CompanyInput {
  name: string;
  motto: string;
  description: string;
  city: string;
  country: string;
  is_online: boolean;
  languages: string[];
  games: string;
  crest: CrestSpec;
  is_public: boolean;
  join_open: boolean;
  join_invite: boolean;
  join_link: boolean;
  member_limit?: number;
  competitive?: boolean;
}
export const SETTINGS_KEYS = ['is_public', 'join_open', 'join_invite', 'join_link', 'member_limit', 'competitive'] as const;

export const isOfficer = (r: CompanyRole | null | undefined) => r === 'leader' || r === 'officer';

export async function searchCompanies(q: { query?: string; city?: string; lang?: string; online?: boolean | null }): Promise<CompanyCard[]> {
  return must(await db().rpc('search_companies', { p_query: q.query ?? null, p_city: q.city ?? null, p_lang: q.lang ?? null, p_online: q.online ?? null })) as CompanyCard[];
}
export async function myCompanies(): Promise<MyCompany[]> {
  return must(await db().rpc('my_companies')) as MyCompany[];
}
export async function myInvites(): Promise<CompanyInvite[]> {
  return must(await db().rpc('my_company_invites')) as CompanyInvite[];
}
export async function companyPage(slug: string): Promise<Company | null> {
  return must(await db().rpc('company_page', { p_slug: slug })) as Company | null;
}
export async function playerCompanies(userId: string): Promise<{ slug: string; name: string; crest: unknown; role: CompanyRole; is_main: boolean }[]> {
  return must(await db().rpc('player_companies', { p_user: userId })) as { slug: string; name: string; crest: unknown; role: CompanyRole; is_main: boolean }[];
}

export async function createCompany(p: CompanyInput): Promise<string> {
  return must(await db().rpc('create_company', { p })) as string;
}
export async function updateCompany(id: string, p: Partial<CompanyInput>) {
  must(await db().rpc('update_company', { p_company: id, p }));
}
export async function dissolveCompany(id: string) {
  must(await db().rpc('dissolve_company', { p_company: id }));
}
export async function joinCompany(id: string) {
  must(await db().rpc('join_company', { p_company: id }));
}
export async function leaveCompany(id: string) {
  must(await db().rpc('leave_company', { p_company: id }));
}
export async function setMainCompany(id: string) {
  must(await db().rpc('set_main_company', { p_company: id }));
}

// --- Invitations and link --------------------------------------------------------------------
export async function companyLink(id: string): Promise<{ token: string; expires_at: string | null } | null> {
  return must(await db().from('company_links').select('token, expires_at').eq('company_id', id).maybeSingle()) as { token: string; expires_at: string | null } | null;
}
export async function resetLink(id: string, days: number | null): Promise<string> {
  return must(await db().rpc('reset_company_link', { p_company: id, p_days: days })) as string;
}
export const linkUrl = (token: string) => `${location.origin}/play/join/${token}`;
export async function linkPreview(token: string): Promise<(CompanyCard & { members: number }) | null> {
  const rows = must(await db().rpc('company_link_preview', { p_token: token })) as (CompanyCard & { members: number })[];
  return rows[0] ?? null;
}
export async function joinByLink(token: string): Promise<string> {
  return must(await db().rpc('join_company_by_link', { p_token: token })) as string;
}
export async function invite(id: string, handle: string) {
  must(await db().rpc('invite_to_company', { p_company: id, p_handle: handle }));
}
export async function answerInvite(id: string, accept: boolean) {
  must(await db().rpc('answer_company_invite', { p_company: id, p_accept: accept }));
}
export async function cancelInvite(id: string, user: string) {
  must(await db().rpc('cancel_company_invite', { p_company: id, p_user: user }));
}

// --- Members -----------------------------------------------------------------------------------
export async function setRole(id: string, user: string, role: CompanyRole) {
  must(await db().rpc('set_company_role', { p_company: id, p_user: user, p_role: role }));
}
export async function removeMember(id: string, user: string) {
  must(await db().rpc('remove_company_member', { p_company: id, p_user: user }));
}

// --- Chat --------------------------------------------------------------------------------------
export interface CompanyMessage {
  id: string;
  sender_id: string;
  body: string;
  is_announcement: boolean;
  is_hidden: boolean;
  created_at: string;
  sender?: { display_name: string; handle: string } | null;
}
export async function companyChat(id: string): Promise<CompanyMessage[]> {
  const rows = must(
    await db()
      .from('company_messages')
      .select('id, sender_id, body, is_announcement, is_hidden, created_at, sender:profiles!company_messages_sender_id_fkey(display_name, handle)')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
  ) as unknown as CompanyMessage[];
  return rows.reverse();
}
export async function announcements(id: string): Promise<CompanyMessage[]> {
  return must(
    await db()
      .from('company_messages')
      .select('id, sender_id, body, is_announcement, is_hidden, created_at, sender:profiles!company_messages_sender_id_fkey(display_name, handle)')
      .eq('company_id', id)
      .eq('is_announcement', true)
      .order('created_at', { ascending: false })
      .limit(5),
  ) as unknown as CompanyMessage[];
}
export async function postMessage(id: string, body: string, announce = false) {
  must(await db().rpc('post_company_message', { p_company: id, p_body: body, p_announce: announce }));
}
export async function pinMessage(id: string, pinned: boolean) {
  must(await db().rpc('pin_company_message', { p_message: id, p_pinned: pinned }));
}
export async function deleteMessage(id: string) {
  must(await db().rpc('delete_company_message', { p_message: id }));
}
export async function reportCompanyContent(type: 'company' | 'company_message', id: string, reason: string) {
  must(await db().rpc('report_company_content', { p_type: type, p_id: id, p_reason: reason }));
}

/** New chat messages, pushed by Supabase Realtime (RLS applies). */
export function onCompanyMessage(id: string, onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  const channel = client
    .channel(`company_messages:${id}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'company_messages', filter: `company_id=eq.${id}` }, () => onChange())
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

// --- Calendar ----------------------------------------------------------------------------------
export type EventAnswer = 'yes' | 'maybe' | 'no';
export interface CompanyEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  place: string;
  details: string;
  yes: number;
  maybe: number;
  my_answer: EventAnswer | null;
  going: string[];
}
export interface EventInput { title: string; starts_at: string; ends_at: string; place: string; details: string }

export async function calendar(id: string, past = false): Promise<CompanyEvent[]> {
  return must(await db().rpc('company_calendar', { p_company: id, p_past: past })) as CompanyEvent[];
}
export async function saveEvent(company: string, id: string | null, p: EventInput): Promise<string> {
  return must(await db().rpc('save_company_event', { p_company: company, p_id: id, p })) as string;
}
export async function deleteEvent(id: string) {
  must(await db().rpc('delete_company_event', { p_id: id }));
}
export async function answerEvent(id: string, answer: EventAnswer | null) {
  must(await db().rpc('answer_company_event', { p_id: id, p_answer: answer }));
}

/** Error codes of the Company functions, on top of the PLAY ones (games.error.*). */
export const COMPANY_ERRORS = [
  'bad_name', 'bad_limit', 'not_leader', 'no_company', 'already_member', 'company_full', 'too_many_companies', 'link_off', 'bad_link',
  'invites_off', 'no_player', 'no_invite', 'bad_dates', 'no_event', 'event_over', 'bad_answer',
] as const;

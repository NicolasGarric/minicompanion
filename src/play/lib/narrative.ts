import { supabase } from '../../core/auth/supabase';
import { encodeTable } from './tableCodec';
import { generate, newSeed, type Theme } from './tableGen';
import type { Board, BattleRow, CampId, CampaignRow, Effect, LogRow, Member, MyCampaign, Place, PlaceType } from './narrativeBoard';

export * from './narrativeBoard';

/**
 * Narrative campaigns (supabase/migrations/*_narrative_campaigns.sql): a network of places and routes
 * the campaign master draws, 2 to 4 camps, actions recorded by the players. The board is one JSON
 * document; players change it only through server functions (fixed effects), the master saves it whole.
 */
/** A table map suited to the kind of place, as a code for the table editor. */
const THEME_OF: Record<PlaceType, Theme> = { planet: 'forest', moon: 'desert', station: 'outpost', belt: 'frozen', nebula: 'frozen', wreck: 'city' };
export function rollPlaceMap(p: Place, name: string): Promise<string> {
  const t = generate({ mode: 'narrative', size: 1, density: 'standard', theme: THEME_OF[p.type], seed: newSeed() });
  return encodeTable({ ...t, name: name.slice(0, 60) });
}

// ---------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};
const COLUMNS = 'id, master_id, title, sector, description, template_key, turn, version, status, is_public, created_at, updated_at';

export const myCampaigns = async () => (must(await db().rpc('my_campaigns')) ?? []) as MyCampaign[];

export async function loadCampaign(id: string) {
  const [row, board, members, log, battles] = await Promise.all([
    db().from('campaigns').select(COLUMNS).eq('id', id).maybeSingle(),
    db().rpc('campaign_view', { p_campaign: id }),
    db().from('campaign_members').select('user_id, camp, profile:profiles(display_name, handle)').eq('campaign_id', id).order('joined_at'),
    db().from('campaign_log').select('*, author:profiles!campaign_log_author_id_fkey(display_name, handle)').eq('campaign_id', id).order('turn', { ascending: false }).limit(300),
    db().from('campaign_battles').select('*').eq('campaign_id', id).neq('status', 'cancelled').order('starts_on'),
  ]);
  const r = must(row) as CampaignRow | null;
  if (!r) return null;
  return {
    row: r,
    board: must(board) as Board,
    members: must(members) as unknown as Member[],
    log: must(log) as unknown as LogRow[],
    battles: must(battles) as BattleRow[],
  };
}
export const campaignVersion = async (id: string) => (must(await db().from('campaigns').select('version').eq('id', id).maybeSingle()) as { version: number } | null)?.version ?? null;

export const createCampaign = async (title: string, sector: string, description: string, template: string | null, board: Board, camp: CampId | null) =>
  must(await db().rpc('create_campaign', { p_title: title, p_sector: sector, p_description: description, p_template: template, p_state: board, p_camp: camp })) as string;
export const saveBoard = async (id: string, board: Board, version: number, meta: { title?: string; sector?: string; description?: string; isPublic?: boolean; status?: 'active' | 'finished' } = {}) =>
  must(await db().rpc('save_campaign_state', {
    p_campaign: id, p_state: board, p_version: version, p_title: meta.title ?? null, p_sector: meta.sector ?? null,
    p_description: meta.description ?? null, p_public: meta.isPublic ?? null, p_status: meta.status ?? null,
  })) as number;
export const inviteCode = async (id: string) => must(await db().rpc('campaign_invite_code', { p_campaign: id })) as string | null;
export const joinCampaign = async (id: string, code: string, camp: CampId | null) => must(await db().rpc('join_campaign', { p_campaign: id, p_code: code, p_camp: camp }));
export const setMember = async (id: string, user: string, camp: CampId | null, remove = false) =>
  must(await db().rpc('set_campaign_member', { p_campaign: id, p_user: user, p_camp: camp, p_remove: remove }));
export const leaveCampaign = async (id: string) => must(await db().rpc('leave_campaign', { p_campaign: id }));
export const deleteCampaign = async (id: string) => must(await db().rpc('delete_campaign', { p_campaign: id }));
export const recordAction = async (id: string, camp: CampId, effect: Effect, target: string | null, amount: number | null, label: string | null, text: string | null) =>
  must(await db().rpc('record_campaign_action', { p_campaign: id, p_camp: camp, p_effect: effect, p_target: target, p_amount: amount, p_label: label, p_text: text }));
export const contestAction = async (log: string) => must(await db().rpc('contest_campaign_action', { p_log: log }));
export const resolveContest = async (log: string, undo: boolean) => must(await db().rpc('resolve_campaign_contest', { p_log: log, p_undo: undo }));
export const planBattle = async (id: string, place: number, title: string, date: string, a: CampId, b: CampId, note: string) =>
  must(await db().rpc('plan_campaign_battle', { p_campaign: id, p_place: place, p_title: title, p_date: date, p_camp_a: a, p_camp_b: b, p_note: note }));
export const recordBattle = async (battle: string, winnerCamp: CampId) => must(await db().rpc('record_campaign_battle', { p_battle: battle, p_winner: winnerCamp }));
export const cancelBattle = async (battle: string) => must(await db().rpc('cancel_campaign_battle', { p_battle: battle }));

/** Journal and battles change live; the board is fetched again by the caller. */
export function onCampaignChange(id: string, onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  const channel = client
    .channel(`campaign:${id}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_log', filter: `campaign_id=eq.${id}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_battles', filter: `campaign_id=eq.${id}` }, () => onChange())
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

/** Error key for the UI (games.error.* style). */
export function campaignError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? '';
  const known = ['not_authenticated', 'suspended', 'too_many_campaigns', 'bad_state', 'bad_invite', 'bad_camp', 'campaign_full', 'not_master', 'master_stays',
    'version_conflict', 'not_your_camp', 'not_your_place', 'bad_target', 'bad_effect', 'rate_limited', 'campaign_finished', 'not_other_camp', 'too_late',
    'already_contested', 'not_contested', 'too_many_battles', 'already_played', 'forbidden'];
  return known.find((k) => m.includes(k)) ?? 'generic';
}

/**
 * Narrative campaign board: types and pure helpers (no import, unit-tested with plain Node).
 * Server calls live in narrative.ts, which re-exports everything here.
 */
export type CampId = 'A' | 'B' | 'C' | 'D';
export const CAMP_IDS: CampId[] = ['A', 'B', 'C', 'D'];
export type PlaceType = 'planet' | 'moon' | 'station' | 'belt' | 'nebula' | 'wreck';
export const PLACE_TYPES: PlaceType[] = ['planet', 'moon', 'station', 'belt', 'nebula', 'wreck'];
export const PLACE_VALUE: Record<PlaceType, number> = { planet: 2, moon: 1, station: 2, belt: 1, nebula: 1, wreck: 3 };
export type RouteType = 'normal' | 'long' | 'unstable' | 'secret';
export const ROUTE_TYPES: RouteType[] = ['normal', 'long', 'unstable', 'secret'];
export type ZoneType = 'nebula' | 'debris' | 'border';
export const ZONE_TYPES: ZoneType[] = ['nebula', 'debris', 'border'];
export type Background = 'blue' | 'night' | 'paper';
export const BACKGROUNDS: Background[] = ['blue', 'night', 'paper'];
export type EmblemShape = 'circle' | 'shield' | 'diamond' | 'hex';
export const EMBLEM_SHAPES: EmblemShape[] = ['circle', 'shield', 'diamond', 'hex'];
export type EmblemSign = 'star' | 'bolt' | 'eye' | 'crown' | 'claw' | 'wave';
export const EMBLEM_SIGNS: EmblemSign[] = ['star', 'bolt', 'eye', 'crown', 'claw', 'wave'];
export type Effect = 'take' | 'fort' | 'cut' | 'res' | 'xp' | 'fall' | 'event';
export const EFFECTS: Effect[] = ['take', 'fort', 'cut', 'res', 'xp', 'fall', 'event'];
export type VictoryRule = 'capital' | 'count' | 'resources' | 'turns';
export const VICTORY_RULES: VictoryRule[] = ['capital', 'count', 'resources', 'turns'];
export const CAMP_COLORS = ['#ff4f7b', '#ffd23f', '#4fd1a5', '#b18cff'];

export interface Place {
  id: number;
  name: string;
  type: PlaceType;
  x: number;
  y: number;
  owner: CampId | null;
  capital: boolean;
  fort: number;
  value: number;
  scenario: string;
  notes: string;
  /** Table map code (tableCodec) */
  map: string | null;
  /** Scenario of the library played here ("amber_veil.3", "free.7"), shown in each reader's language */
  sc?: string | null;
  /** Background text of a ready-made campaign ("amber_veil.4") */
  lore?: string | null;
}
export interface Route { a: number; b: number; type: RouteType; owner: CampId | null; cut: boolean }
export interface Zone { x: number; y: number; r: number; type: ZoneType }
export interface Hero { name: string; xp: number; fallen: boolean }
export interface Camp { id: CampId; name: string; color: string; shape: EmblemShape; sign: EmblemSign; motto: string; res: number; heroes: Hero[] }
export interface CustomAction { name: string; effect: Effect; amount: number }
export interface Board {
  bg: Background;
  places: Place[];
  routes: Route[];
  zones: Zone[];
  camps: Camp[];
  custom: CustomAction[];
  victory: { rule: VictoryRule; n: number };
}

export interface CampaignRow {
  id: string;
  master_id: string;
  title: string;
  sector: string | null;
  description: string | null;
  template_key: string | null;
  turn: number;
  version: number;
  status: 'active' | 'finished';
  is_public: boolean;
  created_at: string;
  updated_at: string;
}
export interface Snapshot { places: Record<string, { owner: CampId | null; capital: boolean; fort: number }>; cut: string[]; res: Record<string, number> }
export interface LogRow {
  id: string;
  turn: number;
  camp: CampId | null;
  author_id: string | null;
  effect: Effect | 'battle';
  label: string | null;
  detail: Record<string, unknown>;
  snapshot: Snapshot;
  contested_by: string | null;
  contested_at: string | null;
  resolution: 'kept' | 'undone' | null;
  created_at: string;
  author?: { display_name: string; handle: string } | null;
}
export interface BattleRow {
  id: string;
  place_id: number;
  title: string | null;
  starts_on: string;
  camps: [CampId, CampId];
  note: string | null;
  status: 'planned' | 'played' | 'cancelled';
  winner: CampId | null;
  created_by: string | null;
}
export interface Member { user_id: string; camp: CampId | null; profile?: { display_name: string; handle: string } | null }
export interface MyCampaign { id: string; title: string; sector: string | null; status: string; turn: number; camp: CampId | null; is_master: boolean; members: number; next_battle: string | null }

export const LIMITS = { places: 80, routes: 200, zones: 40, custom: 30, heroes: 12, name: 40, notes: 1000, scenario: 80, motto: 80 };

// ---------------------------------------------------------------------------------------------
// Board helpers (pure)
// ---------------------------------------------------------------------------------------------
export const routeKey = (r: { a: number; b: number }) => `${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`;

/** Places a camp holds but cannot reach from its capital through its own places and open routes. */
export function isolated(b: Board): Set<number> {
  const out = new Set<number>();
  for (const k of b.camps) {
    const cap = b.places.find((p) => p.owner === k.id && p.capital);
    if (!cap) continue;
    const seen = new Set([cap.id]), queue = [cap.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const r of b.routes) {
        if (r.cut || (r.a !== id && r.b !== id)) continue;
        const o = r.a === id ? r.b : r.a;
        if (!seen.has(o) && b.places.find((p) => p.id === o)?.owner === k.id) {
          seen.add(o);
          queue.push(o);
        }
      }
    }
    b.places.forEach((p) => p.owner === k.id && !seen.has(p.id) && out.add(p.id));
  }
  return out;
}

/** The board as it was at a turn of the journal: owners, capitals, fortifications, cut routes. */
export function boardAt(b: Board, s: Snapshot): Board {
  return {
    ...b,
    places: b.places.map((p) => ({ ...p, ...(s.places[String(p.id)] ?? { owner: null, capital: false, fort: 0 }) })),
    routes: b.routes.map((r) => ({ ...r, cut: r.type === 'secret' ? r.cut : s.cut.includes(routeKey(r)) })),
    camps: b.camps.map((c) => ({ ...c, res: s.res?.[c.id] ?? c.res })),
  };
}

export const placesOf = (b: Board, camp: CampId) => b.places.filter((p) => p.owner === camp);
export const valueOf = (b: Board, camp: CampId) => placesOf(b, camp).reduce((a, p) => a + p.value, 0);

/** Progress of a camp towards the victory rule: [done, needed]. */
export function progress(b: Board, camp: CampId, turn: number): [number, number] {
  const v = b.victory;
  if (v.rule === 'capital') {
    const others = b.camps.filter((c) => c.id !== camp);
    return [others.filter((o) => !b.places.some((p) => p.owner === o.id && p.capital)).length, others.length];
  }
  if (v.rule === 'count') return [placesOf(b, camp).length, v.n];
  if (v.rule === 'resources') return [b.camps.find((c) => c.id === camp)?.res ?? 0, v.n];
  return [Math.min(turn, v.n), v.n];
}

export function winner(b: Board, turn: number): Camp | null {
  const v = b.victory;
  if (v.rule === 'capital') {
    if (!turn) return null;
    const alive = b.camps.filter((c) => b.places.some((p) => p.owner === c.id && p.capital));
    return alive.length === 1 ? alive[0] : null;
  }
  if (v.rule === 'count') return b.camps.find((c) => placesOf(b, c.id).length >= v.n) ?? null;
  if (v.rule === 'resources') return b.camps.find((c) => c.res >= v.n) ?? null;
  if (turn < v.n) return null;
  return [...b.camps].sort((x, y) => valueOf(b, y.id) - valueOf(b, x.id))[0] ?? null;
}

export const nextPlaceId = (b: Board) => b.places.reduce((m, p) => Math.max(m, p.id), 0) + 1;

export function blankBoard(): Board {
  return {
    bg: 'blue',
    places: [],
    routes: [],
    zones: [],
    camps: [
      { id: 'A', name: 'Camp A', color: CAMP_COLORS[0], shape: 'shield', sign: 'star', motto: '', res: 0, heroes: [] },
      { id: 'B', name: 'Camp B', color: CAMP_COLORS[1], shape: 'hex', sign: 'bolt', motto: '', res: 0, heroes: [] },
    ],
    custom: [],
    victory: { rule: 'capital', n: 8 },
  };
}


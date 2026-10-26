import { supabase } from '../../core/auth/supabase';

/**
 * League campaign map (supabase/migrations/*_hobby_community.sql): a planet split into regions or a
 * star system of planets and moons. The geometry and names are rebuilt here from the seed, so the
 * database only stores who holds which territory.
 */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export type MapKind = 'planet' | 'system';
export interface Campaign { league_id: string; map_kind: MapKind; seed: number; territories: number }
export interface CampaignEvent { id: string; player_id: string; idx: number; taken_from: string | null; by_organiser: boolean; created_at: string }

export async function getCampaign(league: string) {
  const c = must(await db().from('league_campaigns').select('*').eq('league_id', league).maybeSingle()) as Campaign | null;
  if (!c) return null;
  const owners = must(await db().from('campaign_territories').select('idx, owner_id').eq('league_id', league)) as { idx: number; owner_id: string | null }[];
  const events = must(await db().from('campaign_events').select('*').eq('league_id', league).order('created_at', { ascending: false }).limit(30)) as CampaignEvent[];
  return { campaign: c, owners: new Map(owners.map((o) => [o.idx, o.owner_id])), events };
}
export async function createCampaign(league: string, kind: MapKind, territories: number) {
  must(await db().rpc('create_league_campaign', { p_league: league, p_kind: kind, p_territories: territories }));
}
export async function conquestsLeft(league: string, player: string): Promise<number> {
  return must(await db().rpc('campaign_conquests_left', { p_league: league, p_player: player })) as number;
}
export async function claim(league: string, idx: number) {
  must(await db().rpc('claim_territory', { p_league: league, p_idx: idx }));
}
export async function setOwner(league: string, idx: number, owner: string | null) {
  must(await db().rpc('organiser_set_territory', { p_league: league, p_idx: idx, p_owner: owner }));
}

/* ---------- Geometry (deterministic from the seed) ---------- */

export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYL = ['ka', 'ri', 'to', 'ven', 'mor', 'sa', 'lu', 'dra', 'ne', 'zor', 'ha', 'mi', 'cal', 'ost', 'ur', 'ae', 'bel', 'tis', 'gra', 'on', 'ys', 'ke', 'lo', 'vi'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Invented, language-neutral place names. */
export function territoryNames(seed: number, n: number): string[] {
  const r = rng(seed * 7 + 3), out: string[] = [];
  while (out.length < n) {
    const len = 2 + Math.floor(r() * 2);
    const name = cap(Array.from({ length: len }, () => SYL[Math.floor(r() * SYL.length)]).join(''));
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Planet: region centres inside the unit disc (−1…1), spread out. */
export function planetSites(seed: number, n: number): [number, number][] {
  const r = rng(seed), out: [number, number][] = [];
  const minD = 1.6 / Math.sqrt(n);
  for (let tries = 0; out.length < n && tries < 5000; tries++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.92;
    const p: [number, number] = [Math.cos(a) * d, Math.sin(a) * d];
    if (out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > minD * (tries > 3000 ? 0.6 : 1))) out.push(p);
  }
  return out;
}

/** Region of a point of the disc: nearest site, with a gentle warp so borders look like coasts. */
export function regionAt(x: number, y: number, sites: [number, number][], seed: number): number {
  const wx = x + 0.06 * Math.sin(y * 9 + seed), wy = y + 0.06 * Math.sin(x * 8 - seed);
  let best = 0, bd = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const d = (sites[i][0] - wx) ** 2 + (sites[i][1] - wy) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Star system: territories are planets on orbits; some planets have a moon (also a territory). */
export interface Body { x: number; y: number; r: number; orbit: number; parent: number | null }
export function systemBodies(seed: number, n: number): Body[] {
  const r = rng(seed), bodies: Body[] = [];
  const orbits = Math.max(3, Math.min(6, Math.round(n / 3)));
  let i = 0;
  while (bodies.length < n) {
    const orbit = i % orbits;
    const radius = 0.24 + (orbit / (orbits - 1)) * 0.68;
    const a = r() * Math.PI * 2;
    const planet: Body = { x: Math.cos(a) * radius, y: Math.sin(a) * radius * 0.62, r: 0.035 + r() * 0.035, orbit, parent: null };
    if (bodies.every((b) => Math.hypot(b.x - planet.x, b.y - planet.y) > 0.16)) {
      const pi = bodies.push(planet) - 1;
      if (bodies.length < n && r() < 0.35) {
        const ma = r() * Math.PI * 2;
        bodies.push({ x: planet.x + Math.cos(ma) * 0.075, y: planet.y + Math.sin(ma) * 0.075, r: 0.018, orbit, parent: pi });
      }
    }
    i++;
    if (i > 4000) break;
  }
  return bodies.slice(0, n);
}

export const PLAYER_INKS = ['#ff4f7b', '#1d2a5b', '#3b8f6b', '#c8693a', '#5b2a6e', '#2d9cb8', '#a47552', '#b0a04a', '#8a8fb0', '#2b2b2b'];

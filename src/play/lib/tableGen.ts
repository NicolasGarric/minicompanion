/**
 * Table & mission generator (pure, seeded): terrain, deployment zones, objectives and a mission,
 * in three modes. Generic wording only, no rules of any published game.
 *  - narrative: terrain themed after the chosen scenario, asymmetric, a story twist;
 *  - casual: balanced but lively, one fun event;
 *  - competitive: point-symmetric terrain (the same for both sides), chosen density.
 */
import { KIND_DEFAULTS, inPolygon, makePiece, mirrorPiece, type Piece, type TerrainKind } from './terrain.ts';

export type { Piece, TerrainKind } from './terrain.ts';
export type Mode = 'narrative' | 'casual' | 'competitive';
export type Density = 'light' | 'standard' | 'dense';
export type Theme = 'city' | 'forest' | 'desert' | 'frozen' | 'outpost';
export type Deployment = 'long' | 'short' | 'diagonal' | 'corners' | 'hammer' | 'none';
export const DEPLOYMENTS: Deployment[] = ['long', 'short', 'diagonal', 'corners', 'hammer', 'none'];

/** Usual table sizes in inches (index kept in links: new sizes go at the end). */
export const SIZES = [[44, 30], [44, 60], [48, 48], [72, 48], [30, 22], [30, 30], [36, 36], [60, 44]] as const;
/** Sizes in the order shown in the menus (smallest first) */
export const SIZE_ORDER = [4, 5, 6, 0, 2, 1, 7, 3];
export const THEMES: Theme[] = ['city', 'forest', 'desert', 'frozen', 'outpost'];
export const DENSITY_COUNT: Record<Density, number> = { light: 6, standard: 10, dense: 14 };

const THEME_TERRAIN: Record<Theme, TerrainKind[]> = {
  city: ['ruin', 'ruin', 'building', 'wall', 'crater', 'container'],
  forest: ['woods', 'woods', 'hill', 'rocks', 'pond', 'ruin'],
  desert: ['rocks', 'hill', 'crater', 'ruin', 'wall', 'rocks'],
  frozen: ['crystal', 'rocks', 'hill', 'pond', 'crater', 'ruin'],
  outpost: ['container', 'building', 'wall', 'crater', 'container', 'hill'],
};
export const NARRATIVE = ['ambush', 'escort', 'holdout', 'relic', 'breakthrough', 'sabotage'] as const;
export const CASUAL = ['king_hill', 'scramble', 'supply_drop', 'tug_of_war', 'treasure_hunt'] as const;
export const COMPETITIVE = ['take_hold', 'priority_targets', 'control_center', 'shifting_fronts'] as const;
export const TWISTS = ['fog', 'storm', 'reinforcements', 'night', 'tremor', 'none'] as const;
export const EVENTS = ['lucky_charm', 'bonus_point', 'moving_objective', 'duel', 'none'] as const;

export interface Table {
  seed: number;
  /** 'custom' = drawn in the editor (no mission unless it was kept from a generated table) */
  mode: Mode | 'custom';
  /** Name given in the editor */
  name?: string;
  width: number;
  height: number;
  deployment: Deployment;
  /** Polygons in inches, side A then side B */
  zones: [number, number][][];
  pieces: Piece[];
  objectives: { x: number; y: number }[];
  /** Mission key, '' when there is none */
  mission: string;
  /** Narrative twist or casual event key ('none' = nothing) */
  extra: string;
  rounds: number;
}

export interface GenOptions {
  mode: Mode;
  size: number; // index in SIZES
  density: Density;
  theme: Theme;
  seed: number;
  /** Number of terrain pieces wanted (otherwise from the mode and density) */
  count?: number;
  /** Any table size in inches, instead of one of SIZES */
  dims?: [number, number];
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];

export function zonesFor(d: Deployment, W: number, H: number): [number, number][][] {
  const depth = Math.min(W, H) * 0.22;
  switch (d) {
    case 'none': return [];
    case 'long': return [[[0, 0], [W, 0], [W, depth], [0, depth]], [[0, H - depth], [W, H - depth], [W, H], [0, H]]];
    case 'short': return [[[0, 0], [depth, 0], [depth, H], [0, H]], [[W - depth, 0], [W, 0], [W, H], [W - depth, H]]];
    case 'diagonal': return [[[0, 0], [W * 0.45, 0], [0, H * 0.45]], [[W, H], [W * 0.55, H], [W, H * 0.55]]];
    case 'corners': return [[[0, 0], [W * 0.3, 0], [W * 0.3, H * 0.3], [0, H * 0.3]], [[W, H], [W * 0.7, H], [W * 0.7, H * 0.7], [W, H * 0.7]]];
    case 'hammer': return [[[0, 0], [W * 0.5, 0], [W * 0.5, depth], [depth, depth], [depth, H * 0.5], [0, H * 0.5]],
      [[W, H], [W * 0.5, H], [W * 0.5, H - depth], [W - depth, H - depth], [W - depth, H * 0.5], [W, H * 0.5]]];
  }
}


export function generate(o: GenOptions): Table {
  const r = rng(o.seed);
  const [W, H] = o.dims ?? SIZES[o.size] ?? SIZES[1];
  const theme = o.mode === 'narrative' ? o.theme : pick(r, THEMES);
  const kinds = THEME_TERRAIN[theme];
  const deployment: Deployment = o.mode === 'competitive' ? pick(r, ['long', 'short', 'diagonal', 'hammer'] as const)
    : o.mode === 'narrative' ? pick(r, ['long', 'corners', 'diagonal', 'short'] as const) : pick(r, ['long', 'short', 'diagonal'] as const);
  const zones = zonesFor(deployment, W, H);
  const auto = o.mode === 'competitive' ? DENSITY_COUNT[o.density] : o.mode === 'casual' ? 8 + Math.floor(r() * 4) : 7 + Math.floor(r() * 6);
  const count = o.count !== undefined ? Math.max(0, Math.min(MAX_PIECES, Math.round(o.count))) : auto;
  const pieces: Piece[] = [];
  const fits = (p: Piece) => {
    const m = 1.5;
    if (p.x - p.w / 2 < m || p.y - p.h / 2 < m || p.x + p.w / 2 > W - m || p.y + p.h / 2 > H - m) return false;
    // Keep 3" between pieces so models can move between them
    return pieces.every((q) => Math.abs(q.x - p.x) > (q.w + p.w) / 2 + 3 || Math.abs(q.y - p.y) > (q.h + p.h) / 2 + 3);
  };
  const make = (kind: TerrainKind): Piece => {
    const d = KIND_DEFAULTS[kind];
    const s = 0.8 + r() * 0.4;
    const rot = kind === 'wall' || kind === 'container' ? Math.floor(r() * 4) * 45 : Math.floor(r() * 6) * 15;
    // Ruins are L-shaped or plain footprints, like most ruin kits
    const shape = kind === 'ruin' && r() < 0.35 ? 'rect' : d.shape;
    return { ...makePiece(kind, 0, 0, Math.floor(r() * 1e6)), shape, w: d.w * s, h: d.h * s, rot };
  };
  const target = o.mode === 'competitive' ? Math.ceil(count / 2) : count;
  for (let n = 0, tries = 0; n < target && tries < 600 + count * 40; tries++) {
    const p = make(o.mode === 'narrative' && n === 0 ? kinds[0] : pick(r, kinds));
    if (o.mode === 'competitive') {
      // One half of the table, mirrored through the centre
      p.x = W * (0.12 + r() * 0.76);
      p.y = H * (0.1 + r() * 0.38);
      const twin = mirrorPiece(p, W, H, p.seed);
      if (!fits(p)) continue;
      pieces.push(p);
      // Both or neither: a piece whose twin has no room is dropped, so the table stays symmetric
      if (Math.hypot(twin.x - p.x, twin.y - p.y) >= 1) {
        if (!fits(twin)) {
          pieces.pop();
          continue;
        }
        pieces.push(twin);
      }
      n++;
    } else {
      p.x = W * (0.08 + r() * 0.84);
      p.y = H * (0.08 + r() * 0.84);
      // Casual keeps the middle open-ish and both halves equally covered
      if (o.mode === 'casual') {
        const top = pieces.filter((q) => q.y < H / 2).length, bottom = pieces.length - top;
        if ((p.y < H / 2 && top > bottom + 1) || (p.y >= H / 2 && bottom > top + 1)) continue;
      }
      if (!fits(p)) continue;
      pieces.push(p);
      n++;
    }
  }
  // Objectives: centre + symmetric pairs (competitive), spread out otherwise
  const objectives: { x: number; y: number }[] = [{ x: W / 2, y: H / 2 }];
  if (o.mode === 'competitive') {
    const pairs = W >= 60 || H >= 60 ? 2 : 2;
    for (let i = 0; i < pairs; i++) {
      const x = W * (i === 0 ? 0.25 : 0.75), y = H * (0.3 + r() * 0.1);
      objectives.push({ x, y }, { x: W - x, y: H - y });
    }
  } else {
    const n = o.mode === 'narrative' ? 2 + Math.floor(r() * 3) : 3 + Math.floor(r() * 2);
    for (let tries = 0; objectives.length <= n && tries < 200; tries++) {
      const p = { x: W * (0.12 + r() * 0.76), y: H * (0.2 + r() * 0.6) };
      if (zones.some((z) => inPolygon(p.x, p.y, z))) continue;
      if (objectives.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 10)) continue;
      objectives.push(p);
    }
  }
  const mission = o.mode === 'narrative' ? pick(r, NARRATIVE) : o.mode === 'casual' ? pick(r, CASUAL) : pick(r, COMPETITIVE);
  const extra = o.mode === 'narrative' ? pick(r, TWISTS) : o.mode === 'casual' ? pick(r, EVENTS) : 'none';
  return { seed: o.seed, mode: o.mode, width: W, height: H, deployment, zones, pieces, objectives, mission, extra, rounds: o.mode === 'casual' ? 4 : 5 };
}

export const MAX_PIECES = 40;

export const newSeed = () => 1 + Math.floor(Math.random() * 999998);

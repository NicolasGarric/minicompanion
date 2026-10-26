/**
 * Table & mission generator (pure, seeded): terrain, deployment zones, objectives and a mission,
 * in three modes. Generic wording only, no rules of any published game.
 *  - narrative: terrain themed after the chosen scenario, asymmetric, a story twist;
 *  - casual: balanced but lively, one fun event;
 *  - competitive: point-symmetric terrain (the same for both sides), chosen density.
 */
export type Mode = 'narrative' | 'casual' | 'competitive';
export type Density = 'light' | 'standard' | 'dense';
export type Theme = 'city' | 'forest' | 'desert' | 'frozen' | 'outpost';
export type TerrainKind = 'ruin' | 'building' | 'woods' | 'hill' | 'crater' | 'wall' | 'rocks' | 'crystal' | 'container' | 'pond';
export type Deployment = 'long' | 'short' | 'diagonal' | 'corners' | 'hammer';

export const SIZES = [[44, 30], [44, 60], [48, 48], [72, 48]] as const;
export const THEMES: Theme[] = ['city', 'forest', 'desert', 'frozen', 'outpost'];
export const DENSITY_COUNT: Record<Density, number> = { light: 6, standard: 10, dense: 14 };

const THEME_TERRAIN: Record<Theme, TerrainKind[]> = {
  city: ['ruin', 'ruin', 'building', 'wall', 'crater', 'container'],
  forest: ['woods', 'woods', 'hill', 'rocks', 'pond', 'ruin'],
  desert: ['rocks', 'hill', 'crater', 'ruin', 'wall', 'rocks'],
  frozen: ['crystal', 'rocks', 'hill', 'pond', 'crater', 'ruin'],
  outpost: ['container', 'building', 'wall', 'crater', 'container', 'hill'],
};
const NARRATIVE = ['ambush', 'escort', 'holdout', 'relic', 'breakthrough', 'sabotage'] as const;
const CASUAL = ['king_hill', 'scramble', 'supply_drop', 'tug_of_war', 'treasure_hunt'] as const;
const COMPETITIVE = ['take_hold', 'priority_targets', 'control_center', 'shifting_fronts'] as const;
const TWISTS = ['fog', 'storm', 'reinforcements', 'night', 'tremor', 'none'] as const;
const EVENTS = ['lucky_charm', 'bonus_point', 'moving_objective', 'duel', 'none'] as const;

export interface Piece { kind: TerrainKind; x: number; y: number; w: number; h: number; rot: number; seed: number }
export interface Table {
  seed: number;
  mode: Mode;
  width: number;
  height: number;
  deployment: Deployment;
  /** Polygons in inches, side A then side B */
  zones: [number, number][][];
  pieces: Piece[];
  objectives: { x: number; y: number }[];
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

function zonesFor(d: Deployment, W: number, H: number): [number, number][][] {
  const depth = Math.min(W, H) * 0.22;
  switch (d) {
    case 'long': return [[[0, 0], [W, 0], [W, depth], [0, depth]], [[0, H - depth], [W, H - depth], [W, H], [0, H]]];
    case 'short': return [[[0, 0], [depth, 0], [depth, H], [0, H]], [[W - depth, 0], [W, 0], [W, H], [W - depth, H]]];
    case 'diagonal': return [[[0, 0], [W * 0.45, 0], [0, H * 0.45]], [[W, H], [W * 0.55, H], [W, H * 0.55]]];
    case 'corners': return [[[0, 0], [W * 0.3, 0], [W * 0.3, H * 0.3], [0, H * 0.3]], [[W, H], [W * 0.7, H], [W * 0.7, H * 0.7], [W, H * 0.7]]];
    case 'hammer': return [[[0, 0], [W * 0.5, 0], [W * 0.5, depth], [depth, depth], [depth, H * 0.5], [0, H * 0.5]],
      [[W, H], [W * 0.5, H], [W * 0.5, H - depth], [W - depth, H - depth], [W - depth, H * 0.5], [W, H * 0.5]]];
  }
}

function inPolygon(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const SIZE_OF: Record<TerrainKind, [number, number]> = {
  ruin: [8, 6], building: [7, 7], woods: [9, 7], hill: [10, 7], crater: [5, 5], wall: [9, 1.5],
  rocks: [5, 4], crystal: [4, 4], container: [6, 2.5], pond: [7, 5],
};

export function generate(o: GenOptions): Table {
  const r = rng(o.seed);
  const [W, H] = SIZES[o.size] ?? SIZES[1];
  const theme = o.mode === 'narrative' ? o.theme : pick(r, THEMES);
  const kinds = THEME_TERRAIN[theme];
  const deployment: Deployment = o.mode === 'competitive' ? pick(r, ['long', 'short', 'diagonal', 'hammer'] as const)
    : o.mode === 'narrative' ? pick(r, ['long', 'corners', 'diagonal', 'short'] as const) : pick(r, ['long', 'short', 'diagonal'] as const);
  const zones = zonesFor(deployment, W, H);
  const count = o.mode === 'competitive' ? DENSITY_COUNT[o.density] : o.mode === 'casual' ? 8 + Math.floor(r() * 4) : 7 + Math.floor(r() * 6);
  const pieces: Piece[] = [];
  const fits = (p: Piece) => {
    const m = 1.5;
    if (p.x - p.w / 2 < m || p.y - p.h / 2 < m || p.x + p.w / 2 > W - m || p.y + p.h / 2 > H - m) return false;
    // Keep 3" between pieces so models can move between them
    return pieces.every((q) => Math.abs(q.x - p.x) > (q.w + p.w) / 2 + 3 || Math.abs(q.y - p.y) > (q.h + p.h) / 2 + 3);
  };
  const make = (kind: TerrainKind): Piece => {
    const [w0, h0] = SIZE_OF[kind];
    const s = 0.8 + r() * 0.4;
    const rot = kind === 'wall' || kind === 'container' ? Math.floor(r() * 4) * 45 : Math.floor(r() * 6) * 15;
    return { kind, x: 0, y: 0, w: w0 * s, h: h0 * s, rot, seed: Math.floor(r() * 1e6) };
  };
  const target = o.mode === 'competitive' ? Math.ceil(count / 2) : count;
  for (let n = 0, tries = 0; n < target && tries < 600; tries++) {
    const p = make(o.mode === 'narrative' && n === 0 ? kinds[0] : pick(r, kinds));
    if (o.mode === 'competitive') {
      // One half of the table, mirrored through the centre
      p.x = W * (0.12 + r() * 0.76);
      p.y = H * (0.1 + r() * 0.38);
      const twin: Piece = { ...p, x: W - p.x, y: H - p.y, rot: (p.rot + 180) % 360 };
      if (!fits(p)) continue;
      pieces.push(p);
      if (fits(twin) || Math.hypot(twin.x - p.x, twin.y - p.y) < 1) pieces.push(twin);
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

export const newSeed = () => 1 + Math.floor(Math.random() * 999998);

import { pack, unpack } from '../../core/lib/packed.ts';
import { cleanRefs } from '../../core/lib/refLinks.ts';
import { COVERS, KINDS, MAX_SIZE, MIN_SIZE, SHAPES, TRAITS, type Piece } from './terrain.ts';
import { CASUAL, COMPETITIVE, DEPLOYMENTS, EVENTS, MAX_PIECES, NARRATIVE, TWISTS, zonesFor, type Deployment, type Objective, type ObjectiveKind, type Table } from './tableGen.ts';

const OBJECTIVE_KINDS: ObjectiveKind[] = ['homeA', 'homeB', 'expansion', 'central'];

/**
 * A whole table layout in a short code, for share links (`?map=…`) and for the map attached to a
 * game. The code holds every piece, so a table stays the same even if the generator changes.
 * Numbers are stored in half inches; everything read back is checked and clamped.
 */
type Compact = {
  v: 1;
  w: number;
  h: number;
  d: number;
  /** kind, shape, x, y, w, h, rot, cover, traits (bit mask), seed */
  p: [number, number, number, number, number, number, number, number, number, number][];
  /** x, y, kind (index in OBJECTIVE_KINDS + 1; missing = plain objective) */
  o: ([number, number] | [number, number, number])[];
  m?: string;
  e?: string;
  r?: number;
  n?: string;
  g?: string;
  /** Reference links [address, label?] */
  l?: [string, string?][];
};

export const MAX_OBJECTIVES = 12;
export const MIN_TABLE = 12;
export const MAX_TABLE = 96;
/** Longest code the database accepts for a game map */
export const MAX_CODE = 6000;

const half = (n: number) => Math.round(n * 2);
const clamp = (n: unknown, lo: number, hi: number, fallback = lo) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};

export function encodeTable(t: Table): Promise<string> {
  const c: Compact = {
    v: 1,
    w: t.width,
    h: t.height,
    d: DEPLOYMENTS.indexOf(t.deployment),
    p: t.pieces.slice(0, MAX_PIECES).map((p) => [
      KINDS.indexOf(p.kind), SHAPES.indexOf(p.shape), half(p.x), half(p.y), half(p.w), half(p.h), Math.round(p.rot) % 360,
      COVERS.indexOf(p.cover), TRAITS.reduce((m, tr, i) => (p.traits.includes(tr) ? m | (1 << i) : m), 0), p.seed,
    ]),
    o: t.objectives.slice(0, MAX_OBJECTIVES).map((o) => (o.kind ? [half(o.x), half(o.y), OBJECTIVE_KINDS.indexOf(o.kind) + 1] : [half(o.x), half(o.y)])),
  };
  if (t.mission) Object.assign(c, { m: t.mission, e: t.extra, r: t.rounds, g: t.mode });
  if (t.name) c.n = t.name.slice(0, 60);
  const refs = cleanRefs(t.refs);
  if (refs.length) c.l = refs.map((r) => (r.l ? [r.u, r.l] : [r.u]));
  return pack(c);
}

const MISSIONS: readonly string[] = [...NARRATIVE, ...CASUAL, ...COMPETITIVE];
const EXTRAS: readonly string[] = [...TWISTS, ...EVENTS];

export async function decodeTable(code: string): Promise<Table> {
  const c = (await unpack(code)) as Compact;
  if (!c || c.v !== 1 || !Array.isArray(c.p) || !Array.isArray(c.o)) throw new Error('bad code');
  const W = Math.round(clamp(c.w, MIN_TABLE, MAX_TABLE, 44)), H = Math.round(clamp(c.h, MIN_TABLE, MAX_TABLE, 60));
  const deployment: Deployment = DEPLOYMENTS[Number(c.d)] ?? 'none';
  const pieces: Piece[] = c.p.slice(0, MAX_PIECES).filter(Array.isArray).map(([k, s, x, y, w, h, rot, cov, tr, seed]) => ({
    kind: KINDS[Number(k)] ?? 'custom',
    shape: SHAPES[Number(s)] ?? 'rect',
    x: clamp(x, 0, W * 2) / 2,
    y: clamp(y, 0, H * 2) / 2,
    w: clamp(w, MIN_SIZE * 2, MAX_SIZE * 2) / 2,
    h: clamp(h, MIN_SIZE * 2, MAX_SIZE * 2) / 2,
    rot: ((Math.round(clamp(rot, -720, 720, 0)) % 360) + 360) % 360,
    cover: COVERS[Number(cov)] ?? 'none',
    traits: TRAITS.filter((_, i) => (Number(tr) & (1 << i)) !== 0),
    seed: Math.round(clamp(seed, 0, 1e6, 1)),
  }));
  const objectives: Objective[] = c.o.slice(0, MAX_OBJECTIVES).filter(Array.isArray).map(([x, y, k]) => {
    const kind = OBJECTIVE_KINDS[Number(k) - 1];
    return { x: clamp(x, 0, W * 2) / 2, y: clamp(y, 0, H * 2) / 2, ...(kind ? { kind } : {}) };
  });
  const mission = typeof c.m === 'string' && MISSIONS.includes(c.m) ? c.m : '';
  const mode = mission && (c.g === 'narrative' || c.g === 'casual' || c.g === 'competitive') ? c.g : 'custom';
  return {
    seed: 0,
    mode,
    name: typeof c.n === 'string' ? c.n.slice(0, 60) : undefined,
    width: W,
    height: H,
    deployment,
    zones: zonesFor(deployment, W, H),
    pieces,
    objectives,
    mission,
    extra: mission && typeof c.e === 'string' && EXTRAS.includes(c.e) ? c.e : 'none',
    rounds: mission ? Math.round(clamp(c.r, 1, 10, 5)) : 5,
    refs: Array.isArray(c.l) ? cleanRefs(c.l.filter(Array.isArray).map(([u, l]) => ({ u, l }))) : [],
  };
}

/**
 * Terrain pieces shared by the generator and the table editor (pure, no DOM): what a piece is,
 * its footprint on the table, and a check of a whole layout against common table-building habits.
 *
 * Cover and traits are generic families found in most miniature games, not the rules of one game:
 *  - cover: none / light (partly hides, e.g. woods, low walls) / heavy (solid, e.g. ruins, rocks)
 *    / blocking (nothing sees through, e.g. buildings, containers);
 *  - traits: difficult ground (slows), elevated (high ground), hazardous, impassable.
 * All sizes are in inches, x / y is the centre of the piece, rot is in degrees clockwise.
 */
export type TerrainKind = 'ruin' | 'building' | 'woods' | 'hill' | 'crater' | 'wall' | 'rocks' | 'crystal' | 'container' | 'pond' | 'tower' | 'custom';
export type Shape = 'rect' | 'L' | 'oval' | 'triangle' | 'hex' | 'blob';
export type Cover = 'none' | 'light' | 'heavy' | 'blocking';
export type Trait = 'difficult' | 'elevated' | 'hazardous' | 'impassable';

export const KINDS: TerrainKind[] = ['ruin', 'building', 'woods', 'hill', 'crater', 'wall', 'rocks', 'crystal', 'container', 'pond', 'tower', 'custom'];
export const SHAPES: Shape[] = ['rect', 'L', 'oval', 'triangle', 'hex', 'blob'];
export const COVERS: Cover[] = ['none', 'light', 'heavy', 'blocking'];
export const TRAITS: Trait[] = ['difficult', 'elevated', 'hazardous', 'impassable'];

export interface Piece {
  kind: TerrainKind;
  shape: Shape;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  cover: Cover;
  traits: Trait[];
  seed: number;
}

/** Usual footprint and game effect of each kind; every value can be changed in the editor. */
export const KIND_DEFAULTS: Record<TerrainKind, { shape: Shape; w: number; h: number; cover: Cover; traits: Trait[] }> = {
  ruin: { shape: 'L', w: 8, h: 6, cover: 'heavy', traits: [] },
  building: { shape: 'rect', w: 7, h: 7, cover: 'blocking', traits: [] },
  woods: { shape: 'blob', w: 9, h: 7, cover: 'light', traits: ['difficult'] },
  hill: { shape: 'oval', w: 10, h: 7, cover: 'none', traits: ['elevated'] },
  crater: { shape: 'oval', w: 5, h: 5, cover: 'light', traits: ['difficult'] },
  wall: { shape: 'rect', w: 9, h: 1.5, cover: 'light', traits: [] },
  rocks: { shape: 'blob', w: 5, h: 4, cover: 'heavy', traits: [] },
  crystal: { shape: 'triangle', w: 4, h: 4, cover: 'blocking', traits: ['hazardous'] },
  container: { shape: 'rect', w: 6, h: 2.5, cover: 'blocking', traits: [] },
  pond: { shape: 'blob', w: 7, h: 5, cover: 'none', traits: ['difficult'] },
  tower: { shape: 'hex', w: 4, h: 4, cover: 'blocking', traits: ['elevated'] },
  custom: { shape: 'rect', w: 6, h: 4, cover: 'heavy', traits: [] },
};

export const MIN_SIZE = 1;
export const MAX_SIZE = 30;

export function makePiece(kind: TerrainKind, x: number, y: number, seed: number, scale = 1): Piece {
  const d = KIND_DEFAULTS[kind];
  return { kind, shape: d.shape, x, y, w: round(d.w * scale), h: round(d.h * scale), rot: 0, cover: d.cover, traits: [...d.traits], seed };
}

const round = (n: number) => Math.round(n * 2) / 2;

function prng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

/** Outline of the piece around (0,0), not rotated, in inches. */
export function localOutline(p: Piece): Pt[] {
  const a = p.w / 2, b = p.h / 2;
  switch (p.shape) {
    case 'rect':
      return [[-a, -b], [a, -b], [a, b], [-a, b]];
    case 'L': {
      // Two arms of about 40 % thickness along the left and bottom edges
      const tx = Math.max(0.5, p.w * 0.4), ty = Math.max(0.5, p.h * 0.4);
      return [[-a, -b], [-a + tx, -b], [-a + tx, b - ty], [a, b - ty], [a, b], [-a, b]];
    }
    case 'oval':
      return Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2) * a, Math.sin((i / 24) * Math.PI * 2) * b] as Pt);
    case 'triangle':
      return [[0, -b], [a, b], [-a, b]];
    case 'hex':
      return Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * a, Math.sin((i / 6) * Math.PI * 2) * b] as Pt);
    case 'blob': {
      const r = prng(p.seed);
      return Array.from({ length: 14 }, (_, i) => {
        const k = 0.8 + r() * 0.2;
        return [Math.cos((i / 14) * Math.PI * 2) * a * k, Math.sin((i / 14) * Math.PI * 2) * b * k] as Pt;
      });
    }
  }
}

/** Outline on the table (rotated and moved), in inches. */
export function footprint(p: Piece): Pt[] {
  const c = Math.cos((p.rot * Math.PI) / 180), s = Math.sin((p.rot * Math.PI) / 180);
  return localOutline(p).map(([x, y]) => [p.x + x * c - y * s, p.y + x * s + y * c]);
}

export function inPolygon(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Pt[]) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(s) / 2;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

export function segmentHitsPolygon(a: Pt, b: Pt, poly: Pt[]) {
  if (inPolygon(a[0], a[1], poly) || inPolygon(b[0], b[1], poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (segmentsCross(a, b, poly[j], poly[i])) return true;
  return false;
}

function pointSegmentDistance(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Smallest gap between two outlines (0 when they touch or overlap). */
export function gapBetween(p: Pt[], q: Pt[]) {
  if (p.some(([x, y]) => inPolygon(x, y, q)) || q.some(([x, y]) => inPolygon(x, y, p))) return 0;
  let best = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    for (let k = 0, l = q.length - 1; k < q.length; l = k++) {
      if (segmentsCross(p[j], p[i], q[l], q[k])) return 0;
      best = Math.min(best, pointSegmentDistance(p[i], q[l], q[k]), pointSegmentDistance(q[k], p[j], p[i]));
    }
  }
  return best;
}

/** The same piece seen from the other side of the table (point symmetry through the centre). */
export function mirrorPiece(p: Piece, W: number, H: number, seed: number): Piece {
  return { ...p, traits: [...p.traits], x: W - p.x, y: H - p.y, rot: (p.rot + 180) % 360, seed };
}

/** Where the rotation handle of a piece is drawn: 1.5" above its top edge, turning with it. */
export function rotateHandle(p: Piece): Pt {
  const d = p.h / 2 + 1.5, a = (p.rot * Math.PI) / 180;
  return [p.x + Math.sin(a) * d, p.y - Math.cos(a) * d];
}

export interface Layout {
  width: number;
  height: number;
  zones: Pt[][];
  pieces: Piece[];
  objectives: { x: number; y: number }[];
}

export type Tip = 'open' | 'crowded' | 'fireLanes' | 'noBlocking' | 'offTable' | 'objectiveBlocked' | 'narrow' | 'balanced';

export interface Analysis {
  /** Share of the table covered by terrain, 0..1 (overlaps counted twice) */
  coverage: number;
  byCover: Record<Cover, number>;
  /** Share of sight lines between the two deployment zones that a blocking piece cuts, or null without zones */
  blockedLanes: number | null;
  /** Pairs of pieces closer than 1" without touching (large bases will not pass) */
  narrow: number;
  offTable: number;
  objectiveBlocked: number;
  tips: Tip[];
}

function samplePoints(poly: Pt[], n: number): Pt[] {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = x0 + ((i + 0.5) / n) * (x1 - x0), y = y0 + ((j + 0.5) / n) * (y1 - y0);
      if (inPolygon(x, y, poly)) out.push([x, y]);
    }
  }
  return out;
}

/**
 * Common table-building habits (not the rules of any game): about a quarter to 40 % of the table
 * covered, several pieces that block sight between the deployment zones, room for bases to pass.
 */
export function analyse(t: Layout): Analysis {
  const area = t.width * t.height;
  const outlines = t.pieces.map(footprint);
  const coverage = outlines.reduce((a, o) => a + polygonArea(o), 0) / area;
  const byCover: Record<Cover, number> = { none: 0, light: 0, heavy: 0, blocking: 0 };
  t.pieces.forEach((p) => byCover[p.cover]++);
  const blockers = outlines.filter((_, i) => t.pieces[i].cover === 'blocking');
  let blockedLanes: number | null = null;
  if (t.zones.length >= 2) {
    const a = samplePoints(t.zones[0], 4), b = samplePoints(t.zones[1], 4);
    let lanes = 0, cut = 0;
    for (const p of a) {
      for (const q of b) {
        lanes++;
        if (blockers.some((o) => segmentHitsPolygon(p, q, o))) cut++;
      }
    }
    blockedLanes = lanes ? cut / lanes : null;
  }
  let narrow = 0;
  for (let i = 0; i < outlines.length; i++) {
    for (let j = i + 1; j < outlines.length; j++) {
      const g = gapBetween(outlines[i], outlines[j]);
      if (g > 0 && g < 1) narrow++;
    }
  }
  const offTable = outlines.filter((o) => o.some(([x, y]) => x < -0.01 || y < -0.01 || x > t.width + 0.01 || y > t.height + 0.01)).length;
  const objectiveBlocked = t.objectives.filter((o) =>
    outlines.some((ol, i) => (t.pieces[i].cover === 'blocking' || t.pieces[i].traits.includes('impassable')) && inPolygon(o.x, o.y, ol)),
  ).length;

  const tips: Tip[] = [];
  if (offTable) tips.push('offTable');
  if (objectiveBlocked) tips.push('objectiveBlocked');
  if (t.pieces.length && coverage < 0.2) tips.push('open');
  if (coverage > 0.45) tips.push('crowded');
  if (t.pieces.length && byCover.blocking === 0) tips.push('noBlocking');
  else if (blockedLanes !== null && blockedLanes < 0.3) tips.push('fireLanes');
  if (narrow) tips.push('narrow');
  if (!tips.length && t.pieces.length) tips.push('balanced');
  return { coverage, byCover, blockedLanes, narrow, offTable, objectiveBlocked, tips };
}

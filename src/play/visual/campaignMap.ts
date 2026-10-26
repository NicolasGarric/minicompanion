import { planetSites, regionAt, systemBodies, type Body, type MapKind } from '../lib/campaign';

/**
 * Campaign map drawing (riso): a planet whose regions take the holder's ink (hatched), with a
 * halftone night side, or a star system whose planets and moons do. Also gives hit testing.
 */
export interface MapState {
  kind: MapKind;
  seed: number;
  count: number;
  /** Ink per territory (null = free) */
  inks: (string | null)[];
  selected: number | null;
}

const PAPER = '#f4ecdc', SURFACE = '#fffaf0', NAVY = '#1d2a5b', YELLOW = '#ffd23f';

let cache: { key: string; map: Int16Array; size: number } | null = null;

function regionMap(seed: number, count: number, size: number) {
  const key = `${seed}:${count}:${size}`;
  if (cache?.key === key) return cache.map;
  const sites = planetSites(seed, count);
  const map = new Int16Array(size * size).fill(-1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 2 - 1, v = (y / size) * 2 - 1;
      if (u * u + v * v <= 1) map[y * size + x] = regionAt(u, v, sites, seed);
    }
  }
  cache = { key, map, size };
  return map;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draws the map into a square canvas of `px` device pixels. */
export function drawCampaign(ctx: CanvasRenderingContext2D, s: MapState, px: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, px, px);
  if (s.kind === 'planet') drawPlanet(ctx, s, px);
  else drawSystem(ctx, s, px);
}

function drawPlanet(ctx: CanvasRenderingContext2D, s: MapState, px: number) {
  const size = Math.round(px * 0.9), off = Math.round((px - size) / 2);
  const map = regionMap(s.seed, s.count, size);
  const img = ctx.createImageData(size, size);
  const paper = hexRgb(SURFACE), navy = hexRgb(NAVY);
  const inks = s.inks.map((c) => (c ? hexRgb(c) : null));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, reg = map[i], o = i * 4;
      if (reg < 0) continue;
      let c = paper;
      const ink = inks[reg];
      // Held regions: diagonal hatching in the holder's ink; free ones: sparse dots
      if (ink) c = (x + y) % 6 < 3 ? ink : paper;
      else if (x % 6 === 0 && y % 6 === 0) c = navy;
      // Border with a neighbour region
      const right = x + 1 < size ? map[i + 1] : -1, down = y + 1 < size ? map[i + size] : -1;
      if ((right >= 0 && right !== reg) || (down >= 0 && down !== reg)) c = navy;
      // Night side: halftone towards the lower right
      const u = (x / size) * 2 - 1, v = (y / size) * 2 - 1, shade = Math.max(0, (u + v) * 0.55);
      const cell = 7, cx = (x % cell) - cell / 2, cy = (y % cell) - cell / 2;
      if (shade > 0.15 && cx * cx + cy * cy < (shade * cell * 0.5) ** 2) c = navy;
      if (s.selected === reg && (x + y) % 4 < 2) c = hexRgb(YELLOW);
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, off, off);
  ctx.beginPath();
  ctx.arc(px / 2, px / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(3, px * 0.008);
  ctx.strokeStyle = NAVY;
  ctx.stroke();
  // Numbers on region centres
  const sites = planetSites(s.seed, s.count);
  ctx.font = `700 ${Math.max(10, px * 0.026)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  sites.forEach(([u, v], i) => {
    const x = off + ((u + 1) / 2) * size, y = off + ((v + 1) / 2) * size;
    ctx.fillStyle = SURFACE;
    ctx.beginPath();
    ctx.arc(x, y, px * 0.022, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.fillText(String(i + 1), x, y + 1);
  });
}

const toPx = (b: Body, px: number) => [px / 2 + b.x * px * 0.48, px / 2 + b.y * px * 0.48] as const;

function drawSystem(ctx: CanvasRenderingContext2D, s: MapState, px: number) {
  const bodies = systemBodies(s.seed, s.count);
  // Star: halftone sun
  const cx = px / 2, cy = px / 2;
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.arc(cx, cy, px * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff7a1a';
  for (let a = 0; a < 3; a++) {
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2 + a, rr = px * (0.06 + a * 0.015);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, px * 0.004 * (3 - a), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Orbits
  const orbits = new Set(bodies.filter((b) => b.parent === null).map((b) => Math.hypot(b.x, b.y / 0.62)));
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 5]);
  orbits.forEach((r) => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * px * 0.48, r * 0.62 * px * 0.48, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  bodies.forEach((b, i) => {
    const [x, y] = toPx(b, px), r = b.r * px * 0.48;
    if (b.parent !== null) {
      const [mx, my] = toPx(bodies[b.parent], px);
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(x, y);
      ctx.strokeStyle = NAVY;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.clip();
    const ink = s.inks[i];
    if (ink) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(2, r * 0.25);
      for (let d = -r * 2; d < r * 2; d += r * 0.5) {
        ctx.beginPath();
        ctx.moveTo(x + d - r, y - r);
        ctx.lineTo(x + d + r, y + r);
        ctx.stroke();
      }
    }
    // Night side
    ctx.fillStyle = 'rgba(29,42,91,0.35)';
    ctx.beginPath();
    ctx.arc(x + r * 0.45, y + r * 0.45, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = s.selected === i ? 4 : 2;
    ctx.strokeStyle = s.selected === i ? '#ff4f7b' : NAVY;
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${Math.max(10, px * 0.024)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x, y - r - 6);
  });
}

/** Territory under a point of the canvas (CSS pixels of a square of side `px`), or null. */
export function hitCampaign(s: MapState, px: number, x: number, y: number): number | null {
  if (s.kind === 'planet') {
    const size = px * 0.9, off = (px - size) / 2;
    const u = ((x - off) / size) * 2 - 1, v = ((y - off) / size) * 2 - 1;
    if (u * u + v * v > 1) return null;
    return regionAt(u, v, planetSites(s.seed, s.count), s.seed);
  }
  const bodies = systemBodies(s.seed, s.count);
  let best: number | null = null, bd = Infinity;
  bodies.forEach((b, i) => {
    const [bx, by] = toPx(b, px), d = Math.hypot(bx - x, by - y);
    if (d < Math.max(b.r * px * 0.48, 18) && d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

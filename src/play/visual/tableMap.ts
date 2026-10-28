import type { Table } from '../lib/tableGen';
import { footprint, localOutline, rotateHandle, type Cover, type Piece, type Trait } from '../lib/terrain';

/**
 * Draws a generated table seen from above, printed in riso inks like the home page: halftone and
 * hatched terrain, deployment zones hatched per side, numbered objectives with their 3" radius,
 * and a ruler every 6". Works for the page canvas and the downloaded image.
 */
const PAPER = '#f4ecdc', SURFACE = '#fffaf0', PINK = '#ff4f7b', NAVY = '#1d2a5b', YELLOW = '#ffd23f';

function prng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hatch(ctx: CanvasRenderingContext2D, path: Path2D, color: string, gap: number, angle: number, width: number) {
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const R = Math.hypot(ctx.canvas.width, ctx.canvas.height);
  ctx.beginPath();
  for (let d = -R; d < R; d += gap) {
    ctx.moveTo(d * Math.cos(angle + Math.PI / 2) - R * Math.cos(angle), d * Math.sin(angle + Math.PI / 2) - R * Math.sin(angle));
    ctx.lineTo(d * Math.cos(angle + Math.PI / 2) + R * Math.cos(angle), d * Math.sin(angle + Math.PI / 2) + R * Math.sin(angle));
  }
  ctx.stroke();
  ctx.restore();
}

/** Halftone dots inside `path`; `r` is the half-size of the area to cover around the origin. */
function dots(ctx: CanvasRenderingContext2D, path: Path2D, color: string, cell: number, size: number, r: number) {
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = color;
  let row = 0;
  for (let y = -r; y < r; y += cell, row++) {
    for (let x = -r + (row % 2 ? cell / 2 : 0); x < r; x += cell) {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function outlinePath(p: Piece, s: number) {
  const path = new Path2D();
  localOutline(p).forEach(([x, y], i) => (i ? path.lineTo(x * s, y * s) : path.moveTo(x * s, y * s)));
  path.closePath();
  return path;
}

/** The same outline shrunk towards its centre (contour lines of hills, rings of craters). */
function scaledPath(p: Piece, s: number, k: number) {
  return outlinePath({ ...p, w: p.w * k, h: p.h * k }, s);
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, s: number) {
  const r = prng(p.seed);
  const w = p.w * s, h = p.h * s, lw = Math.max(1.5, s * 0.18), big = Math.max(w, h);
  const path = outlinePath(p, s);
  ctx.save();
  ctx.translate(p.x * s, p.y * s);
  ctx.rotate((p.rot * Math.PI) / 180);
  ctx.lineWidth = lw;
  ctx.strokeStyle = NAVY;
  ctx.lineJoin = 'round';
  switch (p.kind) {
    case 'ruin': {
      // Footprint in dots, dashed edge, broken walls along two sides
      dots(ctx, path, NAVY, Math.max(4, s * 0.55), Math.max(0.8, s * 0.09), big);
      ctx.setLineDash([lw * 3, lw * 1.5]);
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.save();
      ctx.clip(path);
      ctx.lineWidth = lw * 2.4;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + lw, h / 2 - h * (0.5 + r() * 0.45));
      ctx.lineTo(-w / 2 + lw, h / 2 - lw);
      ctx.lineTo(-w / 2 + w * (0.5 + r() * 0.45), h / 2 - lw);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'building':
      ctx.fillStyle = NAVY;
      ctx.fill(path);
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(-w * 0.18, -h * 0.18, w * 0.2, h * 0.2);
      ctx.restore();
      break;
    case 'woods':
      dots(ctx, path, '#3b8f6b', Math.max(4, s * 0.5), Math.max(0.9, s * 0.1), big);
      ctx.stroke(path);
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = NAVY;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc((r() - 0.5) * w * 0.5, (r() - 0.5) * h * 0.5, s * (0.7 + r() * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    case 'hill':
      ctx.fillStyle = SURFACE;
      ctx.fill(path);
      [1, 0.68, 0.36].forEach((k) => ctx.stroke(scaledPath(p, s, k)));
      break;
    case 'crater':
      ctx.strokeStyle = PINK;
      [1, 0.7, 0.42].forEach((k) => ctx.stroke(scaledPath(p, s, k)));
      break;
    case 'wall':
      ctx.fillStyle = NAVY;
      ctx.fill(path);
      break;
    case 'rocks':
      ctx.fillStyle = SURFACE;
      ctx.fill(path);
      hatch(ctx, path, NAVY, Math.max(3, s * 0.4), 0.8, Math.max(1, s * 0.08));
      ctx.stroke(path);
      break;
    case 'crystal':
      ctx.fillStyle = PINK;
      ctx.fill(path);
      ctx.stroke(path);
      ctx.save();
      ctx.clip(path);
      ctx.strokeStyle = SURFACE;
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2);
      ctx.lineTo(0, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.stroke();
      ctx.restore();
      break;
    case 'container':
      ctx.fillStyle = SURFACE;
      ctx.fill(path);
      hatch(ctx, path, PINK, Math.max(3, s * 0.35), Math.PI / 2, Math.max(1, s * 0.12));
      ctx.stroke(path);
      break;
    case 'pond':
      ctx.fillStyle = '#d6e4ef';
      ctx.fill(path);
      hatch(ctx, path, NAVY, Math.max(4, s * 0.6), 0, Math.max(0.8, s * 0.06));
      ctx.stroke(path);
      break;
    case 'tower':
      ctx.fillStyle = NAVY;
      ctx.fill(path);
      ctx.strokeStyle = YELLOW;
      ctx.stroke(scaledPath(p, s, 0.55));
      break;
    case 'custom':
      ctx.fillStyle = SURFACE;
      ctx.fill(path);
      dots(ctx, path, PINK, Math.max(4, s * 0.6), Math.max(0.7, s * 0.08), big);
      ctx.lineWidth = lw * 1.4;
      ctx.stroke(path);
      break;
  }
  ctx.restore();
}

/** Cover and traits as small signs at the centre of the piece (legend under the map). */
function drawMarks(ctx: CanvasRenderingContext2D, p: Piece, s: number) {
  const signs = [COVER_SIGN[p.cover], ...p.traits.map((tr) => TRAIT_SIGN[tr])].filter(Boolean);
  if (!signs.length) return;
  const size = Math.max(11, s * 1.3);
  ctx.save();
  ctx.font = `700 ${size * 0.8}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = signs.join(' ');
  const tw = ctx.measureText(text).width + size * 0.6;
  ctx.fillStyle = 'rgba(255, 250, 240, 0.92)';
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(p.x * s - tw / 2, p.y * s - size * 0.6, tw, size * 1.2, size * 0.6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.fillText(text, p.x * s, p.y * s + 1);
  ctx.restore();
}

/** Signs shared by the map and its legend */
export const COVER_SIGN: Record<Cover, string> = { none: '', light: '◐', heavy: '●', blocking: '■' };
export const TRAIT_SIGN: Record<Trait, string> = { difficult: '≈', elevated: '▲', hazardous: '!', impassable: '✕' };

export interface DrawOptions {
  /** Show cover and trait signs on the pieces */
  marks?: boolean;
  /** Editor: index of the selected piece (handles drawn around it) */
  selected?: number | null;
  /** Editor: index of the selected objective */
  selectedObjective?: number | null;
}

export function drawTable(ctx: CanvasRenderingContext2D, t: Table, px: number, opts: DrawOptions = {}) {
  const s = px / t.width;
  const H = t.height * s;
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, px, H);
  // Deployment zones
  t.zones.forEach((z, i) => {
    const p = new Path2D();
    z.forEach(([x, y], k) => (k ? p.lineTo(x * s, y * s) : p.moveTo(x * s, y * s)));
    p.closePath();
    hatch(ctx, p, i === 0 ? PINK : NAVY, Math.max(5, s * 0.8), i === 0 ? Math.PI / 4 : -Math.PI / 4, Math.max(1, s * 0.1));
    ctx.strokeStyle = i === 0 ? PINK : NAVY;
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.stroke(p);
    const cx = z.reduce((a, [x]) => a + x, 0) / z.length, cy = z.reduce((a, [, y]) => a + y, 0) / z.length;
    ctx.font = `400 ${Math.max(14, s * 3)}px "Dela Gothic One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = SURFACE;
    ctx.fillText(i === 0 ? 'A' : 'B', cx * s + 2, cy * s + 2);
    ctx.fillStyle = i === 0 ? PINK : NAVY;
    ctx.fillText(i === 0 ? 'A' : 'B', cx * s, cy * s);
  });
  t.pieces.forEach((p) => drawPiece(ctx, p, s));
  if (opts.marks) t.pieces.forEach((p) => drawMarks(ctx, p, s));
  // Objectives
  t.objectives.forEach((o, i) => {
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.arc(o.x * s, o.y * s, 3 * s, 0, Math.PI * 2);
    ctx.strokeStyle = NAVY;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    const r = Math.max(9, s * 1.1);
    ctx.beginPath();
    ctx.arc(o.x * s, o.y * s, r, 0, Math.PI * 2);
    ctx.fillStyle = YELLOW;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = NAVY;
    ctx.font = `700 ${r * 1.1}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), o.x * s, o.y * s + 1);
    if (opts.selectedObjective === i) {
      ctx.beginPath();
      ctx.arc(o.x * s, o.y * s, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
  const sel = opts.selected != null ? t.pieces[opts.selected] : undefined;
  if (sel) drawSelection(ctx, sel, s);
  // Ruler
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = Math.max(3, s * 0.3);
  ctx.strokeRect(0, 0, px, H);
  ctx.lineWidth = 1.5;
  for (let x = 6; x < t.width; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x * s, 0);
    ctx.lineTo(x * s, s * 0.9);
    ctx.moveTo(x * s, H);
    ctx.lineTo(x * s, H - s * 0.9);
    ctx.stroke();
  }
  for (let y = 6; y < t.height; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y * s);
    ctx.lineTo(s * 0.9, y * s);
    ctx.moveTo(px, y * s);
    ctx.lineTo(px - s * 0.9, y * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Editor: outline of the selected piece and its rotation handle. */
function drawSelection(ctx: CanvasRenderingContext2D, p: Piece, s: number) {
  const outline = footprint(p);
  ctx.save();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  const [hx, hy] = rotateHandle(p);
  ctx.beginPath();
  ctx.moveTo(p.x * s, p.y * s);
  ctx.lineTo(hx * s, hy * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx * s, hy * s, Math.max(9, s * 0.9), 0, Math.PI * 2);
  ctx.fillStyle = YELLOW;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = NAVY;
  ctx.stroke();
  // Curved arrow inside the handle
  ctx.beginPath();
  ctx.arc(hx * s, hy * s, Math.max(4.5, s * 0.45), -Math.PI * 0.9, Math.PI * 0.5);
  ctx.stroke();
  ctx.restore();
}

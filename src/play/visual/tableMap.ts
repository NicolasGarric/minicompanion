import type { Piece, Table } from '../lib/tableGen';

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

/** Irregular closed shape around (0,0) of radii rx, ry. */
function blob(r: () => number, rx: number, ry: number, n = 12) {
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = 0.78 + r() * 0.3;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, s: number) {
  const r = prng(p.seed);
  const w = p.w * s, h = p.h * s, lw = Math.max(1.5, s * 0.18);
  ctx.save();
  ctx.translate(p.x * s, p.y * s);
  ctx.rotate((p.rot * Math.PI) / 180);
  ctx.lineWidth = lw;
  ctx.strokeStyle = NAVY;
  ctx.lineJoin = 'round';
  const rect = new Path2D();
  rect.rect(-w / 2, -h / 2, w, h);
  switch (p.kind) {
    case 'ruin': {
      // Footprint in dots, broken L-shaped walls on top
      dots(ctx, rect, NAVY, Math.max(4, s * 0.55), Math.max(0.8, s * 0.09), Math.max(w, h));
      ctx.setLineDash([lw * 3, lw * 1.5]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);
      ctx.lineWidth = lw * 2.4;
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 2 - h * (0.4 + r() * 0.5));
      ctx.lineTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2 + w * (0.4 + r() * 0.5), h / 2);
      ctx.stroke();
      break;
    }
    case 'building':
      ctx.fillStyle = NAVY;
      ctx.fill(rect);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(-w / 2 + lw * 2, -h / 2 + lw * 2, w * 0.35, h * 0.35);
      break;
    case 'woods': {
      const b = blob(r, w / 2, h / 2);
      dots(ctx, b, '#3b8f6b', Math.max(4, s * 0.5), Math.max(0.9, s * 0.1), Math.max(w, h));
      ctx.stroke(b);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc((r() - 0.5) * w * 0.6, (r() - 0.5) * h * 0.6, s * (0.7 + r() * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = NAVY;
        ctx.fill();
      }
      break;
    }
    case 'hill':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, (w / 2) * (1 - i * 0.3), (h / 2) * (1 - i * 0.3), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'crater':
      ctx.strokeStyle = PINK;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, (w / 2) * (1 - i * 0.28), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'wall':
      ctx.fillStyle = NAVY;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    case 'rocks': {
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate((r() - 0.5) * w * 0.5, (r() - 0.5) * h * 0.5);
        const b = blob(r, w * (0.2 + r() * 0.12), h * (0.2 + r() * 0.12), 6);
        ctx.fillStyle = SURFACE;
        ctx.fill(b);
        hatch(ctx, b, NAVY, Math.max(3, s * 0.4), 0.8, Math.max(1, s * 0.08));
        ctx.stroke(b);
        ctx.restore();
      }
      break;
    }
    case 'crystal':
      ctx.fillStyle = PINK;
      for (let i = 0; i < 4; i++) {
        const x = (r() - 0.5) * w * 0.6, y = (r() - 0.5) * h * 0.6, k = s * (0.8 + r());
        ctx.beginPath();
        ctx.moveTo(x, y - k * 1.6);
        ctx.lineTo(x + k * 0.7, y + k * 0.6);
        ctx.lineTo(x - k * 0.7, y + k * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'container':
      ctx.fillStyle = SURFACE;
      ctx.fill(rect);
      hatch(ctx, rect, PINK, Math.max(3, s * 0.35), Math.PI / 2, Math.max(1, s * 0.12));
      ctx.stroke(rect);
      break;
    case 'pond': {
      const b = blob(r, w / 2, h / 2, 10);
      ctx.fillStyle = '#d6e4ef';
      ctx.fill(b);
      hatch(ctx, b, NAVY, Math.max(4, s * 0.6), 0, Math.max(0.8, s * 0.06));
      ctx.stroke(b);
      break;
    }
  }
  ctx.restore();
}

export function drawTable(ctx: CanvasRenderingContext2D, t: Table, px: number) {
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
  });
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

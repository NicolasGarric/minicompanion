import { isolated, type Background, type Board, type Camp, type CampId, type Place } from '../lib/narrative';

/**
 * Narrative campaign board, drawn like a blueprint (or night sky, or paper): zones, routes styled by
 * type (long = double, unstable = waving, secret = dotted with an eye), supply flowing as particles
 * between places of the same camp, places drawn by type with the camp emblem, isolated places,
 * battles to come pulsing. The board is 900 × 600 units; the caller scales the context.
 */
export const BOARD_W = 900;
export const BOARD_H = 600;

const THEMES: Record<Background, { bg: string; grid: string; ink: string; soft: string; fill: string }> = {
  blue: { bg: '#123a7a', grid: 'rgba(255,255,255,.08)', ink: '#ffffff', soft: 'rgba(255,255,255,.7)', fill: '#123a7a' },
  night: { bg: '#0d1024', grid: 'rgba(255,255,255,.05)', ink: '#ece9ff', soft: 'rgba(236,233,255,.6)', fill: '#0d1024' },
  paper: { bg: '#f4ecdc', grid: 'rgba(29,42,91,.09)', ink: '#1d2a5b', soft: 'rgba(29,42,91,.6)', fill: '#fffaf0' },
};
const NAVY = '#1d2a5b', PINK = '#ff4f7b', YELLOW = '#ffd23f';

export interface Flash { x: number; y: number; t: number; color: string }
export interface NetworkOptions {
  /** Time in ms (animations); 0 = still */
  t: number;
  still?: boolean;
  selected?: { kind: 'place'; id: number } | { kind: 'route'; i: number } | { kind: 'zone'; i: number } | null;
  /** Route being drawn: from this place to the pointer */
  pending?: { from: number; to: [number, number] } | null;
  flashes?: Flash[];
  /** Places where a battle is planned */
  battles?: Set<number>;
  title: string;
  /** Second line (view, archive turn) */
  subtitle?: string;
  isolatedLabel: string;
  winner?: string | null;
}

function lcg(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Camp emblem: a shape in the camp colour with a sign drawn in navy. */
export function drawEmblem(ctx: CanvasRenderingContext2D, c: Pick<Camp, 'color' | 'shape' | 'sign'>, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  const p = new Path2D();
  if (c.shape === 'circle') p.arc(0, 0, s, 0, Math.PI * 2);
  else if (c.shape === 'diamond') { p.moveTo(0, -s); p.lineTo(s, 0); p.lineTo(0, s); p.lineTo(-s, 0); p.closePath(); }
  else if (c.shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (Math.PI / 3) * i; if (i) p.lineTo(Math.cos(a) * s, Math.sin(a) * s); else p.moveTo(Math.cos(a) * s, Math.sin(a) * s); } p.closePath(); }
  else { p.moveTo(-s * 0.85, -s * 0.9); p.lineTo(s * 0.85, -s * 0.9); p.lineTo(s * 0.85, 0); p.quadraticCurveTo(s * 0.8, s * 0.75, 0, s); p.quadraticCurveTo(-s * 0.8, s * 0.75, -s * 0.85, 0); p.closePath(); }
  ctx.fillStyle = c.color;
  ctx.fill(p);
  ctx.lineWidth = Math.max(1.5, s * 0.12);
  ctx.strokeStyle = NAVY;
  ctx.stroke(p);
  ctx.fillStyle = NAVY;
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const k = s * 0.5;
  ctx.beginPath();
  switch (c.sign) {
    case 'star':
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (Math.PI / 5) * i, r = i % 2 ? k * 0.45 : k; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); break;
    case 'bolt':
      ctx.moveTo(k * 0.2, -k); ctx.lineTo(-k * 0.5, k * 0.1); ctx.lineTo(k * 0.05, k * 0.1); ctx.lineTo(-k * 0.2, k); ctx.lineTo(k * 0.5, -k * 0.15); ctx.lineTo(-k * 0.05, -k * 0.15);
      ctx.closePath(); ctx.fill(); break;
    case 'eye':
      ctx.moveTo(-k, 0); ctx.quadraticCurveTo(0, -k * 0.9, k, 0); ctx.quadraticCurveTo(0, k * 0.9, -k, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, k * 0.3, 0, Math.PI * 2); ctx.fill(); break;
    case 'crown':
      ctx.moveTo(-k, k * 0.6); ctx.lineTo(-k, -k * 0.5); ctx.lineTo(-k * 0.5, 0); ctx.lineTo(0, -k * 0.7); ctx.lineTo(k * 0.5, 0); ctx.lineTo(k, -k * 0.5); ctx.lineTo(k, k * 0.6);
      ctx.closePath(); ctx.fill(); break;
    case 'claw':
      for (const dx of [-0.55, 0, 0.55]) { ctx.moveTo(k * dx - k * 0.2, -k * 0.8); ctx.lineTo(k * dx + k * 0.2, k * 0.8); }
      ctx.stroke(); break;
    case 'wave':
      for (let i = 0; i <= 20; i++) { const u = -1 + i / 10; if (i) ctx.lineTo(u * k, Math.sin(u * Math.PI * 1.5) * k * 0.45); else ctx.moveTo(u * k, Math.sin(u * Math.PI * 1.5) * k * 0.45); }
      ctx.stroke(); break;
  }
  ctx.restore();
}

function drawPlace(ctx: CanvasRenderingContext2D, p: Place, col: string, fill: string, r0: number) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = col;
  ctx.fillStyle = fill;
  ctx.beginPath();
  switch (p.type) {
    case 'planet':
      ctx.arc(p.x, p.y, r0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r0 + 7, 4, -0.4, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke(); break;
    case 'moon':
      ctx.arc(p.x, p.y, r0 * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
    case 'station':
      ctx.rect(p.x - r0, p.y - r0, r0 * 2, r0 * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - r0 - 6, p.y); ctx.lineTo(p.x + r0 + 6, p.y); ctx.lineWidth = 2; ctx.stroke(); break;
    case 'belt': {
      const r = lcg(p.id * 31 + 7);
      ctx.fillStyle = col;
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, d = r0 + (r() - 0.5) * 6; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.6, 1.5 + r() * 2, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'nebula':
      ctx.setLineDash([3, 4]); ctx.arc(p.x, p.y, r0 + 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); break;
    case 'wreck':
      ctx.moveTo(p.x - r0, p.y + r0 * 0.7); ctx.lineTo(p.x - r0 * 0.1, p.y - r0); ctx.lineTo(p.x + r0 * 0.15, p.y - r0 * 0.1); ctx.lineTo(p.x + r0, p.y + r0 * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke(); break;
  }
}

export function drawNetwork(ctx: CanvasRenderingContext2D, b: Board, o: NetworkOptions) {
  const th = THEMES[b.bg] ?? THEMES.blue, t = o.t;
  const camp = (id: CampId | null) => (id ? b.camps.find((c) => c.id === id) : undefined);
  const place = (id: number) => b.places.find((p) => p.id === id);
  const iso = isolated(b);
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.strokeStyle = th.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= BOARD_W; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BOARD_H); ctx.stroke(); }
  for (let y = 0; y <= BOARD_H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(BOARD_W, y); ctx.stroke(); }

  b.zones.forEach((z, i) => {
    const r = lcg(1000 + i * 77);
    if (z.type === 'nebula') {
      for (let k = 0; k < 260; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * z.r; ctx.fillStyle = `rgba(177,140,255,${0.08 + 0.25 * (1 - d / z.r)})`; ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 1.5 + r() * 3, 0, Math.PI * 2); ctx.fill(); }
    } else if (z.type === 'debris') {
      ctx.fillStyle = th.soft;
      ctx.globalAlpha = 0.45;
      for (let k = 0; k < 60; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * z.r, x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d, s = 2 + r() * 4; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s * 0.6); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else {
      ctx.setLineDash([16, 8, 3, 8]); ctx.strokeStyle = th.soft; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.selected?.kind === 'zone' && o.selected.i === i) { ctx.setLineDash([6, 4]); ctx.strokeStyle = YELLOW; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  });

  b.routes.forEach((rt, i) => {
    const A = place(rt.a), B = place(rt.b);
    if (!A || !B) return;
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const same = !!A.owner && A.owner === B.owner;
    ctx.globalAlpha = rt.cut ? 0.35 : 1;
    ctx.strokeStyle = rt.type === 'secret' ? (camp(rt.owner)?.color ?? th.ink) : rt.type === 'unstable' ? YELLOW : th.ink;
    ctx.lineWidth = same ? 2.6 : 1.6;
    if (rt.type === 'long') {
      for (const off of [-3, 3]) { ctx.beginPath(); ctx.moveTo(A.x + nx * off, A.y + ny * off); ctx.lineTo(B.x + nx * off, B.y + ny * off); ctx.stroke(); }
      ctx.fillStyle = th.bg; ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = th.ink; ctx.font = '700 11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('2', mx, my + 1);
    } else if (rt.type === 'unstable') {
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const u = k / 40, w = Math.sin((u * len) / 9 + (o.still ? 0 : t * 0.006)) * 4; if (k) ctx.lineTo(A.x + dx * u + nx * w, A.y + dy * u + ny * w); else ctx.moveTo(A.x + nx * w, A.y + ny * w); }
      ctx.stroke();
    } else {
      ctx.setLineDash(rt.type === 'secret' ? [2, 6] : same ? [] : [12, 6]);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.setLineDash([]);
      if (rt.type === 'secret') {
        ctx.beginPath(); ctx.ellipse(mx, my, 9, 5, 0, 0, Math.PI * 2); ctx.fillStyle = th.bg; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle as string; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (rt.cut) { ctx.strokeStyle = PINK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mx - 8, my - 8); ctx.lineTo(mx + 8, my + 8); ctx.moveTo(mx + 8, my - 8); ctx.lineTo(mx - 8, my + 8); ctx.stroke(); }
    if (same && !rt.cut && !o.still && !iso.has(A.id) && !iso.has(B.id)) {
      ctx.fillStyle = camp(A.owner)?.color ?? th.ink;
      for (let k = 0; k < (rt.type === 'long' ? 2 : 3); k++) { const u = (t * (rt.type === 'long' ? 0.00012 : 0.00025) + k / 3 + i * 0.13) % 1; ctx.beginPath(); ctx.arc(A.x + dx * u, A.y + dy * u, 2.8, 0, Math.PI * 2); ctx.fill(); }
    }
    if (o.selected?.kind === 'route' && o.selected.i === i) { ctx.strokeStyle = YELLOW; ctx.lineWidth = 8; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.globalAlpha = 1; }
  });

  if (o.pending) {
    const A = place(o.pending.from);
    if (A) { ctx.setLineDash([4, 6]); ctx.strokeStyle = YELLOW; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(o.pending.to[0], o.pending.to[1]); ctx.stroke(); ctx.setLineDash([]); }
  }
  for (const f of o.flashes ?? []) {
    const k = Math.min(1, Math.max(0, (t - f.t) / 900));
    if (k >= 1) continue;
    ctx.beginPath(); ctx.arc(f.x, f.y, 16 + k * 50, 0, Math.PI * 2); ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
  }

  for (const p of b.places) {
    const owner = camp(p.owner), col = owner?.color ?? th.soft, r0 = p.capital ? 15 : 11;
    drawPlace(ctx, p, col, th.fill, r0);
    if (owner) drawEmblem(ctx, owner, p.x, p.y, p.capital ? 9 : 6);
    for (let f = 0; f < p.fort; f++) { ctx.beginPath(); ctx.arc(p.x, p.y, r0 + 9 + f * 5, 0, Math.PI * 2); ctx.strokeStyle = th.soft; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.font = `700 ${p.capital ? 14 : 12}px ui-monospace, "Space Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = th.ink;
    ctx.fillText(p.name.toUpperCase(), p.x, p.y - r0 - 10);
    ctx.fillStyle = th.soft;
    for (let v = 0; v < p.value; v++) ctx.fillRect(p.x - p.value * 3.5 + v * 7, p.y + r0 + 8, 4, 4);
    if (p.scenario || p.sc) {
      ctx.strokeStyle = th.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x + r0 + 4, p.y + 4); ctx.lineTo(p.x + r0 + 4, p.y - 12); ctx.stroke();
      ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.moveTo(p.x + r0 + 4, p.y - 12); ctx.lineTo(p.x + r0 + 14, p.y - 8); ctx.lineTo(p.x + r0 + 4, p.y - 4); ctx.fill();
    }
    if (p.map) { ctx.fillStyle = th.ink; ctx.fillRect(p.x - r0 - 17, p.y - 9, 9, 12); ctx.fillStyle = th.bg; ctx.fillRect(p.x - r0 - 15, p.y - 7, 5, 8); ctx.fillStyle = YELLOW; ctx.fillRect(p.x - r0 - 14, p.y - 4, 3, 3); }
    if (p.notes) { ctx.strokeStyle = th.ink; ctx.lineWidth = 1.5; for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(p.x - r0 - 17, p.y + 6 + l * 3); ctx.lineTo(p.x - r0 - 8, p.y + 6 + l * 3); ctx.stroke(); } }
    if (iso.has(p.id)) {
      ctx.setLineDash([3, 4]); ctx.strokeStyle = PINK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r0 + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '700 10px ui-monospace, monospace'; ctx.fillStyle = PINK; ctx.fillText(o.isolatedLabel, p.x, p.y + r0 + 24);
    }
    if (o.battles?.has(p.id)) {
      const k = o.still ? 0.5 : (Math.sin(t * 0.005) + 1) / 2, bx = p.x + r0 + 8, by = p.y + r0 + 4;
      ctx.strokeStyle = YELLOW; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + 0.4 * k;
      ctx.beginPath(); ctx.moveTo(bx - 6, by - 6); ctx.lineTo(bx + 6, by + 6); ctx.moveTo(bx + 6, by - 6); ctx.lineTo(bx - 6, by + 6); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by, 10 + k * 4, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (o.selected?.kind === 'place' && o.selected.id === p.id) { ctx.setLineDash([5, 4]); ctx.strokeStyle = YELLOW; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, r0 + 20, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }

  ctx.textAlign = 'left';
  ctx.font = '700 17px ui-monospace, "Space Mono", monospace';
  ctx.fillStyle = th.ink;
  ctx.fillText(o.title.toUpperCase().slice(0, 60), 16, 28);
  if (o.subtitle) { ctx.font = '400 12px ui-monospace, monospace'; ctx.fillStyle = th.soft; ctx.fillText(o.subtitle.toUpperCase(), 16, 46); }
  if (o.winner) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, BOARD_H / 2 - 40, BOARD_W, 80);
    ctx.font = '400 30px "Dela Gothic One", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = YELLOW; ctx.fillText(o.winner, BOARD_W / 2, BOARD_H / 2 + 10);
  }
}

// Hit testing (board units)
export const hitPlace = (b: Board, x: number, y: number) => [...b.places].reverse().find((p) => Math.hypot(p.x - x, p.y - y) < 20);
function segDist(x: number, y: number, A: Place, B: Place) {
  const dx = B.x - A.x, dy = B.y - A.y, l = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / l));
  return Math.hypot(x - A.x - u * dx, y - A.y - u * dy);
}
export function hitRoute(b: Board, x: number, y: number) {
  return b.routes.findIndex((r) => {
    const A = b.places.find((p) => p.id === r.a), B = b.places.find((p) => p.id === r.b);
    return !!A && !!B && segDist(x, y, A, B) < 8;
  });
}
export function hitZone(b: Board, x: number, y: number) {
  for (let i = b.zones.length - 1; i >= 0; i--) if (Math.hypot(b.zones[i].x - x, b.zones[i].y - y) < b.zones[i].r) return i;
  return -1;
}

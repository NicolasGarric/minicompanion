import type { Roll } from '../lib/dice';

/**
 * "Stats" tab: a roll animated on a tabletop seen from above, printed like the home page
 * (halftone paper, riso inks). Dice are thrown into the first zone, failures slide into the pink
 * "failed" tray, the others are thrown into the next phase; unsaved dice roll their damage in the
 * last zone. Colours come from the CSS inks. No dependency; reduced motion shows the end at once.
 */
export interface DiceTableLabels {
  /** Zone titles: hit, wound, save, damage */
  zones: [string, string, string, string];
  failed: string;
  /** "{passed} / {rolled} through" */
  passed: (passed: number, rolled: number) => string;
  /** Under the big total, e.g. "damage" */
  total: string;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), s = (v: number) => v * v * (3 - 2 * v), u = s(x - xi), v = s(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Phase k starts at PHASE(k) seconds; the damage zone is k = 3. */
const PHASE = (k: number) => 0.3 + k * 1.5;
const THROW = 0.7;
const JUDGE = 1.05;
export const DICE_TABLE_DURATION = PHASE(3) + 2.4;

export function startDiceTable(canvas: HTMLCanvasElement, labels: DiceTableLabels) {
  const ctx = canvas.getContext('2d')!;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(canvas);
  const ink = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const surface = ink('--surface', '#fffaf0'), pink = ink('--ink1', '#ff4f7b'), navy = ink('--ink2', '#1d2a5b'), yellow = ink('--ink3', '#ffd23f');
  const muted = ink('--muted', '#6b6d86');
  const display = ink('--display', "'Dela Gothic One', sans-serif"), text = ink('--font', 'sans-serif');

  let roll: Roll | null = null;
  let start = 0;
  let w = 0, h = 0, dpr = 1;
  let paper: HTMLCanvasElement | null = null;
  let raf = 0;
  let visible = true;

  function die(x: number, y: number, s: number, v: number, o: { rot?: number; fill?: string; stroke?: string; pip?: string; shadow?: string | false; ring?: boolean } = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    const r = s * 0.18, half = s / 2;
    const box = () => { ctx.beginPath(); ctx.roundRect(-half, -half, s, s, r); };
    if (o.shadow !== false) { ctx.save(); ctx.translate(s * 0.12, s * 0.12); box(); ctx.fillStyle = o.shadow ?? pink; ctx.fill(); ctx.restore(); }
    box();
    ctx.fillStyle = o.fill ?? surface;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.strokeStyle = o.stroke ?? navy;
    ctx.stroke();
    ctx.fillStyle = o.pip ?? navy;
    if (v > 0) for (const [a, b] of PIPS[v]) { ctx.beginPath(); ctx.arc(a * s * 0.26, b * s * 0.26, s * 0.085, 0, 7); ctx.fill(); }
    else ctx.fillRect(-s * 0.2, -s * 0.04, s * 0.4, s * 0.08);
    if (o.ring) {
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.strokeStyle = yellow;
      ctx.beginPath();
      ctx.roundRect(-half - s * 0.14, -half - s * 0.14, s * 1.28, s * 1.28, r * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function label(str: string, x: number, y: number, size: number, o: { color?: string; weight?: number; marker?: boolean; align?: CanvasTextAlign } = {}) {
    ctx.font = `${o.weight ?? 700} ${size}px ${text}`;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    if (o.marker) {
      const m = ctx.measureText(str).width, x0 = o.align === 'center' ? x - m / 2 : x;
      ctx.fillStyle = yellow;
      ctx.fillRect(x0 - 3, y - size * 0.55, m + 6, size * 0.6);
    }
    ctx.fillStyle = o.color ?? navy;
    ctx.fillText(str, x, y);
  }

  // Halftone paper, built once per size at device pixels.
  function buildPaper() {
    const c = document.createElement('canvas');
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.fillStyle = navy;
    const cell = 7 * dpr, ang = 0.5, ca = Math.cos(ang), sa = Math.sin(ang), R = Math.hypot(c.width, c.height);
    for (let v = -R; v < R; v += cell)
      for (let u = -R; u < R; u += cell) {
        const x = u * ca - v * sa + c.width / 2, y = u * sa + v * ca + c.height / 2;
        if (x < -cell || y < -cell || x > c.width + cell || y > c.height + cell) continue;
        const d = 0.18 * noise((x / c.width) * 5, (y / c.height) * 4) + (y / c.height > 0.76 ? 0.1 : 0);
        if (d < 0.02) continue;
        g.beginPath();
        g.arc(x, y, cell * 0.5 * Math.sqrt(d), 0, 7);
        g.fill();
      }
    paper = c;
  }

  function resize() {
    const cw = Math.round(canvas.clientWidth);
    if (!cw) return;
    const ch = Math.round(cw * (cw < 560 ? 1.15 : 0.55));
    if (cw === w && ch === h) return;
    w = cw;
    h = ch;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = `${h}px`;
    buildPaper();
    draw(performance.now());
  }

  function draw(now: number) {
    if (!roll || !w) return;
    const R = roll, t = reduce ? 99 : (now - start) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, w, h);
    if (paper) { ctx.globalAlpha = 0.5; ctx.drawImage(paper, 0, 0, w, h); ctx.globalAlpha = 1; }

    const zw = w / 4, top = h * 0.17, trayTop = h * 0.76;
    const counts = R.lists.map((l) => l.length);
    const active = t >= DICE_TABLE_DURATION ? -1 : Math.min(3, Math.max(0, Math.floor((t - 0.3) / 1.5)));
    const fs = Math.max(9, Math.min(13, zw / 11));
    for (let z = 0; z < 4; z++) {
      if (z) {
        ctx.strokeStyle = navy;
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(z * zw, 8);
        ctx.lineTo(z * zw, h - 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      label(labels.zones[z], z * zw + 10, 26, fs, { marker: z === active });
      if (z < 3) {
        label(t > PHASE(z) + JUDGE ? labels.passed(counts[z + 1], counts[z]) : '…', z * zw + 10, 44, fs - 1, { weight: 400, color: muted });
        label(labels.failed, z * zw + 10, trayTop + 16, fs - 2, { color: pink });
      }
    }
    ctx.strokeStyle = pink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, trayTop);
    ctx.lineTo(zw * 3 - 4, trayTop);
    ctx.stroke();

    const slot = (k: number, idx: number, count: number) => {
      const aw = zw - 16, ah = trayTop - top - 14;
      const cols = Math.max(1, Math.ceil(Math.sqrt((count * aw) / ah))), rows = Math.ceil(count / cols);
      const cell = Math.min(aw / cols, ah / rows), s = Math.min(cell * 0.66, zw * 0.28);
      const c = idx % cols, r = Math.floor(idx / cols);
      const jx = (hash(idx * 7 + k, R.seed) - 0.5) * cell * 0.2, jy = (hash(idx * 3 + k, R.seed + 1) - 0.5) * cell * 0.2;
      return {
        x: k * zw + 8 + (aw - cols * cell) / 2 + (c + 0.5) * cell + jx,
        y: top + 6 + (ah - rows * cell) / 2 + (r + 0.5) * cell + jy,
        s,
        rot: (hash(idx, k + R.seed) - 0.5) * 0.5,
      };
    };
    const tray = (k: number, idx: number, count: number) => {
      const aw = zw - 16, ah = h - trayTop - 26, s0 = Math.min(18, zw / 7);
      const cols = Math.max(1, Math.floor(aw / (s0 * 1.35))), rows = Math.ceil(count / cols), s = Math.min(s0, ah / rows / 1.35);
      return { x: k * zw + 8 + ((idx % cols) + 0.5) * s * 1.35, y: trayTop + 26 + (Math.floor(idx / cols) + 0.5) * s * 1.35, s, rot: (hash(idx, k) - 0.5) * 0.6 };
    };

    for (const tok of R.tokens) {
      let k = -1;
      for (let i = 0; i <= tok.failedAt; i++) if (t >= PHASE(i)) k = i;
      if (k < 0) continue;
      const lt = t - PHASE(k);
      const dst = k < 3 ? slot(k, tok.dice[k].index, counts[k]) : slot(3, R.lists[3].indexOf(tok), counts[3]);
      const src = k === 0 ? { x: -30, y: h * (0.2 + 0.5 * hash(tok.id, R.seed)), s: dst.s, rot: 0 } : slot(k - 1, tok.dice[k - 1].index, counts[k - 1]);
      const e = ease(lt / THROW), spin = (hash(tok.id, k * 9) - 0.5) * 9;
      let x = lerp(src.x, dst.x, e), y = lerp(src.y, dst.y, e) - Math.sin(Math.PI * e) * h * 0.06;
      let s = lerp(src.s, dst.s, e), rot = dst.rot + (1 - e) * spin;
      const tumbling = 1 + Math.floor(hash(tok.id, Math.floor(t * 14)) * 6);

      if (k === 3) {
        // Damage roll: the unsaved die tumbles a second time and shows its damage.
        const rolling = lt < THROW + 0.5;
        const v = rolling ? tumbling : Math.min(6, tok.damage);
        if (lt > THROW && rolling) rot += Math.sin(lt * 30) * 0.3;
        die(x, y, s, v, { rot, fill: navy, pip: surface, shadow: yellow });
        continue;
      }
      const d = tok.dice[k];
      let v = lt < THROW ? tumbling : d.rerolled && lt < 0.95 ? d.first : d.value;
      if (d.value === 0) v = 0;
      const o: Parameters<typeof die>[4] = { rot, ring: d.rerolled && lt > 0.95 };
      if (k === tok.failedAt && lt > JUDGE) {
        const tr = tray(k, tok.failIndex, R.fails[k]), f = ease((lt - JUDGE) / 0.4);
        x = lerp(dst.x, tr.x, f);
        y = lerp(dst.y, tr.y, f);
        s = lerp(dst.s, tr.s, f);
        rot = lerp(rot, tr.rot, f);
        Object.assign(o, { rot, ring: false, shadow: f < 0.3 ? pink : false });
        if (f > 0.3) Object.assign(o, { fill: '#ffd9e2', stroke: pink, pip: pink });
        v = d.value;
      } else if (d.pass && lt > JUDGE) {
        ctx.fillStyle = yellow;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.9, 0, 7);
        ctx.fill();
      }
      die(x, y, s, v, o);
    }

    // Total damage, printed with the riso misregistration.
    const tt = t - PHASE(3) - THROW - 0.6;
    if (tt > 0) {
      const f = ease(tt / 0.5), size = Math.min(zw * 0.5, h * 0.2), cx = 3.5 * zw, base = h - 36;
      ctx.save();
      ctx.globalAlpha = f;
      ctx.font = `400 ${size}px ${display}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.globalCompositeOperation = 'multiply';
      const mis = 3 + 6 * (1 - f);
      ctx.fillStyle = pink;
      ctx.fillText(String(R.totalDamage), cx + mis, base + mis * 0.6);
      ctx.fillStyle = navy;
      ctx.fillText(String(R.totalDamage), cx, base);
      ctx.restore();
      ctx.globalAlpha = f;
      label(labels.total, cx, h - 12, fs - 1, { align: 'center', marker: true });
      ctx.globalAlpha = 1;
    }
  }

  function loop(now: number) {
    draw(now);
    raf = !reduce && visible && (now - start) / 1000 < DICE_TABLE_DURATION + 0.3 ? requestAnimationFrame(loop) : 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  io.observe(canvas);
  resize();
  document.fonts?.ready.then(() => draw(performance.now()));

  return {
    play(next: Roll, nextLabels?: DiceTableLabels) {
      roll = next;
      if (nextLabels) labels = nextLabels;
      start = performance.now();
      kick();
    },
    /** Redraw (language change) without restarting the animation */
    relabel(nextLabels: DiceTableLabels) {
      labels = nextLabels;
      draw(performance.now());
    },
    stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    },
  };
}

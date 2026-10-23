/**
 * Home page background: a tabletop seen from above, printed like a risograph (halftone terrain,
 * hatched deployment zones, numbered objectives, units on their bases), with the app name
 * "airbrushed" by particles that leave the pointer. The pointer measures the distance from the
 * selected unit in inches; a click selects another unit.
 *
 * Colours come from the CSS inks (--paper, --ink1, --ink2, --ink3). No dependency. The loop stops
 * when the page is hidden or the element leaves the screen, and runs once with reduced motion.
 */
interface Unit {
  x: number;
  y: number;
  r: number;
  vy: number;
  side: 0 | 1;
}

export interface RisoTableOptions {
  title: string;
  /** Called with the measured distance (inches) or null when the pointer leaves */
  onMeasure?: (inches: number | null) => void;
}

export function startRisoTable(host: HTMLElement, canvas: HTMLCanvasElement, opts: RisoTableOptions): () => void {
  const ctx = canvas.getContext('2d')!;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(host);
  const ink = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const paper = ink('--paper', '#f4ecdc'), ink1 = ink('--ink1', '#ff4f7b'), ink2 = ink('--ink2', '#1d2a5b'), ink3 = ink('--ink3', '#ffd23f');

  let size = '';
  let layerA: HTMLCanvasElement | null = null;
  let layerB: HTMLCanvasElement | null = null;
  let units: Unit[] = [];
  let selected = 0;
  let inch = 24;
  let targets: [number, number][] = [];
  let parts: { x: number; y: number; tx: number; ty: number; age: number }[] = [];
  let dot = 2;
  let raf = 0;
  let visible = true;
  let fontsReady = false;
  const p = { x: 0.85, y: 0.15, active: false };

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const make = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  // Halftone screen: density alpha → dots on a rotated grid, like a riso master.
  function halftone(o: CanvasRenderingContext2D, density: HTMLCanvasElement, w: number, h: number, color: string, cell: number, angle: number) {
    const d = density.getContext('2d')!.getImageData(0, 0, w, h).data;
    o.fillStyle = color;
    const ca = Math.cos(angle), sa = Math.sin(angle), R = Math.hypot(w, h);
    for (let v = -R; v < R; v += cell) {
      for (let u = -R; u < R; u += cell) {
        const x = u * ca - v * sa + w / 2, y = u * sa + v * ca + h / 2;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const a = d[((y | 0) * w + (x | 0)) * 4 + 3] / 255;
        if (a < 0.03) continue;
        o.beginPath();
        o.arc(x, y, (cell / 2) * Math.sqrt(a) * 1.05, 0, Math.PI * 2);
        o.fill();
      }
    }
  }

  function build(w: number, h: number) {
    seed = 11;
    inch = 24 * DPR;
    // On narrow screens the text covers the left side: keep the terrain in the lower part.
    const narrow = w / DPR < 700;
    const yMin = narrow ? 0.8 : 0.2, ySpan = narrow ? 0.12 : 0.6, xMin = narrow ? 0.15 : 0.5;
    const A = make(w, h), B = make(w, h);
    const a = A.getContext('2d')!, b = B.getContext('2d')!;
    // Deployment zones, hatched in ink 1
    const hatch = (y0: number, y1: number) => {
      a.save();
      a.beginPath();
      a.rect(0, y0, w, y1 - y0);
      a.clip();
      a.strokeStyle = ink1;
      a.globalAlpha = 0.33;
      a.lineWidth = 2 * DPR;
      for (let x = -h; x < w + h; x += 12 * DPR) {
        a.beginPath();
        a.moveTo(x, y0);
        a.lineTo(x + (y1 - y0), y1);
        a.stroke();
      }
      a.restore();
    };
    hatch(0, inch * 1.6);
    hatch(h - inch * 3, h);
    // Forests and hills (ink 2), ruins (ink 1), in halftone; terrain stays right of the title
    const dens = make(w, h), dc = dens.getContext('2d')!;
    dc.fillStyle = '#000';
    for (let i = 0; i < (narrow ? 2 : 4); i++) {
      const cx = (xMin + rnd() * (0.95 - xMin)) * w, cy = (yMin + rnd() * ySpan) * h;
      for (let k = 0; k < 9; k++) {
        dc.globalAlpha = 0.5 + rnd() * 0.5;
        dc.beginPath();
        dc.arc(cx + (rnd() - 0.5) * inch * 4, cy + (rnd() - 0.5) * inch * 3, (0.5 + rnd() * 0.9) * inch, 0, Math.PI * 2);
        dc.fill();
      }
    }
    for (let i = 0; i < (narrow ? 1 : 2); i++) {
      const cx = (xMin + 0.05 + rnd() * (0.9 - xMin)) * w, cy = (yMin + 0.05 + rnd() * ySpan * 0.8) * h;
      const g = dc.createRadialGradient(cx, cy, 0, cx, cy, inch * 4);
      g.addColorStop(0, 'rgba(0,0,0,0.7)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.globalAlpha = 1;
      dc.fillStyle = g;
      dc.beginPath();
      dc.ellipse(cx, cy, inch * 5, inch * 3.5, rnd(), 0, Math.PI * 2);
      dc.fill();
    }
    halftone(b, dens, w, h, ink2, 7 * DPR, 0.4);
    const ruins = make(w, h), rc = ruins.getContext('2d')!;
    rc.fillStyle = '#000';
    rc.globalAlpha = 0.7;
    for (let i = 0; i < (narrow ? 2 : 4); i++) {
      const x = (xMin + rnd() * (0.9 - xMin)) * w, y = (yMin + rnd() * ySpan) * h, L = (2 + rnd() * 3) * inch, T = 0.6 * inch;
      rc.fillRect(x, y, L, T);
      rc.fillRect(x, y, T, L * 0.8);
    }
    halftone(a, ruins, w, h, ink1, 6 * DPR, 1.2);
    // Objectives: numbered rings
    b.lineWidth = 3 * DPR;
    b.font = `400 ${14 * DPR}px "Dela Gothic One", sans-serif`;
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    for (let i = 0; i < (narrow ? 2 : 4); i++) {
      const x = (narrow ? 0.3 + i * 0.4 : 0.6 + (i % 2) * 0.26 + (rnd() - 0.5) * 0.05) * w, y = (narrow ? 0.86 : 0.35 + Math.floor(i / 2) * 0.28) * h;
      b.fillStyle = paper;
      b.strokeStyle = ink2;
      b.beginPath();
      b.arc(x, y, 0.9 * inch, 0, Math.PI * 2);
      b.fill();
      b.stroke();
      b.fillStyle = ink2;
      b.fillText(String(i + 1), x, y + 1);
    }
    // Two armies on their bases
    units = [];
    for (let i = 0; i < 5; i++) units.push({ x: (narrow ? 0.12 + i * 0.18 : 0.5 + i * 0.1) * w, y: h - inch * 1.5, r: (0.55 + rnd() * 0.25) * inch, vy: -0.05 - rnd() * 0.06, side: 0 });
    if (!narrow) for (let i = 0; i < 4; i++) units.push({ x: (0.55 + i * 0.11) * w, y: inch * 2.4, r: (0.55 + rnd() * 0.25) * inch, vy: 0.04 + rnd() * 0.05, side: 1 });
    selected = 0;
    layerA = A;
    layerB = B;
    buildTitle(w, h);
  }

  function buildTitle(w: number, h: number) {
    const o = make(w, h).getContext('2d')!;
    const fs = Math.min(w / (w / DPR < 700 ? 7.6 : 6.6), h / 6.2, 150 * DPR);
    o.font = `400 ${fs}px "Dela Gothic One", sans-serif`;
    o.fillStyle = '#000';
    o.textBaseline = 'top';
    const x0 = Math.max(16 * DPR, Math.min(64 * DPR, w * 0.05)), y0 = 28 * DPR;
    const words = opts.title.match(/^(Mini)(.+)$/);
    if (words) {
      o.fillText(words[1], x0, y0);
      o.fillText(words[2], x0, y0 + fs * 0.95);
    } else o.fillText(opts.title, x0, y0);
    const d = o.getImageData(0, 0, w, h).data;
    const gap = Math.max(3, Math.round(4.2 * DPR));
    const t: [number, number][] = [];
    for (let y = 0; y < Math.min(h, y0 + fs * 2.1); y += gap) for (let x = 0; x < w; x += gap) if (d[(y * w + x) * 4 + 3] > 128) t.push([x, y]);
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
    targets = t;
    parts = [];
    dot = gap * 0.42;
    // Let the page push its text below the particle title
    host.style.setProperty('--title-bottom', `${(y0 + fs * 2) / DPR}px`);
  }

  function frame() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * DPR)), h = Math.max(1, Math.round(rect.height * DPR));
    if (`${w}x${h}` !== size) {
      size = `${w}x${h}`;
      canvas.width = w;
      canvas.height = h;
      build(w, h);
    }
    const misX = ((p.active ? p.x : 0.5) - 0.5) * 10 * DPR, misY = ((p.active ? p.y : 0.5) - 0.5) * 6 * DPR;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(layerA!, misX, misY);
    ctx.drawImage(layerB!, 0, 0);

    units.forEach((u, i) => {
      if (!reduce) {
        u.y += u.vy * DPR;
        if (u.side === 0 && (u.y < h * 0.62 || u.y > h - inch)) u.vy = -u.vy;
        if (u.side === 1 && (u.y > h * 0.38 || u.y < inch * 2)) u.vy = -u.vy;
      }
      ctx.fillStyle = u.side ? ink1 : ink2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(u.x + (u.side ? misX : 0), u.y + (u.side ? misY : 0), u.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (i === selected) {
        ctx.strokeStyle = ink2;
        ctx.lineWidth = 2.5 * DPR;
        ctx.beginPath();
        ctx.arc(u.x, u.y, u.r + 6 * DPR, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    const su = units[selected];
    if (p.active && su) {
      const px = p.x * w, py = p.y * h;
      ctx.fillStyle = ink3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(su.x, su.y, 12 * inch, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink2;
      ctx.lineWidth = 3 * DPR;
      ctx.setLineDash([inch * 0.5, inch * 0.5]);
      ctx.beginPath();
      ctx.moveTo(su.x, su.y);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      opts.onMeasure?.(Math.max(0, Math.hypot(px - su.x, py - su.y) - su.r) / inch);
    }

    // Airbrushed title: grey primer first, then ink, with a misregistered pink pass
    const nx = (p.active ? p.x : 0.85) * w, ny = (p.active ? p.y : 0.12) * h;
    const batch = reduce ? targets.length : 70;
    for (let k = 0; k < batch && parts.length < targets.length; k++) {
      const [tx, ty] = targets[parts.length];
      parts.push(reduce ? { x: tx, y: ty, tx, ty, age: 99 } : { x: nx + (Math.random() - 0.5) * 24 * DPR, y: ny + (Math.random() - 0.5) * 24 * DPR, tx, ty, age: 0 });
    }
    const done = parts.length >= targets.length;
    for (const q of parts) {
      if (done && p.active) {
        const dx = q.x - nx, dy = q.y - ny, dd = Math.hypot(dx, dy), R = 60 * DPR;
        if (dd < R) {
          const k = (1 - dd / R) * 14 * DPR;
          q.x += (dx / (dd + 1)) * k;
          q.y += (dy / (dd + 1)) * k;
        }
      }
      q.x += (q.tx - q.x) * 0.09;
      q.y += (q.ty - q.y) * 0.09;
      q.age++;
      const s = Math.min(1, q.age / 70);
      ctx.fillStyle = ink1;
      ctx.globalAlpha = 0.55 * s;
      ctx.beginPath();
      ctx.arc(q.x + 3 * DPR + misX * 0.5, q.y + 2 * DPR, dot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s < 1 ? '#9a958c' : ink2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(q.x, q.y, dot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    p.x = (e.clientX - r.left) / r.width;
    p.y = (e.clientY - r.top) / r.height;
    p.active = true;
  };
  const onLeave = () => {
    p.active = false;
    opts.onMeasure?.(null);
  };
  const onDown = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const x = (e.clientX - r.left) * DPR, y = (e.clientY - r.top) * DPR;
    let best = -1, bd = Infinity;
    units.forEach((u, i) => {
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && bd < 60 * DPR) selected = best;
  };
  const restart = () => {
    cancelAnimationFrame(raf);
    if (fontsReady && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    restart();
  });
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('pointerdown', onDown);
  document.addEventListener('visibilitychange', restart);
  io.observe(host);
  // Fonts must be ready before the title is sampled.
  void document.fonts
    .load(`400 64px "Dela Gothic One"`)
    .catch(() => undefined)
    .then(() => {
      fontsReady = true;
      size = ''; // rebuild with the real font
      restart();
    });

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerleave', onLeave);
    host.removeEventListener('pointerdown', onDown);
    document.removeEventListener('visibilitychange', restart);
  };
}

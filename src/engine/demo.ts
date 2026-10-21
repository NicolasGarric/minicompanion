import type { RoleId } from '../types';

/**
 * Generates a grey-primed demo figure (a generic armoured trooper, original design),
 * with one mask per role. Each part gets top-left lighting, dark recesses at its edges
 * and photo grain, so the wash / drybrush effects have something to work with.
 */
export interface DemoResult {
  image: ImageData;
  masks: Partial<Record<RoleId, Uint8Array>>;
}

const W = 800;
const H = 1100;

type PathFn = (ctx: CanvasRenderingContext2D) => void;

export function createDemo(): DemoResult {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#e9e7e2');
  bg.addColorStop(1, '#c9c4ba');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 750);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  const maskCanvases = new Map<RoleId, CanvasRenderingContext2D>();
  const maskCtx = (role: RoleId) => {
    let m = maskCanvases.get(role);
    if (!m) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      m = c.getContext('2d')!;
      maskCanvases.set(role, m);
    }
    return m;
  };

  const part = (role: RoleId, path: PathFn, tone = 150, opts: { lx?: number; ly?: number; rim?: number; flat?: boolean } = {}) => {
    // Remove the part from masks drawn earlier (occlusion), then add it to its own
    for (const m of maskCanvases.values()) {
      m.globalCompositeOperation = 'destination-out';
      m.beginPath();
      path(m);
      m.fill();
      m.globalCompositeOperation = 'source-over';
    }
    const mc = maskCtx(role);
    mc.fillStyle = '#fff';
    mc.beginPath();
    path(mc);
    mc.fill();

    ctx.save();
    ctx.beginPath();
    path(ctx);
    ctx.clip();
    const b = bounds(path);
    const cx = b.x + b.w * (opts.lx ?? 0.32);
    const cy = b.y + b.h * (opts.ly ?? 0.28);
    const rad = Math.max(b.w, b.h) * 1.05;
    const g = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
    const t = (v: number) => `rgb(${v},${v},${Math.min(255, v + 3)})`;
    if (opts.flat) {
      g.addColorStop(0, t(tone));
      g.addColorStop(1, t(tone - 40));
    } else {
      g.addColorStop(0, t(Math.min(240, tone + 70)));
      g.addColorStop(0.35, t(tone));
      g.addColorStop(0.8, t(Math.max(25, tone - 75)));
      g.addColorStop(1, t(Math.max(15, tone - 100)));
    }
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    // Dark recess along the outline
    ctx.filter = 'blur(6px)';
    ctx.strokeStyle = 'rgba(10,10,14,0.75)';
    ctx.lineWidth = opts.rim ?? 14;
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
    ctx.filter = 'none';
    ctx.restore();
    // Thin edge line
    ctx.strokeStyle = 'rgba(20,20,24,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
  };

  const ellipse = (x: number, y: number, rx: number, ry: number, rot = 0): PathFn => (c) => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  const rrect = (x: number, y: number, w: number, h: number, r: number): PathFn => (c) => c.roundRect(x, y, w, h, r);
  const poly = (pts: number[]): PathFn => (c) => {
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  };
  const ring = (x: number, y: number, rx: number, ry: number, th: number): PathFn => (c) => {
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.ellipse(x, y, rx - th, ry - th, 0, Math.PI * 2, 0, true);
  };

  // Cast shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.filter = 'blur(18px)';
  ctx.beginPath();
  ctx.ellipse(430, 1000, 290, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'none';

  // Base
  part('base', (c) => {
    c.moveTo(150, 940);
    c.lineTo(150, 975);
    c.ellipse(400, 975, 250, 62, 0, Math.PI, 0, true);
    c.lineTo(650, 940);
    c.closePath();
  }, 70, { flat: true, rim: 8 });
  part('base', ellipse(400, 940, 250, 62), 165, { ly: 0.2 });
  // Rocks
  for (const [x, y, r] of [[300, 925, 30], [520, 945, 22], [470, 915, 16], [235, 950, 14]] as const) {
    part('base', ellipse(x, y, r * 1.3, r), 175, { rim: 6 });
  }

  // Backpack
  part('armor2', rrect(270, 260, 260, 140, 30), 140);
  part('metal', rrect(250, 220, 40, 90, 12), 150);
  part('metal', rrect(510, 220, 40, 90, 12), 150);

  // Legs
  part('armor', rrect(305, 650, 85, 300, 26), 150);
  part('armor', rrect(410, 650, 85, 300, 26), 150);
  part('armor', rrect(290, 880, 110, 70, 18), 145);
  part('armor', rrect(400, 880, 110, 70, 18), 145);
  part('armor2', ellipse(348, 760, 44, 40), 160);
  part('armor2', ellipse(452, 760, 44, 40), 160);
  // Tabard
  part('cloth', poly([355, 600, 445, 600, 470, 860, 400, 880, 330, 860]), 175, { rim: 10 });
  part('leather', rrect(380, 620, 40, 90, 6), 125, { rim: 6 });

  // Torso
  part('armor', (c) => c.roundRect(280, 380, 240, 260, [40, 40, 70, 70]), 155);
  // Chest emblem (original winged shape)
  part('trim', (c) => {
    c.moveTo(400, 430);
    c.bezierCurveTo(360, 420, 320, 430, 300, 460);
    c.lineTo(330, 465);
    c.lineTo(315, 485);
    c.lineTo(350, 482);
    c.lineTo(345, 505);
    c.lineTo(400, 495);
    c.lineTo(455, 505);
    c.lineTo(450, 482);
    c.lineTo(485, 485);
    c.lineTo(470, 465);
    c.lineTo(500, 460);
    c.bezierCurveTo(480, 430, 440, 420, 400, 430);
    c.closePath();
  }, 170, { rim: 6 });
  // Belt
  part('leather', rrect(285, 595, 230, 48, 12), 120, { rim: 8 });
  part('metal', ellipse(400, 619, 28, 22), 175, { rim: 5 });

  // Arms
  part('armor', rrect(180, 470, 80, 190, 30), 145);
  part('armor', rrect(540, 470, 80, 190, 30), 145);
  part('armor2', rrect(170, 630, 100, 80, 24), 135);
  part('armor2', rrect(530, 630, 100, 80, 24), 135);

  // Rifle held across the body
  const bolter = (c: CanvasRenderingContext2D) => {
    c.save();
    c.translate(400, 670);
    c.rotate(-0.38);
    c.roundRect(-210, -38, 380, 76, 14);
    c.restore();
  };
  part('weapon', bolter, 115);
  part('metal', (c) => {
    c.save();
    c.translate(400, 670);
    c.rotate(-0.38);
    c.roundRect(165, -22, 120, 36, 8);
    c.restore();
  }, 160);
  part('metal', (c) => {
    c.save();
    c.translate(400, 670);
    c.rotate(-0.38);
    c.roundRect(-80, 30, 46, 70, 6);
    c.restore();
  }, 140, { rim: 6 });
  part('trim', (c) => {
    c.save();
    c.translate(400, 670);
    c.rotate(-0.38);
    c.roundRect(-150, -40, 18, 80, 4);
    c.roundRect(60, -40, 18, 80, 4);
    c.restore();
  }, 170, { rim: 4 });

  // Shoulder pads
  part('armor', ellipse(215, 430, 120, 108, -0.15), 160);
  part('armor', ellipse(585, 430, 120, 108, 0.15), 160, { lx: 0.25 });
  part('trim', ring(215, 430, 120, 108, 18), 175, { rim: 6 });
  part('trim', ring(585, 430, 120, 108, 18), 175, { rim: 6 });
  // Parchment seal
  part('cloth', rrect(560, 470, 40, 95, 4), 195, { rim: 6 });
  part('lenses', ellipse(580, 470, 26, 20), 110, { rim: 6 });

  // Gorget and helmet
  part('armor2', rrect(345, 330, 110, 60, 20), 130);
  part('armor', ellipse(400, 290, 72, 82), 160);
  part('metal', poly([365, 320, 435, 320, 420, 365, 380, 365]), 150, { rim: 6 });
  part('lenses', ellipse(372, 280, 18, 13, 0.25), 120, { rim: 5 });
  part('lenses', ellipse(428, 280, 18, 13, -0.25), 120, { rim: 5 });

  // Photo grain
  const img = ctx.getImageData(0, 0, W, H);
  let seed = 42;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const n = ((seed >>> 16) / 65536 - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }

  const masks: DemoResult['masks'] = {};
  for (const [role, mc] of maskCanvases) {
    const d = mc.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
    masks[role] = m;
  }
  return { image: img, masks };
}

function bounds(path: PathFn) {
  // Bounding box measured on an offscreen canvas
  const c = measureCtx();
  c.clearRect(0, 0, W, H);
  c.beginPath();
  path(c);
  c.fill();
  const d = c.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (d[(y * W + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

let _measure: CanvasRenderingContext2D | null = null;
function measureCtx() {
  if (!_measure) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    _measure = c.getContext('2d', { willReadFrequently: true })!;
  }
  return _measure;
}

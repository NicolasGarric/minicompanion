import type { Finish, Primer, RoleId, Scheme, Zone, ZoneRecipe } from '../types';
import { defaultRecipe } from '../data/presets';
import type { Library } from '../storage/db';
import { engine } from '../engine/engine';
import { renderOffscreen } from './render';
import { translate, type Lang } from '../../core/i18n';
import { buildRecipe } from './recipe';

import { APP_NAME } from '../../core/brand';
import { drawCover, fitText, FONT, wrap } from '../../core/lib/card';
export { APP_NAME };

// --- Public scheme links ---------------------------------------------------------------------
// No backend: the scheme (recipes per role, never the image) is encoded in the URL hash.
// To move to hosted links later, replace `schemeLink` / `decodeSchemeParam` only.

interface CompactLayer {
  p?: string; // paint id
  h: string; // hex
  a: number; // amount
}

interface CompactZone {
  r: RoleId;
  b: { p?: string; h: string };
  f: Finish;
  c?: 1;
  w?: CompactLayer;
  d?: CompactLayer;
  l?: CompactLayer;
}

interface CompactScheme {
  v: 1;
  n: string;
  z: CompactZone[];
}

const layer = (e: ZoneRecipe['wash']): CompactLayer | undefined =>
  e.enabled ? { p: e.paintId, h: e.hex, a: Math.round(e.amount * 100) / 100 } : undefined;

const unlayer = (c: CompactLayer | undefined, fallback: ZoneRecipe['wash']): ZoneRecipe['wash'] =>
  c ? { enabled: true, hex: c.h, paintId: c.p, amount: c.a } : fallback;

export function compactScheme(name: string, zones: Zone[]): CompactScheme {
  const seen = new Set<RoleId>();
  const z: CompactZone[] = [];
  for (const zone of zones) {
    if (!zone.visible || seen.has(zone.role)) continue;
    seen.add(zone.role);
    z.push({
      r: zone.role,
      b: { p: zone.base.paintId, h: zone.base.hex },
      f: zone.finish,
      ...(zone.contrast ? { c: 1 as const } : {}),
      w: layer(zone.wash),
      d: layer(zone.drybrush),
      l: layer(zone.highlight),
    });
  }
  return { v: 1, n: name, z };
}

function toBase64Url(bytes: Uint8Array) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** `z…` = deflate-compressed JSON, `j…` = plain JSON (older browsers). */
export async function encodeScheme(c: CompactScheme): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(c));
  if (typeof CompressionStream !== 'undefined') return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + toBase64Url(json);
}

export async function decodeSchemeParam(param: string): Promise<Scheme> {
  const kind = param[0];
  let bytes = fromBase64Url(param.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j') throw new Error('bad link');
  const c = JSON.parse(new TextDecoder().decode(bytes)) as CompactScheme;
  if (c.v !== 1 || !Array.isArray(c.z)) throw new Error('bad link');
  const d = defaultRecipe();
  const recipes: Scheme['recipes'] = {};
  for (const z of c.z) {
    recipes[z.r] = {
      ...d,
      base: { hex: z.b.h, paintId: z.b.p },
      finish: z.f,
      contrast: !!z.c,
      wash: unlayer(z.w, d.wash),
      drybrush: unlayer(z.d, d.drybrush),
      highlight: unlayer(z.l, d.highlight),
    };
  }
  return { id: `shared-${param.slice(1, 9)}`, name: String(c.n).slice(0, 80), faction: '', recipes };
}

export async function schemeLink(name: string, zones: Zone[]): Promise<string> {
  const data = await encodeScheme(compactScheme(name, zones));
  return `${location.origin}${location.pathname}#/s/${data}`;
}

/** Turns a decoded scheme back into zones, e.g. to render its shopping list. */
export function schemeToZones(s: Scheme): Zone[] {
  return Object.entries(s.recipes).map(([role, r], i) => ({
    ...defaultRecipe(),
    ...r,
    id: `z${i}`,
    role: role as RoleId,
    name: translate(`role.${role}` as never),
    visible: true,
  })) as Zone[];
}

// --- Share card ------------------------------------------------------------------------------

/** square = post, story = vertical, compare = before / after side by side (square). */
export type CardFormat = 'story' | 'square' | 'compare';
export const CARD_SIZE: Record<CardFormat, [number, number]> = { story: [1080, 1920], square: [1080, 1080], compare: [1080, 1080] };


function canvasFromImageData(img: ImageData) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}



export async function generateCard(opts: {
  format: CardFormat;
  name: string;
  zones: Zone[];
  primer: Primer | null;
  library: Library;
  lang: Lang;
  link: string;
}): Promise<Blob> {
  const { format, name, zones, primer, library, lang } = opts;
  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) => translate(key, vars, lang);
  await Promise.allSettled([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`400 28px ${FONT}`)]);

  const [W, H] = CARD_SIZE[format];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, W, H);

  const pad = 64;
  const painted = canvasFromImageData(renderOffscreen(zones, primer));
  const reference = canvasFromImageData(engine.sourceImageData());

  const story = format === 'story';
  if (format === 'compare') {
    drawCompare(ctx, { W, pad, name, zones, painted, reference, t });
  } else {
    // Layout: story = big image on top + list below; square = image left + list right.
    const img = story ? { x: pad, y: 200, w: W - pad * 2, h: 940 } : { x: pad, y: 170, w: 470, h: 700 };
    const list = story ? { x: pad, y: 1200, w: W - pad * 2 } : { x: pad + 470 + 40, y: 170, w: W - pad * 2 - 510 };

    ctx.fillStyle = '#e3b04b';
    ctx.font = `700 ${story ? 30 : 26}px ${FONT}`;
    ctx.fillText(t('card.kicker'), pad, story ? 96 : 84);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${story ? 64 : 52}px ${FONT}`;
    ctx.fillText(fitText(ctx, name, W - pad * 2), pad, story ? 164 : 140);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(img.x, img.y, img.w, img.h, 24);
    ctx.clip();
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(img.x, img.y, img.w, img.h);
    drawCover(ctx, painted, img.x, img.y, img.w, img.h);
    ctx.restore();

    // Reference image inset (the user's own photo)
    const inset = story ? 260 : 170;
    const ix = img.x + img.w - inset - 20;
    const iy = img.y + img.h - inset - 20;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ix, iy, inset, inset, 16);
    ctx.clip();
    drawCover(ctx, reference, ix, iy, inset, inset);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(ix, iy, inset, inset, 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(ix, iy + inset - 40, inset, 40);
    ctx.fillStyle = '#fff';
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(t('card.reference'), ix + 12, iy + inset - 12);

    // Swatches + paint names
    const lines = buildRecipe(zones, library, lang, primer);
    // Rows must end above the footer rule (story: H-200, square: H-150).
    const maxRows = story ? 6 : 7;
    const rowH = story ? 76 : 96;
    let y = list.y;
    for (const l of lines.slice(0, maxRows)) {
      const base = l.steps[0];
      ctx.fillStyle = base.hex;
      ctx.beginPath();
      ctx.roundRect(list.x, y, 56, 56, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Effect dots (wash / drybrush / highlight)
      l.steps.slice(1).forEach((s, i) => {
        ctx.fillStyle = s.hex;
        ctx.beginPath();
        ctx.arc(list.x + 70 + i * 22, y + 46, 9, 0, Math.PI * 2);
        ctx.fill();
      });
      const tx = list.x + (story ? 150 : 140);
      const tw = list.w - (tx - list.x);
      ctx.fillStyle = '#9aa0ab';
      ctx.font = `500 ${story ? 24 : 22}px ${FONT}`;
      ctx.fillText(fitText(ctx, l.zone, tw), tx, y + 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${story ? 30 : 26}px ${FONT}`;
      ctx.fillText(fitText(ctx, base.brand ? `${base.name} · ${base.brand}` : base.name, tw), tx, y + 56);
      y += rowH;
    }
    if (lines.length > maxRows) {
      ctx.fillStyle = '#9aa0ab';
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText(t('card.more', { count: lines.length - maxRows }), list.x, y + 24);
    }
  }

  // Footer: organic reach + short disclaimer
  ctx.fillStyle = '#2a2e38';
  ctx.fillRect(0, H - (story ? 200 : 150), W, 2);
  ctx.fillStyle = '#e3b04b';
  ctx.font = `700 ${story ? 32 : 28}px ${FONT}`;
  ctx.fillText(t('card.madeWith', { app: APP_NAME }), pad, H - (story ? 140 : 100));
  ctx.fillStyle = '#7d8492';
  ctx.font = `400 ${story ? 21 : 19}px ${FONT}`;
  wrap(ctx, t('legal.short'), pad, H - (story ? 96 : 64), W - pad * 2, story ? 30 : 26);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('card'))), 'image/png'));
}

type T = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) => string;

/** Before / after: the user's photo and the recoloured version side by side, plus the colour changes. */
function drawCompare(
  ctx: CanvasRenderingContext2D,
  o: { W: number; pad: number; name: string; zones: Zone[]; painted: HTMLCanvasElement; reference: HTMLCanvasElement; t: T },
) {
  const { W, pad, name, zones, painted, reference, t } = o;
  ctx.fillStyle = '#e3b04b';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(t('card.kicker'), pad, 84);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText(fitText(ctx, name, W - pad * 2), pad, 140);

  const gap = 24;
  const pw = (W - pad * 2 - gap) / 2;
  const ph = 640;
  const top = 170;
  [
    { img: reference, label: t('card.before'), x: pad },
    { img: painted, label: t('card.after'), x: pad + pw + gap },
  ].forEach(({ img, label, x }) => {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, top, pw, ph, 20);
    ctx.clip();
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(x, top, pw, ph);
    drawCover(ctx, img, x, top, pw, ph);
    ctx.restore();
    ctx.font = `700 24px ${FONT}`;
    const lw = ctx.measureText(label).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(x + 16, top + 16, lw, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + 30, top + 46);
  });

  // Colour changes: original swatch -> new swatch (zones the user actually recoloured)
  const changes = zones.filter((z) => z.visible && z.refHex && z.base.hex !== z.refHex).slice(0, 6);
  const cell = (W - pad * 2) / Math.max(1, changes.length);
  changes.forEach((z, i) => {
    const x = pad + i * cell;
    const y = top + ph + 34;
    ctx.fillStyle = z.refHex!;
    ctx.beginPath();
    ctx.roundRect(x, y, 44, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#9aa0ab';
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText('→', x + 52, y + 32);
    ctx.fillStyle = z.base.hex;
    ctx.beginPath();
    ctx.roundRect(x + 86, y, 44, 44, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}


import { APP_NAME } from '../../core/brand';
import { DISPLAY, drawCover, fitText, FONT, wrap } from '../../core/lib/card';
import { translate, type Lang } from '../../core/i18n';
import type { ResultRow } from './contest';
import type { Tournament } from './tournaments';

/** Square podium card (1080²) of a painting contest category: the three most voted entries. */
export async function podiumCard(o: { tour: Tournament; kindLabel: string; rows: ResultRow[]; lang: Lang; photo: (p: string) => string }): Promise<Blob> {
  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) => translate(key, vars, o.lang);
  await Promise.allSettled([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`400 28px ${FONT}`), document.fonts.load(`400 52px ${DISPLAY}`)]);
  const W = 1080, H = 1080, pad = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4ecdc';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ff4f7b';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(t('contest.cardKicker', { kind: o.kindLabel }).toUpperCase(), pad, 84);
  ctx.fillStyle = '#1d2a5b';
  ctx.font = `400 52px ${DISPLAY}`;
  ctx.fillText(fitText(ctx, o.tour.name, W - pad * 2), pad, 140);

  const imgs = await Promise.all(o.rows.map((r) => load(o.photo(r.photo_paths[0]))));
  // 2nd | 1st | 3rd, the winner taller
  const slots = [
    { i: 1, x: pad, h: 520 },
    { i: 0, x: pad + 330, h: 620 },
    { i: 2, x: pad + 660, h: 460 },
  ];
  const w = 292;
  const base = 860;
  for (const s of slots) {
    const r = o.rows[s.i];
    if (!r) continue;
    const y = base - s.h;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(s.x, y, w, s.h - 120, 20);
    ctx.clip();
    ctx.fillStyle = '#e4d8bd';
    ctx.fillRect(s.x, y, w, s.h - 120);
    const img = imgs[s.i];
    if (img) drawCover(ctx, img, s.x, y, w, s.h - 120);
    ctx.restore();
    ctx.fillStyle = s.i === 0 ? '#ffd23f' : '#fffaf0';
    ctx.beginPath();
    ctx.roundRect(s.x, base - 110, w, 110, 16);
    ctx.fill();
    // Printed block: ink outline
    ctx.strokeStyle = '#1d2a5b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = s.i === 0 ? '#1d2a5b' : '#1d2a5b';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(String(r.public_rank), s.x + 18, base - 62);
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(fitText(ctx, r.title, w - 80), s.x + 70, base - 66);
    ctx.font = `500 21px ${FONT}`;
    ctx.fillText(fitText(ctx, `${r.author_name} · ${t('contest.votes', { count: r.votes })}`, w - 36), s.x + 18, base - 26);
  }

  ctx.fillStyle = '#1d2a5b';
  ctx.fillRect(0, H - 150, W, 2);
  ctx.fillStyle = '#ff4f7b';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(t('card.madeWith', { app: APP_NAME }), pad, H - 100);
  ctx.fillStyle = '#6b6d86';
  ctx.font = `400 19px ${FONT}`;
  wrap(ctx, t('legal.short'), pad, H - 64, W - pad * 2, 26);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('card'))), 'image/png'));
}

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

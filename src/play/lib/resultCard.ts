import { APP_NAME } from '../../core/brand';
import { drawCover, fitText, FONT, wrap } from '../../core/lib/card';
import { translate, type Lang } from '../../core/i18n';
import type { Game } from './games';
import type { GameReport } from './social';

/** Square result card (1080²) of a confirmed battle report, to share on social networks. */
export async function resultCard(o: { game: Game; report: GameReport; lang: Lang; when: string; place: string; images: string[] }): Promise<Blob> {
  const { game, report, lang } = o;
  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) => translate(key, vars, lang);
  await Promise.allSettled([document.fonts.load(`700 64px ${FONT}`), document.fonts.load(`400 28px ${FONT}`)]);
  const W = 1080;
  const H = 1080;
  const pad = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, W, H);

  // Up to two pictures (painted armies or report photos) on the right
  const pics = (await Promise.all(o.images.slice(0, 2).map(loadImage))).filter((x): x is HTMLImageElement => !!x);
  const textW = pics.length ? 560 : W - pad * 2;
  pics.forEach((img, i) => {
    const h = pics.length === 1 ? 700 : 340;
    const x = pad + textW + 32;
    const y = 170 + i * (h + 20);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, W - pad - x, h, 24);
    ctx.clip();
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(x, y, W - pad - x, h);
    drawCover(ctx, img, x, y, W - pad - x, h);
    ctx.restore();
  });

  ctx.fillStyle = '#e3b04b';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(t('report.cardKicker'), pad, 84);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 52px ${FONT}`;
  ctx.fillText(fitText(ctx, game.game_system, W - pad * 2), pad, 140);

  ctx.fillStyle = '#9aa0ab';
  ctx.font = `500 24px ${FONT}`;
  let y = 200;
  for (const line of [[game.format, game.points ? t('games.points', { points: game.points }) : null].filter(Boolean).join(' · '), o.when, o.place]) {
    if (!line) continue;
    ctx.fillText(fitText(ctx, line, textW), pad, y);
    y += 36;
  }

  // Results: winner first, with score
  y += 30;
  const best = Math.min(...report.results.map((r) => r.placement));
  const winners = report.results.filter((r) => r.placement === best).length;
  for (const r of report.results.slice(0, 6)) {
    const win = r.placement === best;
    ctx.fillStyle = win ? '#e3b04b' : '#2a2e38';
    ctx.beginPath();
    ctx.roundRect(pad, y, textW, 84, 16);
    ctx.fill();
    ctx.fillStyle = win ? '#15171c' : '#ffffff';
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(fitText(ctx, r.profile?.display_name ?? '?', textW - 200), pad + 24, y + 40);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(win ? (winners > 1 ? t('report.draw') : t('report.winner')) : t('report.place', { n: r.placement }), pad + 24, y + 70);
    if (r.score !== null) {
      ctx.font = `700 44px ${FONT}`;
      const s = String(r.score);
      ctx.fillText(s, pad + textW - 24 - ctx.measureText(s).width, y + 56);
    }
    y += 100;
  }
  if (report.summary) {
    ctx.fillStyle = '#c9ccd3';
    ctx.font = `400 24px ${FONT}`;
    wrap(ctx, `“${report.summary.slice(0, 160)}”`, pad, y + 20, textW, 34);
  }

  ctx.fillStyle = '#2a2e38';
  ctx.fillRect(0, H - 150, W, 2);
  ctx.fillStyle = '#e3b04b';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(t('card.madeWith', { app: APP_NAME }), pad, H - 100);
  ctx.fillStyle = '#7d8492';
  ctx.font = `400 19px ${FONT}`;
  wrap(ctx, t('legal.short'), pad, H - 64, W - pad * 2, 26);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('card'))), 'image/png'));
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    // Storage URLs are on another origin: CORS keeps the canvas exportable.
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

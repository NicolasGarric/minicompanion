import { APP_NAME } from '../../core/brand';
import { DISPLAY, FONT, drawCover, fitText, halftoneBand, wrap } from '../../core/lib/card';
import type { Army } from './store';
import type { Deck, Role } from './deckCodec';

/**
 * Army deck: one card per unit, to show an army to a friend. Shared as a link (text only, encoded
 * in the URL hash like scheme links, nothing is uploaded) or as an image of the cards.
 */
export { ROLES, decodeDeck, deckLink, type Deck, type DeckCard } from './deckCodec';

export const deckOf = (a: Army): Deck => ({
  name: a.name,
  colour: a.colour,
  cards: a.units.map((u) => ({ name: u.name, role: u.role, count: u.count, points: u.points, stars: u.stars, note: u.note, painted: u.painted })),
});

/** Role inks: the card frame colour. */
export const ROLE_INK: Record<Role, string> = { leader: '#ff4f7b', troop: '#1d2a5b', elite: '#ffd23f', support: '#3b8f6b', other: '#8a8fb0' };

/**
 * The deck as one image: cards in a grid (3 columns), army name on top, app footer.
 * `photos` maps a card index to a decoded photo (optional).
 */
export async function deckImage(d: Deck, labels: { role: (r: Role) => string; figures: (n: number) => string; pts: string }, photos: Map<number, ImageBitmap>): Promise<Blob> {
  const cols = 3, cw = 340, ch = 480, gap = 30, pad = 50, head = 170, foot = 80;
  const rows = Math.max(1, Math.ceil(d.cards.length / cols));
  const W = pad * 2 + cols * cw + (cols - 1) * gap, H = head + rows * (ch + gap) - gap + pad + foot;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  await document.fonts?.ready;
  ctx.fillStyle = '#f4ecdc';
  ctx.fillRect(0, 0, W, H);
  halftoneBand(ctx, W - 420, 0, 420, 150, '#ff4f7b');
  ctx.fillStyle = '#1d2a5b';
  ctx.font = `400 64px ${DISPLAY}`;
  ctx.fillText(fitText(ctx, d.name, W - pad * 2 - 120), pad, 100);
  ctx.font = `700 26px ${FONT}`;
  const total = d.cards.reduce((s, x) => s + (x.points ?? 0), 0);
  ctx.fillText(`${d.cards.length} × ${labels.figures(d.cards.reduce((s, x) => s + x.count, 0))}${total ? ` · ${total} ${labels.pts}` : ''}`, pad, 142);

  d.cards.forEach((card, i) => {
    const x = pad + (i % cols) * (cw + gap), y = head + Math.floor(i / cols) * (ch + gap);
    ctx.fillStyle = '#ff4f7b';
    ctx.fillRect(x + 10, y + 10, cw, ch);
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(x, y, cw, ch);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1d2a5b';
    ctx.strokeRect(x, y, cw, ch);
    // Picture: the photo, or the army ink in halftone
    const px = x + 18, py = y + 18, pw = cw - 36, ph = 250;
    const photo = photos.get(i);
    if (photo) drawCover(ctx, photo, px, py, pw, ph);
    else {
      ctx.fillStyle = d.colour;
      ctx.fillRect(px, py, pw, ph);
      halftoneBand(ctx, px, py, pw, ph, 'rgba(255,250,240,0.35)');
    }
    ctx.lineWidth = 3;
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = '#1d2a5b';
    ctx.font = `400 30px ${DISPLAY}`;
    ctx.fillText(fitText(ctx, card.name, pw - 70), px, py + ph + 46);
    if (card.stars) {
      ctx.fillStyle = '#ff4f7b';
      ctx.font = `700 26px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('★'.repeat(card.stars), px + pw, py + ph + 44);
      ctx.textAlign = 'left';
    }
    // Role pill
    ctx.font = `700 22px ${FONT}`;
    const role = labels.role(card.role), rw = ctx.measureText(role).width + 28;
    ctx.fillStyle = ROLE_INK[card.role];
    ctx.beginPath();
    ctx.roundRect(px, py + ph + 66, rw, 36, 18);
    ctx.fill();
    ctx.fillStyle = card.role === 'elite' ? '#1d2a5b' : '#fffaf0';
    ctx.fillText(role, px + 14, py + ph + 92);
    ctx.fillStyle = '#1d2a5b';
    ctx.textAlign = 'right';
    ctx.fillText(`${labels.figures(card.count)}${card.points ? ` · ${card.points}` : ''}`, px + pw, py + ph + 92);
    ctx.textAlign = 'left';
    if (card.note) {
      ctx.font = `italic 400 20px ${FONT}`;
      ctx.fillStyle = '#3e4a7a';
      wrap(ctx, card.note.slice(0, 90), px, py + ph + 134, pw, 26);
    }
  });
  ctx.fillStyle = '#1d2a5b';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(`Made with ${APP_NAME}`, pad, H - 34);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'));
}

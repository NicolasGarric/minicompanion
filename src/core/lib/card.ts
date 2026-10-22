/** Canvas helpers shared by the share cards (PAINT scheme card, PLAY result card). */
export const FONT = '"Noto Sans JP", system-ui, sans-serif';

/** Draws `src` to cover the target box (centre crop). */
export function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / src.width, h / src.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** Writes `text` over several lines of at most `maxW`; returns the y after the last line. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  // Japanese has no spaces: fall back to per-character wrapping.
  const tokens = text.includes(' ') ? text.split(/(\s+)/) : [...text];
  let line = '';
  for (const tok of tokens) {
    if (ctx.measureText(line + tok).width > maxW && line) {
      ctx.fillText(line.trim(), x, y);
      y += lh;
      line = tok.trimStart();
    } else line += tok;
  }
  if (line) ctx.fillText(line.trim(), x, y);
  return y + lh;
}


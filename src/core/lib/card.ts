/** Canvas helpers shared by the share cards (PAINT scheme card, PLAY result card). */
export const FONT = '"Noto Sans JP", "Noto Sans SC", "Noto Sans KR", system-ui, sans-serif';
/** Poster face of the riso theme, for card titles. */
export const DISPLAY = '"Dela Gothic One", "Noto Sans JP", "Noto Sans SC", "Noto Sans KR", sans-serif';

/** Riso halftone band (decoration): dots growing towards the bottom-right, in `color`. */
export function halftoneBand(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  const cell = 22;
  for (let yy = y + cell / 2; yy < y + h; yy += cell) {
    for (let xx = x + cell / 2; xx < x + w; xx += cell) {
      const k = ((xx - x) / w) * 0.5 + ((yy - y) / h) * 0.5;
      ctx.beginPath();
      ctx.arc(xx, yy, (cell / 2) * Math.max(0.08, k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

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


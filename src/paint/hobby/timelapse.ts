import { APP_NAME } from '../../core/brand';
import { DISPLAY, FONT, drawCover, fitText } from '../../core/lib/card';

/**
 * Painting time-lapse as a vertical story (1080×1920): the step photos of a unit one after the
 * other with a short cross-fade, story progress bars, step number and date. Previewed on a canvas
 * and recorded as a video with MediaRecorder (no dependency).
 */
export const STORY_W = 1080;
export const STORY_H = 1920;

export interface StoryInput {
  photos: { bitmap: ImageBitmap; at: number }[];
  title: string;
  subtitle: string;
  dateLabel: (at: number) => string;
  /** Seconds per photo */
  hold: number;
}

const FADE = 0.35;

export const storyDuration = (s: StoryInput) => s.photos.length * s.hold + 1.2;

export function drawStoryFrame(ctx: CanvasRenderingContext2D, s: StoryInput, t: number) {
  const n = s.photos.length;
  ctx.fillStyle = '#f4ecdc';
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  if (!n) return;
  const i = Math.min(n - 1, Math.floor(t / s.hold));
  const local = t - i * s.hold;
  const ph = 1560;
  drawCover(ctx, s.photos[i].bitmap, 0, 0, STORY_W, ph);
  // Cross-fade into the next photo at the end of each hold
  if (i < n - 1 && local > s.hold - FADE) {
    ctx.globalAlpha = (local - (s.hold - FADE)) / FADE;
    drawCover(ctx, s.photos[i + 1].bitmap, 0, 0, STORY_W, ph);
    ctx.globalAlpha = 1;
  }
  // Progress bars
  const gap = 10, bw = (STORY_W - 60 - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    const x = 30 + k * (bw + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x, 30, bw, 8);
    const f = k < i ? 1 : k > i ? 0 : Math.min(1, local / s.hold);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, 30, bw * f, 8);
  }
  // Step number with the riso misregistration
  const num = String(i + 1).padStart(2, '0');
  ctx.font = `400 220px ${DISPLAY}`;
  ctx.fillStyle = '#ff4f7b';
  ctx.fillText(num, 48, 300);
  ctx.fillStyle = '#fffaf0';
  ctx.fillText(num, 40, 292);
  ctx.font = `700 44px ${FONT}`;
  ctx.fillStyle = '#fffaf0';
  ctx.shadowColor = 'rgba(29,42,91,0.7)';
  ctx.shadowBlur = 12;
  ctx.fillText(s.dateLabel(s.photos[i].at), 48, 370);
  ctx.shadowBlur = 0;
  // Footer
  ctx.fillStyle = '#f4ecdc';
  ctx.fillRect(0, ph, STORY_W, STORY_H - ph);
  ctx.fillStyle = '#1d2a5b';
  ctx.fillRect(0, ph, STORY_W, 8);
  ctx.font = `400 76px ${DISPLAY}`;
  ctx.fillText(fitText(ctx, s.title, STORY_W - 96), 48, ph + 130);
  ctx.font = `700 42px ${FONT}`;
  ctx.fillText(fitText(ctx, s.subtitle, STORY_W - 96), 48, ph + 200);
  ctx.fillStyle = '#ff4f7b';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(`Made with ${APP_NAME}`, 48, STORY_H - 50);
}

/** Starts a looping preview; returns a stop function. */
export function previewStory(canvas: HTMLCanvasElement, s: StoryInput): () => void {
  const ctx = canvas.getContext('2d')!;
  const t0 = performance.now(), total = storyDuration(s);
  let raf = 0;
  const loop = (now: number) => {
    drawStoryFrame(ctx, s, ((now - t0) / 1000) % total);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

export function videoSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** Records the story in real time and returns the video (MP4 where the browser can, else WebM). */
export function recordStory(s: StoryInput, onProgress?: (f: number) => void): Promise<{ blob: Blob; ext: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d')!;
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const total = storyDuration(s);
  return new Promise((resolve, reject) => {
    rec.onstop = () => {
      const mime = rec.mimeType || type || 'video/webm';
      resolve({ blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm' });
    };
    rec.onerror = () => reject(new Error('record'));
    drawStoryFrame(ctx, s, 0);
    rec.start(250);
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawStoryFrame(ctx, s, Math.min(t, total));
      onProgress?.(Math.min(1, t / total));
      if (t < total) setTimeout(tick, 1000 / 30);
      else rec.stop();
    };
    tick();
  });
}

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 8-bit sRGB -> linear lookup table, shared with the renderer. */
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb8(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 255;
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

/** Inverse table to speed up output conversion (4096 entries). */
export const LINEAR_TO_SRGB_LUT = new Uint8ClampedArray(4097);
for (let i = 0; i <= 4096; i++) LINEAR_TO_SRGB_LUT[i] = linearToSrgb8(i / 4096);

export function hexToLinear(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex);
  return [SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b]];
}

export function rgbToLab([r, g, b]: RGB): RGB {
  const lr = SRGB_TO_LINEAR[Math.round(r)];
  const lg = SRGB_TO_LINEAR[Math.round(g)];
  const lb = SRGB_TO_LINEAR[Math.round(b)];
  let x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  let y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  let z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a: RGB, b: RGB): number {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

export function rgbToHsl([r, g, b]: RGB): RGB {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: RGB;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

export function shiftHue(hex: string, deg: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h + deg, s, l]));
}

export function adjustLightness(hex: string, delta: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, s, Math.max(0, Math.min(1, l + delta))]));
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

export function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
}

/** Labels and descriptions live in i18n (`harmony.<id>`, `harmony.<id>.desc`). */
export interface Harmony {
  id: string;
  offsets: number[];
}

export const HARMONIES: Harmony[] = [
  { id: 'complementary', offsets: [180] },
  { id: 'split', offsets: [150, 210] },
  { id: 'analogous', offsets: [-30, 30] },
  { id: 'triadic', offsets: [120, 240] },
  { id: 'tetradic', offsets: [90, 180, 270] },
  { id: 'mono', offsets: [] },
];

export function harmonyColors(hex: string, h: Harmony): string[] {
  if (h.id === 'mono') return [adjustLightness(hex, -0.22), adjustLightness(hex, -0.1), adjustLightness(hex, 0.12), adjustLightness(hex, 0.25)];
  return h.offsets.map((o) => shiftHue(hex, o));
}

const labCache = new Map<string, RGB>();
function labOf(hex: string): RGB {
  let v = labCache.get(hex);
  if (!v) {
    v = rgbToLab(hexToRgb(hex));
    labCache.set(hex, v);
  }
  return v;
}

/** Closest items to `hex` by ΔE (CIE76). Works on anything with a `hex`, e.g. paints. */
export function nearestPaints<T extends { hex: string }>(hex: string, paints: T[], count = 3, filter?: (p: T) => boolean): { paint: T; dE: number }[] {
  const target = labOf(hex);
  const out: { paint: T; dE: number }[] = [];
  for (const p of paints) {
    if (filter && !filter(p)) continue;
    const l = labOf(p.hex);
    out.push({ paint: p, dE: Math.hypot(l[0] - target[0], l[1] - target[1], l[2] - target[2]) });
  }
  out.sort((a, b) => a.dE - b.dE);
  return out.slice(0, count);
}

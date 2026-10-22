import type { Rect } from './engine';

/**
 * A copy of one rectangle of a mask. Undo history stores patches instead of whole masks:
 * a brush stroke on a 1600 px photo touches a few KB, not 2 MB per affected colour.
 */
export interface MaskPatch {
  id: string;
  rect: Rect;
  data: Uint8Array;
}

export function copyRect(mask: Uint8Array, width: number, r: Rect): Uint8Array {
  const w = r.x1 - r.x0;
  const out = new Uint8Array(w * (r.y1 - r.y0));
  for (let y = r.y0; y < r.y1; y++) out.set(mask.subarray(y * width + r.x0, y * width + r.x1), (y - r.y0) * w);
  return out;
}

export function pasteRect(mask: Uint8Array, width: number, r: Rect, data: Uint8Array) {
  const w = r.x1 - r.x0;
  for (let y = r.y0; y < r.y1; y++) mask.set(data.subarray((y - r.y0) * w, (y - r.y0 + 1) * w), y * width + r.x0);
}

/** Bounding box of the non-zero pixels of a selection, or null if it is empty. */
export function bboxOf(sel: Uint8Array, width: number, height: number): Rect | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!sel[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

import type { Zone } from '../types';

/**
 * Painting steps, in the order a miniature is painted. Each step shows the zones with only the
 * techniques applied so far: a step-by-step tutorial of the user's own scheme.
 */
export const STAGES = ['primer', 'base', 'wash', 'drybrush', 'highlight'] as const;
export type Stage = (typeof STAGES)[number];

export function zonesAtStage(zones: Zone[], stage: number): Zone[] {
  if (stage <= 0) return zones.map((z) => ({ ...z, visible: false }));
  return zones.map((z) => ({
    ...z,
    wash: { ...z.wash, enabled: z.wash.enabled && stage >= 2 },
    drybrush: { ...z.drybrush, enabled: z.drybrush.enabled && stage >= 3 },
    highlight: { ...z.highlight, enabled: z.highlight.enabled && stage >= 4 },
  }));
}

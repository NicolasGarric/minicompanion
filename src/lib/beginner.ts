import type { Brand, Paint, PaintType, Scheme } from '../types';
import { PAINTS } from '../data/paints';
import { defaultRecipe } from '../data/presets';
import { adjustLightness, hexToRgb, mixHex, nearestPaints, rgbToHsl } from './color';

export type Technique = 'prime' | 'basecoat' | 'wash' | 'drybrush' | 'highlight';

export interface BeginnerStep {
  technique: Technique;
  paints: { paint: Paint; similarity: number; forKey: 'main' | 'secondary' | 'metal' }[];
  /** Primer colour suggestion (no specific product). */
  primer?: 'grey' | 'white' | 'black';
}

export interface BeginnerPlan {
  steps: BeginnerStep[];
  shoppingList: Paint[];
  scheme: Scheme;
}

/** ΔE → 0..100 % similarity, shown next to paint suggestions. */
export const similarity = (dE: number) => Math.max(0, Math.round(100 - dE * 2.2));

function pick(hex: string, brand: Brand, types: PaintType[]) {
  const inBrand = nearestPaints(hex, PAINTS, 1, (p) => p.brand === brand && types.includes(p.type))[0];
  // Some ranges lack a type (e.g. no "dry" line): fall back to any brand.
  return inBrand ?? nearestPaints(hex, PAINTS, 1, (p) => types.includes(p.type))[0];
}

/** Chooses a sensible "main" colour: the most saturated of the heavier palette colours. */
export function suggestMain(colors: string[]): string | undefined {
  return [...colors].sort((a, b) => rgbToHsl(hexToRgb(b))[1] - rgbToHsl(hexToRgb(a))[1])[0];
}

export function buildBeginnerPlan(main: string, secondary: string | null, brand: Brand): BeginnerPlan {
  const lightness = rgbToHsl(hexToRgb(main))[2];
  const primer: BeginnerStep['primer'] = lightness > 0.6 ? 'white' : lightness < 0.2 ? 'black' : 'grey';

  const base = pick(main, brand, ['base', 'layer']);
  const second = secondary ? pick(secondary, brand, ['base', 'layer']) : undefined;
  const wash = pick(mixHex(main, '#000000', 0.7), brand, ['shade']);
  const dry = pick(adjustLightness(main, 0.18), brand, ['dry', 'layer']);
  const highlight = pick(adjustLightness(main, 0.3), brand, ['layer', 'base']);
  const metal = pick('#a0a4a8', brand, ['metallic']);

  const entry = (m: { paint: Paint; dE: number } | undefined, forKey: BeginnerStep['paints'][number]['forKey']) =>
    m ? [{ paint: m.paint, similarity: similarity(m.dE), forKey }] : [];

  const steps: BeginnerStep[] = [
    { technique: 'prime', paints: [], primer },
    { technique: 'basecoat', paints: [...entry(base, 'main'), ...entry(second, 'secondary'), ...entry(metal, 'metal')] },
    { technique: 'wash', paints: entry(wash, 'main') },
    { technique: 'drybrush', paints: entry(dry, 'main') },
    { technique: 'highlight', paints: entry(highlight, 'main') },
  ];

  const shoppingList = [...new Map(steps.flatMap((s) => s.paints.map((p) => [p.paint.id, p.paint] as const))).values()];

  const d = defaultRecipe();
  const ref = (m?: { paint: Paint }) => (m ? { hex: m.paint.hex, paintId: m.paint.id } : undefined);
  const scheme: Scheme = {
    id: 'beginner',
    name: 'Beginner scheme',
    faction: '',
    recipes: {
      armor: {
        base: ref(base) ?? { hex: main },
        contrast: base?.paint.type === 'contrast',
        wash: { ...d.wash, ...ref(wash), enabled: !!wash, amount: 0.6 },
        drybrush: { ...d.drybrush, ...ref(dry), enabled: !!dry, amount: 0.45 },
        highlight: { ...d.highlight, ...ref(highlight), enabled: !!highlight, amount: 0.5 },
      },
      ...(second ? { trim: { base: ref(second)!, wash: { ...d.wash, ...ref(wash), enabled: !!wash, amount: 0.5 } } } : {}),
      metal: { base: ref(metal) ?? { hex: '#a0a4a8' }, finish: 'metal', wash: { ...d.wash, ...ref(wash), enabled: !!wash, amount: 0.7 } },
    },
  };
  return { steps, shoppingList, scheme };
}

import type { Primer, Zone } from '../types';
import { paintById } from '../store';
import { isUnpaintedColour } from '../engine/engine';
import type { Library } from '../storage/db';
import { k, translate, type Lang } from '../../core/i18n';

export interface RecipeLine {
  zone: string;
  role: string;
  steps: { label: string; name: string; hex: string; brand?: string }[];
}

/**
 * Steps to paint the scheme: the primer first (if any), then every painted zone.
 * Colour zones still showing the photo's own colour are skipped: there is nothing to paint.
 */
export function buildRecipe(zones: Zone[], lib: Library, lang?: Lang, primer: Primer | null = null): RecipeLine[] {
  const t = (key: string) => translate(k(key), undefined, lang);
  const step = (label: string, hex: string, paintId?: string) => {
    const p = paintById(paintId, lib);
    return { label, hex, name: p ? p.name : hex.toUpperCase(), brand: p ? `${p.brand === 'Custom' ? t('brand.Custom') : p.brand} ${p.range}` : t('recipe.customMix') };
  };

  const lines: RecipeLine[] = [];
  if (primer?.kind === 'paint') {
    lines.push({ zone: t('primer.title'), role: t('primer.role'), steps: [step(t('primer.title'), primer.hex, primer.paintId)] });
  }
  for (const z of zones) {
    if (!z.visible || isUnpaintedColour(z)) continue;
    const steps = [step(t(z.contrast ? 'slot.contrast' : 'slot.base'), z.base.hex, z.base.paintId)];
    if (z.wash.enabled) steps.push(step(t('slot.wash'), z.wash.hex, z.wash.paintId));
    if (z.drybrush.enabled) steps.push(step(t('slot.drybrush'), z.drybrush.hex, z.drybrush.paintId));
    if (z.highlight.enabled) steps.push(step(t('slot.highlight'), z.highlight.hex, z.highlight.paintId));
    lines.push({ zone: z.name, role: `${t(`role.${z.role}`)} · ${t(`finish.${z.finish}`)}`, steps });
  }
  return lines;
}

/** Unique paints used by a set of zones (shopping list). */
export function paintsUsed(zones: Zone[], lib: Library, primer: Primer | null = null) {
  const ids = new Set<string>();
  if (primer?.kind === 'paint' && primer.paintId) ids.add(primer.paintId);
  for (const z of zones.filter((x) => x.visible && !isUnpaintedColour(x))) {
    for (const l of [z.base, z.wash.enabled && z.wash, z.drybrush.enabled && z.drybrush, z.highlight.enabled && z.highlight]) {
      if (l && l.paintId) ids.add(l.paintId);
    }
  }
  return [...ids].map((id) => paintById(id, lib)).filter((p) => !!p);
}

export function recipeToText(title: string, lines: RecipeLine[], lang?: Lang): string {
  const t = (key: string) => translate(k(key), undefined, lang);
  const out = [`# ${title}`, ''];
  for (const l of lines) {
    out.push(`## ${l.zone}`, `_${l.role}_`);
    l.steps.forEach((s, i) => out.push(`${i + 1}. ${s.label}: ${s.name} (${s.brand})`));
    out.push('');
  }
  out.push(`## ${t('recipe.shoppingList')}`);
  const pots = new Set<string>();
  lines.forEach((l) => l.steps.forEach((s) => s.brand !== t('recipe.customMix') && pots.add(`${s.name} (${s.brand})`)));
  out.push(...[...pots].sort().map((p) => `- ${p}`), '', `_${t('legal.short')}_`);
  return out.join('\n');
}

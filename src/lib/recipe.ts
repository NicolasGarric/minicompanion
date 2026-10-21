import type { Zone } from '../types';
import { paintById } from '../store';
import type { Library } from '../storage/db';
import type { RecipeLine } from './image';
import { k, translate, type Lang } from '../i18n';

export function buildRecipe(zones: Zone[], lib: Library, lang?: Lang): RecipeLine[] {
  const t = (key: string) => translate(k(key), undefined, lang);
  return zones
    .filter((z) => z.visible)
    .map((z) => {
      const step = (label: string, hex: string, paintId?: string) => {
        const p = paintById(paintId, lib);
        return { label, hex, name: p ? p.name : hex.toUpperCase(), brand: p ? `${p.brand === 'Custom' ? t('brand.Custom') : p.brand} ${p.range}` : t('recipe.customMix') };
      };
      const steps = [step(t(z.contrast ? 'slot.contrast' : 'slot.base'), z.base.hex, z.base.paintId)];
      if (z.wash.enabled) steps.push(step(t('slot.wash'), z.wash.hex, z.wash.paintId));
      if (z.drybrush.enabled) steps.push(step(t('slot.drybrush'), z.drybrush.hex, z.drybrush.paintId));
      if (z.highlight.enabled) steps.push(step(t('slot.highlight'), z.highlight.hex, z.highlight.paintId));
      return { zone: z.name, role: `${t(`role.${z.role}`)} · ${t(`finish.${z.finish}`)}`, steps };
    });
}

/** Unique paints used by a set of zones (shopping list). */
export function paintsUsed(zones: Zone[], lib: Library) {
  const ids = new Set<string>();
  for (const z of zones.filter((x) => x.visible)) {
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

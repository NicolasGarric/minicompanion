import type { Zone } from '../types';
import { roleLabel } from '../data/presets';
import { paintById } from '../store';
import type { Library } from '../storage/db';
import type { RecipeLine } from './image';

const FINISH: Record<Zone['finish'], string> = { mat: 'Mat', satin: 'Satiné', gloss: 'Brillant', metal: 'Métallique' };

export function buildRecipe(zones: Zone[], lib: Library): RecipeLine[] {
  return zones
    .filter((z) => z.visible)
    .map((z) => {
      const step = (label: string, hex: string, paintId?: string) => {
        const p = paintById(paintId, lib);
        return { label, hex, name: p ? p.name : hex.toUpperCase(), brand: p ? `${p.brand} ${p.range}` : 'Mélange perso' };
      };
      const steps = [step(z.contrast ? 'Contrast' : 'Base', z.base.hex, z.base.paintId)];
      if (z.wash.enabled) steps.push(step('Lavis', z.wash.hex, z.wash.paintId));
      if (z.drybrush.enabled) steps.push(step('Brossage à sec', z.drybrush.hex, z.drybrush.paintId));
      if (z.highlight.enabled) steps.push(step('Éclaircissement', z.highlight.hex, z.highlight.paintId));
      return { zone: z.name, role: `${roleLabel(z.role)} · finition ${FINISH[z.finish].toLowerCase()}`, steps };
    });
}

export function recipeToText(title: string, lines: RecipeLine[]): string {
  const out = [`# ${title}`, ''];
  for (const l of lines) {
    out.push(`## ${l.zone}`, `_${l.role}_`);
    l.steps.forEach((s, i) => out.push(`${i + 1}. ${s.label} : ${s.name} (${s.brand})`));
    out.push('');
  }
  const pots = new Map<string, string>();
  lines.forEach((l) => l.steps.forEach((s) => s.brand !== 'Mélange perso' && pots.set(`${s.name} (${s.brand})`, s.hex)));
  out.push('## Liste des pots', ...[...pots.keys()].sort().map((p) => `- ${p}`));
  return out.join('\n');
}

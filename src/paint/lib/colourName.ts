import { hexToRgb, rgbToHsl } from '../../core/lib/color';
import { isLoaded, k, LANGS, translate, useLang, type Lang, type MessageKey, type Vars } from '../../core/i18n';
import type { Zone } from '../types';

/** Simple human name for a colour ("Dark blue", "濃い青"), used to label automatic zones. */
export function colourName(hex: string, lang: Lang = useLang.getState().lang): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  let hue: string;
  if (l < 0.12) hue = 'black';
  else if (l > 0.9 && s < 0.4) hue = 'white';
  else if (s < 0.14) hue = 'grey';
  else if (h >= 15 && h < 50 && l < 0.42) hue = 'brown';
  else if (h < 15 || h >= 345) hue = 'red';
  else if (h < 40) hue = 'orange';
  else if (h < 66) hue = 'yellow';
  else if (h < 165) hue = 'green';
  else if (h < 195) hue = 'teal';
  else if (h < 255) hue = 'blue';
  else if (h < 290) hue = 'purple';
  else hue = 'pink';

  const name = translate(k(`cname.${hue}`), undefined, lang);
  if (hue === 'black' || hue === 'white' || hue === 'brown') return name;
  if (l < 0.3) return translate('cname.dark', { hue: name }, lang);
  if (l > 0.68) return translate('cname.light', { hue: name }, lang);
  return name;
}

/**
 * How the app made a zone's name (a colour, or a message such as "Background" / "Area 3"), plus the
 * number added to keep names unique. Kept on the zone so the name follows the UI language; the
 * user typing a name of their own removes it.
 */
export type AutoName = ({ hex: string } | { key: MessageKey; vars?: Vars }) & { n?: number };

export function autoNameText(a: AutoName, lang: Lang = useLang.getState().lang): string {
  const base = 'hex' in a ? colourName(a.hex, lang) : translate(a.key, a.vars, lang);
  return a.n && a.n > 1 ? `${base} ${a.n}` : base;
}

/** Names made before `autoName` existed: recognised when they match a generated name in a loaded language. */
function guessAutoName(z: Zone): AutoName | undefined {
  if (z.source !== 'auto' || !z.refHex) return undefined;
  const m = / (\d+)$/.exec(z.name);
  const bare = m ? z.name.slice(0, m.index) : z.name;
  const n = m ? Number(m[1]) : undefined;
  for (const { code } of LANGS) {
    if (!isLoaded(code)) continue;
    if (z.isBackground && bare === translate('colours.background', undefined, code)) return { key: 'colours.background', n };
    if (!z.isBackground && bare === colourName(z.refHex, code)) return { hex: z.refHex, n };
  }
  return undefined;
}

/** Writes generated zone names again in the given language; names typed by the user are untouched. */
export function relabelZones(zones: Zone[], lang: Lang = useLang.getState().lang): Zone[] {
  let changed = false;
  const out = zones.map((z) => {
    const autoName = z.autoName ?? guessAutoName(z);
    if (!autoName) return z;
    const name = autoNameText(autoName, lang);
    if (name === z.name && z.autoName) return z;
    changed = true;
    return { ...z, name, autoName };
  });
  return changed ? out : zones;
}

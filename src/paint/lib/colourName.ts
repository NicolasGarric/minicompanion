import { hexToRgb, rgbToHsl } from '../../core/lib/color';
import { k, translate } from '../../core/i18n';

/** Simple human name for a colour ("Dark blue", "濃い青"), used to label automatic zones. */
export function colourName(hex: string): string {
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

  const name = translate(k(`cname.${hue}`));
  if (hue === 'black' || hue === 'white' || hue === 'brown') return name;
  if (l < 0.3) return translate('cname.dark', { hue: name });
  if (l > 0.68) return translate('cname.light', { hue: name });
  return name;
}

/** Makes names unique in a list: "Blue", "Blue 2", "Blue 3"… */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const c = (seen.get(n) ?? 0) + 1;
    seen.set(n, c);
    return c === 1 ? n : `${n} ${c}`;
  });
}

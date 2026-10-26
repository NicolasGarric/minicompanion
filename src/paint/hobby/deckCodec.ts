/**
 * Army deck share links (no import, so it is unit-tested with plain Node): the deck is encoded in the
 * URL hash like scheme links, deflate-compressed where the browser can. Nothing is uploaded.
 */
export const ROLES = ['leader', 'troop', 'elite', 'support', 'other'] as const;
export type Role = (typeof ROLES)[number];

function toBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export interface DeckCard {
  name: string;
  role: Role;
  count: number;
  points?: number;
  stars?: number;
  note?: string;
  painted: number;
}
export interface Deck {
  name: string;
  colour: string;
  cards: DeckCard[];
}

type Compact = { v: 1; n: string; c: string; u: [string, number, number, number, number, string, number][] };

export async function deckLink(d: Deck): Promise<string> {
  const c: Compact = {
    v: 1,
    n: d.name,
    c: d.colour,
    u: d.cards.slice(0, 60).map((x) => [x.name.slice(0, 60), ROLES.indexOf(x.role), x.count, x.points ?? 0, x.stars ?? 0, (x.note ?? '').slice(0, 140), x.painted]),
  };
  const json = new TextEncoder().encode(JSON.stringify(c));
  const data = typeof CompressionStream !== 'undefined' ? 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw'))) : 'j' + toBase64Url(json);
  return `${location.origin}/#/d/${data}`;
}

export async function decodeDeck(param: string): Promise<Deck> {
  let bytes = fromBase64Url(param.slice(1));
  if (param[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (param[0] !== 'j') throw new Error('bad link');
  const c = JSON.parse(new TextDecoder().decode(bytes)) as Compact;
  if (c.v !== 1 || !Array.isArray(c.u)) throw new Error('bad link');
  const hex = /^#[0-9a-f]{6}$/i.test(c.c) ? c.c : '#1d2a5b';
  return {
    name: String(c.n).slice(0, 80),
    colour: hex,
    cards: c.u.map(([name, role, count, points, stars, note, painted]) => ({
      name: String(name).slice(0, 60),
      role: ROLES[role] ?? 'other',
      count: Math.max(1, Math.min(999, Number(count) || 1)),
      points: Number(points) || undefined,
      stars: Math.max(0, Math.min(3, Number(stars) || 0)),
      note: String(note ?? '').slice(0, 140) || undefined,
      painted: Math.max(0, Math.min(999, Number(painted) || 0)),
    })),
  };
}


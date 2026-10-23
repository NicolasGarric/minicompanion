/**
 * Store finder data layer: real game, model-kit and hobby shops worldwide, from OpenStreetMap.
 *
 * public/data/shops.json is built by scripts/fetch-osm-shops.mjs. Data © OpenStreetMap contributors,
 * under the Open Database License (ODbL): the finder shows that credit next to the list.
 * Coverage depends on what volunteers mapped; the finder invites shops to add themselves on OSM.
 */
export type ShopKind = 'games' | 'model' | 'hobby';
export const SHOP_KINDS: ShopKind[] = ['games', 'model', 'hobby'];

export interface Store {
  /** OSM element: n123 (node), w123 (way), r123 (relation) */
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: ShopKind;
  address: string;
  website: string;
}

type Row = [string, string, number, number, ShopKind, string, string];
let cache: Promise<Store[]> | null = null;

/** Loaded once per visit, only by the pages that show stores. */
export function loadShops(): Promise<Store[]> {
  cache ??= fetch(`${import.meta.env.BASE_URL}data/shops.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`shops ${r.status}`))))
    .then((d: { shops: Row[] }) => d.shops.map(([id, name, lat, lng, kind, address, website]) => ({ id, name, lat, lng, kind, address, website })))
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** OpenStreetMap embed of one point (no API key, no dependency). */
export function osmEmbedUrl(p: { lat: number; lng: number }) {
  const d = 0.008;
  const bbox = [p.lng - d, p.lat - d * 0.7, p.lng + d, p.lat + d * 0.7].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lng}`;
}

export function osmLink(p: { lat: number; lng: number }) {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;
}

/** The shop's own page on OpenStreetMap (details, opening hours, and where to correct it). */
export function osmElementUrl(s: Store) {
  const type = { n: 'node', w: 'way', r: 'relation' }[s.id[0]] ?? 'node';
  return `https://www.openstreetmap.org/${type}/${s.id.slice(1)}`;
}

/**
 * Place search (OpenStreetMap Nominatim). Only the typed text is sent, on submit; never the position.
 * Usage policy: at most one request per second, no autocomplete.
 */
export async function searchPlace(q: string, lang: string): Promise<{ bounds: [[number, number], [number, number]] } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const [hit] = (await res.json()) as { boundingbox: [string, string, string, string] }[];
  if (!hit) return null;
  const [s, n, w, e] = hit.boundingbox.map(Number);
  return { bounds: [[s, w], [n, e]] };
}

/**
 * Store finder data layer.
 *
 * SAMPLE DATA ONLY: the stores below are fictional placeholders (no real retailer names) placed in
 * real Japanese cities so the map and distance sorting can be demonstrated. To plug in real data,
 * implement `StoreProvider` (e.g. fetch a JSON file or an API) and pass it to `<StoreFinder>`.
 */
export type StoreFeature = 'paints' | 'tables' | 'events' | 'beginner';

export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  features: StoreFeature[];
  url?: string;
}

export interface StoreProvider {
  /** Human-readable source label shown under the list (e.g. "Sample data"). */
  readonly source: 'sample' | 'live';
  list(): Promise<Store[]>;
}

const SAMPLE_STORES: Store[] = [
  { id: 's1', name: 'Sample Hobby Base Akihabara', city: 'Tokyo', address: 'Sotokanda, Chiyoda-ku, Tokyo', lat: 35.7006, lng: 139.7715, features: ['paints', 'tables', 'events', 'beginner'] },
  { id: 's2', name: 'Sample Mini Atelier Shibuya', city: 'Tokyo', address: 'Udagawacho, Shibuya-ku, Tokyo', lat: 35.6614, lng: 139.6982, features: ['paints', 'beginner'] },
  { id: 's3', name: 'Sample Game Table Ikebukuro', city: 'Tokyo', address: 'Higashi-Ikebukuro, Toshima-ku, Tokyo', lat: 35.7295, lng: 139.7193, features: ['tables', 'events'] },
  { id: 's4', name: 'Sample Brush & Dice Yokohama', city: 'Yokohama', address: 'Minatomirai, Nishi-ku, Yokohama', lat: 35.4577, lng: 139.6322, features: ['paints', 'tables', 'beginner'] },
  { id: 's5', name: 'Sample Hobby Corner Nagoya', city: 'Nagoya', address: 'Osu, Naka-ku, Nagoya', lat: 35.1592, lng: 136.9011, features: ['paints', 'tables', 'events'] },
  { id: 's6', name: 'Sample Paint Lab Kyoto', city: 'Kyoto', address: 'Kawaramachi, Nakagyo-ku, Kyoto', lat: 35.0045, lng: 135.7689, features: ['paints', 'beginner'] },
  { id: 's7', name: 'Sample Wargame Hall Osaka', city: 'Osaka', address: 'Nipponbashi, Naniwa-ku, Osaka', lat: 34.6612, lng: 135.5063, features: ['paints', 'tables', 'events', 'beginner'] },
  { id: 's8', name: 'Sample Model Studio Fukuoka', city: 'Fukuoka', address: 'Tenjin, Chuo-ku, Fukuoka', lat: 33.5911, lng: 130.3988, features: ['paints', 'tables'] },
  { id: 's9', name: 'Sample Hobby Den Sapporo', city: 'Sapporo', address: 'Tanukikoji, Chuo-ku, Sapporo', lat: 43.0573, lng: 141.3521, features: ['paints', 'events', 'beginner'] },
  { id: 's10', name: 'Sample Table Top Sendai', city: 'Sendai', address: 'Ichibancho, Aoba-ku, Sendai', lat: 38.2604, lng: 140.8713, features: ['tables', 'beginner'] },
];

export const sampleStoreProvider: StoreProvider = {
  source: 'sample',
  list: async () => SAMPLE_STORES,
};

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** OpenStreetMap embed (no API key, no dependency). Loaded only when a store is selected. */
export function osmEmbedUrl(s: Store) {
  const d = 0.008;
  const bbox = [s.lng - d, s.lat - d * 0.7, s.lng + d, s.lat + d * 0.7].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${s.lat},${s.lng}`;
}

export function osmLink(s: Store) {
  return `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`;
}

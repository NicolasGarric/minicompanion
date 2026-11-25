import { TIMEZONES } from '../data/timezones.ts';

export interface Point {
  lat: number;
  lng: number;
}

const inRange = (p: Point): Point | null =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? p : null;

/**
 * A PostGIS geography point as the API returns it: EWKB in hexadecimal ("0101000020E6100000…"),
 * or EWKT ("SRID=4326;POINT(lng lat)") from the local test database.
 */
export function parsePoint(raw: string | null | undefined): Point | null {
  if (!raw) return null;
  const text = raw.match(/POINT\s*\(\s*(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*\)/i);
  if (text) return inRange({ lng: Number(text[1]), lat: Number(text[2]) });
  if (!/^[0-9a-f]{42,50}$/i.test(raw)) return null;
  const bytes = new DataView(new Uint8Array(raw.match(/../g)!.map((h) => parseInt(h, 16))).buffer);
  const little = bytes.getUint8(0) === 1;
  const type = bytes.getUint32(1, little);
  if ((type & 0xff) !== 1) return null;
  const at = type & 0x20000000 ? 9 : 5; // SRID present or not
  if (bytes.byteLength < at + 16) return null;
  return inRange({ lng: bytes.getFloat64(at, little), lat: bytes.getFloat64(at + 8, little) });
}

/** PostGIS accepts EWKT for geography columns. */
export const toPoint = (p: Point) => `SRID=4326;POINT(${p.lng} ${p.lat})`;

/** Country and main city of a time zone; null for "UTC" and the like. */
export function zoneInfo(zone: string): (Point & { country: string }) | null {
  const row = TIMEZONES.split(';').find((r) => r.startsWith(`${zone},`));
  if (!row) return null;
  const [, country, lat, lng] = row.split(',');
  return { country, lat: Number(lat), lng: Number(lng) };
}

/** Time zone of this device ("Europe/Paris"). */
export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

let here: ReturnType<typeof zoneInfo> | undefined;
/**
 * Roughly where this device is, from its time zone only: no permission, no request, nothing stored.
 * Opens maps in the right part of the world and preselects a country.
 */
export const deviceRegion = () => (here === undefined ? (here = zoneInfo(deviceZone())) : here);

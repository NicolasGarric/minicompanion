import { db } from '../../paint/storage/db';
import { photoBlob, useHobby } from '../../paint/hobby/store';

/**
 * PAINT bridge: photos already on this device that can go into a contest entry — the photo of
 * each PAINT project and the latest step photo of each unit in My pile. Nothing leaves the device
 * until the player submits the entry.
 */
export interface DevicePhoto {
  id: string;
  source: 'project' | 'pile';
  label: string;
  blob: Blob;
  url: string;
}

const MAX_PROJECTS = 12;
const MAX_UNITS = 24;

/** Call `release` when the picker closes (object URLs). */
export async function devicePhotos(): Promise<{ photos: DevicePhoto[]; release: () => void }> {
  const photos: DevicePhoto[] = [];
  const projects = await db.listProjects().catch(() => []);
  for (const meta of projects.slice(0, MAX_PROJECTS)) {
    const rec = await db.loadProject(meta.id).catch(() => undefined);
    if (rec?.image) photos.push({ id: `p:${meta.id}`, source: 'project', label: meta.name, blob: rec.image, url: URL.createObjectURL(rec.image) });
  }
  const units = useHobby
    .getState()
    .armies.flatMap((a) => a.units.filter((u) => u.photos.length).map((u) => ({ army: a.name, unit: u })))
    .sort((a, b) => b.unit.photos[b.unit.photos.length - 1].at - a.unit.photos[a.unit.photos.length - 1].at)
    .slice(0, MAX_UNITS);
  for (const { army, unit } of units) {
    const last = unit.photos[unit.photos.length - 1];
    const blob = await photoBlob(last.id).catch(() => undefined);
    if (blob) photos.push({ id: `u:${last.id}`, source: 'pile', label: `${unit.name} · ${army}`, blob, url: URL.createObjectURL(blob) });
  }
  return { photos, release: () => photos.forEach((p) => URL.revokeObjectURL(p.url)) };
}

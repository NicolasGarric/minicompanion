import { create } from 'zustand';
import { db } from '../storage/db';

/**
 * The player's hobby, kept on this device (like PAINT projects): armies and their units (the "pile
 * of shame", also used for the army deck cards), painting sessions, and step photos of units
 * (IndexedDB, for the time-lapse). Nothing here needs an account.
 */
export const STAGES = ['box', 'built', 'primed', 'painted', 'based'] as const;
export type Stage = (typeof STAGES)[number];
import { ROLES, type Role } from './deckCodec';
import { removeCard, type Groups, type InfoLine } from './cards';
export { ROLES, type Role };

export interface Unit {
  id: string;
  name: string;
  role: Role;
  /** Number of miniatures in the unit, and how many of them are painted */
  count: number;
  painted: number;
  stage: Stage;
  points?: number;
  note?: string;
  /** 0–3 stars on the collectible card (older units; now a row of the info list) */
  stars?: number;
  /** The card's free info list; undefined = never edited (points, stars and note are shown instead) */
  info?: InfoLine[];
  /** Photo shown on the card (id of one of the photos); the latest one when unset */
  cardPhoto?: string;
  /** Unit this one is linked to (a hero with its squad), one level only */
  linkedTo?: string;
  /** Step photos (ids in IndexedDB; `remote` once uploaded to the account), oldest first */
  photos: UnitPhoto[];
  /** Painted miniatures (date) for the year in review and levels */
  doneAt?: number;
  createdAt: number;
}

export interface UnitPhoto {
  id: string;
  at: number;
  /** Path in the "pile" bucket once uploaded (synced piles); the blob may then be missing on this device */
  remote?: string;
}

/** A composed combat deck: cards from any army, in scroll order, linked cards grouped. */
export interface LocalDeck {
  id: string;
  name: string;
  groups: Groups;
  createdAt: number;
  /** Id on the account once synced */
  remoteId?: string;
}

export interface Army {
  id: string;
  name: string;
  /** Ink of the army on gauges and cards */
  colour: string;
  units: Unit[];
  createdAt: number;
}

export interface Session {
  id: string;
  start: number;
  minutes: number;
  unitId?: string;
  note?: string;
}

interface Stored {
  armies: Army[];
  sessions: Session[];
  /** Running session: start time and unit */
  running: { start: number; unitId?: string } | null;
  /** Painted miniatures log (date, count) for the stats, even when units are deleted later */
  paintedLog: { at: number; n: number }[];
  decks: LocalDeck[];
  /** Account the pile is synced with (after the import), and what changed since the last push */
  sync: SyncState;
}

export interface SyncState {
  owner: string | null;
  /** "a:<army>", "u:<army>:<unit>", "d:<deck>" changed since the last push */
  dirty: string[];
  /** Removed since the last push: local ids of armies and units, account ids of decks */
  gone: { armies: string[]; units: string[]; decks: string[] };
}
export const NO_SYNC: SyncState = { owner: null, dirty: [], gone: { armies: [], units: [], decks: [] } };

const KEY = 'cf.hobby';
const EMPTY: Stored = { armies: [], sessions: [], running: null, paintedLog: [], decks: [], sync: NO_SYNC };

function load(): Stored {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...EMPTY };
  }
}

/** Inks given to new armies in turn (gauges and cards). */
export const ARMY_INKS = ['#1d2a5b', '#ff4f7b', '#3b8f6b', '#c8693a', '#5b2a6e', '#2b2b2b', '#3d6b8f', '#a47552'];

export const hid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const DAY = 86400000;

interface HobbyState extends Stored {
  addArmy: (name: string, colour: string) => string;
  /** New army with its units at once (from a tournament list), all still in the box. */
  addArmyWithUnits: (name: string, units: { name: string; count: number; points: number | null }[]) => string;
  updateArmy: (id: string, patch: Partial<Pick<Army, 'name' | 'colour'>>) => void;
  removeArmy: (id: string) => void;
  addUnit: (armyId: string, u: Partial<Unit> & { name: string }) => string;
  updateUnit: (armyId: string, unitId: string, patch: Partial<Unit>) => void;
  removeUnit: (armyId: string, unitId: string) => void;
  moveUnit: (armyId: string, unitId: string, dir: -1 | 1) => void;
  addPhoto: (armyId: string, unitId: string, blob: Blob) => Promise<void>;
  removePhoto: (armyId: string, unitId: string, photoId: string) => Promise<void>;
  startSession: (unitId?: string) => void;
  stopSession: (note?: string) => void;
  cancelSession: () => void;
  addSession: (s: Omit<Session, 'id'>) => void;
  removeSession: (id: string) => void;
  addDeck: (name: string, groups?: Groups) => string;
  updateDeck: (id: string, patch: Partial<Pick<LocalDeck, 'name' | 'groups'>>) => void;
  removeDeck: (id: string) => void;
  /** Sync only: replace the whole pile and decks, or record what was pushed */
  replaceAll: (p: Pick<Stored, 'armies' | 'decks'>, sync: SyncState) => void;
  setSync: (sync: SyncState) => void;
}

export const useHobby = create<HobbyState>((set, get) => {
  const save = (patch: Partial<Stored>) => {
    set(patch);
    const s = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ armies: s.armies, sessions: s.sessions, running: s.running, paintedLog: s.paintedLog, decks: s.decks, sync: s.sync }));
    } catch {
      /* storage full or blocked: kept for this visit only */
    }
  };
  // Changes are remembered for the next push only once the pile is synced with an account
  const mark = (keys: string[], gone?: Partial<SyncState['gone']>) => {
    const sy = get().sync;
    if (!sy.owner) return {};
    return {
      sync: {
        ...sy,
        dirty: [...new Set([...sy.dirty, ...keys])],
        gone: {
          armies: [...sy.gone.armies, ...(gone?.armies ?? [])],
          units: [...sy.gone.units, ...(gone?.units ?? [])],
          decks: [...sy.gone.decks, ...(gone?.decks ?? [])],
        },
      },
    };
  };
  const mapArmy = (id: string, fn: (a: Army) => Army, keys: string[] = [`a:${id}`]) =>
    save({ armies: get().armies.map((a) => (a.id === id ? fn(a) : a)), ...mark(keys) });
  const mapUnit = (armyId: string, unitId: string, fn: (u: Unit) => Unit) =>
    mapArmy(armyId, (a) => ({ ...a, units: a.units.map((u) => (u.id === unitId ? fn(u) : u)) }), [`u:${armyId}:${unitId}`]);

  return {
    ...load(),
    addArmy: (name, colour) => {
      const id = hid();
      save({ armies: [...get().armies, { id, name, colour, units: [], createdAt: Date.now() }], ...mark([`a:${id}`]) });
      return id;
    },
    addArmyWithUnits: (name, list) => {
      const id = hid();
      const now = Date.now();
      const units: Unit[] = list.map((u) => ({
        id: hid(),
        name: u.name,
        role: 'troop',
        count: u.count,
        painted: 0,
        stage: 'box',
        ...(u.points ? { points: u.points } : null),
        photos: [],
        createdAt: now,
      }));
      const armies = get().armies;
      save({ armies: [...armies, { id, name, colour: ARMY_INKS[armies.length % ARMY_INKS.length], units, createdAt: now }],
        ...mark([`a:${id}`, ...units.map((u) => `u:${id}:${u.id}`)]) });
      return id;
    },
    updateArmy: (id, patch) => mapArmy(id, (a) => ({ ...a, ...patch })),
    removeArmy: (id) => {
      const army = get().armies.find((a) => a.id === id);
      army?.units.forEach((u) => u.photos.forEach((p) => void db.setKV(`photo:${p.id}`, undefined)));
      const ids = new Set(army?.units.map((u) => u.id));
      save({
        armies: get().armies.filter((a) => a.id !== id).map((a) => unlinkFrom(a, ids)),
        decks: get().decks.map((d) => ({ ...d, groups: [...ids].reduce(removeCard, d.groups) })),
        ...mark(get().decks.map((d) => `d:${d.id}`), { armies: [id] }),
      });
    },
    addUnit: (armyId, u) => {
      const id = hid();
      const unit: Unit = { role: 'troop', count: 1, painted: 0, stage: 'box', photos: [], createdAt: Date.now(), ...u, id };
      mapArmy(armyId, (a) => ({ ...a, units: [...a.units, unit] }), [`u:${armyId}:${id}`]);
      return id;
    },
    updateUnit: (armyId, unitId, patch) =>
      mapUnit(armyId, unitId, (u) => {
        const next = { ...u, ...patch };
        next.count = Math.max(1, Math.min(999, Math.round(next.count)));
        next.painted = Math.max(0, Math.min(next.count, Math.round(next.painted)));
        // Newly painted miniatures go into the log (levels, year in review)
        const gained = next.painted - u.painted;
        if (gained > 0) save({ paintedLog: [...get().paintedLog, { at: Date.now(), n: gained }] });
        if (next.painted === next.count && u.painted < u.count) {
          next.doneAt = Date.now();
          if (STAGES.indexOf(next.stage) < STAGES.indexOf('painted')) next.stage = 'painted';
        }
        return next;
      }),
    removeUnit: (armyId, unitId) => {
      const unit = get().armies.find((a) => a.id === armyId)?.units.find((u) => u.id === unitId);
      unit?.photos.forEach((p) => void db.setKV(`photo:${p.id}`, undefined));
      const ids = new Set([unitId]);
      save({
        armies: get().armies.map((a) => unlinkFrom(a.id === armyId ? { ...a, units: a.units.filter((u) => u.id !== unitId) } : a, ids)),
        decks: get().decks.map((d) => ({ ...d, groups: removeCard(d.groups, unitId) })),
        ...mark(get().decks.filter((d) => d.groups.flat().includes(unitId)).map((d) => `d:${d.id}`), { units: [unitId] }),
      });
    },
    moveUnit: (armyId, unitId, dir) =>
      mapArmy(armyId, (a) => {
        const i = a.units.findIndex((u) => u.id === unitId), j = i + dir;
        if (i < 0 || j < 0 || j >= a.units.length) return a;
        const units = a.units.slice();
        [units[i], units[j]] = [units[j], units[i]];
        return { ...a, units };
      }, [`a:${armyId}`, ...(get().armies.find((a) => a.id === armyId)?.units.map((u) => `u:${armyId}:${u.id}`) ?? [])]),
    addPhoto: async (armyId, unitId, blob) => {
      const id = hid();
      await db.setKV(`photo:${id}`, blob);
      mapUnit(armyId, unitId, (u) => ({ ...u, photos: [...u.photos, { id, at: Date.now() }] }));
    },
    removePhoto: async (armyId, unitId, photoId) => {
      await db.setKV(`photo:${photoId}`, undefined);
      mapUnit(armyId, unitId, (u) => ({ ...u, photos: u.photos.filter((p) => p.id !== photoId), cardPhoto: u.cardPhoto === photoId ? undefined : u.cardPhoto }));
    },
    startSession: (unitId) => save({ running: { start: Date.now(), unitId } }),
    stopSession: (note) => {
      const r = get().running;
      if (!r) return;
      const minutes = Math.round((Date.now() - r.start) / 60000);
      save({ running: null, sessions: minutes >= 1 ? [...get().sessions, { id: hid(), start: r.start, minutes, unitId: r.unitId, note }] : get().sessions });
    },
    cancelSession: () => save({ running: null }),
    addSession: (s) => save({ sessions: [...get().sessions, { ...s, id: hid() }].sort((a, b) => a.start - b.start) }),
    removeSession: (id) => save({ sessions: get().sessions.filter((s) => s.id !== id) }),
    addDeck: (name, groups = []) => {
      const id = hid();
      save({ decks: [...get().decks, { id, name, groups, createdAt: Date.now() }], ...mark([`d:${id}`]) });
      return id;
    },
    updateDeck: (id, patch) => save({ decks: get().decks.map((d) => (d.id === id ? { ...d, ...patch } : d)), ...mark([`d:${id}`]) }),
    removeDeck: (id) => {
      const remote = get().decks.find((d) => d.id === id)?.remoteId;
      save({ decks: get().decks.filter((d) => d.id !== id), ...mark([], { decks: remote ? [remote] : [] }) });
    },
    replaceAll: (p, sync) => save({ armies: p.armies, decks: p.decks, sync }),
    setSync: (sync) => save({ sync }),
  };
});

export const photoBlob = (id: string) => db.getKV<Blob>(`photo:${id}`);

/** Units linked to removed units lose their link. */
function unlinkFrom(a: Army, removed: Set<string>): Army {
  return a.units.some((u) => u.linkedTo && removed.has(u.linkedTo))
    ? { ...a, units: a.units.map((u) => (u.linkedTo && removed.has(u.linkedTo) ? { ...u, linkedTo: undefined } : u)) }
    : a;
}

/** The photo of the card: the chosen one, else the latest. */
export const cardPhotoOf = (u: Unit) => u.photos.find((p) => p.id === u.cardPhoto) ?? u.photos[u.photos.length - 1];

/* ---------- Derived numbers ---------- */

export function armyStats(a: Army) {
  const figures = a.units.reduce((s, u) => s + u.count, 0);
  const painted = a.units.reduce((s, u) => s + u.painted, 0);
  const byStage = Object.fromEntries(STAGES.map((st) => [st, a.units.filter((u) => u.stage === st).length])) as Record<Stage, number>;
  const points = a.units.reduce((s, u) => s + (u.points ?? 0), 0);
  return { figures, painted, progress: figures ? painted / figures : 0, byStage, points };
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Consecutive days with a session, ending today or yesterday. */
export function streak(sessions: Session[], now = Date.now()): number {
  const days = new Set(sessions.map((s) => dayKey(s.start)));
  let n = 0;
  let t = days.has(dayKey(now)) ? now : now - DAY;
  while (days.has(dayKey(t))) {
    n++;
    t -= DAY;
  }
  return n;
}

/** Minutes painted per day for the last `days` days (oldest first). */
export function minutesByDay(sessions: Session[], days: number, now = Date.now()): number[] {
  const out = new Array(days).fill(0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime() - (days - 1) * DAY;
  for (const s of sessions) {
    const i = Math.floor((s.start - t0) / DAY);
    if (i >= 0 && i < days) out[i] += s.minutes;
  }
  return out;
}

export function unitById(armies: Army[], unitId?: string) {
  for (const a of armies) for (const u of a.units) if (u.id === unitId) return { army: a, unit: u };
  return null;
}

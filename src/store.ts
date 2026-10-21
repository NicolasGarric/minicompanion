import { create } from 'zustand';
import type { PaletteColor, Paint, ProjectRecord, RoleId, Scheme, SlotId, Tool, Variant, Zone } from './types';
import { engine } from './engine/engine';
import { applyRecipe, defaultRecipe, recipeOf, ROLES, roleLabel, schemeName } from './data/presets';
import { PAINTS } from './data/paints';
import { db, emptyLibrary, type Library } from './storage/db';
import { blobToImageData, imageDataToBlob, renderThumb, resampleMask } from './lib/image';
import { extractPalette } from './lib/palette';
import { nearestPaints } from './lib/color';
import { track } from './lib/analytics';
import { translate as tr } from './i18n';
import { combine, feather, growShrink, type CombineMode } from './engine/maskTools';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

interface HistoryEntry {
  zones: Zone[];
  activeZoneId: string | null;
  masks: [string, Uint8Array][];
}

export interface Toast {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export type RightTab = 'zones' | 'palette' | 'schemes' | 'harmony' | 'variants';
export type MaskOp = 'grow' | 'shrink' | 'feather' | 'invert' | 'clear' | 'fill';

export interface NewProjectOptions {
  /** Masks per role (demo figure). */
  masks?: Partial<Record<RoleId, Uint8Array>>;
  /** Creates one empty zone per role of this scheme, with its recipe. */
  scheme?: Scheme;
}

interface State {
  projectId: string | null;
  projectName: string;
  createdAt: number;
  imageBlob: Blob | null;
  imageUrl: string | null;
  width: number;
  height: number;
  zones: Zone[];
  activeZoneId: string | null;
  variants: Variant[];
  palette: PaletteColor[];
  maskVersion: number;
  loading: boolean;

  tool: Tool;
  brush: { size: number; hardness: number; flow: number; smart: boolean; smartTolerance: number };
  wand: { tolerance: number; contiguous: boolean; feather: number; mode: CombineMode };
  lassoMode: CombineMode;
  showMask: boolean;
  split: number | null;
  compareOpen: boolean;
  shareOpen: boolean;
  activeSlot: SlotId;
  rightTab: RightTab;
  pickedColor: string | null;
  harmonyBase: string | null;

  library: Library;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastCommitKey: string;
  lastCommitAt: number;
  toasts: Toast[];
}

interface Actions {
  set: (p: Partial<State>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;

  newProject: (image: ImageData, name: string, opts?: NewProjectOptions) => Promise<void>;
  replaceImage: (image: ImageData) => Promise<void>;
  openProject: (id: string) => Promise<boolean>;
  importProject: (rec: ProjectRecord) => Promise<void>;
  closeProject: () => void;
  saveNow: () => Promise<void>;
  buildRecord: () => Promise<ProjectRecord | null>;

  addZone: (role?: RoleId, name?: string) => string;
  updateZone: (id: string, patch: Partial<Zone>, key?: string) => void;
  removeZone: (id: string) => void;
  duplicateZone: (id: string) => void;
  moveZone: (id: string, dir: -1 | 1) => void;
  setActiveZone: (id: string | null) => void;
  assignPaint: (paint: Paint, slot?: SlotId) => void;

  addPaletteColor: (hex: string) => void;
  removePaletteColor: (id: string) => void;
  assignColorToZone: (colorId: string, zoneId: string | undefined) => void;

  pushMaskHistory: (id: string, before: Uint8Array) => void;
  applySelection: (sel: Uint8Array, mode: CombineMode) => void;
  maskOp: (op: MaskOp, amount?: number) => void;
  bumpMasks: () => void;

  applyScheme: (s: Scheme) => void;
  saveScheme: (name: string, faction: string) => void;
  addSchemeToLibrary: (s: Scheme) => void;
  deleteScheme: (id: string) => void;
  currentScheme: (name: string) => Scheme;

  saveVariant: (name: string) => Promise<void>;
  loadVariant: (id: string) => void;
  deleteVariant: (id: string) => void;
  renameVariant: (id: string, name: string) => void;

  loadLibrary: () => Promise<void>;
  updateLibrary: (fn: (l: Library) => Library) => void;

  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 60;

const roleColor = (role: RoleId) => ROLES.find((r) => r.id === role)?.color ?? '#888888';

export function makeZone(role: RoleId, name: string): Zone {
  return {
    id: uid(),
    name,
    role,
    visible: true,
    ...defaultRecipe(),
    base: { hex: roleColor(role) },
  };
}

function paletteFrom(image: ImageData): PaletteColor[] {
  return extractPalette(image, 6).map((c) => ({ id: uid(), hex: c.hex, weight: c.weight, source: 'auto' as const }));
}

export const useStore = create<State & Actions>((set, get) => {
  const snapshot = (maskIds: string[] = []): HistoryEntry => ({
    zones: structuredClone(get().zones),
    activeZoneId: get().activeZoneId,
    masks: maskIds.map((id) => [id, new Uint8Array(engine.ensureMask(id))]),
  });

  const push = (entry: HistoryEntry) =>
    set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT + 1), entry], future: [], lastCommitKey: '' }));

  const restore = (entry: HistoryEntry) => {
    for (const [id, data] of entry.masks) engine.setMask(id, new Uint8Array(data));
    set((s) => ({ zones: entry.zones, activeZoneId: entry.activeZoneId, maskVersion: s.maskVersion + 1 }));
  };

  const setImage = (blob: Blob, image: ImageData) => {
    const prev = get().imageUrl;
    if (prev) URL.revokeObjectURL(prev);
    return { imageBlob: blob, imageUrl: URL.createObjectURL(blob), width: image.width, height: image.height };
  };

  const resetProjectState = (): Partial<State> => ({
    past: [],
    future: [],
    variants: [],
    split: null,
    compareOpen: false,
    shareOpen: false,
    pickedColor: null,
    maskVersion: 0,
  });

  return {
    projectId: null,
    projectName: '',
    createdAt: 0,
    imageBlob: null,
    imageUrl: null,
    width: 0,
    height: 0,
    zones: [],
    activeZoneId: null,
    variants: [],
    palette: [],
    maskVersion: 0,
    loading: false,

    tool: 'brush',
    brush: { size: 40, hardness: 0.6, flow: 1, smart: false, smartTolerance: 25 },
    wand: { tolerance: 18, contiguous: true, feather: 1, mode: 'add' },
    lassoMode: 'add',
    showMask: false,
    split: null,
    compareOpen: false,
    shareOpen: false,
    activeSlot: 'base',
    rightTab: 'zones',
    pickedColor: null,
    harmonyBase: null,

    library: emptyLibrary(),
    past: [],
    future: [],
    lastCommitKey: '',
    lastCommitAt: 0,
    toasts: [],

    set: (p) => set(p),

    toast: (text, tone = 'info') => {
      const id = uid();
      set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
      setTimeout(() => get().dismissToast(id), 3200);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    newProject: async (image, name, opts = {}) => {
      engine.load(image);
      const zones: Zone[] = [];
      if (opts.masks) {
        for (const { id: role } of ROLES) {
          const m = opts.masks[role];
          if (!m) continue;
          const z = makeZone(role, roleLabel(role));
          engine.setMask(z.id, m);
          zones.push(z);
        }
      } else if (opts.scheme) {
        for (const { id: role } of ROLES) {
          const rec = opts.scheme.recipes[role];
          if (!rec) continue;
          const z = applyRecipe(makeZone(role, roleLabel(role)), rec);
          engine.ensureMask(z.id);
          zones.push(z);
        }
      }
      if (zones.length === 0) {
        const z = makeZone('armor', roleLabel('armor'));
        engine.ensureMask(z.id);
        zones.push(z);
      }
      const blob = await imageDataToBlob(image);
      set({
        ...resetProjectState(),
        ...setImage(blob, image),
        projectId: uid(),
        projectName: name,
        createdAt: Date.now(),
        zones,
        palette: paletteFrom(image),
        activeZoneId: zones[0]?.id ?? null,
        rightTab: 'zones',
      });
      track('scheme_created');
      await get().saveNow();
    },

    replaceImage: async (image) => {
      const { width: ow, height: oh, zones, variants } = get();
      // Masks are resampled so painted zones roughly follow the new framing.
      const ids = new Set([...zones.map((z) => z.id), ...variants.flatMap((v) => v.zones.map((z) => z.id))]);
      const old = new Map([...ids].map((id) => [id, engine.masks.get(id)]));
      engine.load(image);
      for (const [id, m] of old) {
        engine.setMask(id, m ? resampleMask(m, ow, oh, image.width, image.height) : new Uint8Array(image.width * image.height));
      }
      const blob = await imageDataToBlob(image);
      set((s) => ({
        ...setImage(blob, image),
        palette: [...paletteFrom(image), ...s.palette.filter((c) => c.source === 'picked')],
        past: [],
        future: [],
        maskVersion: s.maskVersion + 1,
      }));
      get().toast(tr('toast.imageReplaced'), 'success');
      await get().saveNow();
    },

    openProject: async (id) => {
      set({ loading: true });
      try {
        const rec = await db.loadProject(id);
        if (!rec) throw new Error(tr('error.projectNotFound'));
        await get().importProject(rec);
        return true;
      } catch (e) {
        get().toast(tr('error.openProject', { message: (e as Error).message }), 'error');
        return false;
      } finally {
        set({ loading: false });
      }
    },

    importProject: async (rec) => {
      const img = await blobToImageData(rec.image);
      engine.load(img);
      for (const [id, m] of Object.entries(rec.masks)) engine.setMask(id, new Uint8Array(m));
      for (const z of rec.zones) engine.ensureMask(z.id);
      set({
        ...resetProjectState(),
        ...setImage(rec.image, img),
        projectId: rec.id,
        projectName: rec.name,
        createdAt: rec.createdAt,
        zones: rec.zones,
        variants: rec.variants ?? [],
        palette: rec.palette?.length ? rec.palette : paletteFrom(img),
        activeZoneId: rec.zones[0]?.id ?? null,
      });
    },

    closeProject: () => {
      const url = get().imageUrl;
      if (url) URL.revokeObjectURL(url);
      set({ projectId: null, zones: [], palette: [], activeZoneId: null, imageBlob: null, imageUrl: null, ...resetProjectState() });
    },

    buildRecord: async () => {
      const s = get();
      if (!s.projectId || !s.imageBlob) return null;
      const ids = new Set(s.zones.map((z) => z.id));
      s.variants.forEach((v) => v.zones.forEach((z) => ids.add(z.id)));
      const masks: Record<string, Uint8Array> = {};
      for (const id of ids) {
        const m = engine.masks.get(id);
        if (m) masks[id] = m;
      }
      return {
        id: s.projectId,
        name: s.projectName,
        createdAt: s.createdAt,
        updatedAt: Date.now(),
        width: s.width,
        height: s.height,
        image: s.imageBlob,
        zones: s.zones,
        masks,
        variants: s.variants,
        palette: s.palette,
        thumb: renderThumb(s.zones, 220),
      };
    },

    saveNow: async () => {
      const rec = await get().buildRecord();
      if (!rec) return;
      try {
        await db.saveProject(rec);
      } catch (e) {
        get().toast(tr('error.save', { message: (e as Error).message }), 'error');
      }
    },

    addZone: (role = 'other', name) => {
      push(snapshot());
      const count = get().zones.filter((z) => z.role === role).length;
      const z = makeZone(role, name ?? `${roleLabel(role)}${count ? ` ${count + 1}` : ''}`);
      engine.ensureMask(z.id);
      set((s) => ({ zones: [...s.zones, z], activeZoneId: z.id }));
      return z.id;
    },

    updateZone: (id, patch, key) => {
      const s = get();
      const now = Date.now();
      // Consecutive edits of the same field (slider drags) are merged into one undo step.
      const k = key ? `${id}:${key}` : `${id}:${Object.keys(patch).join(',')}`;
      if (k !== s.lastCommitKey || now - s.lastCommitAt > 900) push(snapshot());
      set((st) => ({
        zones: st.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
        lastCommitKey: k,
        lastCommitAt: now,
      }));
    },

    removeZone: (id) => {
      push(snapshot([id]));
      set((s) => {
        const zones = s.zones.filter((z) => z.id !== id);
        return {
          zones,
          palette: s.palette.map((c) => (c.zoneId === id ? { ...c, zoneId: undefined } : c)),
          activeZoneId: s.activeZoneId === id ? zones[zones.length - 1]?.id ?? null : s.activeZoneId,
        };
      });
    },

    duplicateZone: (id) => {
      const src = get().zones.find((z) => z.id === id);
      if (!src) return;
      push(snapshot());
      const z: Zone = { ...structuredClone(src), id: uid(), name: tr('zone.copyName', { name: src.name }) };
      engine.setMask(z.id, new Uint8Array(engine.ensureMask(id)));
      set((s) => {
        const i = s.zones.findIndex((x) => x.id === id);
        const zones = [...s.zones];
        zones.splice(i + 1, 0, z);
        return { zones, activeZoneId: z.id, maskVersion: s.maskVersion + 1 };
      });
    },

    moveZone: (id, dir) => {
      const zones = [...get().zones];
      const i = zones.findIndex((z) => z.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= zones.length) return;
      push(snapshot());
      [zones[i], zones[j]] = [zones[j], zones[i]];
      set({ zones });
    },

    setActiveZone: (id) => set({ activeZoneId: id }),

    assignPaint: (paint, slot) => {
      const s = get();
      const zone = s.zones.find((z) => z.id === s.activeZoneId);
      if (!zone) {
        s.toast(tr('toast.selectZoneFirst'), 'error');
        return;
      }
      const target = slot ?? s.activeSlot;
      const ref = { hex: paint.hex, paintId: paint.id };
      if (target === 'base') {
        const metal = paint.type === 'metallic';
        s.updateZone(
          zone.id,
          {
            base: ref,
            contrast: paint.type === 'contrast',
            finish: metal ? 'metal' : zone.finish === 'metal' ? 'mat' : zone.finish,
          },
          'base',
        );
      } else {
        s.updateZone(zone.id, { [target]: { ...zone[target], ...ref, enabled: true } }, target);
      }
    },

    addPaletteColor: (hex) => {
      if (get().palette.some((c) => c.hex === hex)) return;
      set((s) => ({ palette: [...s.palette, { id: uid(), hex, source: 'picked' }] }));
    },

    removePaletteColor: (id) => set((s) => ({ palette: s.palette.filter((c) => c.id !== id) })),

    assignColorToZone: (colorId, zoneId) => {
      const color = get().palette.find((c) => c.id === colorId);
      if (!color) return;
      set((s) => ({ palette: s.palette.map((c) => (c.id === colorId ? { ...c, zoneId } : c)) }));
      if (!zoneId) return;
      // The zone's base becomes the closest paint (owned paints only when that filter is on).
      const s = get();
      const owned = new Set(s.library.owned);
      const match = nearestPaints(color.hex, allPaints(s.library), 1, (p) =>
        p.type !== 'shade' && p.type !== 'technical' && (!s.library.ownedOnly || owned.has(p.id) || p.brand === 'Custom'),
      )[0];
      const zone = s.zones.find((z) => z.id === zoneId);
      if (match && zone) {
        set({ activeZoneId: zoneId });
        s.assignPaint(match.paint, 'base');
      }
    },

    pushMaskHistory: (id, before) => {
      push({ zones: structuredClone(get().zones), activeZoneId: get().activeZoneId, masks: [[id, before]] });
    },

    applySelection: (sel, mode) => {
      const id = get().activeZoneId;
      if (!id) return;
      const mask = engine.ensureMask(id);
      get().pushMaskHistory(id, new Uint8Array(mask));
      combine(mask, sel, mode);
      engine.invalidate(id);
      get().bumpMasks();
    },

    maskOp: (op, amount = 2) => {
      const id = get().activeZoneId;
      if (!id) return;
      const mask = engine.ensureMask(id);
      get().pushMaskHistory(id, new Uint8Array(mask));
      let next: Uint8Array;
      switch (op) {
        case 'grow': next = growShrink(mask, amount); break;
        case 'shrink': next = growShrink(mask, -amount); break;
        case 'feather': next = feather(mask, amount); break;
        case 'invert': next = mask.map((v) => 255 - v); break;
        case 'clear': next = new Uint8Array(mask.length); break;
        case 'fill': next = new Uint8Array(mask.length).fill(255); break;
      }
      engine.setMask(id, next);
      get().bumpMasks();
    },

    bumpMasks: () => set((s) => ({ maskVersion: s.maskVersion + 1 })),

    applyScheme: (scheme) => {
      const zones = get().zones;
      if (!zones.length) return;
      push(snapshot());
      let applied = 0;
      const next = zones.map((z) => {
        const rec = scheme.recipes[z.role];
        if (rec) applied++;
        return applyRecipe(z, rec);
      });
      set({ zones: next });
      get().toast(
        applied ? tr('toast.schemeApplied', { name: schemeName(scheme), count: applied }) : tr('toast.schemeNoMatch'),
        applied ? 'success' : 'error',
      );
    },

    currentScheme: (name) => {
      const recipes: Scheme['recipes'] = {};
      for (const z of get().zones) if (!recipes[z.role]) recipes[z.role] = recipeOf(z);
      return { id: uid(), name, faction: '', recipes };
    },

    saveScheme: (name, faction) => {
      const scheme = { ...get().currentScheme(name), faction };
      get().addSchemeToLibrary(scheme);
    },

    addSchemeToLibrary: (scheme) => {
      get().updateLibrary((l) => ({ ...l, schemes: [{ ...scheme, builtin: false, faction: scheme.faction || tr('schemes.mine') }, ...l.schemes] }));
      get().toast(tr('toast.schemeSaved', { name: scheme.name }), 'success');
    },

    deleteScheme: (id) => get().updateLibrary((l) => ({ ...l, schemes: l.schemes.filter((s) => s.id !== id) })),

    saveVariant: async (name) => {
      const zones = structuredClone(get().zones);
      const v: Variant = { id: uid(), name, zones, thumb: renderThumb(zones, 260), createdAt: Date.now() };
      set((s) => ({ variants: [...s.variants, v] }));
      get().toast(tr('toast.variantSaved', { name }), 'success');
    },

    loadVariant: (id) => {
      const v = get().variants.find((x) => x.id === id);
      if (!v) return;
      push(snapshot());
      const zones = structuredClone(v.zones);
      zones.forEach((z) => engine.ensureMask(z.id));
      set((s) => ({ zones, activeZoneId: zones[0]?.id ?? null, maskVersion: s.maskVersion + 1 }));
    },

    deleteVariant: (id) => set((s) => ({ variants: s.variants.filter((v) => v.id !== id) })),
    renameVariant: (id, name) => set((s) => ({ variants: s.variants.map((v) => (v.id === id ? { ...v, name } : v)) })),

    loadLibrary: async () => {
      const lib = await db.getKV<Library>('library');
      if (lib) set({ library: { ...emptyLibrary(), ...lib } });
    },

    updateLibrary: (fn) => {
      const library = fn(get().library);
      set({ library });
      db.setKV('library', library).catch(() => get().toast(tr('error.saveLibrary'), 'error'));
    },

    undo: () => {
      const entry = get().past.at(-1);
      if (!entry) return;
      const redo = snapshot(entry.masks.map(([id]) => id));
      set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, redo], lastCommitKey: '' }));
      restore(entry);
    },

    redo: () => {
      const entry = get().future.at(-1);
      if (!entry) return;
      const undo = snapshot(entry.masks.map(([id]) => id));
      set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, undo], lastCommitKey: '' }));
      restore(entry);
    },
  };
});

export function allPaints(lib: Library): Paint[] {
  return [...PAINTS, ...lib.customPaints];
}

export function paintById(id: string | undefined, lib: Library): Paint | undefined {
  if (!id) return undefined;
  return PAINTS.find((p) => p.id === id) ?? lib.customPaints.find((p) => p.id === id);
}

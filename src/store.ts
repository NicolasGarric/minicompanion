import { create } from 'zustand';
import type { Paint, ProjectRecord, RoleId, Scheme, SlotId, Tool, Variant, Zone } from './types';
import { engine } from './engine/engine';
import { applyRecipe, defaultRecipe, recipeOf, ROLES, roleLabel } from './data/presets';
import { PAINTS } from './data/paints';
import { db, emptyLibrary, type Library } from './storage/db';
import { blobToImageData, imageDataToBlob, renderThumb } from './lib/image';
import { combine, feather, growShrink, type CombineMode } from './engine/maskTools';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

interface HistoryEntry {
  zones: Zone[];
  activeZoneId: string | null;
  masks: [string, Uint8Array][];
  label: string;
}

export interface Toast {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export type RightTab = 'palette' | 'schemes' | 'harmony' | 'variants';
export type MaskOp = 'grow' | 'shrink' | 'feather' | 'invert' | 'clear' | 'fill';

interface State {
  projectId: string | null;
  projectName: string;
  createdAt: number;
  imageBlob: Blob | null;
  width: number;
  height: number;
  zones: Zone[];
  activeZoneId: string | null;
  variants: Variant[];
  maskVersion: number;
  loading: boolean;

  tool: Tool;
  brush: { size: number; hardness: number; flow: number; smart: boolean; smartTolerance: number };
  wand: { tolerance: number; contiguous: boolean; feather: number; mode: CombineMode };
  lassoMode: CombineMode;
  showMask: boolean;
  split: number | null;
  compareOpen: boolean;
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

  newProject: (image: ImageData, name: string, masks?: Partial<Record<RoleId, Uint8Array>>) => Promise<void>;
  openProject: (id: string) => Promise<void>;
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
  assignHex: (hex: string, slot?: SlotId) => void;

  pushMaskHistory: (id: string, before: Uint8Array, label: string) => void;
  applySelection: (sel: Uint8Array, mode: CombineMode, label: string) => void;
  maskOp: (op: MaskOp, amount?: number) => void;
  bumpMasks: () => void;

  applyScheme: (s: Scheme) => void;
  saveScheme: (name: string, faction: string) => void;
  deleteScheme: (id: string) => void;

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

export const useStore = create<State & Actions>((set, get) => {
  const snapshot = (label: string, maskIds: string[] = []): HistoryEntry => ({
    zones: structuredClone(get().zones),
    activeZoneId: get().activeZoneId,
    masks: maskIds.map((id) => [id, new Uint8Array(engine.ensureMask(id))]),
    label,
  });

  const push = (entry: HistoryEntry) =>
    set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT + 1), entry], future: [], lastCommitKey: '' }));

  const restore = (entry: HistoryEntry) => {
    for (const [id, data] of entry.masks) engine.setMask(id, new Uint8Array(data));
    set((s) => ({ zones: entry.zones, activeZoneId: entry.activeZoneId, maskVersion: s.maskVersion + 1 }));
  };

  const resetProjectState = (): Partial<State> => ({
    past: [],
    future: [],
    variants: [],
    split: null,
    compareOpen: false,
    maskVersion: 0,
  });

  return {
    projectId: null,
    projectName: '',
    createdAt: 0,
    imageBlob: null,
    width: 0,
    height: 0,
    zones: [],
    activeZoneId: null,
    variants: [],
    maskVersion: 0,
    loading: false,

    tool: 'brush',
    brush: { size: 40, hardness: 0.6, flow: 1, smart: false, smartTolerance: 25 },
    wand: { tolerance: 18, contiguous: true, feather: 1, mode: 'add' },
    lassoMode: 'add',
    showMask: false,
    split: null,
    compareOpen: false,
    activeSlot: 'base',
    rightTab: 'palette',
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

    newProject: async (image, name, masks) => {
      engine.load(image);
      const zones: Zone[] = [];
      if (masks) {
        for (const role of ROLES.map((r) => r.id)) {
          const m = masks[role];
          if (!m) continue;
          const z = makeZone(role, roleLabel(role));
          engine.setMask(z.id, m);
          zones.push(z);
        }
      } else {
        const z = makeZone('armor', roleLabel('armor'));
        engine.ensureMask(z.id);
        zones.push(z);
      }
      const blob = await imageDataToBlob(image);
      set({
        ...resetProjectState(),
        projectId: uid(),
        projectName: name,
        createdAt: Date.now(),
        imageBlob: blob,
        width: image.width,
        height: image.height,
        zones,
        activeZoneId: zones[0]?.id ?? null,
      });
      await get().saveNow();
    },

    openProject: async (id) => {
      set({ loading: true });
      try {
        const rec = await db.loadProject(id);
        if (!rec) throw new Error('Projet introuvable');
        await get().importProject(rec);
      } catch (e) {
        get().toast(`Impossible d'ouvrir le projet : ${(e as Error).message}`, 'error');
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
        projectId: rec.id,
        projectName: rec.name,
        createdAt: rec.createdAt,
        imageBlob: rec.image,
        width: img.width,
        height: img.height,
        zones: rec.zones,
        variants: rec.variants ?? [],
        activeZoneId: rec.zones[0]?.id ?? null,
      });
    },

    closeProject: () => set({ projectId: null, zones: [], activeZoneId: null, imageBlob: null, ...resetProjectState() }),

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
        thumb: renderThumb(s.zones, 220),
      };
    },

    saveNow: async () => {
      const rec = await get().buildRecord();
      if (!rec) return;
      try {
        await db.saveProject(rec);
      } catch (e) {
        get().toast(`Échec de la sauvegarde : ${(e as Error).message}`, 'error');
      }
    },

    addZone: (role = 'other', name) => {
      push(snapshot('Nouvelle zone'));
      const count = get().zones.filter((z) => z.role === role).length;
      const z = makeZone(role, name ?? `${roleLabel(role)}${count ? ` ${count + 1}` : ''}`);
      engine.ensureMask(z.id);
      set((s) => ({ zones: [...s.zones, z], activeZoneId: z.id }));
      return z.id;
    },

    updateZone: (id, patch, key) => {
      const s = get();
      const now = Date.now();
      const k = key ? `${id}:${key}` : `${id}:${Object.keys(patch).join(',')}`;
      if (k !== s.lastCommitKey || now - s.lastCommitAt > 900) {
        push(snapshot('Modifier la zone'));
      }
      set((st) => ({
        zones: st.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
        lastCommitKey: k,
        lastCommitAt: now,
      }));
    },

    removeZone: (id) => {
      push(snapshot('Supprimer la zone', [id]));
      set((s) => {
        const zones = s.zones.filter((z) => z.id !== id);
        return { zones, activeZoneId: s.activeZoneId === id ? zones[zones.length - 1]?.id ?? null : s.activeZoneId };
      });
    },

    duplicateZone: (id) => {
      const src = get().zones.find((z) => z.id === id);
      if (!src) return;
      push(snapshot('Dupliquer la zone'));
      const z: Zone = { ...structuredClone(src), id: uid(), name: `${src.name} (copie)` };
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
      push(snapshot('Réordonner'));
      [zones[i], zones[j]] = [zones[j], zones[i]];
      set({ zones });
    },

    setActiveZone: (id) => set({ activeZoneId: id }),

    assignPaint: (paint, slot) => {
      const s = get();
      const zone = s.zones.find((z) => z.id === s.activeZoneId);
      if (!zone) {
        s.toast('Sélectionnez ou créez une zone avant de choisir une peinture.', 'error');
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
        const layer = zone[target];
        s.updateZone(zone.id, { [target]: { ...layer, ...ref, enabled: true } }, target);
      }
    },

    assignHex: (hex, slot) => {
      const s = get();
      const zone = s.zones.find((z) => z.id === s.activeZoneId);
      if (!zone) return;
      const target = slot ?? s.activeSlot;
      if (target === 'base') s.updateZone(zone.id, { base: { hex } }, 'base');
      else s.updateZone(zone.id, { [target]: { ...zone[target], hex, paintId: undefined, enabled: true } }, target);
    },

    pushMaskHistory: (id, before, label) => {
      push({ zones: structuredClone(get().zones), activeZoneId: get().activeZoneId, masks: [[id, before]], label });
    },

    applySelection: (sel, mode, label) => {
      const id = get().activeZoneId;
      if (!id) return;
      const mask = engine.ensureMask(id);
      get().pushMaskHistory(id, new Uint8Array(mask), label);
      combine(mask, sel, mode);
      engine.invalidate(id);
      get().bumpMasks();
    },

    maskOp: (op, amount = 2) => {
      const id = get().activeZoneId;
      if (!id) return;
      const mask = engine.ensureMask(id);
      get().pushMaskHistory(id, new Uint8Array(mask), 'Opération de masque');
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
      push(snapshot(`Schéma ${scheme.name}`));
      let applied = 0;
      const next = zones.map((z) => {
        const rec = scheme.recipes[z.role];
        if (rec) applied++;
        return applyRecipe(z, rec);
      });
      set({ zones: next });
      get().toast(
        applied ? `Schéma « ${scheme.name} » appliqué à ${applied} zone(s).` : 'Aucune zone ne correspond aux rôles de ce schéma. Assignez un rôle à vos zones.',
        applied ? 'success' : 'error',
      );
    },

    saveScheme: (name, faction) => {
      const recipes: Scheme['recipes'] = {};
      for (const z of get().zones) if (!recipes[z.role]) recipes[z.role] = recipeOf(z);
      const scheme: Scheme = { id: uid(), name, faction, recipes, description: `${Object.keys(recipes).length} rôles` };
      get().updateLibrary((l) => ({ ...l, schemes: [scheme, ...l.schemes] }));
      get().toast(`Schéma « ${name} » enregistré dans votre bibliothèque.`, 'success');
    },

    deleteScheme: (id) => get().updateLibrary((l) => ({ ...l, schemes: l.schemes.filter((s) => s.id !== id) })),

    saveVariant: async (name) => {
      const zones = structuredClone(get().zones);
      const v: Variant = { id: uid(), name, zones, thumb: renderThumb(zones, 260), createdAt: Date.now() };
      set((s) => ({ variants: [...s.variants, v] }));
      get().toast(`Variante « ${name} » enregistrée.`, 'success');
    },

    loadVariant: (id) => {
      const v = get().variants.find((x) => x.id === id);
      if (!v) return;
      push(snapshot(`Charger ${v.name}`));
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
      db.setKV('library', library).catch(() => get().toast('Échec de la sauvegarde de la bibliothèque', 'error'));
    },

    undo: () => {
      const { past } = get();
      const entry = past[past.length - 1];
      if (!entry) return;
      const redo = snapshot(entry.label, entry.masks.map(([id]) => id));
      set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, redo], lastCommitKey: '' }));
      restore(entry);
    },

    redo: () => {
      const { future } = get();
      const entry = future[future.length - 1];
      if (!entry) return;
      const undo = snapshot(entry.label, entry.masks.map(([id]) => id));
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

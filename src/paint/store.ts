import { create } from 'zustand';
import type { Paint, ProjectRecord, RoleId, Scheme, SlotId, Tool, Variant, Zone } from './types';
import { engine, type Rect } from './engine/engine';
import { segmentImage, splitMask } from './engine/segment';
import { growPart } from './engine/parts';
import { copyRect, pasteRect, bboxOf, type MaskPatch } from './engine/maskPatch';
import { applyRecipe, defaultRecipe, recipeOf, ROLES, roleLabel, schemeName } from './data/presets';
import { PAINTS } from './data/paints';
import { db, emptyLibrary, type Library } from './storage/db';
import { blobToImageData, imageDataToBlob } from '../core/lib/image';
import { renderThumb, resampleMask } from './lib/render';
import { colourName, uniqueNames } from './lib/colourName';
import { deltaE, hexToRgb, rgbToHex } from '../core/lib/color';
import { track } from '../core/analytics';
import { translate as tr } from '../core/i18n';
import { combine, feather, growShrink, type CombineMode } from './engine/maskTools';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** One undo step: zone settings + the changed rectangles of the affected masks. */
interface HistoryEntry {
  zones: Zone[];
  activeZoneId: string | null;
  patches: MaskPatch[];
}

export interface Toast {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export type Step = 1 | 2 | 3;
export type MaskOp = 'grow' | 'shrink' | 'feather' | 'invert' | 'clear' | 'fill';

export const DEFAULT_COLOURS = 6;
export const MIN_COLOURS = 3;
export const MAX_COLOURS = 12;

export interface NewProjectOptions {
  /** Ready-made masks per role (demo figure). */
  masks?: Partial<Record<RoleId, Uint8Array>>;
  /** Scheme to apply to the detected colours, biggest colour first (shared links, beginner path). */
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
  maskVersion: number;
  loading: boolean;

  /** Editor flow: 1 image, 2 colours, 3 paints & share. */
  step: Step;
  colourCount: number;
  analysing: boolean;
  /** Last analysis found a colourless photo (primed miniature): suggest drawing areas. */
  greyscale: boolean;

  tool: Tool;
  brush: { size: number; hardness: number; flow: number; smart: boolean; smartTolerance: number };
  wand: { tolerance: number; contiguous: boolean; feather: number; mode: CombineMode };
  lassoMode: CombineMode;
  /** "Tap a part" tool: 1 (tight) … 10 (loose) */
  partSensitivity: number;
  showMask: boolean;
  split: number | null;
  compareOpen: boolean;
  shareOpen: boolean;
  /** Slot that receives the next paint picked in the catalogue. */
  activeSlot: SlotId;

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

  analyseColours: (count: number) => Promise<void>;
  addManualZone: () => string;
  updateZone: (id: string, patch: Partial<Zone>, key?: string) => void;
  removeZone: (id: string) => void;
  setActiveZone: (id: string | null) => void;
  selectZoneAt: (x: number, y: number) => string | null;
  assignPaint: (paint: Paint, slot?: SlotId) => void;
  setZoneColour: (id: string, colour: Paint | string) => void;
  resetZoneColour: (id: string) => void;
  tapPart: (x: number, y: number) => void;
  mergeZones: (targetId: string, sourceId: string) => void;
  splitZone: (id: string) => boolean;

  commitMaskEdit: (zoneId: string, before: Uint8Array, rect: Rect) => void;
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
/** Colours closer than this (ΔE) keep the recipe the user gave them when re-analysing. */
const CARRY_OVER_DE = 14;

const roleColor = (role: RoleId) => ROLES.find((r) => r.id === role)?.color ?? '#888888';
const fullRect = (): Rect => ({ x0: 0, y0: 0, x1: engine.width, y1: engine.height });
const isAuto = (z: Zone) => z.source === 'auto';

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

/** Average source colour under a mask (used for the demo figure's ready-made zones). */
function meanColour(mask: Uint8Array): string {
  let r = 0, g = 0, b = 0, n = 0;
  const src = engine.src;
  for (let i = 0; i < mask.length; i += 3) {
    const a = mask[i];
    if (!a) continue;
    r += src[i * 4] * a;
    g += src[i * 4 + 1] * a;
    b += src[i * 4 + 2] * a;
    n += a;
  }
  return n ? rgbToHex([r / n, g / n, b / n]) : '#808080';
}

export const useStore = create<State & Actions>((set, get) => {
  const snapshot = (patches: { id: string; rect: Rect }[] = []): HistoryEntry => ({
    zones: structuredClone(get().zones),
    activeZoneId: get().activeZoneId,
    patches: patches.map(({ id, rect }) => ({ id, rect, data: copyRect(engine.ensureMask(id), engine.width, rect) })),
  });

  const push = (entry: HistoryEntry) =>
    set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT + 1), entry], future: [], lastCommitKey: '' }));

  const restore = (entry: HistoryEntry) => {
    for (const p of entry.patches) {
      pasteRect(engine.ensureMask(p.id), engine.width, p.rect, p.data);
      engine.invalidate(p.id);
    }
    set((s) => ({ zones: entry.zones, activeZoneId: entry.activeZoneId, maskVersion: s.maskVersion + 1 }));
  };

  const setImage = (blob: Blob, image: ImageData) => {
    const prev = get().imageUrl;
    if (prev) URL.revokeObjectURL(prev);
    return { imageBlob: blob, imageUrl: URL.createObjectURL(blob), width: image.width, height: image.height };
  };

  /** Applies a role-based scheme to plain colour zones: main role to the biggest colour, etc. */
  const applySchemeBySize = (scheme: Scheme) => {
    const targets = get().zones.filter((z) => isAuto(z) && !z.isBackground);
    const recipes = ROLES.map((r) => ({ role: r.id, rec: scheme.recipes[r.id] })).filter((x) => x.rec);
    if (!targets.length || !recipes.length) return;
    push(snapshot());
    const byId = new Map(targets.slice(0, recipes.length).map((z, i) => [z.id, recipes[i]]));
    set((s) => ({
      zones: s.zones.map((z) => {
        const r = byId.get(z.id);
        return r ? { ...applyRecipe(z, r.rec), role: r.role } : z;
      }),
    }));
    get().toast(tr('toast.schemeApplied', { name: schemeName(scheme), count: byId.size }), 'success');
  };

  const resetProjectState = (): Partial<State> => ({
    past: [],
    future: [],
    variants: [],
    split: null,
    compareOpen: false,
    shareOpen: false,
    maskVersion: 0,
    step: 2,
    tool: 'picker',
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
    maskVersion: 0,
    loading: false,

    step: 2,
    colourCount: DEFAULT_COLOURS,
    analysing: false,
    greyscale: false,

    tool: 'picker',
    brush: { size: 40, hardness: 0.6, flow: 1, smart: false, smartTolerance: 25 },
    wand: { tolerance: 18, contiguous: true, feather: 1, mode: 'add' },
    lassoMode: 'add',
    partSensitivity: 5,
    showMask: false,
    split: null,
    compareOpen: false,
    shareOpen: false,
    activeSlot: 'base',

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
      const blob = await imageDataToBlob(image);
      set({
        ...resetProjectState(),
        ...setImage(blob, image),
        projectId: uid(),
        projectName: name,
        createdAt: Date.now(),
        zones: [],
        activeZoneId: null,
      });

      if (opts.masks) {
        // Demo figure: its parts are already known, use them as the reference colours.
        const zones: Zone[] = [];
        for (const { id: role } of ROLES) {
          const m = opts.masks[role];
          if (!m) continue;
          const ref = meanColour(m);
          const z: Zone = { ...makeZone(role, roleLabel(role)), source: 'auto', refHex: ref, base: { hex: ref } };
          engine.setMask(z.id, m);
          zones.push(z);
        }
        set({ zones, activeZoneId: zones[0]?.id ?? null, colourCount: zones.length });
      } else {
        await get().analyseColours(DEFAULT_COLOURS);
        if (opts.scheme) applySchemeBySize(opts.scheme);
      }
      track('scheme_created');
      await get().saveNow();
    },

    replaceImage: async (image) => {
      const { width: ow, height: oh, zones, variants, colourCount } = get();
      const hasAuto = zones.some(isAuto);
      // Manual zones are resampled to the new framing; automatic ones are re-detected.
      const ids = new Set([...zones.filter((z) => !isAuto(z)).map((z) => z.id), ...variants.flatMap((v) => v.zones.map((z) => z.id))]);
      const old = new Map([...ids].map((id) => [id, engine.masks.get(id)]));
      engine.load(image);
      for (const [id, m] of old) {
        engine.setMask(id, m ? resampleMask(m, ow, oh, image.width, image.height) : new Uint8Array(image.width * image.height));
      }
      const blob = await imageDataToBlob(image);
      set((s) => ({ ...setImage(blob, image), past: [], future: [], maskVersion: s.maskVersion + 1 }));
      if (hasAuto) await get().analyseColours(colourCount);
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
      const auto = rec.zones.filter(isAuto).length;
      set({
        ...resetProjectState(),
        ...setImage(rec.image, img),
        projectId: rec.id,
        projectName: rec.name,
        createdAt: rec.createdAt,
        zones: rec.zones,
        variants: rec.variants ?? [],
        colourCount: auto || DEFAULT_COLOURS,
        activeZoneId: rec.zones.find((z) => z.visible)?.id ?? null,
      });
    },

    closeProject: () => {
      const url = get().imageUrl;
      if (url) URL.revokeObjectURL(url);
      set({ projectId: null, zones: [], activeZoneId: null, imageBlob: null, imageUrl: null, ...resetProjectState() });
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

    analyseColours: async (count) => {
      if (!engine.loaded) return;
      set({ analysing: true });
      // Let the spinner paint before the (synchronous) analysis.
      await new Promise((r) => setTimeout(r, 30));
      const seg = segmentImage({ data: engine.src, width: engine.width, height: engine.height }, count);

      const previous = get().zones.filter(isAuto);
      const manual = get().zones.filter((z) => !isAuto(z));
      const used = new Set<string>();
      // The background gets its own label, so it does not take a colour name ("Light grey") from the figure.
      const names = uniqueNames(seg.clusters.map((c, i) => (i === seg.background ? tr('colours.background') : colourName(c.hex))));

      const autoZones = seg.clusters.map((c, i): Zone => {
        const isBackground = i === seg.background;
        // Carry over what the user did to the closest colour of the previous analysis.
        const match = previous
          .filter((p) => !used.has(p.id) && p.refHex)
          .map((p) => ({ p, d: deltaE(hexToRgb(p.refHex!), hexToRgb(c.hex)) }))
          .sort((a, b) => a.d - b.d)[0];
        const base: Zone = { ...makeZone('other', names[i]), source: 'auto', refHex: c.hex, base: { hex: c.hex }, isBackground, visible: !isBackground };
        if (!match || match.d > CARRY_OVER_DE) return base;
        used.add(match.p.id);
        const recolouredBefore = match.p.base.hex !== match.p.refHex;
        return {
          ...structuredClone(match.p),
          id: base.id,
          refHex: c.hex,
          isBackground,
          base: recolouredBefore ? match.p.base : { hex: c.hex },
        };
      });
      autoZones.forEach((z, i) => engine.setMask(z.id, seg.clusters[i].mask));
      // Background last in the list; the rest by size (the segmentation order).
      autoZones.sort((a, b) => Number(!!a.isBackground) - Number(!!b.isBackground));

      // Masks were replaced wholesale: undo history no longer matches them.
      set((s) => ({
        zones: [...autoZones, ...manual],
        colourCount: seg.clusters.length,
        greyscale: seg.greyscale,
        // Nothing open: the list is the first thing to read.
        activeZoneId: null,
        analysing: false,
        past: [],
        future: [],
        maskVersion: s.maskVersion + 1,
      }));
    },

    addManualZone: () => {
      push(snapshot());
      const n = get().zones.filter((z) => !isAuto(z)).length + 1;
      const z = makeZone('other', tr('zones.manualName', { n }));
      engine.ensureMask(z.id);
      set((s) => ({ zones: [...s.zones, z], activeZoneId: z.id, tool: 'lasso' }));
      return z.id;
    },

    updateZone: (id, patch, key) => {
      const s = get();
      const now = Date.now();
      // Consecutive edits of the same field (slider drags, colour wheel) are merged into one undo step.
      const k = key ? `${id}:${key}` : `${id}:${Object.keys(patch).join(',')}`;
      if (k !== s.lastCommitKey || now - s.lastCommitAt > 900) push(snapshot());
      set((st) => ({
        zones: st.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)),
        lastCommitKey: k,
        lastCommitAt: now,
      }));
    },

    removeZone: (id) => {
      push(snapshot([{ id, rect: fullRect() }]));
      set((s) => {
        const zones = s.zones.filter((z) => z.id !== id);
        return { zones, activeZoneId: s.activeZoneId === id ? zones.find((z) => z.visible)?.id ?? null : s.activeZoneId };
      });
    },

    setActiveZone: (id) => set({ activeZoneId: id }),

    /** Zone under a point of the image: manual zones are on top, then the strongest colour. */
    selectZoneAt: (x, y) => {
      const i = Math.round(y) * engine.width + Math.round(x);
      if (i < 0 || i >= engine.width * engine.height) return null;
      const zones = get().zones;
      const manualHit = [...zones].reverse().find((z) => !isAuto(z) && z.visible && (engine.masks.get(z.id)?.[i] ?? 0) > 127);
      const hit =
        manualHit ??
        zones
          .filter(isAuto)
          .map((z) => ({ z, m: engine.masks.get(z.id)?.[i] ?? 0 }))
          .sort((a, b) => b.m - a.m)[0]?.z;
      if (hit) set({ activeZoneId: hit.id });
      return hit?.id ?? null;
    },

    assignPaint: (paint, slot) => {
      const s = get();
      const zone = s.zones.find((z) => z.id === s.activeZoneId);
      if (!zone) {
        s.toast(tr('toast.selectZoneFirst'), 'error');
        return;
      }
      const target = slot ?? s.activeSlot;
      if (target === 'base') return s.setZoneColour(zone.id, paint);
      s.updateZone(zone.id, { [target]: { ...zone[target], hex: paint.hex, paintId: paint.id, enabled: true } }, target);
    },

    setZoneColour: (id, colour) => {
      const zone = get().zones.find((z) => z.id === id);
      if (!zone) return;
      if (typeof colour === 'string') {
        get().updateZone(id, { base: { hex: colour }, visible: true }, 'base');
        return;
      }
      const metal = colour.type === 'metallic';
      get().updateZone(
        id,
        {
          base: { hex: colour.hex, paintId: colour.id },
          contrast: colour.type === 'contrast',
          finish: metal ? 'metal' : zone.finish === 'metal' ? 'mat' : zone.finish,
          // Recolouring the background means the user wants it back in the scheme.
          visible: true,
        },
        'base',
      );
    },

    resetZoneColour: (id) => {
      const zone = get().zones.find((z) => z.id === id);
      if (!zone?.refHex) return;
      get().updateZone(id, { ...defaultRecipe(), base: { hex: zone.refHex } }, 'reset');
    },

    /**
     * "Tap a part" (grey-primed minis): the part under the finger becomes a drawn area, or is added
     * to the open drawn area.
     */
    tapPart: (x, y) => {
      const sel = growPart({ lum: engine.lumG, edge: engine.edge, width: engine.width, height: engine.height }, x, y, get().partSensitivity);
      if (!bboxOf(sel, engine.width, engine.height)) return;
      const active = get().zones.find((z) => z.id === get().activeZoneId);
      if (active && active.source !== 'auto') {
        get().applySelection(sel, 'add');
        return;
      }
      push(snapshot());
      const n = get().zones.filter((z) => !isAuto(z)).length + 1;
      const z = makeZone('other', tr('zones.manualName', { n }));
      engine.setMask(z.id, sel);
      set((s) => ({ zones: [...s.zones, z], activeZoneId: z.id, maskVersion: s.maskVersion + 1 }));
    },

    /** Adds the area of `sourceId` to `targetId` and removes `sourceId` (target keeps its recipe). */
    mergeZones: (targetId, sourceId) => {
      if (targetId === sourceId) return;
      const full = fullRect();
      push(snapshot([{ id: targetId, rect: full }, { id: sourceId, rect: full }]));
      const t = engine.ensureMask(targetId);
      const s = engine.ensureMask(sourceId);
      for (let i = 0; i < t.length; i++) if (s[i]) t[i] = Math.min(255, t[i] + s[i]);
      engine.invalidate(targetId);
      set((st) => ({ zones: st.zones.filter((z) => z.id !== sourceId), activeZoneId: targetId, maskVersion: st.maskVersion + 1 }));
    },

    /** Splits a colour zone into two sub-colours; the new one is added right after it. */
    splitZone: (id) => {
      const zone = get().zones.find((z) => z.id === id);
      if (!zone) return false;
      const res = splitMask({ data: engine.src, width: engine.width, height: engine.height }, engine.ensureMask(id));
      if (!res) {
        get().toast(tr('colours.splitUniform'), 'info');
        return false;
      }
      push(snapshot([{ id, rect: fullRect() }]));
      const [m1, m2] = res.masks;
      const [hex1, hex2] = res.hexes;
      engine.setMask(id, m1);
      const unchanged = !zone.refHex || zone.base.hex === zone.refHex;
      const kept: Zone = { ...zone, refHex: hex1, base: unchanged ? { hex: hex1 } : zone.base };
      const taken = new Set(get().zones.map((z) => z.name));
      let name = colourName(hex2);
      for (let k = 2; taken.has(name); k++) name = `${colourName(hex2)} ${k}`;
      const added: Zone = { ...makeZone(zone.role, name), source: zone.source, refHex: hex2, base: { hex: hex2 } };
      engine.setMask(added.id, m2);
      set((s) => {
        const zones = s.zones.map((z) => (z.id === id ? kept : z));
        zones.splice(zones.findIndex((z) => z.id === id) + 1, 0, added);
        return { zones, activeZoneId: added.id, maskVersion: s.maskVersion + 1 };
      });
      return true;
    },

    /**
     * Records a mask edit for undo. On automatic zones the edit is exclusive: what one colour gains
     * is taken from the other colours (and what it loses is given back), so they stay a partition.
     */
    commitMaskEdit: (zoneId, before, rect) => {
      const zones = get().zones;
      const zone = zones.find((z) => z.id === zoneId);
      if (!zone) return;
      const w = engine.width;
      const mask = engine.ensureMask(zoneId);
      const patches: MaskPatch[] = [{ id: zoneId, rect, data: before }];

      if (isAuto(zone)) {
        const others = zones.filter((z) => isAuto(z) && z.id !== zoneId).map((z) => ({ id: z.id, m: engine.ensureMask(z.id) }));
        const saved = others.map((o) => copyRect(o.m, w, rect));
        const changed = new Array(others.length).fill(false);
        const rw = rect.x1 - rect.x0;
        for (let y = rect.y0; y < rect.y1; y++) {
          for (let x = rect.x0; x < rect.x1; x++) {
            const i = y * w + x;
            const was = before[(y - rect.y0) * rw + (x - rect.x0)];
            const now = mask[i];
            if (was === now) continue;
            const restWas = 255 - was;
            if (restWas <= 0) continue; // nobody else had this pixel
            const factor = Math.max(0, 255 - now) / restWas;
            others.forEach((o, k) => {
              const v = o.m[i];
              if (!v) return;
              const nv = Math.min(255, Math.round(v * factor));
              if (nv !== v) {
                o.m[i] = nv;
                changed[k] = true;
              }
            });
          }
        }
        others.forEach((o, k) => {
          if (!changed[k]) return;
          patches.push({ id: o.id, rect, data: saved[k] });
          engine.invalidate(o.id);
        });
      }

      push({ zones: structuredClone(zones), activeZoneId: get().activeZoneId, patches });
      engine.invalidate(zoneId);
      get().bumpMasks();
    },

    applySelection: (sel, mode) => {
      const id = get().activeZoneId;
      if (!id) return;
      const rect = mode === 'replace' ? fullRect() : bboxOf(sel, engine.width, engine.height);
      if (!rect) return;
      const mask = engine.ensureMask(id);
      const before = copyRect(mask, engine.width, rect);
      combine(mask, sel, mode);
      get().commitMaskEdit(id, before, rect);
    },

    maskOp: (op, amount = 2) => {
      const id = get().activeZoneId;
      if (!id) return;
      const mask = engine.ensureMask(id);
      const rect = fullRect();
      const before = copyRect(mask, engine.width, rect);
      let next: Uint8Array;
      switch (op) {
        case 'grow': next = growShrink(mask, amount); break;
        case 'shrink': next = growShrink(mask, -amount); break;
        case 'feather': next = feather(mask, amount); break;
        case 'invert': next = mask.map((v) => 255 - v); break;
        case 'clear': next = new Uint8Array(mask.length); break;
        case 'fill': next = new Uint8Array(mask.length).fill(255); break;
      }
      mask.set(next);
      get().commitMaskEdit(id, before, rect);
    },

    bumpMasks: () => set((s) => ({ maskVersion: s.maskVersion + 1 })),

    applyScheme: (scheme) => {
      const zones = get().zones;
      if (!zones.length) return;
      // Zones with a role get the matching recipe; plain colour zones get the scheme by size.
      if (!zones.some((z) => z.role !== 'other' && scheme.recipes[z.role])) {
        applySchemeBySize(scheme);
        return;
      }
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
      set((s) => ({ zones, activeZoneId: zones.find((z) => z.visible)?.id ?? null, maskVersion: s.maskVersion + 1 }));
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
      const redo = snapshot(entry.patches);
      set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, redo], lastCommitKey: '' }));
      restore(entry);
    },

    redo: () => {
      const entry = get().future.at(-1);
      if (!entry) return;
      const undo = snapshot(entry.patches);
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

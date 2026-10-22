export type Brand = 'Citadel' | 'Vallejo' | 'Army Painter' | 'Custom';

export type PaintType =
  | 'base'
  | 'layer'
  | 'shade'
  | 'contrast'
  | 'dry'
  | 'technical'
  | 'metallic'
  | 'air';

export interface Paint {
  id: string;
  brand: Brand;
  range: string;
  name: string;
  hex: string;
  type: PaintType;
}

export type Finish = 'mat' | 'satin' | 'gloss' | 'metal';

/** An effect layer (wash, highlight, drybrush). */
export interface EffectLayer {
  enabled: boolean;
  hex: string;
  paintId?: string;
  amount: number; // 0..1
}

export interface Zone {
  id: string;
  name: string;
  role: RoleId;
  visible: boolean;
  opacity: number; // 0..1
  base: { hex: string; paintId?: string };
  finish: Finish;
  /** How much photo shading is kept: 0 = flat, 1 = natural, 2 = very contrasted */
  shading: number;
  /** Brightness offset in stops, -1..1 */
  brightness: number;
  /** Simulates a contrast-style paint (translucent, pools in recesses) */
  contrast: boolean;
  wash: EffectLayer;
  highlight: EffectLayer;
  drybrush: EffectLayer;
  /** 'auto' = created from a reference colour of the image; 'manual' (default) = drawn by the user. */
  source?: 'auto' | 'manual';
  /** Original colour of an automatic zone, as found in the photo. */
  refHex?: string;
  /** The automatic zone detected as the photo background (excluded by default = hidden). */
  isBackground?: boolean;
}

export type SlotId = 'base' | 'wash' | 'highlight' | 'drybrush';

export type RoleId =
  | 'armor'
  | 'armor2'
  | 'trim'
  | 'metal'
  | 'lenses'
  | 'cloth'
  | 'leather'
  | 'skin'
  | 'weapon'
  | 'base'
  | 'other';

/** A zone's recipe, reusable across projects (schemes, presets). */
export type ZoneRecipe = Omit<Zone, 'id' | 'name' | 'role' | 'visible' | 'source' | 'refHex' | 'isBackground'>;

export interface Scheme {
  id: string;
  name: string;
  faction: string;
  description?: string;
  /** Built-in schemes use i18n keys `scheme.<id>` / `scheme.<id>.desc` / `cat.<category>` */
  builtin?: boolean;
  category?: string;
  recipes: Partial<Record<RoleId, Partial<ZoneRecipe>>>;
}

/** A colour taken from the reference image (auto-extracted or picked with the eyedropper). */
export interface PaletteColor {
  id: string;
  hex: string;
  source: 'auto' | 'picked';
  weight?: number;
  zoneId?: string;
}

export interface Variant {
  id: string;
  name: string;
  zones: Zone[];
  thumb?: string;
  createdAt: number;
}

export type Tool = 'hand' | 'brush' | 'eraser' | 'wand' | 'lasso' | 'picker';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  thumb?: string;
}

export interface ProjectRecord extends ProjectMeta {
  createdAt: number;
  width: number;
  height: number;
  image: Blob;
  zones: Zone[];
  masks: Record<string, Uint8Array>;
  variants: Variant[];
  /** v1 only (reference palette panel); ignored since v2, where reference colours are zones. */
  palette?: PaletteColor[];
}

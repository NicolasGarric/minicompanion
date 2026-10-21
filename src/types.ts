export type Brand = 'Citadel' | 'Vallejo' | 'Army Painter' | 'Perso';

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

/** Une couche d'effet (lavis, éclaircissement, brossage à sec). */
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
  /** Conservation de l'ombrage de la photo, 0 = aplat, 1 = naturel, 2 = très contrasté */
  shading: number;
  /** Décalage de luminosité en stops, -1..1 */
  brightness: number;
  /** Simule une peinture Contrast / Speedpaint (translucide, se dépose dans les creux) */
  contrast: boolean;
  wash: EffectLayer;
  highlight: EffectLayer;
  drybrush: EffectLayer;
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

/** Recette d'une zone, réutilisable (schémas, presets). */
export type ZoneRecipe = Omit<Zone, 'id' | 'name' | 'role' | 'visible'>;

export interface Scheme {
  id: string;
  name: string;
  faction: string;
  description?: string;
  builtin?: boolean;
  recipes: Partial<Record<RoleId, Partial<ZoneRecipe>>>;
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
}

import type { EffectLayer, RoleId, Scheme, Zone, ZoneRecipe } from '../types';
import { paintByName, PAINTS } from './paints';

export const ROLES: { id: RoleId; label: string; color: string }[] = [
  { id: 'armor', label: 'Armure principale', color: '#5b8def' },
  { id: 'armor2', label: 'Armure secondaire', color: '#8e6cf0' },
  { id: 'trim', label: 'Liserés / détails', color: '#e3b04b' },
  { id: 'metal', label: 'Métal / armes', color: '#9aa4ad' },
  { id: 'lenses', label: 'Lentilles / gemmes', color: '#ef4b6c' },
  { id: 'cloth', label: 'Tissu / robe', color: '#d97a3a' },
  { id: 'leather', label: 'Cuir / sangles', color: '#9b6a43' },
  { id: 'skin', label: 'Peau', color: '#e2a582' },
  { id: 'weapon', label: 'Arme (boîtier)', color: '#5fb08a' },
  { id: 'base', label: 'Socle', color: '#a08a5f' },
  { id: 'other', label: 'Autre', color: '#c0c4cc' },
];

export const roleLabel = (r: RoleId) => ROLES.find((x) => x.id === r)?.label ?? r;

export function effect(name: string | null, amount = 0.6): EffectLayer {
  if (!name) return { enabled: false, hex: '#000000', amount };
  const p = paintByName(name);
  return { enabled: true, hex: p?.hex ?? '#000000', paintId: p?.id, amount };
}

export function base(name: string): ZoneRecipe['base'] {
  const p = paintByName(name);
  return { hex: p?.hex ?? '#808080', paintId: p?.id };
}

export function defaultRecipe(): ZoneRecipe {
  return {
    opacity: 1,
    base: { hex: '#808080' },
    finish: 'mat',
    shading: 1,
    brightness: 0,
    contrast: false,
    wash: { enabled: false, hex: '#14100e', amount: 0.6 },
    highlight: { enabled: false, hex: '#ffffff', amount: 0.5 },
    drybrush: { enabled: false, hex: '#ffffff', amount: 0.5 },
  };
}

/** Recette compacte : base, lavis, éclaircissement, brossage à sec. */
function r(
  baseName: string,
  wash: string | null,
  highlight: string | null,
  extra: Partial<ZoneRecipe> & { drybrush?: EffectLayer } = {},
): Partial<ZoneRecipe> {
  const p = paintByName(baseName);
  const metallic = p?.type === 'metallic';
  const contrast = p?.type === 'contrast';
  return {
    base: base(baseName),
    finish: metallic ? 'metal' : 'mat',
    contrast,
    wash: effect(wash, metallic ? 0.75 : 0.55),
    highlight: effect(highlight, 0.55),
    ...extra,
  };
}

const metalSilver = r('Leadbelcher', 'Nuln Oil', 'Stormhost Silver');
const metalGold = r('Retributor Armour', 'Reikland Fleshshade', 'Liberator Gold');
const metalBrass = r('Balthasar Gold', 'Agrax Earthshade', 'Runelord Brass');
const leather = r('Rhinox Hide', 'Agrax Earthshade', 'Skrag Brown');
const skin = r('Bugman\'s Glow', 'Reikland Fleshshade', 'Cadian Fleshtone');
const desertBase = r('Zandri Dust', 'Agrax Earthshade', null, { drybrush: effect('Terminatus Stone', 0.6) });
const redLens = r('Mephiston Red', 'Carroburg Crimson', 'Fire Dragon Bright', { finish: 'gloss' });
const greenLens = r('Moot Green', null, 'Gauss Blaster Green', { finish: 'gloss', brightness: 0.2 });

export const BUILTIN_SCHEMES: Scheme[] = [
  {
    id: 'ultramarines',
    name: 'Ultramarines',
    faction: 'Adeptus Astartes',
    description: 'Bleu royal, liserés dorés, lentilles rouges.',
    builtin: true,
    recipes: {
      armor: r('Macragge Blue', 'Drakenhof Nightshade', 'Calgar Blue'),
      armor2: r('Macragge Blue', 'Nuln Oil', 'Hoeth Blue'),
      trim: metalBrass,
      metal: metalSilver,
      lenses: redLens,
      cloth: r('Wraithbone', 'Seraphim Sepia', 'Ushabti Bone'),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: desertBase,
    },
  },
  {
    id: 'blood-angels',
    name: 'Blood Angels',
    faction: 'Adeptus Astartes',
    description: 'Rouge sang, or, noir pour les détails.',
    builtin: true,
    recipes: {
      armor: r('Mephiston Red', 'Carroburg Crimson', 'Evil Sunz Scarlet'),
      armor2: r('Abaddon Black', null, 'Eshin Grey'),
      trim: metalGold,
      metal: metalSilver,
      lenses: greenLens,
      cloth: r('Rakarth Flesh', 'Seraphim Sepia', 'Pallid Wych Flesh'),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: r('Mournfang Brown', 'Agrax Earthshade', null, { drybrush: effect('Tallarn Sand', 0.6) }),
    },
  },
  {
    id: 'dark-angels',
    name: 'Dark Angels',
    faction: 'Adeptus Astartes',
    description: 'Vert sombre, robes os, rouge pour les lentilles.',
    builtin: true,
    recipes: {
      armor: r('Caliban Green', 'Nuln Oil', 'Warpstone Glow'),
      armor2: r('Caliban Green', 'Nuln Oil', 'Warpstone Glow'),
      trim: r('Balthasar Gold', 'Agrax Earthshade', 'Gehenna\'s Gold'),
      metal: metalSilver,
      lenses: redLens,
      cloth: r('Rakarth Flesh', 'Seraphim Sepia', 'Ushabti Bone', { drybrush: effect('Wrack White', 0.3) }),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: desertBase,
    },
  },
  {
    id: 'space-wolves',
    name: 'Space Wolves',
    faction: 'Adeptus Astartes',
    description: 'Gris-bleu glacial, or, fourrures et cuir.',
    builtin: true,
    recipes: {
      armor: r('Russ Grey', 'Drakenhof Nightshade', 'Fenrisian Grey'),
      armor2: r('Mephiston Red', 'Carroburg Crimson', 'Evil Sunz Scarlet'),
      trim: r('Retributor Armour', 'Reikland Fleshshade', 'Liberator Gold'),
      metal: metalSilver,
      lenses: redLens,
      cloth: r('Mournfang Brown', 'Agrax Earthshade', null, { drybrush: effect('Karak Stone', 0.6) }),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: r('Stormvermin Fur', 'Nuln Oil', null, { drybrush: effect('Longbeard Grey', 0.55) }),
    },
  },
  {
    id: 'imperial-fists',
    name: 'Imperial Fists',
    faction: 'Adeptus Astartes',
    description: 'Jaune vif, noir et rouge.',
    builtin: true,
    recipes: {
      armor: r('Averland Sunset', 'Casandora Yellow', 'Yriel Yellow'),
      armor2: r('Abaddon Black', null, 'Eshin Grey'),
      trim: r('Mephiston Red', 'Carroburg Crimson', 'Evil Sunz Scarlet'),
      metal: metalSilver,
      lenses: greenLens,
      cloth: r('Wraithbone', 'Seraphim Sepia', 'Ushabti Bone'),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: r('Mechanicus Standard Grey', 'Nuln Oil', null, { drybrush: effect('Administratum Grey', 0.55) }),
    },
  },
  {
    id: 'salamanders',
    name: 'Salamanders',
    faction: 'Adeptus Astartes',
    description: 'Vert flamboyant, laiton, socle volcanique.',
    builtin: true,
    recipes: {
      armor: r('Waaagh! Flesh', 'Biel-Tan Green', 'Warpstone Glow'),
      armor2: r('Abaddon Black', null, 'Eshin Grey'),
      trim: metalBrass,
      metal: metalSilver,
      lenses: redLens,
      cloth: r('Mournfang Brown', 'Agrax Earthshade', 'Skrag Brown'),
      leather,
      skin: r('Abaddon Black', null, 'Eshin Grey'),
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: r('Abaddon Black', null, null, { drybrush: effect('Troll Slayer Orange', 0.45) }),
    },
  },
  {
    id: 'death-guard',
    name: 'Death Guard',
    faction: 'Heretic Astartes',
    description: 'Vert maladif, laiton corrodé, chairs putrides.',
    builtin: true,
    recipes: {
      armor: r('Death Guard Green', 'Agrax Earthshade', null, { drybrush: effect('Ushabti Bone', 0.4) }),
      armor2: r('Rakarth Flesh', 'Seraphim Sepia', 'Pallid Wych Flesh'),
      trim: r('Balthasar Gold', 'Typhus Corrosion', null, { drybrush: effect('Nihilakh Oxide', 0.35) }),
      metal: r('Leadbelcher', 'Agrax Earthshade', null, { drybrush: effect('Ryza Rust', 0.5) }),
      lenses: r('Moot Green', null, 'Nurgle\'s Rot', { finish: 'gloss' }),
      cloth: r('Rakarth Flesh', 'Agrax Earthshade', null),
      leather,
      skin: r('Rakarth Flesh', 'Druchii Violet', 'Pallid Wych Flesh'),
      weapon: r('Leadbelcher', 'Agrax Earthshade', null, { drybrush: effect('Ryza Rust', 0.5) }),
      base: r('Steel Legion Drab', 'Agrax Earthshade', null, { drybrush: effect('Tyrant Skull', 0.5) }),
    },
  },
  {
    id: 'black-templars',
    name: 'Black Templars',
    faction: 'Adeptus Astartes',
    description: 'Armure noire, robes ivoire, croix blanches.',
    builtin: true,
    recipes: {
      armor: r('Abaddon Black', null, 'Eshin Grey', { finish: 'satin' }),
      armor2: r('White Scar', 'Nuln Oil', null),
      trim: r('Grey Seer', null, 'White Scar'),
      metal: metalSilver,
      lenses: redLens,
      cloth: r('Rakarth Flesh', 'Seraphim Sepia', 'Pallid Wych Flesh'),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: desertBase,
    },
  },
  {
    id: 'necrons',
    name: 'Necrons — Sautekh',
    faction: 'Necrons',
    description: 'Acier sombre, lueurs vertes.',
    builtin: true,
    recipes: {
      armor: r('Leadbelcher', 'Nuln Oil', null, { drybrush: effect('Necron Compound', 0.55) }),
      armor2: r('Abaddon Black', null, 'Eshin Grey'),
      trim: metalBrass,
      metal: r('Leadbelcher', 'Nuln Oil', 'Stormhost Silver'),
      lenses: greenLens,
      cloth: r('Abaddon Black', null, 'Eshin Grey'),
      leather,
      skin,
      weapon: r('Moot Green', null, 'Gauss Blaster Green', { brightness: 0.25 }),
      base: r('Mechanicus Standard Grey', 'Nuln Oil', null, { drybrush: effect('Administratum Grey', 0.55) }),
    },
  },
  {
    id: 'orks',
    name: 'Orks — Goff',
    faction: 'Orks',
    description: 'Peau verte, noir et damier, métal rouillé.',
    builtin: true,
    recipes: {
      armor: r('Abaddon Black', null, 'Eshin Grey'),
      armor2: r('Mephiston Red', 'Agrax Earthshade', 'Evil Sunz Scarlet'),
      trim: r('Averland Sunset', 'Agrax Earthshade', 'Yriel Yellow'),
      metal: r('Leadbelcher', 'Agrax Earthshade', null, { drybrush: effect('Ryza Rust', 0.5) }),
      lenses: redLens,
      cloth: r('Steel Legion Drab', 'Agrax Earthshade', 'Karak Stone'),
      leather,
      skin: r('Waaagh! Flesh', 'Biel-Tan Green', 'Skarsnik Green'),
      weapon: r('Leadbelcher', 'Nuln Oil', null),
      base: desertBase,
    },
  },
  {
    id: 'tau',
    name: 'T\'au — Sept T\'au',
    faction: 'T\'au Empire',
    description: 'Ocre sable, gris sombre, lentilles bleues.',
    builtin: true,
    recipes: {
      armor: r('XV-88', 'Seraphim Sepia', 'Tau Light Ochre'),
      armor2: r('Mechanicus Standard Grey', 'Nuln Oil', 'Dawnstone'),
      trim: r('Wraithbone', 'Seraphim Sepia', 'White Scar'),
      metal: metalSilver,
      lenses: r('Lothern Blue', null, 'Baharroth Blue', { finish: 'gloss' }),
      cloth: r('Rhinox Hide', 'Agrax Earthshade', 'Baneblade Brown'),
      leather,
      skin: r('Fenrisian Grey', 'Drakenhof Nightshade', 'Blue Horror'),
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: desertBase,
    },
  },
  {
    id: 'thousand-sons',
    name: 'Thousand Sons',
    faction: 'Heretic Astartes',
    description: 'Bleu turquoise, or et lentilles bleues.',
    builtin: true,
    recipes: {
      armor: r('Thousand Sons Blue', 'Coelia Greenshade', 'Ahriman Blue'),
      armor2: r('Thousand Sons Blue', 'Coelia Greenshade', 'Ahriman Blue'),
      trim: metalGold,
      metal: metalGold,
      lenses: r('Lothern Blue', null, 'Baharroth Blue', { finish: 'gloss' }),
      cloth: r('Rakarth Flesh', 'Seraphim Sepia', 'Ushabti Bone'),
      leather,
      skin,
      weapon: metalGold,
      base: desertBase,
    },
  },
  {
    id: 'world-eaters',
    name: 'World Eaters',
    faction: 'Heretic Astartes',
    description: 'Rouge sombre, laiton, sang frais.',
    builtin: true,
    recipes: {
      armor: r('Khorne Red', 'Nuln Oil', 'Wazdakka Red'),
      armor2: r('Abaddon Black', null, 'Eshin Grey'),
      trim: metalBrass,
      metal: r('Leadbelcher', 'Nuln Oil', null, { drybrush: effect('Blood for the Blood God', 0.35) }),
      lenses: greenLens,
      cloth: r('Rhinox Hide', 'Agrax Earthshade', 'Skrag Brown'),
      leather,
      skin,
      weapon: r('Leadbelcher', 'Nuln Oil', 'Stormhost Silver'),
      base: r('Mournfang Brown', 'Agrax Earthshade', null, { drybrush: effect('Karak Stone', 0.55) }),
    },
  },
  {
    id: 'custodes',
    name: 'Adeptus Custodes',
    faction: 'Adeptus Custodes',
    description: 'Or impérial, capes rouges.',
    builtin: true,
    recipes: {
      armor: r('Retributor Armour', 'Reikland Fleshshade', 'Liberator Gold'),
      armor2: r('Retributor Armour', 'Reikland Fleshshade', 'Liberator Gold'),
      trim: r('Mephiston Red', 'Carroburg Crimson', 'Evil Sunz Scarlet'),
      metal: metalSilver,
      lenses: greenLens,
      cloth: r('Khorne Red', 'Carroburg Crimson', 'Wazdakka Red'),
      leather: r('Abaddon Black', null, 'Eshin Grey'),
      skin,
      weapon: metalSilver,
      base: r('Mechanicus Standard Grey', 'Nuln Oil', null, { drybrush: effect('Administratum Grey', 0.55) }),
    },
  },
  {
    id: 'sororitas',
    name: 'Adepta Sororitas — Rose Ensanglantée',
    faction: 'Adepta Sororitas',
    description: 'Armure noire, robes rouges, parchemins.',
    builtin: true,
    recipes: {
      armor: r('Abaddon Black', null, 'Eshin Grey', { finish: 'satin' }),
      armor2: r('Abaddon Black', null, 'Eshin Grey'),
      trim: metalGold,
      metal: metalSilver,
      lenses: greenLens,
      cloth: r('Mephiston Red', 'Carroburg Crimson', 'Evil Sunz Scarlet'),
      leather,
      skin: r('Cadian Fleshtone', 'Reikland Fleshshade', 'Kislev Flesh'),
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: desertBase,
    },
  },
  {
    id: 'ulthwe',
    name: 'Aeldari — Ulthwé',
    faction: 'Aeldari',
    description: 'Noir profond, os, gemmes rouges.',
    builtin: true,
    recipes: {
      armor: r('Abaddon Black', null, 'Eshin Grey', { finish: 'satin' }),
      armor2: r('Wraithbone', 'Seraphim Sepia', 'Ushabti Bone'),
      trim: r('Wraithbone', null, 'White Scar'),
      metal: metalSilver,
      lenses: redLens,
      cloth: r('Naggaroth Night', 'Druchii Violet', 'Xereus Purple'),
      leather,
      skin,
      weapon: r('Abaddon Black', null, 'Eshin Grey'),
      base: r('Mechanicus Standard Grey', 'Nuln Oil', null, { drybrush: effect('Administratum Grey', 0.55) }),
    },
  },
  {
    id: 'contrast-speed',
    name: 'Speedpaint Contrast',
    faction: 'Méthode rapide',
    description: 'Tout en Contrast sur sous-couche Wraithbone.',
    builtin: true,
    recipes: {
      armor: r('Ultramarines Blue', null, null),
      armor2: r('Black Templar', null, null),
      trim: r('Iyanden Yellow', null, null),
      metal: r('Leadbelcher', 'Nuln Oil', null),
      lenses: r('Blood Angels Red', null, null),
      cloth: r('Skeleton Horde', null, null),
      leather: r('Snakebite Leather', null, null),
      skin: r('Guilliman Flesh', null, null),
      weapon: r('Black Templar', null, null),
      base: r('Aggaros Dunes', null, null),
    },
  },
];

/** Applique une recette de schéma à une zone en conservant son identité. */
export function applyRecipe(zone: Zone, recipe: Partial<ZoneRecipe> | undefined): Zone {
  if (!recipe) return zone;
  const d = defaultRecipe();
  return {
    ...zone,
    ...d,
    ...recipe,
    opacity: zone.opacity,
    wash: { ...d.wash, ...recipe.wash },
    highlight: { ...d.highlight, ...recipe.highlight },
    drybrush: { ...d.drybrush, ...recipe.drybrush },
  };
}

export function recipeOf(zone: Zone): ZoneRecipe {
  const { id: _id, name: _n, role: _r, visible: _v, ...rest } = zone;
  return structuredClone(rest);
}

export function findPaint(id?: string) {
  return id ? PAINTS.find((p) => p.id === id) : undefined;
}

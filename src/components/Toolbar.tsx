import { useStore } from '../store';
import type { Tool } from '../types';
import type { CombineMode } from '../engine/maskTools';
import { IconButton, Segmented, Slider, Toggle } from './ui';

export const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'brush', icon: 'brush', label: 'Pinceau', key: 'B' },
  { id: 'eraser', icon: 'eraser', label: 'Gomme', key: 'E' },
  { id: 'wand', icon: 'wand', label: 'Baguette magique', key: 'W' },
  { id: 'lasso', icon: 'lasso', label: 'Lasso', key: 'L' },
  { id: 'picker', icon: 'picker', label: 'Pipette (trouver la peinture)', key: 'I' },
  { id: 'hand', icon: 'hand', label: 'Déplacer la vue', key: 'H' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const set = useStore((s) => s.set);
  return (
    <nav className="toolbar" aria-label="Outils">
      {TOOLS.map((t) => (
        <IconButton key={t.id} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.id} onClick={() => set({ tool: t.id })} size={20} />
      ))}
    </nav>
  );
}

const MODES: { value: CombineMode; label: string }[] = [
  { value: 'add', label: 'Ajouter' },
  { value: 'subtract', label: 'Retirer' },
  { value: 'replace', label: 'Remplacer' },
];

export function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const brush = useStore((s) => s.brush);
  const wand = useStore((s) => s.wand);
  const lassoMode = useStore((s) => s.lassoMode);
  const zone = useStore((s) => s.zones.find((z) => z.id === s.activeZoneId));
  const set = useStore((s) => s.set);
  const label = TOOLS.find((t) => t.id === tool)?.label;

  return (
    <div className="tool-options">
      <span className="tool-name">{label}</span>
      {zone && tool !== 'hand' && tool !== 'picker' && (
        <span className="tool-zone">
          <span className="role-dot" style={{ background: zone.base.hex }} /> {zone.name}
        </span>
      )}
      {(tool === 'brush' || tool === 'eraser') && (
        <>
          <Slider label="Taille" value={brush.size} min={1} max={300} step={1} onChange={(size) => set({ brush: { ...brush, size } })} format={(v) => `${v}px`} />
          <Slider label="Dureté" value={brush.hardness} min={0} max={1} onChange={(hardness) => set({ brush: { ...brush, hardness } })} format={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Opacité" value={brush.flow} min={0.05} max={1} onChange={(flow) => set({ brush: { ...brush, flow } })} format={(v) => `${Math.round(v * 100)}%`} />
          <Toggle checked={brush.smart} onChange={(smart) => set({ brush: { ...brush, smart } })} label="Bords intelligents" />
          {brush.smart && (
            <Slider label="Tolérance" value={brush.smartTolerance} min={2} max={80} step={1} onChange={(smartTolerance) => set({ brush: { ...brush, smartTolerance } })} />
          )}
          <span className="hint">Alt : {tool === 'brush' ? 'pipette' : 'pipette'} · [ ] taille</span>
        </>
      )}
      {tool === 'wand' && (
        <>
          <Segmented value={wand.mode} options={MODES} onChange={(mode) => set({ wand: { ...wand, mode } })} />
          <Slider label="Tolérance" value={wand.tolerance} min={1} max={80} step={1} onChange={(tolerance) => set({ wand: { ...wand, tolerance } })} />
          <Slider label="Adoucir" value={wand.feather} min={0} max={10} step={1} onChange={(feather) => set({ wand: { ...wand, feather } })} format={(v) => `${v}px`} />
          <Toggle checked={wand.contiguous} onChange={(contiguous) => set({ wand: { ...wand, contiguous } })} label="Contigu" />
          <span className="hint">Maj : ajouter · Alt : retirer</span>
        </>
      )}
      {tool === 'lasso' && (
        <>
          <Segmented value={lassoMode} options={MODES} onChange={(lassoMode) => set({ lassoMode })} />
          <span className="hint">Tracez le contour à main levée · Maj : ajouter · Alt : retirer</span>
        </>
      )}
      {tool === 'picker' && <span className="hint">Cliquez sur la photo pour trouver la peinture la plus proche et générer des harmonies.</span>}
      {tool === 'hand' && <span className="hint">Glissez pour déplacer · molette pour zoomer · Espace maintenu = main temporaire</span>}
    </div>
  );
}

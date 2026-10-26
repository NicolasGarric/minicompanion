import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Tool } from '../types';
import type { CombineMode } from '../engine/maskTools';
import { k, useT } from '../../core/i18n';
import { Icon, IconButton, Segmented, Slider, Toggle } from '../../core/ui/ui';

export const TOOLS: { id: Tool; icon: string; key: string }[] = [
  { id: 'picker', icon: 'picker', key: 'I' },   // v2: tap the image to select the colour under the finger
  { id: 'part', icon: 'target', key: 'P' },     // tap a part of a primed miniature to make it an area
  { id: 'brush', icon: 'brush', key: 'B' },
  { id: 'eraser', icon: 'eraser', key: 'E' },
  { id: 'lasso', icon: 'lasso', key: 'L' },
  { id: 'wand', icon: 'wand', key: 'W' },
  { id: 'hand', icon: 'hand', key: 'H' },
];

export function Toolbar() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const set = useStore((s) => s.set);
  return (
    <nav className="toolbar" aria-label={t('tools.label')}>
      {TOOLS.map((x) => (
        <IconButton key={x.id} icon={x.icon} label={t(k(`tool.${x.id}`))} shortcut={x.key} active={tool === x.id} onClick={() => set({ tool: x.id })} size={20} />
      ))}
    </nav>
  );
}

export function ToolOptions() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const brush = useStore((s) => s.brush);
  const wand = useStore((s) => s.wand);
  const lassoMode = useStore((s) => s.lassoMode);
  const partSensitivity = useStore((s) => s.partSensitivity);
  const partMode = useStore((s) => s.partMode);
  const protectBackground = useStore((s) => s.protectBackground);
  const zone = useStore((s) => s.zones.find((z) => z.id === s.activeZoneId));
  const set = useStore((s) => s.set);
  const modes: { value: CombineMode; label: string }[] = (['add', 'subtract', 'replace'] as CombineMode[]).map((m) => ({ value: m, label: t(k(`mode.${m}`)) }));
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  // Mobile: the options unroll downwards from a one-line summary, over the top of the canvas.
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const summary = tool === 'brush' || tool === 'eraser' ? `${brush.size}px · ${percent(brush.hardness)}` : tool === 'wand' ? `${wand.tolerance}` : '';

  return (
    <div className={`tool-options ${open ? 'open' : ''}`} ref={box}>
      <button type="button" className="tool-options-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <strong>{t(k(`tool.${tool}`))}</strong>
        {zone && tool !== 'hand' && tool !== 'picker' && <span className="role-dot" style={{ background: zone.base.hex }} />}
        <span className="muted">{summary}</span>
        <span className="spacer" />
        <span className="small">{t('tools.settings')}</span>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </button>
      <div className="tool-options-body">
      <span className="tool-name">{t(k(`tool.${tool}`))}</span>
      {zone && tool !== 'hand' && tool !== 'picker' && (
        <span className="tool-zone">
          <span className="role-dot" style={{ background: zone.base.hex }} /> {zone.name}
        </span>
      )}
      {(tool === 'brush' || tool === 'eraser') && (
        <>
          <Slider label={t('brush.size')} value={brush.size} min={1} max={300} step={1} onChange={(size) => set({ brush: { ...brush, size } })} format={(v) => `${v}px`} />
          <Slider label={t('brush.hardness')} value={brush.hardness} min={0} max={1} onChange={(hardness) => set({ brush: { ...brush, hardness } })} format={percent} />
          <Slider label={t('brush.opacity')} value={brush.flow} min={0.05} max={1} onChange={(flow) => set({ brush: { ...brush, flow } })} format={percent} />
          <Toggle checked={brush.smart} onChange={(smart) => set({ brush: { ...brush, smart } })} label={t('brush.smart')} />
          {brush.smart && (
            <Slider label={t('brush.tolerance')} value={brush.smartTolerance} min={2} max={80} step={1} onChange={(smartTolerance) => set({ brush: { ...brush, smartTolerance } })} />
          )}
          <span className="hint hide-sm">{t('brush.hint')}</span>
        </>
      )}
      {tool === 'wand' && (
        <>
          <Segmented value={wand.mode} options={modes} onChange={(mode) => set({ wand: { ...wand, mode } })} />
          <Slider label={t('brush.tolerance')} value={wand.tolerance} min={1} max={80} step={1} onChange={(tolerance) => set({ wand: { ...wand, tolerance } })} />
          <Slider label={t('wand.feather')} value={wand.feather} min={0} max={10} step={1} onChange={(feather) => set({ wand: { ...wand, feather } })} format={(v) => `${v}px`} />
          <Toggle checked={wand.contiguous} onChange={(contiguous) => set({ wand: { ...wand, contiguous } })} label={t('wand.contiguous')} />
          <span className="hint hide-sm">{t('select.hint')}</span>
        </>
      )}
      {tool === 'lasso' && (
        <>
          <Segmented value={lassoMode} options={modes} onChange={(lassoMode) => set({ lassoMode })} />
          <span className="hint hide-sm">{t('lasso.hint')}</span>
        </>
      )}
      {tool === 'part' && (
        <>
          <Segmented
            value={partMode}
            options={[
              { value: 'new', label: t('part.modeNew') },
              { value: 'add', label: t('part.modeAdd') },
            ]}
            onChange={(v) => set({ partMode: v })}
          />
          <Slider label={t('part.sensitivity')} value={partSensitivity} min={1} max={10} step={1} onChange={(v) => set({ partSensitivity: v })} />
          <span className="hint">{t('part.hint')}</span>
        </>
      )}
      {(tool === 'brush' || tool === 'lasso' || tool === 'wand' || tool === 'part') && (
        <Toggle checked={protectBackground} onChange={(v) => set({ protectBackground: v })} label={t('tools.protectBackground')} />
      )}
      {tool === 'picker' && <span className="hint">{t('picker.hint')}</span>}
      {tool === 'hand' && <span className="hint">{t('hand.hint')}</span>}
      </div>
    </div>
  );
}

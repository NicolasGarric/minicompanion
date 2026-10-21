import { useState } from 'react';
import { paintById, useStore } from '../store';
import { ROLES, roleLabel } from '../data/presets';
import type { EffectLayer, Finish, RoleId, SlotId, Zone } from '../types';
import { k, useT } from '../i18n';
import { ColorInput, Icon, IconButton, Menu, pct, Segmented, Slider, Swatch, Toggle } from './ui';

export function ZonesPanel() {
  const t = useT();
  const zones = useStore((s) => s.zones);
  const activeZoneId = useStore((s) => s.activeZoneId);
  const { addZone, setActiveZone, updateZone, removeZone, duplicateZone, moveZone } = useStore.getState();
  const active = zones.find((z) => z.id === activeZoneId);

  return (
    <div className="zones-panel">
      <div className="panel-head">
        <h3><Icon name="layers" size={16} /> {t('zones.title')}</h3>
        <Menu
          trigger={(open) => (
            <button className="btn small primary" onClick={open}>
              <Icon name="plus" size={14} /> {t('zones.add')}
            </button>
          )}
        >
          {(close) =>
            ROLES.map((r) => (
              <button key={r.id} className="menu-item" onClick={() => { addZone(r.id); close(); }}>
                <span className="role-dot" style={{ background: r.color }} /> {roleLabel(r.id)}
              </button>
            ))
          }
        </Menu>
      </div>

      <ul className="zone-list">
        {zones.length === 0 && <li className="hint">{t('zones.empty')}</li>}
        {/* Last zone renders on top, so the list is shown top-first */}
        {[...zones].reverse().map((z) => (
          <li key={z.id} className={`zone-row ${z.id === activeZoneId ? 'active' : ''} ${z.visible ? '' : 'hidden'}`} onClick={() => setActiveZone(z.id)}>
            <span className="zone-swatches">
              <Swatch hex={z.base.hex} size={26} />
              <span className="fx-dots">
                {z.wash.enabled && <i style={{ background: z.wash.hex }} title={t('slot.wash')} />}
                {z.drybrush.enabled && <i style={{ background: z.drybrush.hex }} title={t('slot.drybrush')} />}
                {z.highlight.enabled && <i style={{ background: z.highlight.hex }} title={t('slot.highlight')} />}
              </span>
            </span>
            <span className="zone-text">
              <strong>{z.name}</strong>
              <small>{roleLabel(z.role)}</small>
            </span>
            <span className="zone-actions" onClick={(e) => e.stopPropagation()}>
              <IconButton icon={z.visible ? 'eye' : 'eyeOff'} label={t(z.visible ? 'zones.hide' : 'zones.show')} size={15} onClick={() => updateZone(z.id, { visible: !z.visible })} />
              <Menu trigger={(open) => <IconButton icon="more" label={t('common.actions')} size={15} onClick={open} />}>
                {(close) => (
                  <>
                    <button className="menu-item" onClick={() => { moveZone(z.id, 1); close(); }}><Icon name="up" size={14} /> {t('zones.moveUp')}</button>
                    <button className="menu-item" onClick={() => { moveZone(z.id, -1); close(); }}><Icon name="down" size={14} /> {t('zones.moveDown')}</button>
                    <button className="menu-item" onClick={() => { duplicateZone(z.id); close(); }}><Icon name="copy" size={14} /> {t('zones.duplicate')}</button>
                    <button className="menu-item danger" onClick={() => { removeZone(z.id); close(); }}><Icon name="trash" size={14} /> {t('common.delete')}</button>
                  </>
                )}
              </Menu>
            </span>
          </li>
        ))}
      </ul>

      {active ? <ZoneEditor zone={active} /> : null}
    </div>
  );
}

const SLOTS: Exclude<SlotId, 'base'>[] = ['wash', 'drybrush', 'highlight'];

function ZoneEditor({ zone }: { zone: Zone }) {
  const t = useT();
  const updateZone = useStore((s) => s.updateZone);
  const activeSlot = useStore((s) => s.activeSlot);
  const library = useStore((s) => s.library);
  const set = useStore((s) => s.set);
  const maskOp = useStore((s) => s.maskOp);
  const [amount, setAmount] = useState(3);
  const up = (patch: Partial<Zone>, key?: string) => updateZone(zone.id, patch, key);
  const selectSlot = (slot: SlotId) => set({ activeSlot: slot, rightTab: 'palette' });
  const basePaint = paintById(zone.base.paintId, library);

  return (
    <div className="zone-editor">
      <div className="field-row">
        <input className="text-input grow" value={zone.name} onChange={(e) => up({ name: e.target.value }, 'name')} aria-label={t('zones.name')} />
        <select className="select" value={zone.role} onChange={(e) => up({ role: e.target.value as RoleId })} aria-label={t('zones.role')}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.id)}</option>)}
        </select>
      </div>

      <div className="section-title">{t('zones.paint')} <span className="muted">— {t('zones.paintHint')}</span></div>

      <div className={`slot base-slot ${activeSlot === 'base' ? 'targeted' : ''}`} onClick={() => selectSlot('base')} role="button" tabIndex={0}>
        <Swatch hex={zone.base.hex} size={40} />
        <div className="slot-text">
          <small>{t(zone.contrast ? 'slot.contrast' : 'slot.base')}</small>
          <strong>{basePaint?.name ?? zone.base.hex.toUpperCase()}</strong>
          <span className="muted">{basePaint ? `${basePaint.brand} · ${basePaint.range}` : t('slot.freeColor')}</span>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <ColorInput value={zone.base.hex} onChange={(hex) => up({ base: { hex } }, 'base')} />
        </span>
      </div>

      {SLOTS.map((id) => (
        <EffectSlot
          key={id}
          slot={id}
          layer={zone[id]}
          targeted={activeSlot === id}
          onTarget={() => selectSlot(id)}
          onChange={(l) => up({ [id]: { ...zone[id], ...l } } as Partial<Zone>, id)}
        />
      ))}

      <div className="section-title">{t('zones.render')}</div>
      <Segmented<Finish>
        value={zone.finish}
        onChange={(finish) => up({ finish })}
        options={(['mat', 'satin', 'gloss', 'metal'] as Finish[]).map((f) => ({ value: f, label: t(k(`finish.${f}`)) }))}
      />
      <Toggle checked={zone.contrast} onChange={(contrast) => up({ contrast })} label={t('zones.contrastToggle')} />
      <Slider label={t('zones.shading')} value={zone.shading} min={0} max={2} onChange={(shading) => up({ shading }, 'shading')} format={pct} />
      <Slider label={t('zones.brightness')} value={zone.brightness} min={-1} max={1} onChange={(brightness) => up({ brightness }, 'brightness')} format={(v) => (v > 0 ? '+' : '') + v.toFixed(2)} />
      <Slider label={t('zones.opacity')} value={zone.opacity} min={0} max={1} onChange={(opacity) => up({ opacity }, 'opacity')} format={pct} />

      <div className="section-title">{t('zones.mask')}</div>
      <div className="mask-ops">
        <button className="btn small" onClick={() => maskOp('grow', amount)}>{t('mask.grow')}</button>
        <button className="btn small" onClick={() => maskOp('shrink', amount)}>{t('mask.shrink')}</button>
        <button className="btn small" onClick={() => maskOp('feather', amount)}>{t('mask.feather')}</button>
        <input className="num-input" type="number" min={1} max={30} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} aria-label="px" />
        <span className="muted">px</span>
      </div>
      <div className="mask-ops">
        <button className="btn small" onClick={() => maskOp('invert')}>{t('mask.invert')}</button>
        <button className="btn small" onClick={() => maskOp('fill')}>{t('mask.fill')}</button>
        <button className="btn small danger-ghost" onClick={() => maskOp('clear')}>{t('mask.clear')}</button>
      </div>
    </div>
  );
}

function EffectSlot({
  slot,
  layer,
  targeted,
  onTarget,
  onChange,
}: {
  slot: Exclude<SlotId, 'base'>;
  layer: EffectLayer;
  targeted: boolean;
  onTarget: () => void;
  onChange: (l: Partial<EffectLayer>) => void;
}) {
  const t = useT();
  const library = useStore((s) => s.library);
  const p = paintById(layer.paintId, library);
  return (
    <div className={`slot ${targeted ? 'targeted' : ''} ${layer.enabled ? '' : 'off'}`} onClick={onTarget} role="button" tabIndex={0}>
      <div className="slot-main">
        <Swatch hex={layer.hex} size={30} />
        <div className="slot-text">
          <small>{t(k(`slot.${slot}`))}</small>
          <strong>{layer.enabled ? p?.name ?? layer.hex.toUpperCase() : t('slot.none')}</strong>
          <span className="muted">{layer.enabled ? (p ? `${p.brand} · ${p.range}` : t('slot.freeColor')) : t(k(`slot.${slot}.hint`))}</span>
        </div>
        <span className="slot-tools" onClick={(e) => e.stopPropagation()}>
          <ColorInput value={layer.hex} onChange={(hex) => onChange({ hex, paintId: undefined, enabled: true })} />
          <Toggle checked={layer.enabled} onChange={(enabled) => onChange({ enabled })} />
        </span>
      </div>
      {layer.enabled && (
        <div onClick={(e) => e.stopPropagation()}>
          <Slider label={t('slot.amount')} value={layer.amount} min={0} max={1} onChange={(amount) => onChange({ amount })} format={pct} />
        </div>
      )}
    </div>
  );
}

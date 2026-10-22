import { useState } from 'react';
import { paintById, useStore } from '../store';
import { ROLES, roleLabel } from '../data/presets';
import type { EffectLayer, Finish, RoleId, SlotId, Zone } from '../types';
import { k, useT } from '../../core/i18n';
import { ColorInput, pct, Segmented, Slider, Swatch, Toggle } from '../../core/ui/ui';

const SLOTS: Exclude<SlotId, 'base'>[] = ['wash', 'drybrush', 'highlight'];

/** "Effects" (advanced mode) for one zone: wash, drybrush, highlight, finish, shading, mask tools. */
export function ZoneEffects({ zone, onPickPaint }: { zone: Zone; onPickPaint: (slot: SlotId) => void }) {
  const t = useT();
  const updateZone = useStore((s) => s.updateZone);
  const maskOp = useStore((s) => s.maskOp);
  const [amount, setAmount] = useState(3);
  const up = (patch: Partial<Zone>, key?: string) => updateZone(zone.id, patch, key);

  return (
    <div className="zone-effects">
      {SLOTS.map((id) => (
        <EffectSlot
          key={id}
          slot={id}
          layer={zone[id]}
          onPick={() => onPickPaint(id)}
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
      <Slider label={t('zones.brightness')} value={zone.brightness} min={-1} max={1} onChange={(brightness) => up({ brightness }, 'brightness')} format={(v) => (v > 0 ? '+' : '') + v.toFixed(2)} />
      <Slider label={t('zones.opacity')} value={zone.opacity} min={0} max={1} onChange={(opacity) => up({ opacity }, 'opacity')} format={pct} />
      <label className="field">
        <span>{t('zones.role')}</span>
        <select className="select" value={zone.role} onChange={(e) => up({ role: e.target.value as RoleId })}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{roleLabel(r.id)}</option>)}
        </select>
        <small className="hint">{t('zones.roleHint')}</small>
      </label>

      <div className="section-title">{t('zones.mask')}</div>
      <div className="mask-ops">
        <button className="btn small" onClick={() => maskOp('grow', amount)}>{t('mask.grow')}</button>
        <button className="btn small" onClick={() => maskOp('shrink', amount)}>{t('mask.shrink')}</button>
        <button className="btn small" onClick={() => maskOp('feather', amount)}>{t('mask.feather')}</button>
        <input className="num-input" type="number" min={1} max={30} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} aria-label="px" />
        <span className="muted">px</span>
      </div>
    </div>
  );
}

function EffectSlot({
  slot,
  layer,
  onPick,
  onChange,
}: {
  slot: Exclude<SlotId, 'base'>;
  layer: EffectLayer;
  onPick: () => void;
  onChange: (l: Partial<EffectLayer>) => void;
}) {
  const t = useT();
  const library = useStore((s) => s.library);
  const p = paintById(layer.paintId, library);
  return (
    <div className={`slot ${layer.enabled ? '' : 'off'}`}>
      <div className="slot-main">
        <button className="slot-pick" onClick={onPick} title={t('colours.pickPaint')}>
          <Swatch hex={layer.hex} size={30} />
          <span className="slot-text">
            <small>{t(k(`slot.${slot}`))}</small>
            <strong>{layer.enabled ? p?.name ?? layer.hex.toUpperCase() : t('slot.none')}</strong>
            <span className="muted">{layer.enabled ? (p ? `${p.brand} · ${p.range}` : t('slot.freeColor')) : t(k(`slot.${slot}.hint`))}</span>
          </span>
        </button>
        <span className="slot-tools">
          <ColorInput value={layer.hex} onChange={(hex) => onChange({ hex, paintId: undefined, enabled: true })} />
          <Toggle checked={layer.enabled} onChange={(enabled) => onChange({ enabled })} />
        </span>
      </div>
      {layer.enabled && (
        <Slider label={t('slot.amount')} value={layer.amount} min={0} max={1} onChange={(amount) => onChange({ amount })} format={pct} />
      )}
    </div>
  );
}

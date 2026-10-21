import { useState } from 'react';
import { paintById, useStore } from '../store';
import { ROLES, roleLabel } from '../data/presets';
import type { EffectLayer, Finish, RoleId, SlotId, Zone } from '../types';
import { ColorInput, Icon, IconButton, Menu, pct, Segmented, Slider, Swatch, Toggle } from './ui';

export function ZonesPanel() {
  const zones = useStore((s) => s.zones);
  const activeZoneId = useStore((s) => s.activeZoneId);
  const { addZone, setActiveZone, updateZone, removeZone, duplicateZone, moveZone } = useStore.getState();
  const active = zones.find((z) => z.id === activeZoneId);

  return (
    <aside className="panel zones-panel">
      <div className="panel-head">
        <h3><Icon name="layers" size={16} /> Zones</h3>
        <Menu
          trigger={(open) => (
            <button className="btn small primary" onClick={open}>
              <Icon name="plus" size={14} /> Zone
            </button>
          )}
        >
          {(close) =>
            ROLES.map((r) => (
              <button key={r.id} className="menu-item" onClick={() => { addZone(r.id); close(); }}>
                <span className="role-dot" style={{ background: r.color }} /> {r.label}
              </button>
            ))
          }
        </Menu>
      </div>

      <ul className="zone-list">
        {zones.length === 0 && <li className="hint">Ajoutez une zone, puis peignez-la sur la photo.</li>}
        {[...zones].reverse().map((z) => (
          <li
            key={z.id}
            className={`zone-row ${z.id === activeZoneId ? 'active' : ''} ${z.visible ? '' : 'hidden'}`}
            onClick={() => setActiveZone(z.id)}
          >
            <span className="zone-swatches">
              <Swatch hex={z.base.hex} size={26} />
              <span className="fx-dots">
                {z.wash.enabled && <i style={{ background: z.wash.hex }} title="Lavis" />}
                {z.drybrush.enabled && <i style={{ background: z.drybrush.hex }} title="Brossage à sec" />}
                {z.highlight.enabled && <i style={{ background: z.highlight.hex }} title="Éclaircissement" />}
              </span>
            </span>
            <span className="zone-text">
              <strong>{z.name}</strong>
              <small>{roleLabel(z.role)}</small>
            </span>
            <span className="zone-actions" onClick={(e) => e.stopPropagation()}>
              <IconButton icon={z.visible ? 'eye' : 'eyeOff'} label={z.visible ? 'Masquer' : 'Afficher'} size={15} onClick={() => updateZone(z.id, { visible: !z.visible })} />
              <Menu trigger={(open) => <IconButton icon="more" label="Actions" size={15} onClick={open} />}>
                {(close) => (
                  <>
                    <button className="menu-item" onClick={() => { moveZone(z.id, 1); close(); }}><Icon name="up" size={14} /> Monter</button>
                    <button className="menu-item" onClick={() => { moveZone(z.id, -1); close(); }}><Icon name="down" size={14} /> Descendre</button>
                    <button className="menu-item" onClick={() => { duplicateZone(z.id); close(); }}><Icon name="copy" size={14} /> Dupliquer</button>
                    <button className="menu-item danger" onClick={() => { removeZone(z.id); close(); }}><Icon name="trash" size={14} /> Supprimer</button>
                  </>
                )}
              </Menu>
            </span>
          </li>
        ))}
      </ul>

      {active ? <ZoneEditor zone={active} /> : null}
    </aside>
  );
}

const SLOTS: { id: Exclude<SlotId, 'base'>; label: string; hint: string }[] = [
  { id: 'wash', label: 'Lavis', hint: 'Se dépose dans les creux' },
  { id: 'drybrush', label: 'Brossage à sec', hint: 'Accroche les reliefs texturés' },
  { id: 'highlight', label: 'Éclaircissement', hint: 'Souligne les arêtes' },
];

function ZoneEditor({ zone }: { zone: Zone }) {
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
        <input className="text-input grow" value={zone.name} onChange={(e) => up({ name: e.target.value }, 'name')} aria-label="Nom de la zone" />
        <select className="select" value={zone.role} onChange={(e) => up({ role: e.target.value as RoleId })} aria-label="Rôle">
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>

      <div className="section-title">Peinture <span className="muted">— cliquez un emplacement puis une peinture</span></div>

      <div
        className={`slot base-slot ${activeSlot === 'base' ? 'targeted' : ''}`}
        onClick={() => selectSlot('base')}
        role="button"
        tabIndex={0}
      >
        <Swatch hex={zone.base.hex} size={40} />
        <div className="slot-text">
          <small>{zone.contrast ? 'Contrast / Speedpaint' : 'Couleur de base'}</small>
          <strong>{basePaint?.name ?? zone.base.hex.toUpperCase()}</strong>
          <span className="muted">{basePaint ? `${basePaint.brand} · ${basePaint.range}` : 'Couleur libre'}</span>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <ColorInput value={zone.base.hex} onChange={(hex) => up({ base: { hex } }, 'base')} />
        </span>
      </div>

      {SLOTS.map((s) => (
        <EffectSlot
          key={s.id}
          label={s.label}
          hint={s.hint}
          layer={zone[s.id]}
          targeted={activeSlot === s.id}
          onTarget={() => selectSlot(s.id)}
          onChange={(l) => up({ [s.id]: { ...zone[s.id], ...l } } as Partial<Zone>, s.id)}
        />
      ))}

      <div className="section-title">Rendu</div>
      <Segmented<Finish>
        value={zone.finish}
        onChange={(finish) => up({ finish })}
        options={[
          { value: 'mat', label: 'Mat' },
          { value: 'satin', label: 'Satiné' },
          { value: 'gloss', label: 'Brillant' },
          { value: 'metal', label: 'Métal' },
        ]}
      />
      <Toggle checked={zone.contrast} onChange={(contrast) => up({ contrast })} label="Effet Contrast (pigment translucide)" />
      <Slider label="Ombrage de la photo" value={zone.shading} min={0} max={2} onChange={(shading) => up({ shading }, 'shading')} format={pct} />
      <Slider label="Luminosité" value={zone.brightness} min={-1} max={1} onChange={(brightness) => up({ brightness }, 'brightness')} format={(v) => (v > 0 ? '+' : '') + v.toFixed(2)} />
      <Slider label="Opacité" value={zone.opacity} min={0} max={1} onChange={(opacity) => up({ opacity }, 'opacity')} format={pct} />

      <div className="section-title">Masque</div>
      <div className="mask-ops">
        <button className="btn small" onClick={() => maskOp('grow', amount)} title="Étendre le masque">Étendre</button>
        <button className="btn small" onClick={() => maskOp('shrink', amount)} title="Réduire le masque">Réduire</button>
        <button className="btn small" onClick={() => maskOp('feather', amount)} title="Adoucir les bords">Adoucir</button>
        <input className="num-input" type="number" min={1} max={30} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} aria-label="Pixels" />
        <span className="muted">px</span>
      </div>
      <div className="mask-ops">
        <button className="btn small" onClick={() => maskOp('invert')}>Inverser</button>
        <button className="btn small" onClick={() => maskOp('fill')}>Tout remplir</button>
        <button className="btn small danger-ghost" onClick={() => maskOp('clear')}>Effacer</button>
      </div>
    </div>
  );
}

function EffectSlot({
  label,
  hint,
  layer,
  targeted,
  onTarget,
  onChange,
}: {
  label: string;
  hint: string;
  layer: EffectLayer;
  targeted: boolean;
  onTarget: () => void;
  onChange: (l: Partial<EffectLayer>) => void;
}) {
  const library = useStore((s) => s.library);
  const p = paintById(layer.paintId, library);
  return (
    <div className={`slot ${targeted ? 'targeted' : ''} ${layer.enabled ? '' : 'off'}`} onClick={onTarget} role="button" tabIndex={0}>
      <div className="slot-main">
        <Swatch hex={layer.hex} size={30} />
        <div className="slot-text">
          <small>{label}</small>
          <strong>{layer.enabled ? p?.name ?? layer.hex.toUpperCase() : 'Aucun'}</strong>
          <span className="muted">{layer.enabled ? (p ? `${p.brand} · ${p.range}` : 'Couleur libre') : hint}</span>
        </div>
        <span className="slot-tools" onClick={(e) => e.stopPropagation()}>
          <ColorInput value={layer.hex} onChange={(hex) => onChange({ hex, paintId: undefined, enabled: true })} />
          <Toggle checked={layer.enabled} onChange={(enabled) => onChange({ enabled })} />
        </span>
      </div>
      {layer.enabled && (
        <div onClick={(e) => e.stopPropagation()}>
          <Slider label="Intensité" value={layer.amount} min={0} max={1} onChange={(amount) => onChange({ amount })} format={pct} />
        </div>
      )}
    </div>
  );
}

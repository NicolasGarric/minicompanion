import { useEffect, useMemo, useRef, useState } from 'react';
import { allPaints, MAX_BASE_PAINTS, paintById, useStore } from '../store';
import type { Paint, Primer, SlotId, Tool, Zone } from '../types';
import { nearestPaints } from '../../core/lib/color';
import { similarity } from '../lib/beginner';
import { k, useT } from '../../core/i18n';
import { usePrefs } from '../../core/prefs';
import { BRANDS } from '../data/paints';
import { ColorInput, Icon, IconButton, Modal, pct, Slider, Swatch, Toggle } from '../../core/ui/ui';
import { PalettePanel } from './PalettePanel';
import { ZoneEffects } from './ZoneEffects';

/**
 * Varied starting colours, used instead of "closest paints" when the zone has no real colour to match
 * (grey-primed photo, drawn area): blue, red, green, yellow, bone, steel, black, brass.
 */
const STARTER_HEXES = ['#0d407f', '#960c09', '#1f5429', '#fbb81c', '#dbd1b2', '#888d8f', '#231f20', '#a47552'];

/** Step 2: the reference colours of the image, each one editable with a live render. */
export function StepColours() {
  const t = useT();
  const zones = useStore((s) => s.zones);
  const activeZoneId = useStore((s) => s.activeZoneId);
  const pickMode = useStore((s) => s.pickMode);
  const analysing = useStore((s) => s.analysing);
  const greyscale = useStore((s) => s.greyscale);
  const { analyseColours, addManualZone } = useStore.getState();
  // Which slot the paint catalogue fills: a zone slot, or the primer.
  const [catalog, setCatalog] = useState<SlotId | 'primer' | null>(null);

  // The background shows up in the list only once the user brings it back into the scheme.
  const colours = zones.filter((z) => z.source === 'auto' && (!z.isBackground || z.visible));
  // Drawn areas are layers: the last one is on top, so it is listed first.
  const drawn = zones.filter((z) => z.source !== 'auto').reverse();
  const background = zones.find((z) => z.isBackground);

  const figureColours = colours.filter((z) => !z.isBackground).length;
  // "+ Add a paint": the next tap on the image picks the new colour (tap again to cancel).
  const toggleAdd = () => useStore.getState().set(pickMode === 'add' ? { pickMode: 'select' } : { pickMode: 'add', tool: 'picker' });

  return (
    <div className="step-colours">
      <PrimerCard onCatalog={() => setCatalog('primer')} />

      <div className="colour-count">
        <div>
          <strong>{t('colours.count', { count: figureColours })}</strong>
          <small className="muted">{t('colours.countHint')}</small>
        </div>
        <div className="field-row" aria-busy={analysing}>
          {analysing && <span className="spinner small" />}
          <button className={`btn small ${pickMode === 'add' ? 'primary' : ''}`} onClick={toggleAdd} disabled={colours.length >= MAX_BASE_PAINTS} aria-pressed={pickMode === 'add'}>
            <Icon name="plus" size={14} /> {t('colours.add')}
          </button>
          <IconButton icon="sparkle" label={t('colours.redetect')} onClick={() => analyseColours()} disabled={analysing} />
        </div>
      </div>
      {pickMode === 'add' && <p className="notice small" role="status">{t('colours.addHint')}</p>}
      <BrandSelect />
      {greyscale ? (
        <div className="notice">
          <strong>{t('colours.greyTitle')}</strong>
          <p>{t('colours.greyscale')}</p>
          <div className="field-row">
            <button className="btn small primary" onClick={() => useStore.getState().set({ tool: 'part' })}>
              <Icon name="target" size={14} /> {t('tool.part')}
            </button>
            <button className="btn small" onClick={() => addManualZone()}>
              <Icon name="lasso" size={14} /> {t('colours.addDrawn')}
            </button>
          </div>
        </div>
      ) : (
        <p className="hint">{t('colours.hint')}</p>
      )}

      <ul className="colour-list">
        {colours.map((z) => (
          <ColourZoneItem key={z.id} zone={z} open={z.id === activeZoneId} onCatalog={setCatalog} />
        ))}
      </ul>

      {drawn.length > 0 && (
        <>
          <h4>{t('colours.drawn')}</h4>
          <p className="hint">{t('colours.layersHint')}</p>
          <ul className="colour-list">
            {drawn.map((z, i) => (
              <ColourZoneItem key={z.id} zone={z} open={z.id === activeZoneId} onCatalog={setCatalog} layer={{ top: i === 0, bottom: i === drawn.length - 1 }} />
            ))}
          </ul>
        </>
      )}
      <div className="field-row">
        <button className="btn small ghost" onClick={() => useStore.getState().set({ tool: 'part' })}>
          <Icon name="target" size={14} /> {t('tool.part')}
        </button>
        <button className="btn small ghost" onClick={() => addManualZone()}>
          <Icon name="lasso" size={14} /> {t('colours.addDrawn')}
        </button>
      </div>

      {background && <BackgroundRow zone={background} />}

      {catalog && (
        <Modal title={t(catalog === 'primer' ? 'primer.choose' : 'colours.catalogTitle')} onClose={() => setCatalog(null)}>
          {catalog === 'primer' ? (
            <PalettePanel
              onSelect={(p) => useStore.getState().setPrimer({ kind: 'paint', hex: p.hex, paintId: p.id })}
              onPicked={() => setCatalog(null)}
            />
          ) : (
            <PalettePanel slot={catalog} onPicked={() => setCatalog(null)} />
          )}
        </Modal>
      )}
    </div>
  );
}

function ColourZoneItem({
  zone,
  open,
  onCatalog,
  layer,
}: {
  zone: Zone;
  open: boolean;
  onCatalog: (slot: SlotId) => void;
  /** Set for drawn areas: position in the layer stack. */
  layer?: { top: boolean; bottom: boolean };
}) {
  const t = useT();
  const itemRef = useRef<HTMLLIElement>(null);
  // Selecting a colour by tapping the image scrolls its editor into view.
  useEffect(() => {
    if (open) itemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);
  const library = useStore((s) => s.library);
  const tool = useStore((s) => s.tool);
  const zones = useStore((s) => s.zones);
  const brand = usePrefs((s) => s.brand);
  const greyscale = useStore((s) => s.greyscale);
  const { setActiveZone, updateZone, setZoneColour, resetZoneColour, removeZone, mergeZones, splitZone, moveDrawnZone, set } = useStore.getState();
  const [effects, setEffects] = useState(false);
  const paint = paintById(zone.base.paintId, library);
  const changed = zone.refHex ? zone.base.hex !== zone.refHex : true;

  // Closest paints to the colour seen in the photo ("what paint is this?"), or varied starting
  // colours when there is nothing to match (grey primer, drawn area).
  const starter = greyscale || !zone.refHex;
  const suggestions = useMemo(() => {
    const pool = allPaints(library);
    const ok = (p: Paint) => p.type !== 'shade' && p.type !== 'technical' && (brand === 'all' || p.brand === brand || p.brand === 'Custom');
    if (!starter) return nearestPaints(zone.refHex!, pool, 6, ok);
    const picks = STARTER_HEXES.map((hex) => nearestPaints(hex, pool, 1, ok)[0]).filter(Boolean);
    return picks.filter((m, i) => picks.findIndex((x) => x.paint.id === m.paint.id) === i);
  }, [starter, zone.refHex, library, brand]);

  const refine = (t: Tool) => {
    setActiveZone(zone.id);
    set({ tool: t });
  };

  return (
    <li ref={itemRef} className={`colour-item ${open ? 'open' : ''} ${zone.visible ? '' : 'hidden'}`}>
      <div className="colour-row">
        <button className="colour-head" onClick={() => setActiveZone(open ? null : zone.id)} aria-expanded={open}>
          {zone.refHex && <Swatch hex={zone.refHex} size={22} title={t('colours.original')} />}
          {zone.refHex && <span className="arrow" aria-hidden>→</span>}
          <Swatch hex={zone.base.hex} size={30} ring={changed} />
          <span className="colour-text">
            <strong>
              {zone.priority && <span className="badge-priority" title={t('colours.priority')}>▲</span>}
              {zone.name}
            </strong>
            <small className="muted">{paint ? `${paint.name} · ${paint.brand}` : changed ? zone.base.hex.toUpperCase() : t('colours.unchanged')}</small>
          </span>
        </button>
        {layer && (
          <>
            <IconButton icon="up" label={t('colours.layerUp')} size={15} disabled={layer.top} onClick={() => moveDrawnZone(zone.id, 1)} />
            <IconButton icon="down" label={t('colours.layerDown')} size={15} disabled={layer.bottom} onClick={() => moveDrawnZone(zone.id, -1)} />
          </>
        )}
        {zone.source === 'auto' && !zone.isBackground && (
          <IconButton icon="trash" label={t('colours.remove')} size={15} onClick={() => useStore.getState().removeColour(zone.id)} />
        )}
        <IconButton
          icon={zone.visible ? 'eye' : 'eyeOff'}
          label={t(zone.visible ? 'zones.hide' : 'zones.show')}
          size={15}
          onClick={() => updateZone(zone.id, { visible: !zone.visible })}
        />
      </div>

      {open && (
        <div className="colour-editor">
          <label className="field inline">
            <span>{t('zones.name')}</span>
            <input className="text-input" value={zone.name} maxLength={40} onChange={(e) => updateZone(zone.id, { name: e.target.value }, 'name')} />
          </label>

          <div className="section-title">{t(starter ? 'colours.popular' : 'colours.suggestions')}</div>
          <div className="paint-chips">
            {suggestions.map(({ paint: p, dE }) => (
              <PaintChip key={p.id} paint={p} sim={starter ? null : similarity(dE)} active={p.id === zone.base.paintId} onClick={() => setZoneColour(zone.id, p)} />
            ))}
          </div>
          <div className="colour-actions">
            <button className="btn small" onClick={() => { setActiveZone(zone.id); set({ activeSlot: 'base' }); onCatalog('base'); }}>
              <Icon name="palette" size={14} /> {t('colours.allPaints')}
            </button>
            <span className="free-colour">
              <ColorInput value={zone.base.hex} onChange={(hex) => setZoneColour(zone.id, hex)} title={t('colours.free')} />
              <small>{t('colours.free')}</small>
            </span>
            {zone.refHex && changed && (
              <button className="btn small ghost" onClick={() => resetZoneColour(zone.id)}>
                <Icon name="undo" size={14} /> {t('colours.reset')}
              </button>
            )}
          </div>

          <Toggle checked={!!zone.priority} onChange={(priority) => updateZone(zone.id, { priority })} label={t('colours.priority')} />
          {zone.priority && <p className="hint">{t('colours.priorityHint')}</p>}

          <Slider
            label={t('zones.shading')}
            value={zone.shading}
            min={0}
            max={2}
            onChange={(shading) => updateZone(zone.id, { shading }, 'shading')}
            format={pct}
          />

          <div className="section-title">{t('colours.refine')}</div>
          <div className="refine-tools">
            {(['brush', 'eraser', 'lasso', 'wand'] as Tool[]).map((x) => (
              <button key={x} className={`btn small ${tool === x ? 'primary' : ''}`} onClick={() => refine(x)}>
                <Icon name={x} size={14} /> {t(k(`tool.${x}`))}
              </button>
            ))}
          </div>
          {zone.source === 'auto' && <p className="hint">{t('colours.refineHint')}</p>}
          <div className="refine-tools">
            <button className="btn small" onClick={() => splitZone(zone.id)}>
              <Icon name="split" size={14} /> {t('colours.split')}
            </button>
            <select
              className="select slim"
              value=""
              aria-label={t('colours.mergeWith')}
              onChange={(e) => e.target.value && mergeZones(zone.id, e.target.value)}
            >
              <option value="">{t('colours.mergeWith')}</option>
              {zones
                .filter((z) => z.id !== zone.id && (z.source === 'auto') === (zone.source === 'auto'))
                .map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
            </select>
          </div>

          <button className="link small" onClick={() => setEffects(!effects)} aria-expanded={effects}>
            {effects ? t('colours.effectsHide') : t('colours.effectsShow')}
          </button>
          {effects && (
            <ZoneEffects
              zone={zone}
              onPickPaint={(slot) => {
                setActiveZone(zone.id);
                set({ activeSlot: slot });
                onCatalog(slot);
              }}
            />
          )}

          {zone.source !== 'auto' && (
            <button className="btn small danger-ghost" onClick={() => removeZone(zone.id)}>
              <Icon name="trash" size={14} /> {t('colours.deleteDrawn')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function PaintChip({ paint, sim, active, onClick }: { paint: Paint; sim: number | null; active: boolean; onClick: () => void }) {
  return (
    <button className={`paint-chip ${active ? 'on' : ''}`} onClick={onClick} title={`${paint.name} — ${paint.brand} ${paint.range}`}>
      <Swatch hex={paint.hex} size={22} />
      <span>
        {paint.name}
        <small>{paint.brand}{sim !== null ? ` · ${sim}%` : ''}</small>
      </span>
    </button>
  );
}

function BackgroundRow({ zone }: { zone: Zone }) {
  const t = useT();
  const { updateZone, setActiveZone } = useStore.getState();
  return (
    <div className="background-row">
      <Swatch hex={zone.refHex ?? zone.base.hex} size={22} />
      <span>
        <strong>{t('colours.background')}</strong>
        <small className="muted">{t(zone.visible ? 'colours.backgroundIncluded' : 'colours.backgroundExcluded')}</small>
      </span>
      <button
        className="btn small"
        onClick={() => {
          updateZone(zone.id, { visible: !zone.visible });
          setActiveZone(zone.visible ? null : zone.id);
        }}
      >
        {t(zone.visible ? 'colours.backgroundExclude' : 'colours.backgroundInclude')}
      </button>
    </div>
  );
}

/** Paint brand used for suggestions, remembered on this device. */
function BrandSelect() {
  const t = useT();
  const { brand, setBrand } = usePrefs();
  return (
    <label className="field inline brand-select">
      <span>{t('colours.brand')}</span>
      <select className="select slim" value={brand} onChange={(e) => setBrand(e.target.value)}>
        <option value="all">{t('colours.brandAll')}</option>
        {BRANDS.filter((b) => b !== 'Custom').map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
    </label>
  );
}

/** Common spray primers (by colour); each maps to the closest paint of the preferred brand. */
const PRIMERS: { id: string; hex: string }[] = [
  { id: 'black', hex: '#231f20' },
  { id: 'grey', hex: '#a2a5a7' },
  { id: 'white', hex: '#ffffff' },
  { id: 'bone', hex: '#dbd1b2' },
  { id: 'metal', hex: '#888d8f' },
];

/**
 * Step zero of painting: the primer. The miniature turns black & white, then takes the primer colour
 * (shading kept); every colour is then painted on top of it.
 */
function PrimerCard({ onCatalog }: { onCatalog: () => void }) {
  const t = useT();
  const primer = useStore((s) => s.primer);
  const library = useStore((s) => s.library);
  const brand = usePrefs((s) => s.brand);
  const setPrimer = useStore((s) => s.setPrimer);
  const options = useMemo(
    () =>
      PRIMERS.map((o) => ({
        ...o,
        paint: nearestPaints(o.hex, allPaints(library), 1, (p) => p.type !== 'shade' && p.type !== 'contrast' && (brand === 'all' || p.brand === brand))[0]?.paint,
      })),
    [library, brand],
  );
  const current = primer?.kind === 'paint' ? paintById(primer.paintId, library) : undefined;
  const is = (p: Primer | null) => JSON.stringify(p) === JSON.stringify(primer);

  return (
    <section className="primer-card">
      <div className="primer-head">
        <strong>{t('primer.title')}</strong>
        <small className="muted">{t('primer.hint')}</small>
      </div>
      <div className="primer-chips" role="radiogroup" aria-label={t('primer.title')}>
        <button role="radio" aria-checked={primer === null} className={`chip ${primer === null ? 'on' : ''}`} onClick={() => setPrimer(null)}>
          {t('primer.none')}
        </button>
        <button role="radio" aria-checked={is({ kind: 'greyscale' })} className={`chip ${is({ kind: 'greyscale' }) ? 'on' : ''}`} onClick={() => setPrimer({ kind: 'greyscale' })}>
          <span className="chip-swatch bw" aria-hidden /> {t('primer.greyscale')}
        </button>
        {options.map((o) => {
          if (!o.paint) return null;
          const value: Primer = { kind: 'paint', hex: o.paint.hex, paintId: o.paint.id };
          const on = primer?.kind === 'paint' && primer.paintId === o.paint.id;
          return (
            <button key={o.id} role="radio" aria-checked={on} className={`chip ${on ? 'on' : ''}`} onClick={() => setPrimer(value)} title={`${o.paint.name} · ${o.paint.brand}`}>
              <span className="chip-swatch" style={{ background: o.paint.hex }} aria-hidden /> {t(k(`primer.${o.id}`))}
            </button>
          );
        })}
        <button className="chip" onClick={onCatalog}>
          <Icon name="palette" size={12} /> {t('primer.other')}
        </button>
      </div>
      {current && <small className="muted">{current.name} · {current.brand} {current.range}</small>}
      {primer?.kind === 'paint' && (
        <div className="primer-look">
          <small className="muted">{t('primer.look')}</small>
          <div className="segmented" role="radiogroup" aria-label={t('primer.look')}>
            {(['shadows', 'flat'] as const).map((look) => {
              const on = (primer.look ?? 'shadows') === look;
              return (
                <button key={look} role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => setPrimer({ ...primer, look })}>
                  {t(k(`primer.look.${look}`))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

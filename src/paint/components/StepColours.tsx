import { useEffect, useMemo, useRef, useState } from 'react';
import { allPaints, MAX_COLOURS, MIN_COLOURS, paintById, useStore } from '../store';
import type { Paint, SlotId, Tool, Zone } from '../types';
import { nearestPaints } from '../../core/lib/color';
import { similarity } from '../lib/beginner';
import { k, useT } from '../../core/i18n';
import { usePrefs } from '../../core/prefs';
import { BRANDS } from '../data/paints';
import { ColorInput, Icon, IconButton, Modal, pct, Slider, Swatch } from '../../core/ui/ui';
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
  const colourCount = useStore((s) => s.colourCount);
  const analysing = useStore((s) => s.analysing);
  const greyscale = useStore((s) => s.greyscale);
  const { analyseColours, addManualZone } = useStore.getState();
  const [catalog, setCatalog] = useState<SlotId | null>(null);

  // The background shows up in the list only once the user brings it back into the scheme.
  const colours = zones.filter((z) => z.source === 'auto' && (!z.isBackground || z.visible));
  const drawn = zones.filter((z) => z.source !== 'auto');
  const background = zones.find((z) => z.isBackground);

  // The count control re-analyses after a short pause, so clicking +/- several times is cheap.
  const [count, setCount] = useState(colourCount);
  useEffect(() => setCount(colourCount), [colourCount]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const changeCount = (n: number) => {
    const next = Math.max(MIN_COLOURS, Math.min(MAX_COLOURS, n));
    setCount(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => analyseColours(next), 450);
  };

  return (
    <div className="step-colours">
      <div className="colour-count">
        <div>
          <strong>{t('colours.count')}</strong>
          <small className="muted">{t('colours.countHint')}</small>
        </div>
        <div className="stepper-input" aria-busy={analysing}>
          <IconButton icon="minus" label={t('colours.fewer')} onClick={() => changeCount(count - 1)} disabled={count <= MIN_COLOURS} />
          <output aria-live="polite">{analysing ? <span className="spinner small" /> : count}</output>
          <IconButton icon="plus" label={t('colours.more')} onClick={() => changeCount(count + 1)} disabled={count >= MAX_COLOURS} />
        </div>
      </div>
      <BrandSelect />
      {greyscale ? (
        <div className="notice">
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
          <ul className="colour-list">
            {drawn.map((z) => (
              <ColourZoneItem key={z.id} zone={z} open={z.id === activeZoneId} onCatalog={setCatalog} />
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
        <Modal title={t('colours.catalogTitle')} onClose={() => setCatalog(null)}>
          <PalettePanel slot={catalog} onPicked={() => setCatalog(null)} />
        </Modal>
      )}
    </div>
  );
}

function ColourZoneItem({ zone, open, onCatalog }: { zone: Zone; open: boolean; onCatalog: (slot: SlotId) => void }) {
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
  const { setActiveZone, updateZone, setZoneColour, resetZoneColour, removeZone, mergeZones, splitZone, set } = useStore.getState();
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
            <strong>{zone.name}</strong>
            <small className="muted">{paint ? `${paint.name} · ${paint.brand}` : changed ? zone.base.hex.toUpperCase() : t('colours.unchanged')}</small>
          </span>
        </button>
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

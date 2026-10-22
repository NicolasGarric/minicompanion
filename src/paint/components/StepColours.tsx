import { useEffect, useMemo, useRef, useState } from 'react';
import { allPaints, MAX_COLOURS, MIN_COLOURS, paintById, useStore } from '../store';
import type { Paint, SlotId, Tool, Zone } from '../types';
import { nearestPaints } from '../../core/lib/color';
import { similarity } from '../lib/beginner';
import { useT } from '../../core/i18n';
import { ColorInput, Icon, IconButton, Modal, pct, Slider, Swatch } from '../../core/ui/ui';
import { PalettePanel } from './PalettePanel';
import { ZoneEffects } from './ZoneEffects';

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
      {greyscale ? (
        <div className="notice">
          <p>{t('colours.greyscale')}</p>
          <button className="btn small" onClick={() => addManualZone()}>
            <Icon name="lasso" size={14} /> {t('colours.addDrawn')}
          </button>
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
      <button className="btn small ghost" onClick={() => addManualZone()}>
        <Icon name="lasso" size={14} /> {t('colours.addDrawn')}
      </button>

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
  const library = useStore((s) => s.library);
  const tool = useStore((s) => s.tool);
  const { setActiveZone, updateZone, setZoneColour, resetZoneColour, removeZone, set } = useStore.getState();
  const [effects, setEffects] = useState(false);
  const paint = paintById(zone.base.paintId, library);
  const changed = zone.refHex ? zone.base.hex !== zone.refHex : true;

  // Closest paints to the colour seen in the photo: "what paint is this?" before "what else?".
  const suggestions = useMemo(
    () => nearestPaints(zone.refHex ?? zone.base.hex, allPaints(library), 6, (p) => p.type !== 'shade' && p.type !== 'technical'),
    [zone.refHex, zone.base.hex, library],
  );

  const refine = (t: Tool) => {
    setActiveZone(zone.id);
    set({ tool: t });
  };

  return (
    <li className={`colour-item ${open ? 'open' : ''} ${zone.visible ? '' : 'hidden'}`}>
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

          <div className="section-title">{t('colours.suggestions')}</div>
          <div className="paint-chips">
            {suggestions.map(({ paint: p, dE }) => (
              <PaintChip key={p.id} paint={p} sim={similarity(dE)} active={p.id === zone.base.paintId} onClick={() => setZoneColour(zone.id, p)} />
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
                <Icon name={x} size={14} /> {t(`tool.${x}` as const)}
              </button>
            ))}
          </div>
          {zone.source === 'auto' && <p className="hint">{t('colours.refineHint')}</p>}

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

function PaintChip({ paint, sim, active, onClick }: { paint: Paint; sim: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`paint-chip ${active ? 'on' : ''}`} onClick={onClick} title={`${paint.name} — ${paint.brand} ${paint.range}`}>
      <Swatch hex={paint.hex} size={22} />
      <span>
        {paint.name}
        <small>{paint.brand} · {sim}%</small>
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

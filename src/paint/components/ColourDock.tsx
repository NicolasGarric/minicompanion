import { useState } from 'react';
import { MAX_BASE_PAINTS, paintById, useStore } from '../store';
import { useT } from '../../core/i18n';
import { Icon, Modal } from '../../core/ui/ui';
import { PalettePanel } from './PalettePanel';

/**
 * Mobile, step 2: a fixed bar under the full-screen image with every colour of the miniature.
 * Tap a colour to select it, "Paints" opens the catalogue for it, "Details" raises the full panel.
 * Hidden on desktop, where the panel is always beside the canvas.
 */
export function ColourDock({ onDetails }: { onDetails: () => void }) {
  const t = useT();
  const zones = useStore((s) => s.zones);
  const activeZoneId = useStore((s) => s.activeZoneId);
  const pickMode = useStore((s) => s.pickMode);
  const library = useStore((s) => s.library);
  const { setActiveZone, set } = useStore.getState();
  const [catalog, setCatalog] = useState(false);

  // Same order as the panel: reference colours, then drawn areas (top layer first).
  const colours = zones.filter((z) => z.source === 'auto' && !z.isBackground);
  const drawn = zones.filter((z) => z.source !== 'auto').reverse();
  const items = [...colours, ...drawn];
  const active = zones.find((z) => z.id === activeZoneId);
  const paint = active ? paintById(active.base.paintId, library) : undefined;
  const toggleAdd = () => set(pickMode === 'add' ? { pickMode: 'select' } : { pickMode: 'add', tool: 'picker' });

  return (
    <div className="colour-dock" role="toolbar" aria-label={t('dock.label')}>
      <div className="dock-swatches">
        {items.map((z) => (
          <button
            key={z.id}
            type="button"
            className={`dock-swatch ${z.id === activeZoneId ? 'on' : ''} ${z.visible ? '' : 'off'}`}
            style={{ background: z.base.hex }}
            aria-label={z.name}
            aria-pressed={z.id === activeZoneId}
            onClick={() => setActiveZone(z.id === activeZoneId ? null : z.id)}
          />
        ))}
        <button
          type="button"
          className={`dock-swatch add ${pickMode === 'add' ? 'on' : ''}`}
          aria-label={t('colours.add')}
          aria-pressed={pickMode === 'add'}
          disabled={colours.length >= MAX_BASE_PAINTS}
          onClick={toggleAdd}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <p className="dock-current">
        {pickMode === 'add' ? (
          t('colours.addHint')
        ) : active ? (
          <>
            <span className="role-dot" style={{ background: active.base.hex }} />
            <strong>{active.name}</strong>
            <span className="muted">{paint ? `${paint.name} · ${paint.brand}` : active.base.hex.toUpperCase()}</span>
          </>
        ) : (
          <span className="muted">{t('dock.pick')}</span>
        )}
      </p>
      <div className="dock-actions">
        <button type="button" className="btn small primary" disabled={!active} onClick={() => setCatalog(true)}>
          <Icon name="palette" size={14} /> {t('dock.paints')}
        </button>
        <button type="button" className="btn small" onClick={onDetails}>
          <Icon name="up" size={14} /> {t('dock.details')}
        </button>
      </div>
      {catalog && active && (
        <Modal title={t('colours.catalogTitle')} onClose={() => setCatalog(false)}>
          <PalettePanel slot="base" onPicked={() => setCatalog(false)} />
        </Modal>
      )}
    </div>
  );
}

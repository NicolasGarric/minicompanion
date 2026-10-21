import { useMemo, useState } from 'react';
import { allPaints, useStore } from '../store';
import { useT } from '../../core/i18n';
import { nearestPaints } from '../../core/lib/color';
import { similarity } from '../lib/beginner';
import { ImageUpload } from '../../core/ui/ImageUpload';
import { Icon, IconButton, Swatch } from '../../core/ui/ui';

/**
 * The reference image is the visual guide for the whole project: it stays visible next to the
 * scheme (side column on desktop, collapsible block on mobile) together with its palette.
 */
export function ReferencePanel() {
  const t = useT();
  const imageUrl = useStore((s) => s.imageUrl);
  const palette = useStore((s) => s.palette);
  const zones = useStore((s) => s.zones);
  const library = useStore((s) => s.library);
  const tool = useStore((s) => s.tool);
  const { set, assignColorToZone, removePaletteColor, replaceImage, assignPaint } = useStore.getState();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const paints = useMemo(() => allPaints(library).filter((p) => p.type !== 'technical'), [library]);

  return (
    <section className={`reference ${open ? 'open' : ''}`} aria-label={t('ref.title')}>
      <button className="reference-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="image" size={16} /> <strong>{t('ref.title')}</strong>
        <span className="muted">{t('ref.colors', { count: palette.length })}</span>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </button>
      {open && (
        <div className="reference-body">
          {imageUrl && <img className="reference-img" src={imageUrl} alt={t('ref.alt')} />}

          <div className="reference-actions">
            <button className={`btn small ${tool === 'picker' ? 'primary' : ''}`} onClick={() => set({ tool: 'picker' })}>
              <Icon name="picker" size={14} /> {t('ref.pick')}
            </button>
            <button className="btn small ghost" onClick={() => setReplacing(!replacing)}>
              <Icon name="upload" size={14} /> {t('ref.replace')}
            </button>
          </div>
          {replacing && (
            <ImageUpload
              compact
              label={t('ref.replaceChoose')}
              onImage={async (img) => {
                await replaceImage(img);
                setReplacing(false);
              }}
            />
          )}
          {tool === 'picker' && <p className="hint">{t('ref.pickHint')}</p>}

          <ul className="palette-list">
            {palette.map((c) => {
              const matches = expanded === c.id ? nearestPaints(c.hex, paints, 3) : nearestPaints(c.hex, paints, 1);
              return (
                <li key={c.id} className="palette-item">
                  <div className="palette-row">
                    <Swatch hex={c.hex} size={32} />
                    <div className="palette-info">
                      <code>{c.hex.toUpperCase()}</code>
                      <small className="muted">
                        {c.source === 'auto' ? t('ref.auto', { pct: Math.round((c.weight ?? 0) * 100) }) : t('ref.picked')}
                      </small>
                    </div>
                    <select
                      className="select slim"
                      value={c.zoneId ?? ''}
                      onChange={(e) => assignColorToZone(c.id, e.target.value || undefined)}
                      aria-label={t('ref.assign')}
                    >
                      <option value="">{t('ref.assignNone')}</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                    <IconButton icon="trash" label={t('common.remove')} size={14} onClick={() => removePaletteColor(c.id)} />
                  </div>
                  <div className="palette-matches">
                    {matches.map(({ paint, dE }) => (
                      <button key={paint.id} className="match" onClick={() => assignPaint(paint)} title={t('ref.applyMatch')}>
                        <Swatch hex={paint.hex} size={18} />
                        <span>
                          {paint.name}
                          <small>{paint.brand === 'Custom' ? t('brand.Custom') : paint.brand} · {paint.range}</small>
                        </span>
                        <span className="similarity" style={{ ['--sim' as string]: `${similarity(dE)}%` }}>
                          {similarity(dE)}%
                        </span>
                      </button>
                    ))}
                    <button className="link small" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                      {expanded === c.id ? t('ref.fewer') : t('ref.more')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

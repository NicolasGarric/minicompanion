import { useMemo } from 'react';
import { allPaints, useStore } from '../store';
import { HARMONIES, harmonyColors, nearestPaints } from '../../core/lib/color';
import { k, useT } from '../../core/i18n';
import { SlotTarget } from './PalettePanel';
import { ColorInput, Swatch } from '../../core/ui/ui';

export function HarmonyPanel() {
  const t = useT();
  const library = useStore((s) => s.library);
  const zone = useStore((s) => s.zones.find((z) => z.id === s.activeZoneId));
  const harmonyBase = useStore((s) => s.harmonyBase);
  const set = useStore((s) => s.set);
  const assignPaint = useStore((s) => s.assignPaint);
  const base = harmonyBase ?? zone?.base.hex ?? '#0d407f';
  const paints = useMemo(() => allPaints(library).filter((p) => p.type !== 'shade' && p.type !== 'technical'), [library]);
  const owned = useMemo(() => new Set(library.owned), [library.owned]);
  const filter = library.ownedOnly ? (p: { id: string; brand: string }) => owned.has(p.id) || p.brand === 'Custom' : undefined;

  return (
    <div className="harmony">
      <SlotTarget />
      <div className="card harmony-base">
        <ColorInput value={base} onChange={(hex) => set({ harmonyBase: hex })} title={t('harmony.start')} />
        <div>
          <strong>{t('harmony.start')}</strong>
          <small className="muted">{base.toUpperCase()}</small>
        </div>
        {zone && <button className="btn small" onClick={() => set({ harmonyBase: zone.base.hex })}>{t('harmony.fromZone', { name: zone.name })}</button>}
      </div>
      {library.ownedOnly && <p className="hint">{t('harmony.ownedOnly')}</p>}
      {HARMONIES.map((h) => {
        const colors = harmonyColors(base, h);
        return (
          <section key={h.id} className="harmony-row">
            <h4>{t(k(`harmony.${h.id}`))}</h4>
            <p className="hint">{t(k(`harmony.${h.id}.desc`))}</p>
            <div className="harmony-strip">
              <span className="strip-cell" style={{ background: base }} />
              {colors.map((c, i) => <span key={i} className="strip-cell" style={{ background: c }} />)}
            </div>
            <div className="harmony-matches">
              {colors.map((c, i) => {
                const m = nearestPaints(c, paints, 1, filter)[0];
                if (!m) return null;
                return (
                  <button key={i} className="match" onClick={() => assignPaint(m.paint)}>
                    <Swatch hex={m.paint.hex} size={18} />
                    <span>{m.paint.name}<small>{m.paint.brand} · {m.paint.range}</small></span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

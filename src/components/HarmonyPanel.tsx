import { useMemo } from 'react';
import { allPaints, useStore } from '../store';
import { HARMONIES, harmonyColors, nearestPaints } from '../lib/color';
import { SlotTarget } from './PalettePanel';
import { ColorInput, Swatch } from './ui';

export function HarmonyPanel() {
  const library = useStore((s) => s.library);
  const zone = useStore((s) => s.zones.find((z) => z.id === s.activeZoneId));
  const harmonyBase = useStore((s) => s.harmonyBase);
  const set = useStore((s) => s.set);
  const assignPaint = useStore((s) => s.assignPaint);
  const base = harmonyBase ?? zone?.base.hex ?? '#0d407f';
  const paints = useMemo(() => allPaints(library).filter((p) => p.type !== 'shade' && p.type !== 'technical'), [library]);
  const owned = useMemo(() => new Set(library.owned), [library.owned]);
  const filter = library.ownedOnly ? (p: { id: string; brand: string }) => owned.has(p.id) || p.brand === 'Perso' : undefined;

  return (
    <div className="harmony">
      <SlotTarget />
      <div className="card harmony-base">
        <ColorInput value={base} onChange={(hex) => set({ harmonyBase: hex })} title="Couleur de départ" />
        <div>
          <strong>Couleur de départ</strong>
          <small className="muted">{base.toUpperCase()}</small>
        </div>
        {zone && (
          <button className="btn small" onClick={() => set({ harmonyBase: zone.base.hex })}>
            Depuis « {zone.name} »
          </button>
        )}
      </div>
      {library.ownedOnly && <p className="hint">Suggestions limitées à vos pots (filtre « Mes pots » actif).</p>}
      {HARMONIES.map((h) => {
        const colors = harmonyColors(base, h);
        return (
          <section key={h.id} className="harmony-row">
            <h4>{h.label}</h4>
            <p className="hint">{h.description}</p>
            <div className="harmony-strip">
              <span className="strip-cell" style={{ background: base }} />
              {colors.map((c, i) => <span key={i} className="strip-cell" style={{ background: c }} />)}
            </div>
            <div className="harmony-matches">
              {colors.map((c, i) => {
                const m = nearestPaints(c, paints, 1, filter)[0];
                if (!m) return null;
                return (
                  <button key={i} className="match" onClick={() => assignPaint(m.paint)} title={`Appliquer ${m.paint.name}`}>
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

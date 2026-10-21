import { useMemo, useState } from 'react';
import { allPaints, uid, useStore } from '../store';
import { BRANDS, PAINT_TYPE_LABEL } from '../data/paints';
import type { Brand, Paint, PaintType, SlotId } from '../types';
import { isDark, matchQuality, nearestPaints } from '../lib/color';
import { Icon, IconButton, Swatch, Toggle } from './ui';

const SLOT_LABEL: Record<SlotId, string> = { base: 'Base', wash: 'Lavis', highlight: 'Éclaircissement', drybrush: 'Brossage à sec' };

export function SlotTarget() {
  const zone = useStore((s) => s.zones.find((z) => z.id === s.activeZoneId));
  const slot = useStore((s) => s.activeSlot);
  const set = useStore((s) => s.set);
  if (!zone) return <div className="target-bar muted">Aucune zone active</div>;
  return (
    <div className="target-bar">
      <span className="muted">Appliquer à</span>
      <strong>{zone.name}</strong>
      <span className="muted">›</span>
      <select className="select slim" value={slot} onChange={(e) => set({ activeSlot: e.target.value as SlotId })}>
        {(Object.keys(SLOT_LABEL) as SlotId[]).map((k) => (
          <option key={k} value={k}>{SLOT_LABEL[k]}</option>
        ))}
      </select>
    </div>
  );
}

export function PalettePanel() {
  const library = useStore((s) => s.library);
  const updateLibrary = useStore((s) => s.updateLibrary);
  const assignPaint = useStore((s) => s.assignPaint);
  const pickedColor = useStore((s) => s.pickedColor);
  const set = useStore((s) => s.set);
  const [query, setQuery] = useState('');
  const [brands, setBrands] = useState<Brand[]>(['Citadel']);
  const [type, setType] = useState<PaintType | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [selected, setSelected] = useState<Paint | null>(null);
  const [newName, setNewName] = useState('');
  const [newHex, setNewHex] = useState('#7a3b8f');

  const paints = useMemo(() => allPaints(library), [library]);
  const favorites = useMemo(() => new Set(library.favorites), [library.favorites]);
  const owned = useMemo(() => new Set(library.owned), [library.owned]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return paints.filter(
      (p) =>
        (brands.length === 0 || brands.includes(p.brand)) &&
        (type === 'all' || p.type === type) &&
        (!favOnly || favorites.has(p.id)) &&
        (!library.ownedOnly || owned.has(p.id) || p.brand === 'Perso') &&
        (!q || p.name.toLowerCase().includes(q) || p.range.toLowerCase().includes(q)),
    );
  }, [paints, brands, type, favOnly, favorites, owned, library.ownedOnly, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Paint[]>();
    for (const p of filtered) {
      const k = `${p.brand} · ${p.range}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [filtered]);

  const toggleBrand = (b: Brand) => setBrands((bs) => (bs.includes(b) ? bs.filter((x) => x !== b) : [...bs, b]));
  const toggleIn = (key: 'favorites' | 'owned', id: string) =>
    updateLibrary((l) => ({ ...l, [key]: l[key].includes(id) ? l[key].filter((x) => x !== id) : [...l[key], id] }));

  const pick = (p: Paint) => {
    setSelected(p);
    assignPaint(p);
  };

  const addCustom = () => {
    const name = newName.trim() || `Mélange ${library.customPaints.length + 1}`;
    const p: Paint = { id: `perso-${uid()}`, brand: 'Perso', range: 'Mes couleurs', name, hex: newHex, type: 'base' };
    updateLibrary((l) => ({ ...l, customPaints: [...l.customPaints, p] }));
    setNewName('');
    if (!brands.includes('Perso')) setBrands([...brands, 'Perso']);
  };

  const pickedMatches = useMemo(
    () => (pickedColor ? nearestPaints(pickedColor, paints, 4, (p) => brands.length === 0 || brands.includes(p.brand)) : []),
    [pickedColor, paints, brands],
  );
  const equivalents = useMemo(
    () => (selected ? BRANDS.filter((b) => b !== selected.brand && b !== 'Perso').map((b) => ({ brand: b, m: nearestPaints(selected.hex, paints, 1, (p) => p.brand === b && p.type !== 'shade')[0] })) : []),
    [selected, paints],
  );

  return (
    <div className="palette">
      <SlotTarget />
      <div className="palette-filters">
        <div className="search">
          <Icon name="zoomIn" size={14} />
          <input placeholder="Rechercher une peinture…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="chips">
          {BRANDS.map((b) => (
            <button key={b} className={`chip ${brands.includes(b) ? 'on' : ''}`} onClick={() => toggleBrand(b)}>{b}</button>
          ))}
        </div>
        <div className="chips">
          <button className={`chip small ${type === 'all' ? 'on' : ''}`} onClick={() => setType('all')}>Tous</button>
          {(Object.keys(PAINT_TYPE_LABEL) as PaintType[]).filter((t) => t !== 'air').map((t) => (
            <button key={t} className={`chip small ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{PAINT_TYPE_LABEL[t]}</button>
          ))}
        </div>
        <div className="filter-toggles">
          <Toggle checked={favOnly} onChange={setFavOnly} label="Favoris" />
          <Toggle checked={library.ownedOnly} onChange={(ownedOnly) => updateLibrary((l) => ({ ...l, ownedOnly }))} label="Mes pots uniquement" />
        </div>
      </div>

      {pickedColor && (
        <div className="card picked">
          <div className="card-head">
            <Swatch hex={pickedColor} size={28} />
            <div>
              <strong>Pipette {pickedColor.toUpperCase()}</strong>
              <small className="muted">Peintures les plus proches</small>
            </div>
            <IconButton icon="x" label="Fermer" size={14} onClick={() => set({ pickedColor: null })} />
          </div>
          <div className="match-list">
            {pickedMatches.map(({ paint, dE }) => (
              <button key={paint.id} className="match" onClick={() => pick(paint)} title={`ΔE ${dE.toFixed(1)}`}>
                <Swatch hex={paint.hex} size={20} />
                <span>{paint.name}<small>{paint.brand} · {paint.range}</small></span>
                <span className={`quality ${matchQuality(dE).tone}`}>{matchQuality(dE).label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="card selected-paint">
          <div className="card-head">
            <Swatch hex={selected.hex} size={28} />
            <div>
              <strong>{selected.name}</strong>
              <small className="muted">{selected.brand} · {selected.range} · {PAINT_TYPE_LABEL[selected.type]}</small>
            </div>
            <IconButton icon="star" label="Favori" size={15} active={favorites.has(selected.id)} onClick={() => toggleIn('favorites', selected.id)} />
            <IconButton icon="check" label="Je possède ce pot" size={15} active={owned.has(selected.id)} onClick={() => toggleIn('owned', selected.id)} />
          </div>
          {equivalents.some((e) => e.m) && (
            <div className="equivalents">
              <small className="muted">Équivalences approximatives</small>
              {equivalents.map(({ brand, m }) =>
                m ? (
                  <button key={brand} className="match" onClick={() => pick(m.paint)}>
                    <Swatch hex={m.paint.hex} size={18} />
                    <span>{m.paint.name}<small>{brand} · {m.paint.range}</small></span>
                    <span className={`quality ${matchQuality(m.dE).tone}`}>ΔE {m.dE.toFixed(0)}</span>
                  </button>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      <div className="paint-groups">
        {groups.length === 0 && <p className="hint">Aucune peinture ne correspond aux filtres.</p>}
        {groups.map(([name, list]) => (
          <section key={name}>
            <h4>{name} <span className="muted">{list.length}</span></h4>
            <div className="paint-grid">
              {list.map((p) => (
                <button
                  key={p.id}
                  className={`paint ${selected?.id === p.id ? 'sel' : ''} type-${p.type}`}
                  style={{ background: p.hex, color: isDark(p.hex) ? '#fff' : '#111' }}
                  onClick={() => pick(p)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleIn('favorites', p.id);
                  }}
                  title={`${p.name} — ${p.brand} ${p.range}\nClic : appliquer · Clic droit : favori`}
                >
                  {favorites.has(p.id) && <span className="badge fav">★</span>}
                  {owned.has(p.id) && <span className="badge own">✓</span>}
                  <span className="paint-name">{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="card custom-paint">
        <strong>Ajouter une couleur perso</strong>
        <div className="field-row">
          <input type="color" value={newHex} onChange={(e) => setNewHex(e.target.value)} className="color-native" aria-label="Couleur" />
          <input className="text-input grow" placeholder="Nom (ex. Mélange cape)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
          <button className="btn small primary" onClick={addCustom}><Icon name="plus" size={14} /></button>
        </div>
        {library.customPaints.length > 0 && (
          <div className="custom-list">
            {library.customPaints.map((p) => (
              <span key={p.id} className="custom-item">
                <button className="link" onClick={() => pick(p)}><Swatch hex={p.hex} size={16} /> {p.name}</button>
                <IconButton icon="trash" label="Supprimer" size={13} onClick={() => updateLibrary((l) => ({ ...l, customPaints: l.customPaints.filter((x) => x.id !== p.id) }))} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

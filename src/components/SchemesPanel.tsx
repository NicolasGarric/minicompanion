import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { BUILTIN_SCHEMES, ROLES } from '../data/presets';
import type { Scheme } from '../types';
import { Icon, IconButton } from './ui';

function SchemeCard({ scheme, onApply, onDelete }: { scheme: Scheme; onApply: () => void; onDelete?: () => void }) {
  const chips = ROLES.filter((r) => scheme.recipes[r.id]?.base).slice(0, 7);
  return (
    <div className="scheme-card">
      <div className="scheme-chips">
        {chips.map((r) => (
          <span key={r.id} style={{ background: scheme.recipes[r.id]!.base!.hex }} title={r.label} />
        ))}
      </div>
      <div className="scheme-text">
        <strong>{scheme.name}</strong>
        <small>{scheme.description ?? scheme.faction}</small>
      </div>
      <div className="scheme-actions">
        {onDelete && <IconButton icon="trash" label="Supprimer" size={14} onClick={onDelete} />}
        <button className="btn small" onClick={onApply}>Appliquer</button>
      </div>
    </div>
  );
}

export function SchemesPanel() {
  const library = useStore((s) => s.library);
  const { applyScheme, saveScheme, deleteScheme } = useStore.getState();
  const [name, setName] = useState('');
  const [faction, setFaction] = useState('');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const m = new Map<string, Scheme[]>();
    for (const s of BUILTIN_SCHEMES) {
      if (q && !`${s.name} ${s.faction}`.toLowerCase().includes(q)) continue;
      if (!m.has(s.faction)) m.set(s.faction, []);
      m.get(s.faction)!.push(s);
    }
    return [...m.entries()];
  }, [query]);

  return (
    <div className="schemes">
      <div className="card">
        <strong>Enregistrer le schéma actuel</strong>
        <p className="hint">Mémorise la recette de chaque rôle (armure, liserés…) pour l'appliquer à d'autres figurines.</p>
        <div className="field-col">
          <input className="text-input" placeholder="Nom (ex. Chapitre maison)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="text-input" placeholder="Faction / armée" value={faction} onChange={(e) => setFaction(e.target.value)} />
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              saveScheme(name.trim(), faction.trim() || 'Mes schémas');
              setName('');
              setFaction('');
            }}
          >
            <Icon name="save" size={14} /> Enregistrer
          </button>
        </div>
      </div>

      {library.schemes.length > 0 && (
        <section>
          <h4>Mes schémas</h4>
          {library.schemes.map((s) => (
            <SchemeCard key={s.id} scheme={s} onApply={() => applyScheme(s)} onDelete={() => deleteScheme(s.id)} />
          ))}
        </section>
      )}

      <div className="search">
        <Icon name="zoomIn" size={14} />
        <input placeholder="Rechercher une faction…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <p className="hint">Les schémas s'appliquent selon le <strong>rôle</strong> de chaque zone.</p>
      {groups.map(([faction, list]) => (
        <section key={faction}>
          <h4>{faction}</h4>
          {list.map((s) => <SchemeCard key={s.id} scheme={s} onApply={() => applyScheme(s)} />)}
        </section>
      ))}
    </div>
  );
}

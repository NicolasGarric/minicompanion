import { useState } from 'react';
import { useStore } from '../store';
import { Empty, Icon, IconButton } from './ui';

export function VariantsPanel() {
  const variants = useStore((s) => s.variants);
  const { saveVariant, loadVariant, deleteVariant, renameVariant, set } = useStore.getState();
  const [name, setName] = useState('');

  const save = () => {
    saveVariant(name.trim() || `Variante ${variants.length + 1}`);
    setName('');
  };

  return (
    <div className="variants">
      <div className="card">
        <strong>Sauver l'état actuel comme variante</strong>
        <p className="hint">Testez plusieurs schémas sur la même figurine puis comparez-les côte à côte.</p>
        <div className="field-row">
          <input className="text-input grow" placeholder={`Variante ${variants.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn primary small" onClick={save}><Icon name="save" size={14} /> Sauver</button>
        </div>
      </div>
      {variants.length >= 1 && (
        <button className="btn wide" onClick={() => set({ compareOpen: true })}>
          <Icon name="compare" size={15} /> Comparer les variantes
        </button>
      )}
      {variants.length === 0 ? (
        <Empty icon="compare" title="Aucune variante">Sauvez une première variante, changez les couleurs, puis sauvez-en une autre.</Empty>
      ) : (
        <div className="variant-grid">
          {variants.map((v) => (
            <div key={v.id} className="variant-card">
              <button className="variant-thumb" onClick={() => loadVariant(v.id)} title="Charger cette variante">
                {v.thumb ? <img src={v.thumb} alt={v.name} /> : null}
              </button>
              <input className="variant-name" value={v.name} onChange={(e) => renameVariant(v.id, e.target.value)} aria-label="Nom de la variante" />
              <div className="variant-actions">
                <button className="btn small" onClick={() => loadVariant(v.id)}>Charger</button>
                <IconButton icon="trash" label="Supprimer" size={14} onClick={() => deleteVariant(v.id)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

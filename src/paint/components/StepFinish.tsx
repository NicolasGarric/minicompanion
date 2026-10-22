import { useMemo } from 'react';
import { useStore } from '../store';
import { buildRecipe, paintsUsed } from '../lib/recipe';
import { useT } from '../../core/i18n';
import { Icon, Swatch } from '../../core/ui/ui';
import { PaintSearchLink } from './PalettePanel';
import { VariantsPanel } from './VariantsPanel';
import { SchemesPanel } from './SchemesPanel';

/** Step 3: the recipe per zone, the live shopping list, sharing and extra options. */
export function StepFinish() {
  const t = useT();
  const zones = useStore((s) => s.zones);
  const library = useStore((s) => s.library);
  const { set, updateLibrary } = useStore.getState();
  const lines = useMemo(() => buildRecipe(zones, library), [zones, library]);
  const paints = useMemo(() => paintsUsed(zones, library), [zones, library]);
  const owned = new Set(library.owned);
  const missing = paints.filter((p) => !owned.has(p.id)).length;

  const toggleOwned = (id: string) =>
    updateLibrary((l) => ({ ...l, owned: l.owned.includes(id) ? l.owned.filter((x) => x !== id) : [...l.owned, id] }));

  return (
    <div className="step-finish">
      <button className="btn primary wide" onClick={() => set({ shareOpen: true })}>
        <Icon name="share" size={16} /> {t('share.title')}
      </button>

      <section>
        <h4>{t('finish.recipe')}</h4>
        <ul className="recipe-compact">
          {lines.map((l) => (
            <li key={l.zone}>
              <Swatch hex={l.steps[0].hex} size={24} />
              <span>
                <strong>{l.zone}</strong>
                <small className="muted">{l.steps.map((s) => s.name).join(' → ')}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>
          {t('recipe.shoppingList')} <span className="muted">{t('finish.missing', { count: missing, total: paints.length })}</span>
        </h4>
        {paints.length === 0 ? (
          <p className="hint">{t('finish.noPaints')}</p>
        ) : (
          <ul className="shopping">
            {paints.map((p) => (
              <li key={p.id} className={owned.has(p.id) ? 'have' : ''}>
                <label className="check">
                  <input type="checkbox" checked={owned.has(p.id)} onChange={() => toggleOwned(p.id)} />
                  <Swatch hex={p.hex} size={20} />
                  <span>{p.name} <small className="muted">{p.brand} · {p.range}</small></span>
                </label>
                {!owned.has(p.id) && <PaintSearchLink paint={p} />}
              </li>
            ))}
          </ul>
        )}
        <p className="hint">{t('finish.ownedHint')}</p>
      </section>

      <details className="more-options">
        <summary>{t('finish.variants')}</summary>
        <VariantsPanel />
      </details>
      <details className="more-options">
        <summary>{t('finish.schemes')}</summary>
        <SchemesPanel />
      </details>
    </div>
  );
}

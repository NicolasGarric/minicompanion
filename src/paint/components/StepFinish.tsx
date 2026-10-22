import { useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { buildRecipe, paintsUsed } from '../lib/recipe';
import { useT } from '../../core/i18n';
import { Icon, Swatch } from '../../core/ui/ui';
import { PaintSearchLink } from './PalettePanel';
import { VariantsPanel } from './VariantsPanel';
import { STAGES } from '../lib/stages';
import { k } from '../../core/i18n';
import { SchemesPanel } from './SchemesPanel';

/** Step 3: the recipe per zone, the live shopping list, sharing and extra options. */
export function StepFinish() {
  const t = useT();
  const zones = useStore((s) => s.zones);
  const library = useStore((s) => s.library);
  const primer = useStore((s) => s.primer);
  const { set, updateLibrary } = useStore.getState();
  const lines = useMemo(() => buildRecipe(zones, library, undefined, primer), [zones, library, primer]);
  const paints = useMemo(() => paintsUsed(zones, library, primer), [zones, library, primer]);
  const owned = new Set(library.owned);
  const missing = paints.filter((p) => !owned.has(p.id)).length;

  const toggleOwned = (id: string) =>
    updateLibrary((l) => ({ ...l, owned: l.owned.includes(id) ? l.owned.filter((x) => x !== id) : [...l.owned, id] }));

  return (
    <div className="step-finish">
      <button className="btn primary wide" onClick={() => set({ shareOpen: true })}>
        <Icon name="share" size={16} /> {t('share.title')}
      </button>

      <PaintingSteps />

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

/**
 * Painting steps: a slider replays the scheme as it is painted (primer, base coats, wash, drybrush,
 * highlights), on the image itself. Leaving the step restores the final render.
 */
function PaintingSteps() {
  const t = useT();
  const stage = useStore((s) => s.previewStage);
  const set = useStore((s) => s.set);
  const current = stage ?? STAGES.length - 1;
  useEffect(() => () => set({ previewStage: null }), [set]);
  return (
    <section className="painting-steps">
      <h4>{t('stages.title')}</h4>
      <input
        type="range"
        min={0}
        max={STAGES.length - 1}
        step={1}
        value={current}
        onChange={(e) => set({ previewStage: Number(e.target.value) === STAGES.length - 1 ? null : Number(e.target.value) })}
        aria-label={t('stages.title')}
      />
      <ol className="stage-labels">
        {STAGES.map((st, i) => (
          <li key={st} className={i === current ? 'on' : i < current ? 'done' : ''}>
            <button onClick={() => set({ previewStage: i === STAGES.length - 1 ? null : i })}>{t(k(`stages.${st}`))}</button>
          </li>
        ))}
      </ol>
      <p className="hint">{t(k(`stages.${STAGES[current]}.hint`))}</p>
    </section>
  );
}

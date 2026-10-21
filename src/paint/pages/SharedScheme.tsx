import { useEffect, useMemo, useState } from 'react';
import type { Scheme } from '../types';
import { useStore } from '../store';
import { useT } from '../../core/i18n';
import { decodeSchemeParam, schemeToZones } from '../lib/share';
import { buildRecipe, paintsUsed } from '../lib/recipe';
import { track } from '../../core/analytics';
import { navigate } from '../../core/router';
import { ImageUpload } from '../../core/ui/ImageUpload';
import { PaintSearchLink } from '../components/PalettePanel';
import { Swatch } from '../../core/ui/ui';

/** Public page opened from a shared link: shows the recipe and lets anyone reuse it. */
export function SharedScheme({ param }: { param: string }) {
  const t = useT();
  const library = useStore((s) => s.library);
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    decodeSchemeParam(param)
      .then((s) => {
        setScheme(s);
        track('shared_link_opened');
      })
      .catch(() => setError(true));
  }, [param]);

  const zones = useMemo(() => (scheme ? schemeToZones(scheme) : []), [scheme]);
  const lines = useMemo(() => buildRecipe(zones, library), [zones, library]);
  const paints = useMemo(() => paintsUsed(zones, library), [zones, library]);

  if (error) {
    return (
      <div className="narrow">
        <h1>{t('shared.invalidTitle')}</h1>
        <p>{t('shared.invalid')}</p>
        <a className="btn" href="#/">{t('nav.home')}</a>
      </div>
    );
  }
  if (!scheme) return <div className="narrow"><span className="spinner" /></div>;

  return (
    <div className="shared narrow">
      <p className="kicker">{t('card.kicker')}</p>
      <h1>{scheme.name}</h1>
      <p className="lead">{t('shared.lead')}</p>

      <div className="recipe-list">
        {lines.map((l) => (
          <div key={l.zone} className="card recipe">
            <h3>{l.zone} <small className="muted">{l.role}</small></h3>
            <ol>
              {l.steps.map((s) => (
                <li key={s.label}>
                  <Swatch hex={s.hex} size={22} /> <span className="muted">{s.label}</span> <strong>{s.name}</strong>{' '}
                  <small className="muted">{s.brand}</small>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <section className="card">
        <h2>{t('recipe.shoppingList')}</h2>
        <ul className="shopping">
          {paints.map((p) => (
            <li key={p.id}>
              <span className="check"><Swatch hex={p.hex} size={20} /> {p.name} <small className="muted">{p.brand} · {p.range}</small></span>
              <PaintSearchLink paint={p} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card accent">
        <h2>{t('shared.reuseTitle')}</h2>
        <p>{t('shared.reuseText')}</p>
        <ImageUpload
          label={t('shared.reuseCta')}
          onImage={async (img, name) => {
            await useStore.getState().newProject(img, `${scheme.name} · ${name}`, { scheme });
            navigate('paint/editor');
          }}
        />
        <button className="btn ghost" onClick={() => useStore.getState().addSchemeToLibrary(scheme)}>
          {t('shared.save')}
        </button>
      </section>
    </div>
  );
}

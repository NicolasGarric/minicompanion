import { useEffect, useMemo, useRef, useState } from 'react';
import type { Brand } from '../types';
import { useStore } from '../store';
import { k, useT } from '../../core/i18n';
import { extractPalette } from '../lib/palette';
import { buildBeginnerPlan, suggestMain } from '../lib/beginner';
import { track } from '../../core/analytics';
import { navigate } from '../../core/router';
import { ImageUpload } from '../../core/ui/ImageUpload';
import { StoreFinder } from '../../core/stores/StoreFinder';
import { PaintSearchLink } from '../components/PalettePanel';
import { Swatch } from '../../core/ui/ui';

type Step = 'upload' | 'colors' | 'plan' | 'shopping' | 'store';
const STEPS: Step[] = ['upload', 'colors', 'plan', 'shopping', 'store'];
const BRANDS: Brand[] = ['Citadel', 'Vallejo', 'Army Painter'];

export function Beginner() {
  const t = useT();
  const [step, setStep] = useState<Step>('upload');
  const [image, setImage] = useState<{ data: ImageData; url: string; name: string } | null>(null);
  const [main, setMain] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand>('Citadel');
  const [have, setHave] = useState<Set<string>>(new Set());
  const completed = useRef(false);

  useEffect(() => {
    track('beginner_started');
  }, []);

  useEffect(() => {
    if (step === 'store' && !completed.current) {
      completed.current = true;
      track('beginner_completed');
    }
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const palette = useMemo(() => (image ? extractPalette(image.data, 6).map((c) => c.hex) : []), [image]);
  const plan = useMemo(() => (main ? buildBeginnerPlan(main, secondary, brand) : null), [main, secondary, brand]);
  const index = STEPS.indexOf(step);

  const onImage = async (data: ImageData, name: string) => {
    const c = document.createElement('canvas');
    c.width = data.width;
    c.height = data.height;
    c.getContext('2d')!.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85));
    const colors = extractPalette(data, 6).map((x) => x.hex);
    setImage({ data, url: URL.createObjectURL(blob), name });
    setMain(suggestMain(colors) ?? colors[0]);
    setSecondary(colors.find((x) => x !== suggestMain(colors)) ?? null);
    setStep('colors');
  };

  const openInEditor = async () => {
    if (!image || !plan) return;
    await useStore.getState().newProject(image.data, image.name, { scheme: plan.scheme });
    navigate('paint/editor');
  };

  return (
    <div className="beginner narrow">
      <h1>{t('beginner.title')}</h1>
      <ol className="progress" aria-label={t('beginner.progress')}>
        {STEPS.map((s, i) => (
          <li key={s} className={i < index ? 'done' : i === index ? 'on' : ''}>
            <button disabled={i > index} onClick={() => setStep(s)}>
              <span>{i + 1}</span> {t(k(`beginner.step.${s}`))}
            </button>
          </li>
        ))}
      </ol>

      {/* The reference image stays visible through the whole path */}
      {image && step !== 'upload' && (
        <details className="beginner-ref" open>
          <summary>{t('ref.title')}</summary>
          <img src={image.url} alt={t('ref.alt')} />
        </details>
      )}

      {step === 'upload' && (
        <section className="card">
          <h2>{t('beginner.upload.title')}</h2>
          <p>{t('beginner.upload.text')}</p>
          <ImageUpload onImage={onImage} />
        </section>
      )}

      {step === 'colors' && (
        <section className="card">
          <h2>{t('beginner.colors.title')}</h2>
          <p>{t('beginner.colors.text')}</p>
          <h3>{t('beginner.main')}</h3>
          <div className="color-pick">
            {palette.map((c) => (
              <button key={c} className={main === c ? 'on' : ''} onClick={() => setMain(c)} aria-pressed={main === c}>
                <Swatch hex={c} size={44} />
              </button>
            ))}
          </div>
          <h3>{t('beginner.secondary')}</h3>
          <div className="color-pick">
            <button className={secondary === null ? 'on' : ''} onClick={() => setSecondary(null)}>{t('beginner.none')}</button>
            {palette.filter((c) => c !== main).map((c) => (
              <button key={c} className={secondary === c ? 'on' : ''} onClick={() => setSecondary(c)} aria-pressed={secondary === c}>
                <Swatch hex={c} size={44} />
              </button>
            ))}
          </div>
          <h3>{t('beginner.brand')}</h3>
          <select className="select" value={brand} onChange={(e) => setBrand(e.target.value as Brand)}>
            {BRANDS.map((b) => <option key={b}>{b}</option>)}
          </select>
          <p className="hint">{t('beginner.brandHint')}</p>
          <div className="nav-row">
            <button className="btn primary" disabled={!main} onClick={() => setStep('plan')}>{t('common.next')}</button>
          </div>
        </section>
      )}

      {step === 'plan' && plan && (
        <section>
          <h2>{t('beginner.plan.title')}</h2>
          <p>{t('beginner.plan.text')}</p>
          <ol className="technique-list">
            {plan.steps.map((s, i) => (
              <li key={s.technique} className="card technique">
                <h3><span className="step-n">{i + 1}</span> {t(k(`tech.${s.technique}`))}</h3>
                <p>{t(k(`tech.${s.technique}.how`))}</p>
                {s.primer && <p className="tip">{t(k(`primer.${s.primer}`))}</p>}
                {s.paints.map(({ paint, similarity, forKey }) => (
                  <div key={paint.id + forKey} className="plan-paint">
                    <Swatch hex={paint.hex} size={28} />
                    <span>
                      <strong>{paint.name}</strong>
                      <small>{paint.brand} · {paint.range} · {t(k(`beginner.for.${forKey}`))}</small>
                    </span>
                    <span className="similarity">{similarity}%</span>
                  </div>
                ))}
                <p className="tip">{t(k(`tech.${s.technique}.tip`))}</p>
              </li>
            ))}
          </ol>
          <div className="nav-row">
            <button className="btn" onClick={() => setStep('colors')}>{t('common.back')}</button>
            <button className="btn primary" onClick={() => setStep('shopping')}>{t('common.next')}</button>
          </div>
        </section>
      )}

      {step === 'shopping' && plan && (
        <section className="card">
          <h2>{t('beginner.shopping.title')}</h2>
          <p>{t('beginner.shopping.text', { count: plan.shoppingList.length })}</p>
          <ul className="shopping">
            {plan.shoppingList.map((p) => (
              <li key={p.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={have.has(p.id)}
                    onChange={() => setHave((h) => {
                      const n = new Set(h);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })}
                  />
                  <Swatch hex={p.hex} size={22} />
                  <span>{p.name} <small className="muted">{p.brand} · {p.range}</small></span>
                </label>
                <PaintSearchLink paint={p} />
              </li>
            ))}
          </ul>
          <p className="hint">{t('beginner.shopping.extra')}</p>
          <div className="nav-row">
            <button className="btn" onClick={() => setStep('plan')}>{t('common.back')}</button>
            <button className="btn primary" onClick={() => setStep('store')}>{t('beginner.findStore')}</button>
          </div>
        </section>
      )}

      {step === 'store' && (
        <section>
          <h2>{t('beginner.store.title')}</h2>
          <p>{t('beginner.store.text')}</p>
          <StoreFinder />
          <div className="card done">
            <h3>{t('beginner.done.title')}</h3>
            <p>{t('beginner.done.text')}</p>
            <div className="nav-row">
              <button className="btn primary" onClick={openInEditor}>{t('beginner.openEditor')}</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

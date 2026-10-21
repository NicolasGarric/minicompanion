import { k, useT } from '../i18n';
import { Icon } from '../ui/ui';

/**
 * Platform home: the whole customer journey on one screen.
 * Each step links to the module that serves it, so the page doubles as a map of the product.
 */
const JOURNEY: { id: string; icon: string; href: string }[] = [
  { id: 'discover', icon: 'sparkle', href: '#/paint/beginner' },
  { id: 'paint', icon: 'brush', href: '#/paint' },
  { id: 'share', icon: 'share', href: '#/paint' },
  { id: 'play', icon: 'grid', href: '#/play' },
  { id: 'watch', icon: 'eye', href: '#/play' },
  { id: 'store', icon: 'map', href: '#/stores' },
];

export function Home() {
  const t = useT();
  return (
    <div className="platform-home">
      <section className="hero">
        <h1>{t('platform.title')}</h1>
        <p className="lead">{t('platform.lead')}</p>
        <div className="hero-secondary">
          <a className="btn primary" href="#/paint/beginner"><Icon name="sparkle" size={16} /> {t('platform.ctaBeginner')}</a>
          <a className="btn" href="#/paint"><Icon name="brush" size={16} /> {t('nav.paint')}</a>
          <a className="btn" href="#/play"><Icon name="grid" size={16} /> {t('nav.play')}</a>
        </div>
      </section>

      <ol className="journey">
        {JOURNEY.map((s, i) => (
          <li key={s.id}>
            <a className="journey-step" href={s.href}>
              <span className="step-n">{i + 1}</span>
              <Icon name={s.icon} size={20} />
              <strong>{t(k(`journey.${s.id}`))}</strong>
              <span>{t(k(`journey.${s.id}.text`))}</span>
            </a>
          </li>
        ))}
      </ol>

      <section className="modules">
        <a className="module-card module-paint" href="#/paint">
          <span className="module-tag">PAINT</span>
          <h2>{t('platform.paintTitle')}</h2>
          <p>{t('platform.paintText')}</p>
        </a>
        <a className="module-card module-play" href="#/play">
          <span className="module-tag">PLAY</span>
          <h2>{t('platform.playTitle')}</h2>
          <p>{t('platform.playText')}</p>
        </a>
      </section>
    </div>
  );
}

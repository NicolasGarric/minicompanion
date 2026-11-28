import { useT } from '../i18n';
import { RightsRequestButton } from '../feedback/RightsRequest';

/**
 * Terms of use (/terms, owner request 2026-11-28): responsibility for user content, what may be
 * published, and the notice-and-takedown procedure (Report button, rights request form, quick
 * removal, log in /admin).
 */
export function Terms() {
  const t = useT();
  return (
    <div className="legal narrow">
      <h1>{t('terms.title')}</h1>
      <p className="lead">{t('terms.lead')}</p>

      <section className="card">
        <h2>{t('terms.platformTitle')}</h2>
        <p>{t('terms.ugc')}</p>
        <p className="hint">{t('legal.unofficial')}</p>
      </section>

      <section>
        <h2>{t('terms.rulesTitle')}</h2>
        <ul>
          <li>{t('terms.rule1')}</li>
          <li>{t('terms.rule2')}</li>
          <li>{t('terms.rule3')}</li>
          <li>{t('terms.rule4')}</li>
        </ul>
      </section>

      <section>
        <h2>{t('terms.takedownTitle')}</h2>
        <ol>
          <li>{t('terms.take1')}</li>
          <li>{t('terms.take2')}</li>
          <li>{t('terms.take3')}</li>
          <li>{t('terms.take4')}</li>
        </ol>
      </section>

      <section className="card accent">
        <h2>{t('rights.title')}</h2>
        <p>{t('terms.contactHint')}</p>
        <RightsRequestButton />
      </section>

      <p><a href="/legal">{t('nav.legal')}</a> · <a href="/cookies">{t('cookie.pageTitle')}</a></p>
    </div>
  );
}

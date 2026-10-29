import { localeOf, useLang, useT } from '../i18n';
import { Icon } from '../ui/ui';
import { APP_NAME } from '../brand';
import { DEFAULT_DONATION, DONATE, donationsOpen } from './donate';

/** Footer link to the support page. */
export function SupportLink() {
  const t = useT();
  return (
    <a className="link-button support-link" href="/support">
      <span aria-hidden>♥</span> {t('support.button')}
    </a>
  );
}

/** /support: why donations help, then the Stripe pages (new tab). */
export function SupportPage() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const amount = new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(DEFAULT_DONATION);
  return (
    <div className="narrow support-page">
      <h1>{t('support.title', { app: APP_NAME })}</h1>
      <p className="lead">{t('support.lead')}</p>
      <section className="card">
        <h2>{t('support.whatTitle')}</h2>
        <ul>
          <li>{t('support.what1')}</li>
          <li>{t('support.what2')}</li>
          <li>{t('support.what3')}</li>
        </ul>
      </section>
      {donationsOpen ? (
        <section className="card accent support-actions">
          <div className="field-row wrap">
            {DONATE.once && (
              <a className="btn primary" href={DONATE.once} target="_blank" rel="noopener noreferrer">
                <span aria-hidden>♥</span> {t('support.once')}
              </a>
            )}
            {DONATE.monthly && (
              <a className="btn" href={DONATE.monthly} target="_blank" rel="noopener noreferrer">
                <Icon name="calendar" size={16} /> {t('support.monthly')}
              </a>
            )}
          </div>
          {DONATE.once && <p><strong>{t('support.amount', { amount })}</strong></p>}
          {DONATE.monthly && <p className="hint">{t('support.monthlyAmount', { amount })}</p>}
          <p className="hint">{t('support.stripe')}</p>
          {DONATE.portal && (
            <p className="hint"><a href={DONATE.portal} target="_blank" rel="noopener noreferrer">{t('support.manage')}</a></p>
          )}
        </section>
      ) : (
        <p className="card hint">{t('support.soon')}</p>
      )}
      <section>
        <h2>{t('support.rulesTitle')}</h2>
        <ul>
          <li>{t('support.rule1')}</li>
          <li>{t('support.rule2')}</li>
          <li>{t('support.rule3')}</li>
        </ul>
      </section>
      <p>{t('support.thanks')}</p>
    </div>
  );
}

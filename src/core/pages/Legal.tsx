import { usePrefs } from '../prefs';
import { translate, useLang, useT } from '../i18n';
import { APP_NAME } from '../brand';

/** Legal / About page. The full disclaimer is shown in the reader's language, plus English and Japanese. */
export function Legal() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const disclaimerLangs = [...new Set([lang, 'en', 'ja'] as const)];
  const { retailerTemplate: template, setRetailerTemplate } = usePrefs();

  return (
    <div className="legal narrow">
      <h1>{t('legal.title')}</h1>

      <section className="card">
        <h2>{t('legal.disclaimerTitle')}</h2>
        {disclaimerLangs.map((l) => <p key={l} lang={l}>{translate('legal.full', undefined, l)}</p>)}
      </section>

      <section>
        <h2>{t('legal.aboutTitle', { app: APP_NAME })}</h2>
        <p>{t('legal.about')}</p>
      </section>

      <section>
        <h2>{t('legal.paintsTitle')}</h2>
        <ul>
          <li>{t('legal.paints1')}</li>
          <li>{t('legal.paints2')}</li>
          <li>{t('legal.paints3')}</li>
        </ul>
      </section>

      <section>
        <h2>{t('legal.privacyTitle')}</h2>
        <ul>
          <li>{t('legal.privacy1')}</li>
          <li>{t('legal.privacy2')}</li>
          <li>{t('legal.privacy3')}</li>
        </ul>
      </section>

      <section className="card">
        <h2>{t('legal.retailerTitle')}</h2>
        <p className="hint">{t('legal.retailerHint')}</p>
        <input
          className="text-input"
          type="url"
          placeholder="https://example-shop.jp/search?q={q}"
          value={template}
          onChange={(e) => setRetailerTemplate(e.target.value.trim())}
        />
        {template && !template.includes('{q}') && <p className="error">{t('legal.retailerMissingQ')}</p>}
      </section>

      <section>
        <h2>{t('legal.imagesTitle')}</h2>
        <p>{t('legal.images')}</p>
      </section>
    </div>
  );
}

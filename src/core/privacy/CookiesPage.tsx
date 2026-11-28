import { k, useT } from '../i18n';
import { useConsent } from '../consent';

type Group = 'necessary' | 'stats' | 'external';
/** Everything the app keeps on the device or loads from another service. Keep in sync with the code. */
const ROWS: { name: string; key: string; group: Group; life: string }[] = [
  { name: 'sb-…-auth-token', key: 'session', group: 'necessary', life: 'untilSignOut' },
  { name: 'cf.auth.*', key: 'authSteps', group: 'necessary', life: 'short' },
  { name: 'cf.consent', key: 'consent', group: 'necessary', life: 'sixMonths' },
  { name: 'cf.lang, cf.prefs, cf.shownTitle', key: 'prefs', group: 'necessary', life: 'untilChanged' },
  { name: 'IndexedDB chromaforge, cf.hobby, mc.tableDraft', key: 'projects', group: 'necessary', life: 'untilDeleted' },
  { name: 'cf.analytics, cf.visit', key: 'counters', group: 'stats', life: 'untilWithdrawn' },
  { name: 'Vercel Web Analytics', key: 'vercel', group: 'stats', life: 'noCookie' },
  { name: 'Twitch', key: 'twitch', group: 'external', life: 'theirs' },
];

/** Cookies and storage policy, with the current choice and a button to change it. */
export function CookiesPage() {
  const t = useT();
  const { choice, openPanel } = useConsent();
  const state = (g: Group) => (g === 'necessary' ? t('cookie.always') : choice?.[g] ? t('cookie.on') : t('cookie.off'));
  return (
    <div className="narrow cookies-page">
      <h1>{t('cookie.pageTitle')}</h1>
      <p className="lead">{t('cookie.pageLead')}</p>

      <section className="card accent">
        <h2>{t('cookie.yourChoice')}</h2>
        <ul className="cookie-state">
          {(['necessary', 'stats', 'external'] as Group[]).map((g) => (
            <li key={g}><strong>{t(k(`cookie.${g}`))}</strong> <span className={`tag ${g === 'necessary' || choice?.[g as 'stats'] ? 'ok' : ''}`}>{state(g)}</span></li>
          ))}
        </ul>
        <button className="btn" onClick={openPanel}>{t('cookie.change')}</button>
      </section>

      <section className="card">
        <h2>{t('cookie.listTitle')}</h2>
        <div className="table-wrap">
          <table className="cookie-table">
            <thead>
              <tr><th>{t('cookie.col.name')}</th><th>{t('cookie.col.purpose')}</th><th>{t('cookie.col.group')}</th><th>{t('cookie.col.life')}</th></tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key}>
                  <td><code>{r.name}</code></td>
                  <td>{t(k(`cookie.row.${r.key}`))}</td>
                  <td><span className="cell-label">{t('cookie.col.group')} : </span>{t(k(`cookie.${r.group}`))}</td>
                  <td><span className="cell-label">{t('cookie.col.life')} : </span>{t(k(`cookie.life.${r.life}`))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>{t('cookie.othersTitle')}</h2>
        <p>{t('cookie.others')}</p>
        <h2>{t('cookie.accountTitle')}</h2>
        <p>{t('cookie.account')}</p>
        <h2>{t('cookie.rightsTitle')}</h2>
        <p>{t('cookie.rights')} <a href="/legal">{t('nav.legal')}</a></p>
      </section>
    </div>
  );
}

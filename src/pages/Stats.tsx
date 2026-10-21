import { useMemo, useState } from 'react';
import { EVENTS, readAnalytics, resetAnalytics, type AnalyticsEvent } from '../lib/analytics';
import { k, useLang, useT } from '../i18n';
import { download } from '../lib/image';

const DAYS = 14;

function lastDays(n: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

const rate = (a = 0, b = 0) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

/** Internal stats page: campaign-style numbers from the local, anonymous counters. */
export function Stats() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [data, setData] = useState(readAnalytics);
  const n = (e: AnalyticsEvent) => data.totals[e] ?? 0;

  const days = useMemo(() => lastDays(DAYS), []);
  const daily = days.map((d) => ({ day: d, total: EVENTS.reduce((acc, e) => acc + (data.daily[d]?.[e] ?? 0), 0) }));
  const max = Math.max(1, ...daily.map((d) => d.total));
  const fmtDay = (d: string) => new Date(d).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-GB', { month: 'short', day: 'numeric' });
  const shareMethods = Object.entries(data.detail).filter(([key]) => key.startsWith('card_shared:'));

  return (
    <div className="stats narrow">
      <h1>{t('stats.title')}</h1>
      <p className="lead">{t('stats.lead', { since: data.since })}</p>

      <div className="kpis">
        {EVENTS.map((e) => (
          <div key={e} className="kpi">
            <span className="kpi-value">{n(e)}</span>
            <span className="kpi-label">{t(k(`event.${e}`))}</span>
          </div>
        ))}
      </div>

      <h2>{t('stats.funnels')}</h2>
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">{rate(n('scheme_created'), n('image_uploaded'))}</span>
          <span className="kpi-label">{t('stats.uploadToScheme')}</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{rate(n('card_shared'), n('card_generated'))}</span>
          <span className="kpi-label">{t('stats.shareRate')}</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{rate(n('beginner_completed'), n('beginner_started'))}</span>
          <span className="kpi-label">{t('stats.beginnerCompletion')}</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{rate(n('store_finder_opened'), n('beginner_started'))}</span>
          <span className="kpi-label">{t('stats.storeReach')}</span>
        </div>
      </div>
      {shareMethods.length > 0 && (
        <p className="hint">
          {t('stats.shareMethods')}: {shareMethods.map(([key, v]) => `${t(k(`method.${key.split(':')[1]}`))} ${v}`).join(' · ')}
        </p>
      )}

      <h2>{t('stats.daily', { days: DAYS })}</h2>
      <div className="bars" role="img" aria-label={t('stats.daily', { days: DAYS })}>
        {daily.map((d) => (
          <div key={d.day} className="bar-col" title={`${fmtDay(d.day)}: ${d.total}`}>
            <span className="bar" style={{ height: `${(d.total / max) * 100}%` }} />
            <span className="bar-label">{fmtDay(d.day).replace(/\s/g, ' ')}</span>
          </div>
        ))}
      </div>

      <details className="table-view">
        <summary>{t('stats.table')}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('stats.day')}</th>
                {EVENTS.map((e) => <th key={e}>{t(k(`event.${e}`))}</th>)}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <td>{fmtDay(d)}</td>
                  {EVENTS.map((e) => <td key={e}>{data.daily[d]?.[e] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="card">
        <h3>{t('stats.privacyTitle')}</h3>
        <p>{t('stats.privacy')}</p>
        <div className="nav-row">
          <button className="btn small" onClick={() => download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'chromaforge-stats.json')}>
            {t('stats.export')}
          </button>
          <button
            className="btn small danger-ghost"
            onClick={() => {
              if (!confirm(t('stats.confirmReset'))) return;
              resetAnalytics();
              setData(readAnalytics());
            }}
          >
            {t('stats.reset')}
          </button>
        </div>
      </div>
    </div>
  );
}

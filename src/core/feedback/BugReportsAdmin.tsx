import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../i18n';
import { useSession } from '../auth/session';
import { listBugReports, setBugStatus, type BugReport } from './bugs';

const STATUSES: BugReport['status'][] = ['new', 'seen', 'fixed', 'wontfix'];

/** Admins only (#/admin/bugs): reports sent from the footer, newest first, with screenshots. */
export function BugReportsAdmin() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const isAdmin = useSession((s) => s.profile?.is_admin ?? false);
  const [rows, setRows] = useState<BugReport[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isAdmin) listBugReports().then(setRows, () => setError(true));
  }, [isAdmin]);

  if (!isAdmin) return <div className="narrow"><p className="hint">{t('games.error.forbidden')}</p></div>;
  const change = async (r: BugReport, status: BugReport['status']) => {
    await setBugStatus(r.id, status).catch(() => setError(true));
    setRows((x) => x?.map((y) => (y.id === r.id ? { ...y, status } : y)) ?? null);
  };

  return (
    <div className="narrow">
      <h1>{t('bug.adminTitle')}</h1>
      {error && <p className="error">{t('error.generic')}</p>}
      {!rows && !error && <span className="spinner" />}
      {rows?.length === 0 && <p className="hint">{t('bug.none')}</p>}
      <ul className="bug-admin-list">
        {rows?.map((r) => (
          <li key={r.id} className={`card bug-${r.status}`}>
            <div className="card-head">
              <small className="muted">
                {new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.created_at))} ·{' '}
                {r.reporter ? <a href={`#/u/${r.reporter.handle}`}>@{r.reporter.handle}</a> : t('bug.anonymous')}
                {r.contact && <> · {r.contact}</>}
                {r.page && <> · <a href={r.page}>{r.page}</a></>}
              </small>
              <select className="select" value={r.status} onChange={(e) => change(r, e.target.value as BugReport['status'])} aria-label={t('bug.adminTitle')}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(k(`bug.status.${s}`))}</option>)}
              </select>
            </div>
            <p className="bug-message">{r.message}</p>
            {!!r.urls?.length && (
              <div className="bug-drop">
                {r.urls.map((u) => <a key={u} className="bug-shot" href={u} target="_blank" rel="noreferrer"><img src={u} alt="" /></a>)}
              </div>
            )}
            {Object.keys(r.context).length > 1 && (
              <details className="bug-context"><summary>{t('bug.contextShow')}</summary><pre>{JSON.stringify(r.context, null, 2)}</pre></details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

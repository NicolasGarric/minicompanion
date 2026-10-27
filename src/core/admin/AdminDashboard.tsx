import { useEffect, useState } from 'react';
import { k, localeOf, useLang, useT } from '../i18n';
import { useSession } from '../auth/session';
import { backendConfigured } from '../auth/supabase';
import { BackendNotice } from '../auth/BackendNotice';
import {
  cleanUp, cleanupCandidates, content, daily, langs, moderate, overview, recent, reports, setReport, storageUse, suspend, topPages, users,
  STORAGE_ALERT, STORAGE_LIMIT, type BucketUse, type CleanupFile,
  type AdminReport, type AdminUser, type ContentRow, type ContentType, type Day, type Overview, type Recent, type TopPage,
} from './admin';

/**
 * Admin dashboard (/admin): traffic and accounts straight from the database, the moderation queue
 * (reports → hide / restore content, suspend the author) and the latest content of each kind.
 */
type Tab = 'overview' | 'users' | 'moderation' | 'content' | 'storage';
const TABS: Tab[] = ['overview', 'users', 'moderation', 'content', 'storage'];

export function AdminDashboard() {
  const t = useT();
  const isAdmin = useSession((s) => s.profile?.is_admin ?? false);
  const ready = useSession((s) => s.ready);
  const [tab, setTab] = useState<Tab>(() => (TABS.find((x) => location.hash === `#${x}`) ?? 'overview'));
  useEffect(() => history.replaceState(null, '', `#${tab}`), [tab]);

  if (!backendConfigured) return <BackendNotice />;
  if (!ready) return <div className="narrow"><span className="spinner" /></div>;
  if (!isAdmin) return <div className="narrow"><p className="hint">{t('games.error.forbidden')}</p></div>;

  return (
    <div className="admin">
      <div className="page-head">
        <div>
          <h1>{t('admin.title')}</h1>
          <p className="lead">{t('admin.lead')}</p>
        </div>
        <a className="btn" href="/admin/bugs">{t('bug.adminTitle')}</a>
      </div>
      <div className="segmented view-switch" role="tablist">
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>{t(k(`admin.tab.${x}`))}</button>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'moderation' && <ModerationTab />}
      {tab === 'content' && <ContentTab />}
      {tab === 'storage' && <StorageTab />}
    </div>
  );
}

const useFmt = () => {
  const lang = useLang((s) => s.lang);
  const loc = localeOf(lang);
  return {
    n: (x: number) => new Intl.NumberFormat(loc).format(x),
    day: (d: string) => new Date(`${d.slice(0, 10)}T12:00`).toLocaleDateString(loc, { day: 'numeric', month: 'short' }),
    when: (d: string) => new Date(d).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  };
};

function ErrorLine({ error }: { error: boolean }) {
  const t = useT();
  return error ? <p className="error">{t('admin.error')}</p> : null;
}

/* ---------- Overview ---------- */

const GROUPS: [string, string[]][] = [
  ['traffic', ['visits_today', 'visits_7d', 'visits_30d', 'views_7d']],
  ['accounts', ['users', 'users_7d', 'users_30d', 'active_today', 'active_7d', 'active_30d', 'signed_in_7d', 'public_profiles', 'suspended']],
  ['activity', ['tournaments_upcoming', 'tournaments_total', 'games_upcoming', 'games_total', 'reports_confirmed', 'leagues', 'messages_7d', 'swaps_open', 'challenge_entries', 'mentorships_active', 'mentors']],
  ['todo', ['reports_open', 'bugs_new']],
];

function OverviewTab() {
  const t = useT();
  const f = useFmt();
  const [o, setO] = useState<Overview | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [pages, setPages] = useState<TopPage[]>([]);
  const [languages, setLanguages] = useState<{ lang: string; visits: number }[]>([]);
  const [feed, setFeed] = useState<Recent[]>([]);
  const [span, setSpan] = useState(30);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([overview(), recent()]).then(([a, b]) => { setO(a); setFeed(b); }, () => setError(true));
  }, []);
  useEffect(() => {
    Promise.all([daily(span), topPages(span), langs(span)]).then(([a, b, c]) => { setDays(a); setPages(b); setLanguages(c); }, () => setError(true));
  }, [span]);

  if (error) return <ErrorLine error />;
  if (!o) return <span className="spinner" />;
  return (
    <div className="admin-overview">
      {GROUPS.map(([g, keys]) => (
        <section key={g} className={`kpi-group ${g === 'todo' ? 'todo' : ''}`}>
          <h2 className="section-title">{t(k(`admin.group.${g}`))}</h2>
          <div className="kpis">
            {keys.map((key) => (
              <div key={key} className={`kpi ${g === 'todo' && o[key] > 0 ? 'alert' : ''}`}>
                <span className="kpi-value">{f.n(o[key] ?? 0)}</span>
                <span className="kpi-label">{t(k(`admin.kpi.${key}`))}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <div className="card-head admin-chart-head">
          <h2>{t('admin.chartTitle')}</h2>
          <select className="select" value={span} onChange={(e) => setSpan(+e.target.value)} aria-label={t('admin.span')}>
            {[7, 30, 90].map((d) => <option key={d} value={d}>{t('admin.lastDays', { n: d })}</option>)}
          </select>
        </div>
        <DailyChart days={days} />
      </section>

      <div className="admin-two">
        <section className="card">
          <h2>{t('admin.topPages')}</h2>
          {pages.length === 0 ? <p className="hint">{t('admin.noTraffic')}</p> : (
            <table className="standings admin-table">
              <thead><tr><th>{t('admin.page')}</th><th>{t('admin.views')}</th><th>{t('admin.visits')}</th></tr></thead>
              <tbody>{pages.map((p) => <tr key={p.page}><td><code>{p.page}</code></td><td className="tab">{f.n(p.views)}</td><td className="tab">{f.n(p.visits)}</td></tr>)}</tbody>
            </table>
          )}
          {languages.length > 0 && (
            <>
              <h3>{t('admin.languages')}</h3>
              <div className="chips">{languages.map((l) => <span key={l.lang} className="tag">{l.lang.toUpperCase()} · {f.n(l.visits)}</span>)}</div>
            </>
          )}
        </section>
        <section className="card">
          <h2>{t('admin.recent')}</h2>
          <ul className="admin-feed">
            {feed.map((r, i) => (
              <li key={i}>
                <span className={`tag feed-${r.kind}`}>{t(k(`admin.kind.${r.kind}`))}</span>
                <span className="feed-label">{r.link ? <a href={r.link}>{r.label}</a> : r.label}</span>
                <small className="muted">{r.handle ? `@${r.handle} · ` : ''}{f.when(r.at)}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="hint">{t('admin.privacy')}</p>
    </div>
  );
}

/** Visits as bars, sign-ups and active players as dots on the same days. */
function DailyChart({ days }: { days: Day[] }) {
  const t = useT();
  const f = useFmt();
  if (!days.length) return <span className="spinner" />;
  const W = 800, H = 220, L = 36, B = 26, T = 10, n = days.length, bw = (W - L - 8) / n;
  const max = Math.max(5, ...days.map((d) => Math.max(d.visits, d.active, d.signups)));
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  const every = Math.ceil(n / 10);
  return (
    <>
      <svg className="admin-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('admin.chartTitle')}>
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - 8} y1={y(max * p)} y2={y(max * p)} className="chart-grid" />
            <text x={L - 6} y={y(max * p) + 4} textAnchor="end" className="chart-axis">{Math.round(max * p)}</text>
          </g>
        ))}
        {days.map((d, i) => (
          <g key={d.day}>
            <rect x={L + i * bw + 1} y={y(d.visits)} width={Math.max(1, bw - 2)} height={H - B - y(d.visits)} className="bar-visits">
              <title>{f.day(d.day)} · {t('admin.visits')} {d.visits} · {t('admin.active')} {d.active} · {t('admin.signups')} {d.signups}</title>
            </rect>
            {d.active > 0 && <circle cx={L + i * bw + bw / 2} cy={y(d.active)} r={3.5} className="dot-active" />}
            {d.signups > 0 && <rect x={L + i * bw + bw / 2 - 3.5} y={y(d.signups) - 3.5} width={7} height={7} className="dot-signups" />}
            {i % every === 0 && <text x={L + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="chart-axis">{f.day(d.day)}</text>}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span><i className="lg-visits" /> {t('admin.visits')}</span>
        <span><i className="lg-active" /> {t('admin.active')}</span>
        <span><i className="lg-signups" /> {t('admin.signups')}</span>
      </div>
    </>
  );
}

/* ---------- Accounts ---------- */

function UsersTab() {
  const t = useT();
  const f = useFmt();
  const me = useSession((s) => s.session?.user.id);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState(false);
  const [suspending, setSuspending] = useState<{ id: string; reason: string } | null>(null);

  const load = () => users(q.trim(), sort).then(setRows, () => setError(true));
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await load();
    } catch {
      setError(true);
    }
  };

  return (
    <div className="admin-users">
      <div className="field-row wrap">
        <input className="text-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.searchUsers')} aria-label={t('admin.searchUsers')} />
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('admin.sort')}>
          {['recent', 'active', 'games', 'reports'].map((s) => <option key={s} value={s}>{t(k(`admin.sort.${s}`))}</option>)}
        </select>
        {rows && <span className="hint">{t('admin.shown', { n: rows.length })}</span>}
      </div>
      <ErrorLine error={error} />
      {!rows ? <span className="spinner" /> : (
        <div className="table-scroll">
          <table className="standings admin-table">
            <thead>
              <tr>
                <th>{t('admin.col.player')}</th><th>{t('admin.col.email')}</th><th>{t('admin.col.created')}</th><th>{t('admin.col.lastActive')}</th>
                <th>{t('admin.col.days')}</th><th>{t('admin.col.games')}</th><th>{t('admin.col.reports')}</th><th>{t('admin.col.status')}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={u.is_suspended ? 'suspended' : ''}>
                  <td><a href={`/u/${u.handle}`}>@{u.handle}</a><br /><small className="muted">{u.display_name}{u.home_city ? ` · ${u.home_city}` : ''}</small></td>
                  <td><small>{u.email ?? '—'}</small></td>
                  <td className="tab">{f.day(u.created_at)}</td>
                  <td className="tab">{u.last_active ? f.day(u.last_active) : u.last_sign_in_at ? f.day(u.last_sign_in_at) : '—'}</td>
                  <td className="tab">{u.active_days}</td>
                  <td className="tab">{u.games} / {u.tournaments}</td>
                  <td className={`tab ${u.reports_against ? 'warn' : ''}`}>{u.reports_against}</td>
                  <td>
                    {u.is_admin && <span className="tag on">{t('admin.status.admin')}</span>}
                    {u.is_public && <span className="tag">{t('admin.status.public')}</span>}
                    {u.is_suspended && <span className="tag pk" title={u.suspended_reason ?? ''}>{t('admin.status.suspended')}</span>}
                  </td>
                  <td>
                    {u.id !== me && (u.is_suspended ? (
                      <button className="btn small" onClick={() => act(() => suspend(u.id, false))}>{t('admin.unsuspend')}</button>
                    ) : suspending?.id === u.id ? (
                      <form className="field-row" onSubmit={(e) => { e.preventDefault(); void act(() => suspend(u.id, true, suspending.reason)); setSuspending(null); }}>
                        <input className="text-input" value={suspending.reason} onChange={(e) => setSuspending({ id: u.id, reason: e.target.value })} placeholder={t('admin.reason')} maxLength={300} autoFocus />
                        <button className="btn small danger-ghost">{t('admin.confirm')}</button>
                        <button type="button" className="btn small ghost" onClick={() => setSuspending(null)}>{t('common.cancel')}</button>
                      </form>
                    ) : (
                      <button className="btn small danger-ghost" onClick={() => setSuspending({ id: u.id, reason: '' })}>{t('admin.suspend')}</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{t('admin.suspendHint')}</p>
    </div>
  );
}

/* ---------- Moderation ---------- */

function ModerationTab() {
  const t = useT();
  const f = useFmt();
  const [status, setStatus] = useState('open');
  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState(false);
  const load = () => reports(status).then(setRows, () => setError(true));
  useEffect(() => {
    setRows(null);
    void load();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await load();
    } catch {
      setError(true);
    }
  };
  const hideable = (r: AdminReport) => ['swap', 'challenge', 'entry', 'profile', 'photo'].includes(r.target_type);

  return (
    <div className="admin-moderation">
      <div className="chips">
        {['open', 'actioned', 'dismissed', 'all'].map((s) => (
          <button key={s} className={`chip ${status === s ? 'on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{t(k(`admin.report.${s}`))}</button>
        ))}
      </div>
      <ErrorLine error={error} />
      {!rows ? <span className="spinner" /> : rows.length === 0 ? <p className="hint">{t('admin.noReports')}</p> : (
        <ul className="report-list">
          {rows.map((r) => (
            <li key={r.id} className={`card report-${r.status}`}>
              <div className="report-head">
                <span className="tag on">{t(k(`admin.target.${r.target_type}`))}</span>
                <strong>{r.target_label ?? r.target_id}</strong>
                {r.same_target > 1 && <span className="tag pk">{t('admin.reportsCount', { n: r.same_target })}</span>}
                {r.target_hidden && <span className="tag">{t('admin.hidden')}</span>}
              </div>
              <p className="report-reason">« {r.reason} »</p>
              <p className="hint">
                {t('admin.reportedBy', { who: `@${r.reporter_handle}`, when: f.when(r.created_at) })}
                {r.owner_handle && <> · {t('admin.owner')} <a href={`/u/${r.owner_handle}`}>@{r.owner_handle}</a></>}
              </p>
              <div className="field-row wrap">
                {hideable(r) && (r.target_hidden ? (
                  <button className="btn small" onClick={() => act(() => moderate(r.target_type, r.target_id, false))}>{t('admin.restore')}</button>
                ) : (
                  <button className="btn small primary" onClick={() => act(async () => { await moderate(r.target_type, r.target_id, true); await setReport(r.id, 'actioned'); })}>{t('admin.hideAndClose')}</button>
                ))}
                {r.status !== 'dismissed' && <button className="btn small ghost" onClick={() => act(() => setReport(r.id, 'dismissed'))}>{t('admin.dismiss')}</button>}
                {r.status !== 'open' && <button className="btn small ghost" onClick={() => act(() => setReport(r.id, 'open'))}>{t('admin.reopen')}</button>}
                {r.owner_id && <button className="btn small danger-ghost" onClick={() => act(() => suspend(r.owner_id!, true, r.reason))}>{t('admin.suspendOwner')}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Content ---------- */

function ContentTab() {
  const t = useT();
  const f = useFmt();
  const [type, setType] = useState<ContentType>('swap');
  const [rows, setRows] = useState<ContentRow[] | null>(null);
  const [error, setError] = useState(false);
  const load = () => content(type).then(setRows, () => setError(true));
  useEffect(() => {
    setRows(null);
    void load();
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin-content">
      <div className="chips">
        {(['swap', 'challenge', 'tournament', 'game', 'lfg'] as ContentType[]).map((x) => (
          <button key={x} className={`chip ${type === x ? 'on' : ''}`} aria-pressed={type === x} onClick={() => setType(x)}>{t(k(`admin.target.${x}`))}</button>
        ))}
      </div>
      <ErrorLine error={error} />
      {!rows ? <span className="spinner" /> : rows.length === 0 ? <p className="hint">{t('admin.nothing')}</p> : (
        <div className="table-scroll">
          <table className="standings admin-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.hidden ? 'suspended' : ''}>
                  <td className="tab">{f.day(r.created_at)}</td>
                  <td><a href={r.link}>{r.label}</a></td>
                  <td><a href={`/u/${r.owner_handle}`}>@{r.owner_handle}</a></td>
                  <td>
                    <button className={`btn small ${r.hidden ? '' : 'danger-ghost'}`} onClick={async () => {
                      try {
                        await moderate(type, r.id, !r.hidden);
                        await load();
                      } catch {
                        setError(true);
                      }
                    }}>{t(r.hidden ? 'admin.restore' : 'admin.hide')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Photo storage ---------- */

const mb = (bytes: number) => bytes / 1024 ** 2;

/** Gauge of the photo storage (alert from 70 % of the plan) and the cleanup of expired files. */
function StorageTab() {
  const t = useT();
  const f = useFmt();
  const [use, setUse] = useState<BucketUse[] | null>(null);
  const [files, setFiles] = useState<CleanupFile[] | null>(null);
  const [step, setStep] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [done, setDone] = useState(0);
  const [error, setError] = useState(false);
  const load = () => Promise.all([storageUse(), cleanupCandidates()]).then(([u, c]) => { setUse(u); setFiles(c); }, () => setError(true));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorLine error />;
  if (!use || !files) return <span className="spinner" />;
  const total = use.reduce((a, b) => a + b.bytes, 0);
  const share = total / STORAGE_LIMIT;
  const biggest = Math.max(1, ...use.map((b) => b.bytes));
  const reasons = [...new Set(files.map((x) => x.reason))].map((r) => {
    const of = files.filter((x) => x.reason === r);
    return { reason: r, count: of.length, bytes: of.reduce((a, b) => a + b.bytes, 0) };
  });
  const run = async () => {
    setStep('running');
    try {
      await cleanUp(files, setDone);
      setStep('done');
    } catch {
      setError(true);
    }
    load();
  };

  return (
    <div className="admin-storage">
      <section className={`card storage-gauge ${share >= STORAGE_ALERT ? 'alert' : ''}`}>
        <div className="card-head admin-chart-head">
          <h2>{t('admin.storage.title')}</h2>
          <strong className="tab">{t('admin.storage.used', { used: f.n(Math.round(mb(total))), limit: f.n(Math.round(mb(STORAGE_LIMIT))), pct: Math.round(share * 100) })}</strong>
        </div>
        <div className="gauge-bar" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('admin.storage.title')}>
          <span style={{ width: `${Math.min(100, share * 100)}%` }} />
          <i className="gauge-mark" style={{ left: `${STORAGE_ALERT * 100}%` }} />
        </div>
        <p className={share >= STORAGE_ALERT ? 'notice' : 'hint'}>{t(share >= STORAGE_ALERT ? 'admin.storage.alert' : 'admin.storage.ok')}</p>
        <table className="standings admin-table">
          <thead><tr><th>{t('admin.storage.bucket')}</th><th>{t('admin.storage.files')}</th><th>{t('admin.storage.size')}</th><th aria-hidden /></tr></thead>
          <tbody>
            {use.map((b) => (
              <tr key={b.bucket}>
                <td>{t(k(`admin.storage.b.${b.bucket}`))}</td>
                <td className="tab">{f.n(b.files)}</td>
                <td className="tab">{mb(b.bytes).toFixed(1)} MB</td>
                <td className="bucket-bar"><span style={{ width: `${(b.bytes / biggest) * 100}%` }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{t('admin.storage.cleanTitle')}</h2>
        <p className="hint">{t('admin.storage.cleanLead')}</p>
        {files.length === 0 ? (
          <p>{step === 'done' ? t('admin.storage.cleaned', { n: done }) : t('admin.storage.nothing')}</p>
        ) : (
          <>
            <ul className="plain-list">
              {reasons.map((r) => (
                <li key={r.reason}>{t(k(`admin.storage.r.${r.reason}`))} · <strong className="tab">{f.n(r.count)}</strong> · {mb(r.bytes).toFixed(1)} MB</li>
              ))}
            </ul>
            {step === 'idle' && <button className="btn" onClick={() => setStep('confirm')}>{t('admin.storage.clean', { n: files.length })}</button>}
            {step === 'confirm' && (
              <div className="field-row wrap">
                <p className="notice grow">{t('admin.storage.confirm', { n: files.length })}</p>
                <button className="btn ghost" onClick={() => setStep('idle')}>{t('common.cancel')}</button>
                <button className="btn danger-ghost" onClick={run}>{t('admin.storage.confirmBtn')}</button>
              </div>
            )}
            {step === 'running' && <p><span className="spinner small" /> {t('admin.storage.running', { done, n: files.length })}</p>}
          </>
        )}
      </section>
    </div>
  );
}

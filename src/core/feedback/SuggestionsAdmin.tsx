import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../i18n';
import { useSession } from '../auth/session';
import { safeHref } from '../lib/url';
import { answerSuggestion, listSuggestions, setSuggestionStatus, STATUSES, TOPICS, type Suggestion, type SuggestionStatus } from './suggestions';

type Filter = 'open' | 'all' | SuggestionStatus;

/** Admins only (/admin/suggestions): suggestions from the footer as an inbox of messages, with answers. */
export function SuggestionsAdmin() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const isAdmin = useSession((s) => s.profile?.is_admin ?? false);
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [topic, setTopic] = useState<string>('');

  useEffect(() => {
    if (isAdmin) listSuggestions().then(setRows, () => setError(true));
  }, [isAdmin]);

  if (!isAdmin) return <div className="narrow"><p className="hint">{t('games.error.forbidden')}</p></div>;
  const patch = (id: string, p: Partial<Suggestion>) => setRows((x) => x?.map((y) => (y.id === id ? { ...y, ...p } : y)) ?? null);
  const change = async (r: Suggestion, status: SuggestionStatus) => {
    try {
      await setSuggestionStatus(r.id, status);
      patch(r.id, { status });
    } catch {
      setError(true);
    }
  };
  const count = (f: Filter) => rows?.filter((r) => match(r, f)).length ?? 0;
  const shown = rows?.filter((r) => match(r, filter) && (!topic || r.topic === topic)) ?? [];

  return (
    <div className="narrow">
      <h1>{t('sugg.adminTitle')}</h1>
      <p className="lead">{t('sugg.adminLead')}</p>
      <div className="chips sugg-filters">
        {(['open', 'new', 'planned', 'done', 'declined', 'all'] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {t(k(f === 'open' || f === 'all' ? `sugg.filter.${f}` : `sugg.status.${f}`))} <b>{count(f)}</b>
          </button>
        ))}
        <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={t('sugg.topic')}>
          <option value="">{t('sugg.allTopics')}</option>
          {TOPICS.map((x) => <option key={x} value={x}>{t(k(`sugg.topic.${x}`))}</option>)}
        </select>
      </div>
      {error && <p className="error">{t('error.generic')}</p>}
      {!rows && !error && <span className="spinner" />}
      {rows && shown.length === 0 && <p className="hint">{t('sugg.none')}</p>}
      <ul className="sugg-inbox">
        {shown.map((r) => (
          <li key={r.id} className={`sugg-msg sugg-${r.status}`}>
            <div className="sugg-meta">
              <span className="sugg-topic">{t(k(`sugg.topic.${r.topic}`))}</span>
              <small className="muted">
                {r.author ? <a href={`/u/${r.author.handle}`}>{r.author.display_name}</a> : t('bug.anonymous')}
                {r.contact && <> · {r.contact}</>} · {new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.created_at))}
                {r.lang && <> · {r.lang.toUpperCase()}</>}
                {r.page && <> · {safeHref(r.page, { allowApp: true }) ? <a href={safeHref(r.page, { allowApp: true })}>{r.page}</a> : r.page}</>}
              </small>
            </div>
            <p className="sugg-bubble">{r.message}</p>
            <div className="sugg-actions">
              <select className="select" value={r.status} onChange={(e) => change(r, e.target.value as SuggestionStatus)} aria-label={t('sugg.statusLabel')}>
                {STATUSES.map((s) => <option key={s} value={s}>{t(k(`sugg.status.${s}`))}</option>)}
              </select>
              {r.answered_at && <small className="muted">✓ {t('sugg.answered')}</small>}
              {r.user_id && <a className="btn small ghost" href={`/messages/${r.user_id}`}>{t('sugg.thread')}</a>}
            </div>
            {r.user_id ? (
              <Answer onSend={async (body) => {
                await answerSuggestion(r.id, body);
                patch(r.id, { answered_at: new Date().toISOString(), status: r.status === 'new' ? 'seen' : r.status });
              }} />
            ) : !r.contact && <small className="hint">{t('sugg.noReply')}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const match = (r: Suggestion, f: Filter) => (f === 'all' ? true : f === 'open' ? ['new', 'seen', 'planned'].includes(r.status) : r.status === f);

function Answer({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const t = useT();
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  return (
    <form
      className="sugg-answer"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        try {
          await onSend(body.trim());
          setBody('');
          setState('sent');
        } catch {
          setState('error');
        }
      }}
    >
      <textarea className="text-input" rows={2} maxLength={1000} value={body} onChange={(e) => (setBody(e.target.value), setState('idle'))} placeholder={t('sugg.answerPlaceholder')} aria-label={t('sugg.answer')} />
      <button className="btn small primary" disabled={state === 'busy' || !body.trim()}>{t('sugg.answer')}</button>
      {state === 'sent' && <small className="muted" role="status">{t('sugg.answerSent')}</small>}
      {state === 'error' && <small className="error" role="alert">{t('error.generic')}</small>}
    </form>
  );
}

import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { requireSignIn } from '../../core/auth/session';
import { Icon } from '../../core/ui/ui';
import { addComment, deleteComment, gameComments, playError, reportComment, type GameComment } from '../lib/social';

/**
 * Comments of a played game: everyone reads them on a public game, only the players on a private one.
 * Signed-in players write; the author, the host or an admin deletes; others report (three reports hide).
 */
export function GameComments({ gameId, me, isHost, isAdmin, isPublic }: { gameId: string; me: string | null; isHost: boolean; isAdmin: boolean; isPublic: boolean }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [items, setItems] = useState<GameComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());

  const load = () => gameComments(gameId).then(setItems, (e) => (setError(playError(e) ?? 'generic'), setItems([])));
  useEffect(() => {
    load();
  }, [gameId, me]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    setBusy(false);
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) run(async () => (await addComment(gameId, text), setText('')));
  };
  const when = (iso: string) => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  if (items === null) return null;
  return (
    <section className="card game-comments">
      <h2>{t('comments.title')}</h2>
      {!isPublic && <p className="hint"><Icon name="eyeOff" size={14} /> {t('comments.privateHint')}</p>}
      {items.length === 0 ? (
        <p className="hint">{t('comments.empty')}</p>
      ) : (
        <ul className="comment-list">
          {items.map((c) => (
            <li key={c.id} className={c.is_hidden ? 'hidden-comment' : ''}>
              <small className="muted">
                {c.author ? <a href={`/u/${c.author.handle}`}>{c.author.display_name}</a> : '?'} · {when(c.created_at)}
                {c.is_hidden && ` · ${t('comments.hidden')}`}
              </small>
              <p>{c.body}</p>
              {me && (
                <span className="comment-actions">
                  {(c.author_id === me || isHost || isAdmin) && (
                    <button className="link-button small" disabled={busy} onClick={() => run(() => deleteComment(c.id))}>{t('comments.delete')}</button>
                  )}
                  {c.author_id !== me && (reported.has(c.id) ? (
                    <small className="muted">{t('comments.reported')}</small>
                  ) : (
                    <button className="link-button small" disabled={busy} onClick={() => run(async () => (await reportComment(c.id, 'comment'), setReported((s) => new Set(s).add(c.id))))}>
                      {t('comments.report')}
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {me ? (
        <form className="chat-form" onSubmit={send}>
          <input className="text-input" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('comments.placeholder')} aria-label={t('comments.placeholder')} />
          <button className="btn primary" disabled={busy || !text.trim()}>{t('comments.send')}</button>
        </form>
      ) : (
        <button className="btn" onClick={() => requireSignIn()}>{t('comments.signin')}</button>
      )}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </section>
  );
}

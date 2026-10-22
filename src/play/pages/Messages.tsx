import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { supabase } from '../../core/auth/supabase';
import { canMessage, conversations, onInsert, playError, sendMessage, thread, type Conversation, type DirectMessage } from '../lib/social';

const fmt = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Inbox: one line per person, newest first. */
export function Inbox() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { ready, session } = useSession();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (ready && !session) requireSignIn();
    if (!session) return;
    const load = () => conversations(session.user.id).then(setList, (e) => (playError(e), setError(true)));
    load();
    return onInsert('direct_messages', `recipient_id=eq.${session.user.id}`, load);
  }, [ready, session]);

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <h1>{t('msg.title')}</h1>
      {error && <p className="error">{t('error.generic')}</p>}
      {!list && !error && <span className="spinner" />}
      {list?.length === 0 && <p className="hint">{t('msg.none')}</p>}
      {!!list?.length && (
        <ul className="game-list">
          {list.map((c) => (
            <li key={c.other.id}>
              <a className={`game-card convo ${c.unread ? 'unread' : ''}`} href={`#/messages/${c.other.id}`}>
                <span className="game-what">
                  <strong>{c.other.display_name}</strong>
                  {c.unread > 0 && <span className="tag ok">{t('msg.unread', { count: c.unread })}</span>}
                </span>
                <span className="game-where muted">{c.last.body.slice(0, 90)}</span>
                <span className="muted small">{fmt(c.last.created_at, lang)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One conversation. "?post=<id>" or "?game=<id>" in the hash says what it is about. */
export function MessageThread({ userId }: { userId: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { ready, session } = useSession();
  const me = session?.user.id;
  const [other, setOther] = useState<{ display_name: string; handle: string } | null>(null);
  const [msgs, setMsgs] = useState<DirectMessage[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);
  const query = new URLSearchParams(location.hash.split('?')[1] ?? '');

  const load = () => me && thread(me, userId).then(setMsgs, (e) => setError(playError(e) ?? 'generic'));
  useEffect(() => {
    if (ready && !session) requireSignIn();
    if (!me || !supabase) return;
    supabase.from('profiles').select('display_name, handle').eq('id', userId).maybeSingle().then(({ data }) => setOther(data));
    canMessage(userId).then(setAllowed, () => setAllowed(false));
    load();
    const off = onInsert('direct_messages', `recipient_id=eq.${me}`, load);
    const id = setInterval(load, 60000);
    return () => {
      off();
      clearInterval(id);
    };
  }, [ready, me, userId]);
  useEffect(() => {
    // Braces: recent browsers return a Promise from scrollIntoView, which React would take for a cleanup.
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !text.trim()) return;
    try {
      await sendMessage(me, userId, text, {
        lfg_post_id: query.get('post') ?? undefined,
        game_id: query.get('game') ?? undefined,
      });
      setText('');
      setAllowed(true);
      load();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    }
  };

  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <a className="small" href="#/messages">← {t('msg.title')}</a>
      <h1>{other ? <a href={`#/u/${other.handle}`}>{other.display_name}</a> : '…'}</h1>
      <section className="card chat">
        <ul className="chat-list tall">
          {msgs.length === 0 && <li className="hint">{t('msg.start')}</li>}
          {msgs.map((m) => (
            <li key={m.id} className={m.sender_id === me ? 'mine' : ''}>
              <small className="muted">{fmt(m.created_at, lang)}</small>
              <span>{m.body}</span>
            </li>
          ))}
          <li ref={end} aria-hidden />
        </ul>
        {allowed ? (
          <form className="chat-form" onSubmit={send}>
            <input className="text-input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} />
            <button className="btn primary" disabled={!text.trim()}>{t('chat.send')}</button>
          </form>
        ) : (
          <p className="hint">{t('msg.notAllowed')}</p>
        )}
        {error && <p className="error">{t(error === 'rate_limited' ? 'chat.rateLimited' : 'error.generic')}</p>}
      </section>
    </div>
  );
}

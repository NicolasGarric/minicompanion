import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '../../core/i18n';
import { gameChat, playError, sendGameMessage, type GameMessage } from '../lib/social';

/** Chat of a game, for the host and the accepted players. Refreshed every 15 s. */
export function GameChat({ gameId, me }: { gameId: string; me: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);

  const load = () => gameChat(gameId).then(setMessages, (e) => setError(playError(e)));
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [gameId]);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await sendGameMessage(gameId, me, text);
      setText('');
      load();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    }
  };

  return (
    <section className="card chat">
      <h2>{t('chat.gameTitle')}</h2>
      <ul className="chat-list">
        {messages.length === 0 && <li className="hint">{t('chat.empty')}</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.sender_id === me ? 'mine' : ''}>
            <small className="muted">{m.sender?.display_name} · {new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(m.created_at))}</small>
            <span>{m.body}</span>
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ul>
      <form className="chat-form" onSubmit={send}>
        <input className="text-input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} />
        <button className="btn primary" disabled={!text.trim()}>{t('chat.send')}</button>
      </form>
      {error && <p className="error">{t(error === 'rate_limited' ? 'chat.rateLimited' : 'error.generic')}</p>}
    </section>
  );
}

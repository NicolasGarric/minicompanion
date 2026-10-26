import { useEffect, useState } from 'react';
import { k, localeOf, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { shrinkPhoto } from '../../core/lib/image';
import { Icon, Modal } from '../../core/ui/ui';
import { playError } from '../../play/lib/social';
import { challenges, entriesOf, isOpen, photoUrl, report, submit, toggleLike, withdraw, type Challenge, type ChallengeEntry } from '../lib/challenges';

/**
 * Seasonal challenges: one theme and palette a month. The page opens on the wall of entries of
 * the current month; players add one photo, like other entries, and can browse past months.
 */
export function Challenges() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const [list, setList] = useState<Challenge[] | null>(null);
  const [current, setCurrent] = useState<Challenge | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[] | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ChallengeEntry | null>(null);

  useEffect(() => {
    if (!backendConfigured) return;
    challenges().then((all) => {
      setList(all);
      setCurrent(all.find(isOpen) ?? all.filter((c) => c.starts_on <= new Date().toISOString().slice(0, 10)).pop() ?? all[0] ?? null);
    }, (e) => setError(playError(e) ?? 'generic'));
  }, []);
  const load = () => current && entriesOf(current.id).then(setEntries, (e) => setError(playError(e) ?? 'generic'));
  useEffect(() => {
    setEntries(null);
    void load();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!backendConfigured) return <BackendNotice />;
  if (!list || !current) return <div className="narrow">{error ? <p className="error">{t(k(`games.error.${error}`))}</p> : <span className="spinner" />}</div>;

  const open = isOpen(current);
  const daysLeft = Math.max(0, Math.ceil((Date.parse(`${current.ends_on}T23:59:59`) - Date.now()) / 86400000));
  const mine = entries?.find((e) => e.is_mine);
  const month = (c: Challenge) => new Date(`${c.starts_on}T12:00`).toLocaleDateString(localeOf(lang), { month: 'short', year: '2-digit' });
  const like = async (e: ChallengeEntry) => {
    if (!session) return requireSignIn();
    try {
      await toggleLike(e.id);
      void load();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    }
  };

  return (
    <div className="narrow challenges">
      <div className="page-head">
        <div>
          <p className="kicker">{t('challenge.kicker', { month: month(current) })}</p>
          <h1>{t(k(`challenge.theme.${current.theme_key}`))}</h1>
          <p className="lead">{t(k(`challenge.rule.${current.theme_key}`))}</p>
        </div>
        <div className="challenge-side">
          <div className="palette-row" aria-label={t('challenge.palette')}>
            {current.palette.map((c) => <span key={c} style={{ background: c }} title={c} />)}
          </div>
          {open ? <span className="tag">{t('challenge.daysLeft', { n: daysLeft })}</span> : <span className="tag">{t('challenge.closed')}</span>}
        </div>
      </div>

      <div className="chips challenge-months" role="tablist" aria-label={t('challenge.months')}>
        {list.filter((c) => c.starts_on <= new Date().toISOString().slice(0, 10)).map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === current.id} className={`chip ${c.id === current.id ? 'on' : ''}`} onClick={() => setCurrent(c)}>
            {month(c)}
          </button>
        ))}
      </div>

      <div className="field-row wrap">
        {open && (mine ? (
          <>
            <span className="tag ok">{t('challenge.youAreIn')}</span>
            <button className="btn small" onClick={() => setJoining(true)}>{t('challenge.replace')}</button>
            <button className="btn small ghost" onClick={async () => { await withdraw(current.id); void load(); }}>{t('challenge.withdraw')}</button>
          </>
        ) : (
          <button className="btn primary" onClick={() => (session ? setJoining(true) : requireSignIn())}><Icon name="plus" size={16} /> {t('challenge.join')}</button>
        ))}
        <span className="hint">{t('challenge.count', { n: entries?.length ?? 0 })}</span>
      </div>
      {error && <p className="error">{t(k(`games.error.${error}`))}</p>}

      {entries === null ? <span className="spinner" /> : entries.length === 0 ? (
        <p className="hint">{t('challenge.empty')}</p>
      ) : (
        <div className="entry-wall">
          {entries.map((e) => (
            <figure key={e.id} className={`wall-item ${e.is_hidden ? 'hidden' : ''}`}>
              <button className="wall-photo" onClick={() => setZoom(e)} aria-label={e.title}>
                <img src={photoUrl(e.photo_path)} alt="" loading="lazy" />
              </button>
              <figcaption>
                <span className="wall-title"><strong>{e.title}</strong><small className="muted">@{e.author_handle}</small></span>
                <button className={`like ${e.liked ? 'on' : ''}`} onClick={() => like(e)} disabled={e.is_mine || !open} aria-pressed={e.liked} aria-label={t('challenge.like')}>
                  ♥ {e.likes}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {zoom && (
        <Modal title={zoom.title} onClose={() => setZoom(null)} wide>
          <img className="zoom-photo" src={photoUrl(zoom.photo_path)} alt={zoom.title} />
          <div className="field-row wrap">
            <a href={`/u/${zoom.author_handle}`}>@{zoom.author_handle}</a>
            <span className="spacer" />
            {session && !zoom.is_mine && (
              <button className="btn small ghost" onClick={async () => { await report(zoom.id, 'challenge entry'); setZoom(null); void load(); }}>
                {t('challenge.report')}
              </button>
            )}
          </div>
        </Modal>
      )}
      {joining && <JoinDialog challenge={current} onClose={() => setJoining(false)} onDone={() => { setJoining(false); void load(); }} />}
    </div>
  );
}

function JoinDialog({ challenge, onClose, onDone }: { challenge: Challenge; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);

  const pick = async (f?: File) => {
    if (!f) return;
    const b = await shrinkPhoto(f, 1600);
    setPhoto(b);
    setPreview(URL.createObjectURL(b));
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return;
    setBusy(true);
    try {
      await submit(challenge.id, title.trim(), photo);
      onDone();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t('challenge.join')} onClose={onClose}>
      <form className="field-col" onSubmit={send}>
        <label className="field"><span>{t('challenge.entryTitle')}</span>
          <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required /></label>
        <label className="field"><span>{t('challenge.photo')}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pick(e.target.files?.[0])} required /></label>
        {preview && <img className="zoom-photo" src={preview} alt="" />}
        <label className="check"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} /> {t('challenge.rights')}</label>
        {error && <p className="error">{t(k(`games.error.${error}`))}</p>}
        <button className="btn primary" disabled={busy || !photo || !rights || !title.trim()}>{busy ? <span className="spinner small" /> : t('challenge.send')}</button>
      </form>
    </Modal>
  );
}

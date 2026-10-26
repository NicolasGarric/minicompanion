import { useEffect, useState } from 'react';
import { k, localeOf, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon, Modal, Toggle } from '../../core/ui/ui';
import { playError } from '../lib/games';
import {
  STEPS, answer, endMentorship, markStep, mentors, myMentorProfile, myMentorships, requestMentor, saveMentorProfile, stepAt,
  type Mentor, type MentorProfile, type Mentorship,
} from '../lib/mentors';

/**
 * Mentoring: a beginner asks an experienced player to guide them; together they tick four steps
 * (meet at a store, first painted miniature, first game, first tournament) and both earn stamps.
 */
export function Mentors() {
  const t = useT();
  const session = useSession((s) => s.session);
  const me = session?.user.id;
  const [list, setList] = useState<Mentor[] | null>(null);
  const [mine, setMine] = useState<Mentorship[]>([]);
  const [profile, setProfile] = useState<MentorProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<Mentor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setList(await mentors());
      if (me) {
        setMine(await myMentorships());
        setProfile(await myMentorProfile(me));
      }
    } catch (e) {
      setError(playError(e) ?? 'generic');
      setList([]);
    }
  };
  useEffect(() => {
    if (backendConfigured) void load();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!backendConfigured) return <BackendNotice />;

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
  };
  const live = mine.filter((m) => m.status === 'active');
  const requests = mine.filter((m) => m.status === 'requested' && m.role === 'mentor');
  const pending = mine.find((m) => m.status === 'requested' && m.role === 'mentee');
  const hasMentor = mine.some((m) => m.role === 'mentee' && (m.status === 'active' || m.status === 'requested'));

  return (
    <div className="narrow mentors">
      <div className="page-head">
        <div>
          <h1>{t('mentor.title')}</h1>
          <p className="lead">{t('mentor.lead')}</p>
        </div>
        <button className="btn" onClick={() => (me ? setEditing(true) : requireSignIn())}>
          <Icon name="star" size={16} /> {t(profile?.active ? 'mentor.editProfile' : 'mentor.become')}
        </button>
      </div>
      {error && <p className="error">{t(k(`games.error.${error}`))}</p>}

      {requests.map((m) => (
        <div key={m.id} className="notice">
          <p><strong>{m.other_name}</strong> {t('mentor.asks')}{m.message ? ` : « ${m.message} »` : ''}</p>
          <div className="field-row">
            <button className="btn small primary" onClick={() => act(() => answer(m.id, true))}>{t('mentor.accept')}</button>
            <button className="btn small ghost" onClick={() => act(() => answer(m.id, false))}>{t('mentor.decline')}</button>
          </div>
        </div>
      ))}
      {pending && <p className="notice">{t('mentor.pending', { name: pending.other_name })}</p>}

      {live.map((m) => <DuoPath key={m.id} m={m} onTick={(s, done) => act(() => markStep(m.id, s, done))} onEnd={() => act(() => endMentorship(m.id))} />)}

      <h2 className="section-title">{t('mentor.near')}</h2>
      {list === null ? <span className="spinner" /> : list.filter((x) => x.user_id !== me).length === 0 ? <p className="hint">{t('mentor.none')}</p> : (
        <div className="mentor-grid">
          {list.filter((x) => x.user_id !== me).map((x) => (
            <article key={x.user_id} className="card mentor-card">
              <div className="mentor-head">
                <a href={`/u/${x.handle}`} className="mentor-name">{x.display_name}</a>
                {x.mentees > 0 && <span className="tag yl">{t('mentor.mentees', { n: x.mentees })}</span>}
              </div>
              <p>{x.games}</p>
              <p className="hint">{x.availability} · {x.area}</p>
              <button className="btn small primary" disabled={hasMentor} onClick={() => (me ? setAsking(x) : requireSignIn())}>{t('mentor.ask')}</button>
            </article>
          ))}
        </div>
      )}

      {editing && me && <ProfileDialog initial={profile} onClose={() => setEditing(false)} onSave={(p) => act(async () => { await saveMentorProfile(me, p); setEditing(false); })} />}
      {asking && <AskDialog mentor={asking} onClose={() => setAsking(null)} onSend={(msg) => act(async () => { await requestMentor(asking.user_id, msg); setAsking(null); })} />}
    </div>
  );
}

function DuoPath({ m, onTick, onEnd }: { m: Mentorship; onTick: (s: (typeof STEPS)[number], done: boolean) => void; onEnd: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const done = STEPS.filter((s) => stepAt(m, s)).length;
  return (
    <section className="card duo">
      <div className="duo-head">
        <h2>{t(m.role === 'mentor' ? 'mentor.youGuide' : 'mentor.guidedBy', { name: m.other_name })}</h2>
        <span className="tag">{done} / {STEPS.length}</span>
      </div>
      <ol className="duo-steps">
        {STEPS.map((s, i) => {
          const at = stepAt(m, s);
          return (
            <li key={s} className={at ? 'done' : ''}>
              <button className="duo-dot" aria-pressed={!!at} onClick={() => onTick(s, !at)} aria-label={t(k(`mentor.step.${s}`))}>{at ? '✓' : i + 1}</button>
              <div>
                <strong>{t(k(`mentor.step.${s}`))}</strong>
                <small className="muted">{at ? new Date(at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' }) : t('mentor.tapToTick')}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="stamp-row">
        {STEPS.map((s) => <span key={s} className={`hanko small ${stepAt(m, s) ? '' : 'off'}`}>{t(k(`mentor.stamp.${s}`))}</span>)}
      </div>
      <button className="btn small ghost" onClick={onEnd}>{t('mentor.end')}</button>
    </section>
  );
}

function ProfileDialog({ initial, onClose, onSave }: { initial: MentorProfile | null; onClose: () => void; onSave: (p: MentorProfile) => void }) {
  const t = useT();
  const [p, setP] = useState<MentorProfile>(initial ?? { games: '', availability: '', area: '', active: true });
  const ok = p.games.trim().length >= 2 && p.availability.trim().length >= 2 && p.area.trim().length >= 2;
  return (
    <Modal title={t('mentor.become')} onClose={onClose}>
      <form className="field-col" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(p); }}>
        <p className="hint">{t('mentor.becomeHint')}</p>
        <label className="field"><span>{t('mentor.games')}</span><input className="text-input" value={p.games} maxLength={120} onChange={(e) => setP({ ...p, games: e.target.value })} placeholder={t('mentor.gamesPlaceholder')} /></label>
        <label className="field"><span>{t('mentor.availability')}</span><input className="text-input" value={p.availability} maxLength={120} onChange={(e) => setP({ ...p, availability: e.target.value })} placeholder={t('mentor.availabilityPlaceholder')} /></label>
        <label className="field"><span>{t('mentor.area')}</span><input className="text-input" value={p.area} maxLength={80} onChange={(e) => setP({ ...p, area: e.target.value })} placeholder={t('mentor.areaPlaceholder')} /></label>
        <Toggle checked={p.active} onChange={(active) => setP({ ...p, active })} label={t('mentor.visible')} />
        <button className="btn primary" disabled={!ok}>{t('common.save')}</button>
      </form>
    </Modal>
  );
}

function AskDialog({ mentor, onClose, onSend }: { mentor: Mentor; onClose: () => void; onSend: (msg: string) => void }) {
  const t = useT();
  const [msg, setMsg] = useState('');
  return (
    <Modal title={t('mentor.askTitle', { name: mentor.display_name })} onClose={onClose}>
      <form className="field-col" onSubmit={(e) => { e.preventDefault(); onSend(msg.trim()); }}>
        <label className="field"><span>{t('mentor.message')}</span>
          <textarea className="text-input" rows={3} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('mentor.messagePlaceholder')} /></label>
        <button className="btn primary">{t('mentor.send')}</button>
      </form>
    </Modal>
  );
}

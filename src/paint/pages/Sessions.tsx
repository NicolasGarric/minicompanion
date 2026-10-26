import { useEffect, useState } from 'react';
import { localeOf, useLang, useT } from '../../core/i18n';
import { Icon, IconButton } from '../../core/ui/ui';
import { minutesByDay, streak, unitById, useHobby } from '../hobby/store';

/**
 * Painting sessions: a timer (optionally for a unit of the pile), the current streak, and the
 * last 18 weeks as a halftone calendar (dot size = minutes painted that day).
 */
const WEEKS = 18;

export function Sessions() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { sessions, running, armies } = useHobby();
  const { startSession, stopSession, cancelSession, removeSession, addSession } = useHobby.getState();
  const [now, setNow] = useState(Date.now());
  const [unitId, setUnitId] = useState('');
  const [note, setNote] = useState('');
  const [manual, setManual] = useState({ date: new Date().toISOString().slice(0, 10), minutes: 30 });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Calendar: columns are weeks (Monday first), rows are days
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const days = WEEKS * 7 - (6 - dow);
  const perDay = minutesByDay(sessions, days);
  const max = Math.max(60, ...perDay);
  const cells: (number | null)[] = [...perDay, ...new Array(6 - dow).fill(null)];
  const total = sessions.reduce((s, x) => s + x.minutes, 0);
  const year = sessions.filter((s) => new Date(s.start).getFullYear() === today.getFullYear()).reduce((s, x) => s + x.minutes, 0);
  const week = perDay.slice(-7).reduce((a, b) => a + b, 0);
  const elapsed = running ? Math.floor((now - running.start) / 1000) : 0;
  const clock = `${String(Math.floor(elapsed / 3600)).padStart(1, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const hours = (m: number) => t('sessions.hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
  const runningUnit = unitById(armies, running?.unitId);
  const recent = [...sessions].sort((a, b) => b.start - a.start).slice(0, 8);

  return (
    <div className="narrow sessions">
      <div className="page-head">
        <div>
          <h1>{t('sessions.title')}</h1>
          <p className="lead">{t('sessions.lead')}</p>
        </div>
      </div>

      <div className="session-stats">
        <div><span className="big">{streak(sessions)}</span><span>{t('sessions.streak')}</span></div>
        <div><span className="big">{Math.round(year / 60)} h</span><span>{t('sessions.thisYear')}</span></div>
        <div><span className="big">{hours(week)}</span><span>{t('sessions.thisWeek')}</span></div>
      </div>

      <section className="card session-timer" aria-live="polite">
        {running ? (
          <>
            <div className="timer-clock tab">{clock}</div>
            {runningUnit && <p className="hint">{runningUnit.unit.name} · {runningUnit.army.name}</p>}
            <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('sessions.notePlaceholder')} maxLength={120} aria-label={t('sessions.note')} />
            <div className="field-row wrap">
              <button className="btn primary" onClick={() => { stopSession(note.trim() || undefined); setNote(''); }}><Icon name="check" size={16} /> {t('sessions.stop')}</button>
              <button className="btn ghost" onClick={cancelSession}>{t('common.cancel')}</button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>{t('sessions.forUnit')}</span>
              <select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">{t('sessions.noUnit')}</option>
                {armies.map((a) => (
                  <optgroup key={a.id} label={a.name}>
                    {a.units.filter((u) => u.painted < u.count).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <button className="btn primary" onClick={() => startSession(unitId || undefined)}><Icon name="brush" size={16} /> {t('sessions.start')}</button>
          </>
        )}
      </section>

      <section aria-labelledby="cal-title">
        <h2 id="cal-title" className="section-title">{t('sessions.calendar')}</h2>
        <div className="halftone-cal" role="img" aria-label={t('sessions.calendarAria', { n: perDay.filter((m) => m > 0).length })}>
          {cells.map((m, i) => (
            <span key={i} className="cal-cell" title={m === null ? '' : `${new Date(Date.now() - (days - 1 - i) * 86400000).toLocaleDateString(localeOf(lang))} · ${m} min`}>
              {m !== null && <i style={{ width: `${m ? 30 + 70 * Math.min(1, m / max) : 14}%`, opacity: m ? 1 : 0.25, background: i >= days - 1 ? 'var(--ink1)' : undefined }} />}
            </span>
          ))}
        </div>
        <p className="hint">{t('sessions.total', { h: Math.round(total / 60), n: sessions.length })}</p>
      </section>

      <section aria-labelledby="log-title">
        <h2 id="log-title" className="section-title">{t('sessions.log')}</h2>
        <form className="field-row wrap" onSubmit={(e) => { e.preventDefault(); addSession({ start: new Date(`${manual.date}T12:00`).getTime(), minutes: manual.minutes }); }}>
          <input className="text-input" type="date" value={manual.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setManual({ ...manual, date: e.target.value })} aria-label={t('sessions.date')} />
          <input className="num-input" type="number" min={1} max={720} value={manual.minutes} onChange={(e) => setManual({ ...manual, minutes: Math.max(1, Math.min(720, +e.target.value || 1)) })} aria-label={t('sessions.minutes')} />
          <span className="hint">min</span>
          <button className="btn small">{t('sessions.addPast')}</button>
        </form>
        {recent.length === 0 ? <p className="hint">{t('sessions.none')}</p> : (
          <ul className="session-log">
            {recent.map((s) => {
              const u = unitById(armies, s.unitId);
              return (
                <li key={s.id} className="ticket">
                  <span className="b">{new Date(s.start).toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="tab">{hours(s.minutes)}</span>
                  <span className="muted">{[u?.unit.name, s.note].filter(Boolean).join(' · ')}</span>
                  <IconButton icon="trash" label={t('common.delete')} size={13} onClick={() => removeSession(s.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

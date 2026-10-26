import { useEffect, useState } from 'react';
import { k, useT } from '../core/i18n';
import { useSession } from '../core/auth/session';
import { STAMPS, TITLES, activity, levelOf, setShownTitle, shownTitle, titleFor, xpOf, type Activity } from './progress';

/**
 * Level & titles as Japanese hanko stamps: the current level stamp, XP to the next level, the
 * stamps earned (a tap shows one on my player card), and how XP is earned.
 */
export function LevelPage() {
  const t = useT();
  const session = useSession((s) => s.session);
  const [a, setA] = useState<Activity | null>(null);
  const [shown, setShown] = useState(shownTitle());
  useEffect(() => {
    void activity().then(setA);
  }, [session]);
  if (!a) return <div className="narrow"><span className="spinner" /></div>;

  const xp = xpOf(a), lv = levelOf(xp), title = titleFor(lv.level);
  const pick = (key: string) => {
    setShownTitle(key);
    setShown(key);
  };
  const pct = Math.round(((xp - lv.from) / (lv.to - lv.from)) * 100);

  return (
    <div className="narrow level-page">
      <div className="page-head">
        <div>
          <h1>{t('level.title')}</h1>
          <p className="lead">{t('level.lead')}</p>
        </div>
      </div>

      <div className="level-hero">
        <div className="hanko big" aria-label={t('level.current', { n: lv.level })}>
          <span className="hanko-lv">{t('level.lv', { n: lv.level })}</span>
          <span className="hanko-title">{t(k(`level.titleName.${title}`))}</span>
        </div>
        <div className="level-progress">
          <div className="xp-bar"><span style={{ width: `${pct}%` }} /></div>
          <p className="tab">{t('level.xp', { xp, next: lv.to })}</p>
          <p className="hint">{t('level.next', { n: lv.level + 1, xp: lv.to - xp })}</p>
          {!session && <p className="notice small">{t('level.signInMore')}</p>}
        </div>
      </div>

      <h2 className="section-title">{t('level.stamps')}</h2>
      <p className="hint">{t('level.stampsHint')}</p>
      <div className="stamp-book">
        {TITLES.filter(([l]) => l <= lv.level).map(([, key]) => (
          <button key={key} className={`hanko ${shown === `title:${key}` ? 'shown' : ''}`} onClick={() => pick(`title:${key}`)} aria-pressed={shown === `title:${key}`}>
            {t(k(`level.titleName.${key}`))}
          </button>
        ))}
        {STAMPS.map((s) => {
          const ok = s.done(a);
          return (
            <button key={s.id} className={`hanko ${ok ? '' : 'off'} ${shown === `stamp:${s.id}` ? 'shown' : ''}`} disabled={!ok} onClick={() => pick(`stamp:${s.id}`)} aria-pressed={shown === `stamp:${s.id}`} title={t(k(`level.stampHow.${s.id}`))}>
              {ok ? t(k(`level.stamp.${s.id}`)) : '?'}
            </button>
          );
        })}
      </div>

      <h2 className="section-title">{t('level.how')}</h2>
      <ul className="xp-rules">
        {(['painted', 'session', 'army', 'game', 'tournament', 'store', 'challenge', 'mentor'] as const).map((r) => <li key={r}>{t(k(`level.rule.${r}`))}</li>)}
      </ul>
      <p className="hint">{t('level.fair')}</p>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { k, useT } from '../core/i18n';
import { DISPLAY, FONT, halftoneBand, wrap } from '../core/lib/card';
import { download } from '../core/lib/image';
import { APP_NAME } from '../core/brand';
import { Icon } from '../core/ui/ui';
import { activity, colourOfYear, levelOf, titleFor, xpOf, type Activity } from './progress';

/**
 * My year in the hobby, as a six-screen story: one big number per screen (miniatures painted,
 * hours, games, colour of the year, streak, level). Tap to go on; each screen can be saved as a
 * 1080×1920 image to post.
 */
interface Screen { kicker: string; big: string; text: string; bg: string; ink: string; swatch?: string }

export function YearInReview() {
  const t = useT();
  const now = new Date();
  // In January, the year that just ended is the interesting one
  const [year] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [a, setA] = useState<Activity | null>(null);
  const [colour, setColour] = useState<{ hex: string; name: string } | null>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    void activity(year).then(setA);
    void colourOfYear(year).then(setColour);
  }, [year]);

  const screens: Screen[] = a ? [
    { kicker: t('year.s1k', { year }), big: String(a.painted), text: t(a.painted >= 20 ? 'year.s1big' : 'year.s1', { n: a.painted }), bg: '#ff4f7b', ink: '#fffaf0' },
    { kicker: t('year.s2k'), big: `${Math.round(a.minutes / 60)} h`, text: t('year.s2', { n: a.sessions }), bg: '#1d2a5b', ink: '#fffaf0' },
    { kicker: t('year.s3k'), big: String(a.games + a.tournament_matches), text: t('year.s3', { w: a.wins, o: a.opponents, s: a.stores }), bg: '#ffd23f', ink: '#1d2a5b' },
    { kicker: t('year.s4k'), big: colour?.name ?? '—', text: t(colour ? 'year.s4' : 'year.s4none'), bg: '#fffaf0', ink: '#1d2a5b', swatch: colour?.hex },
    { kicker: t('year.s5k'), big: String(a.streak), text: t('year.s5', { c: a.challenge_entries, t: a.tournaments }), bg: '#3b8f6b', ink: '#fffaf0' },
    (() => {
      const lv = levelOf(xpOf(a)).level;
      return { kicker: t('year.s6k'), big: t('level.lv', { n: lv }), text: t('year.s6', { title: t(k(`level.titleName.${titleFor(lv)}`)) }), bg: '#f4ecdc', ink: '#1d2a5b' };
    })(),
  ] : [];

  useEffect(() => {
    if (!screens.length || paused) return;
    timer.current = setTimeout(() => setI((x) => (x + 1) % screens.length), 5000);
    return () => clearTimeout(timer.current);
  }, [i, screens.length, paused]);

  if (!a) return <div className="narrow"><span className="spinner" /></div>;
  const s = screens[i];

  const save = async () => {
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1920;
    const ctx = c.getContext('2d')!;
    await document.fonts?.ready;
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, 1080, 1920);
    halftoneBand(ctx, 0, 1100, 1080, 820, s.ink === '#fffaf0' ? 'rgba(29,42,91,0.35)' : 'rgba(255,79,123,0.35)');
    ctx.fillStyle = s.ink;
    ctx.font = `700 56px ${FONT}`;
    ctx.fillText(s.kicker, 80, 260);
    if (s.swatch) {
      ctx.fillStyle = s.swatch;
      ctx.fillRect(80, 330, 920, 420);
      ctx.fillStyle = s.ink;
    }
    ctx.font = `400 ${s.big.length > 6 ? 140 : 300}px ${DISPLAY}`;
    ctx.fillText(s.big, 80, s.swatch ? 900 : 640);
    ctx.font = `700 60px ${FONT}`;
    wrap(ctx, s.text, 80, s.swatch ? 1020 : 800, 920, 80);
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(`${APP_NAME} · ${year}`, 80, 1840);
    c.toBlob((b) => {
      if (!b) return;
      const file = new File([b], `my-hobby-${year}-${i + 1}.png`, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) void navigator.share({ files: [file] }).catch(() => undefined);
      else download(b, file.name);
    }, 'image/png');
  };

  return (
    <div className="narrow year-page">
      <div className="page-head">
        <div>
          <h1>{t('year.title', { year })}</h1>
          <p className="lead">{t('year.lead')}</p>
        </div>
      </div>
      <div className="story" style={{ background: s.bg, color: s.ink }} onClick={() => setI((i + 1) % screens.length)}
        onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === ' ') setI((i + 1) % screens.length); if (e.key === 'ArrowLeft') setI((i - 1 + screens.length) % screens.length); }}
        aria-label={t('year.next')}>
        <div className="story-bars">
          {screens.map((_, k2) => <span key={k2}><i className={k2 < i ? 'full' : k2 === i ? (paused ? 'now paused' : 'now') : ''} /></span>)}
        </div>
        <div className="story-halftone" aria-hidden />
        <p className="story-kicker">{s.kicker}</p>
        {s.swatch && <div className="story-swatch" style={{ background: s.swatch }} />}
        <p className={`story-big ${s.big.length > 6 ? 'long' : ''}`}>{s.big}</p>
        <p className="story-text">{s.text}</p>
        <p className="story-foot">{APP_NAME} · {year}</p>
      </div>
      <div className="field-row wrap">
        <button className="btn" onClick={() => setI((i - 1 + screens.length) % screens.length)} aria-label={t('year.prev')}>←</button>
        <button className="btn" onClick={() => setI((i + 1) % screens.length)} aria-label={t('year.next')}>→</button>
        <button className="btn primary" onClick={save}><Icon name="share" size={16} /> {t('year.save')}</button>
      </div>
      <p className="hint">{t('year.privacy')}</p>
    </div>
  );
}

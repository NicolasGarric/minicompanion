import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { k, useT } from '../core/i18n';
import { requireSignIn, useSession } from '../core/auth/session';
import { DISPLAY, FONT, fitText, halftoneBand } from '../core/lib/card';
import { download } from '../core/lib/image';
import { Icon } from '../core/ui/ui';
import { activity, levelOf, shownTitle, titleFor, xpOf } from './progress';

/**
 * Player card as a Japanese business card (meishi, 91 × 55): name, handle, city, games, level and
 * the chosen title, with a QR code to my public player page. Shown full screen in a store, or
 * downloaded as an image to print.
 */
export function PlayerCard() {
  const t = useT();
  const { ready, session, profile } = useSession();
  const [qr, setQr] = useState('');
  const [level, setLevel] = useState<{ n: number; title: string } | null>(null);
  const [full, setFull] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = profile ? `${location.origin}/u/${profile.handle}` : '';

  useEffect(() => {
    if (ready && !session) requireSignIn();
  }, [ready, session]);
  useEffect(() => {
    if (!url) return;
    void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#1d2a5b', light: '#fffaf0' } }).then(setQr);
    void activity().then((a) => {
      const lv = levelOf(xpOf(a)).level, shown = shownTitle();
      const title = shown?.startsWith('stamp:') ? t(k(`level.stamp.${shown.slice(6)}`)) : t(k(`level.titleName.${shown?.startsWith('title:') ? shown.slice(6) : titleFor(lv)}`));
      setLevel({ n: lv, title });
    });
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return <div className="narrow"><span className="spinner" /></div>;
  const games = profile.factions.slice(0, 3);

  const save = async () => {
    const c = canvas.current ?? document.createElement('canvas');
    c.width = 1820;
    c.height = 1100;
    const ctx = c.getContext('2d')!;
    await document.fonts?.ready;
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, 1820, 1100);
    halftoneBand(ctx, 1100, 0, 720, 1100, 'rgba(255,79,123,0.25)');
    ctx.strokeStyle = '#1d2a5b';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 1806, 1086);
    ctx.fillStyle = '#ff4f7b';
    ctx.font = `700 44px ${FONT}`;
    ctx.fillText('PLAYER CARD · MiniCompanion', 90, 140);
    ctx.fillStyle = '#1d2a5b';
    ctx.font = `400 130px ${DISPLAY}`;
    ctx.fillText(fitText(ctx, profile.display_name, 1000), 90, 320);
    ctx.font = `700 54px ${FONT}`;
    ctx.fillText(`@${profile.handle}${profile.home_city ? ` · ${profile.home_city}` : ''}`, 90, 410);
    ctx.font = `400 46px ${FONT}`;
    if (games.length) ctx.fillText(fitText(ctx, games.join(' · '), 1000), 90, 520);
    if (level) {
      ctx.fillStyle = '#ff4f7b';
      ctx.font = `700 50px ${FONT}`;
      ctx.fillText(`${t('level.lv', { n: level.n })} · ${level.title}`, 90, 640);
    }
    if (qr) {
      const img = new Image();
      img.src = qr;
      await img.decode();
      ctx.drawImage(img, 1260, 300, 460, 460);
      ctx.fillStyle = '#1d2a5b';
      ctx.font = `700 36px ${FONT}`;
      ctx.fillText(t('card.scan'), 1260, 830);
    }
    c.toBlob((b) => b && download(b, `player-card-${profile.handle}.png`), 'image/png');
  };

  const card = (
    <div className="meishi">
      <div className="meishi-text">
        <span className="meishi-kicker">PLAYER CARD</span>
        <strong className="meishi-name">{profile.display_name}</strong>
        <span>@{profile.handle}{profile.home_city ? ` · ${profile.home_city}` : ''}</span>
        {games.length > 0 && <span className="chips">{games.map((g) => <span key={g} className="tag">{g}</span>)}</span>}
        {level && <span className="meishi-level">{t('level.lv', { n: level.n })} · {level.title}</span>}
      </div>
      {qr && <img className="meishi-qr" src={qr} alt={t('card.qrAlt')} />}
    </div>
  );

  return (
    <div className="narrow player-card-page">
      <div className="page-head">
        <div>
          <h1>{t('card.title')}</h1>
          <p className="lead">{t('card.lead')}</p>
        </div>
      </div>
      {!profile.is_public && <p className="notice">{t('card.private')} <a href="/account">{t('nav.account')}</a></p>}
      {card}
      <div className="field-row wrap">
        <button className="btn primary" onClick={() => setFull(true)}><Icon name="fit" size={16} /> {t('card.show')}</button>
        <button className="btn" onClick={save}><Icon name="download" size={16} /> {t('card.download')}</button>
        <a className="btn ghost" href="/me/level">{t('level.title')}</a>
      </div>
      <canvas ref={canvas} hidden />
      {full && (
        <div className="card-fullscreen" role="dialog" aria-label={t('card.title')} onClick={() => setFull(false)}>
          {qr && <img src={qr} alt={t('card.qrAlt')} />}
          <strong>{profile.display_name}</strong>
          <span>@{profile.handle}</span>
          <span className="hint">{t('card.tapClose')}</span>
        </div>
      )}
    </div>
  );
}

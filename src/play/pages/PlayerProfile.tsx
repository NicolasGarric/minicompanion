import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { setPageMeta } from '../../core/seo';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { useSession } from '../../core/auth/session';
import { Avatar } from '../../core/ui/Avatar';
import { Icon } from '../../core/ui/ui';
import { formatWhen } from '../components/GameCard';
import type { Game } from '../lib/games';
import { thumbOf } from '../../core/lib/photo';
import {
  badgesFrom,
  galleryUrls,
  historyOf,
  playError,
  profileByHandle,
  publicGallery,
  ratingsOf,
  statsOf,
  type GameResult,
  type PublicProfile,
  type Rating,
  type Stats,
} from '../lib/social';

/** Public player page: badges, ratings per game, recent confirmed games, public gallery. */
export function PlayerProfile({ handle }: { handle: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id;
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [history, setHistory] = useState<{ game: Game; results: GameResult[] }[]>([]);
  const [gallery, setGallery] = useState<{ id: string; title: string; url?: string }[]>([]);
  useEffect(() => {
    // Private players stay out of search results.
    if (p) setPageMeta({ title: p.display_name, description: `@${p.handle}${p.factions?.length ? ` · ${p.factions.join(', ')}` : ''}`, noindex: !p.is_public });
  }, [p]);

  useEffect(() => {
    if (!backendConfigured) return;
    (async () => {
      try {
        const prof = await profileByHandle(handle);
        setP(prof);
        if (!prof || (!prof.is_public && prof.id !== me)) return;
        setStats(await statsOf(prof.id));
        setRatings(await ratingsOf(prof.id));
        setHistory(await historyOf(prof.id));
        const items = await publicGallery(prof.id);
        const urls = await galleryUrls(items.map((i) => i.image_path));
        setGallery(items.map((i) => ({ id: i.id, title: i.title, url: urls.get(thumbOf(i.image_path)) ?? urls.get(i.image_path) })));
      } catch (e) {
        playError(e);
        setP(null);
      }
    })();
  }, [handle, me]);

  if (!backendConfigured) return <BackendNotice />;
  if (p === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (!p) return <div className="narrow"><p className="hint">{t('profile.notFound')}</p></div>;
  const mine = p.id === me;

  return (
    <div className="narrow">
      <div className="account-head">
        <Avatar name={p.display_name} size={64} />
        <div>
          <h1>{p.display_name}</h1>
          <p className="muted">@{p.handle}{p.home_city ? ` · ${p.home_city}` : ''}</p>
        </div>
        {me && !mine && (
          <a className="btn small" href={`/messages/${p.id}`}><Icon name="chat" size={14} /> {t('profile.message')}</a>
        )}
      </div>
      {!p.is_public && !mine ? (
        <p className="notice">{t('profile.private')}</p>
      ) : (
        <>
          {!p.is_public && mine && <p className="notice">{t('profile.privateMine')}</p>}
          {p.factions.length > 0 && <p className="chips">{p.factions.map((f) => <span key={f} className="tag">{f}</span>)}</p>}

          {stats && (
            <section className="card">
              <h2>{t('profile.badges')}</h2>
              <ul className="badges">
                {badgesFrom(stats).map((b) => (
                  <li key={b.id} className={b.earned ? 'earned' : ''} title={t(k(`badge.${b.id}.hint`))}>
                    <Icon name={b.earned ? 'trophy' : 'star'} size={22} />
                    <span>{t(k(`badge.${b.id}`))}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">{t('profile.statsLine', { played: stats.played, wins: stats.wins, hosted: stats.hosted })}</p>
            </section>
          )}

          <section className="card">
            <h2>{t('profile.ratings')}</h2>
            {ratings.length === 0 ? (
              <p className="hint">{t('profile.noRatings')}</p>
            ) : (
              <ul className="rating-list">
                {ratings.map((r) => (
                  <li key={r.game_key}>
                    <strong>{r.game_name}</strong>
                    <span className="rating">{r.rating}</span>
                    <small className="muted">{t('profile.record', { w: r.wins, d: r.draws, l: r.losses })}</small>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">{t('profile.ratingHint')}</p>
          </section>

          <section className="card">
            <h2>{t('profile.history')}</h2>
            {history.length === 0 ? (
              <p className="hint">{t('profile.noHistory')}</p>
            ) : (
              <ul className="notif-list">
                {history.map(({ game, results }) => {
                  const own = results.find((r) => r.player_id === p.id);
                  const best = Math.min(...results.map((r) => r.placement));
                  const outcome = own?.placement === best ? (results.filter((r) => r.placement === best).length > 1 ? 'draw' : 'win') : 'loss';
                  return (
                    <li key={game.id}>
                      <span className={`tag result-${outcome}`}>{t(k(`profile.${outcome}`))}</span>{' '}
                      <a href={`/play/game/${game.id}`}>{game.game_system}</a>{' '}
                      <span className="muted">
                        {t('profile.versus', { names: results.filter((r) => r.player_id !== p.id).map((r) => r.profile?.display_name ?? '?').join(', ') })} · {formatWhen(game.starts_at, lang)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {gallery.length > 0 && (
            <section className="card">
              <h2>{t('gallery.title')}</h2>
              <ul className="gallery-grid">
                {gallery.map((g) => (
                  <li key={g.id} className="gallery-item">
                    <span className="gallery-img">{g.url && <img src={g.url} alt={g.title} loading="lazy" />}</span>
                    <strong className="small">{g.title}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

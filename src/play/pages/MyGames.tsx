import { useEffect, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';
import { requireSignIn, useSession } from '../../core/auth/session';
import { GameCard } from '../components/GameCard';
import { myGames, playError, type Game, type JoinStatus } from '../lib/games';

/** The games I host and the ones I asked to join, upcoming first, then past ones. */
export function MyGames() {
  const t = useT();
  const { ready, session } = useSession();
  const [data, setData] = useState<{ hosted: Game[]; joined: (Game & { my_status: JoinStatus })[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) requireSignIn();
    if (session && backendConfigured) myGames(session.user.id).then(setData, (e) => setError(playError(e) ?? 'generic'));
  }, [ready, session]);

  if (!backendConfigured) return <BackendNotice />;
  const now = Date.now();
  const split = <T extends Game>(list: T[]) => ({
    upcoming: list.filter((g) => new Date(g.starts_at).getTime() >= now).reverse(),
    past: list.filter((g) => new Date(g.starts_at).getTime() < now),
  });

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>{t('mine.title')}</h1>
        <a className="btn primary" href="#/play/new">{t('quick.create')}</a>
      </div>
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      {!data && !error && <span className="spinner" />}
      {data && (
        <>
          <h2>{t('mine.upcoming')}</h2>
          {(() => {
            const items = [
              ...split(data.hosted).upcoming.map((g) => ({ g, s: undefined })),
              ...split(data.joined).upcoming.map((g) => ({ g, s: g.my_status })),
            ].sort((a, b) => a.g.starts_at.localeCompare(b.g.starts_at));
            return items.length ? (
              <ul className="game-list">{items.map(({ g, s }) => <GameCard key={g.id} game={g} myStatus={s} />)}</ul>
            ) : (
              <p className="hint">{t('mine.none')} <a href="#/play/quick">{t('nav.play.quick')}</a></p>
            );
          })()}
          <h2>{t('mine.past')}</h2>
          {(() => {
            const items = [
              ...split(data.hosted).past.map((g) => ({ g, s: undefined })),
              ...split(data.joined).past.filter((g) => g.my_status === 'accepted').map((g) => ({ g, s: g.my_status })),
            ].sort((a, b) => b.g.starts_at.localeCompare(a.g.starts_at));
            return items.length ? (
              <ul className="game-list">{items.map(({ g, s }) => <GameCard key={g.id} game={g} myStatus={s} />)}</ul>
            ) : (
              <p className="hint">{t('mine.nonePast')}</p>
            );
          })()}
        </>
      )}
    </div>
  );
}

import { k, useLang, useT } from '../../core/i18n';
import { countryName } from '../lib/countries';
import type { Game, JoinStatus } from '../lib/games';

export function formatWhen(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** One game in a list: what, when, where, seats. */
export function GameCard({ game, myStatus }: { game: Game; myStatus?: JoinStatus }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const past = new Date(game.starts_at) < new Date();
  return (
    <li>
      <a className={`game-card ${game.status} ${past ? 'past' : ''}`} href={`#/play/game/${game.id}`}>
        <span className="game-what">
          <strong>{game.game_system}</strong>
          {(game.format || game.points) && (
            <small className="muted">{[game.format, game.points ? t('games.points', { points: game.points }) : null].filter(Boolean).join(' · ')}</small>
          )}
        </span>
        <span className="game-when">{formatWhen(game.starts_at, lang)}</span>
        <span className="game-where muted">
          {[game.area, game.city, countryName(game.country, lang)].filter(Boolean).join(', ')}
          {game.store && ` · ${game.store.name}`}
        </span>
        <span className="game-tags">
          <span className="tag">{t(k(`games.level.${game.level}`))}</span>
          <span className={`tag ${game.status === 'open' ? 'ok' : ''}`}>
            {game.status === 'cancelled' ? t('games.status.cancelled') : t('games.seats', { taken: game.players_count, max: game.max_players })}
          </span>
          {myStatus && <span className={`tag mine-${myStatus}`}>{t(k(`games.join.${myStatus}`))}</span>}
          {game.host && <span className="muted small">{t('games.hostedBy', { name: game.host.display_name })}</span>}
        </span>
      </a>
    </li>
  );
}

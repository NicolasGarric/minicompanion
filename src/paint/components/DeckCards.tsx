import { useEffect, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { ROLE_INK, decodeDeck, type Deck, type DeckCard } from '../hobby/deck';

/** Army deck: a fan of the first cards on top, then every card in a grid (playing-card style). */
export function DeckView({ deck, covers }: { deck: Deck; covers?: Map<number, string> }) {
  const fan = deck.cards.slice(0, 5);
  return (
    <div className="deck-view" style={{ ['--army' as string]: deck.colour }}>
      <div className="deck-fan" aria-hidden>
        {fan.map((c, i) => {
          const mid = (fan.length - 1) / 2;
          return (
            <div key={i} className="deck-fan-card" style={{ transform: `translateX(${(i - mid) * 52}%) rotate(${(i - mid) * 8}deg) translateY(${Math.abs(i - mid) * 6}%)`, zIndex: i }}>
              <Card card={c} colour={deck.colour} cover={covers?.get(i)} compact />
            </div>
          );
        })}
      </div>
      <div className="deck-grid">
        {deck.cards.map((c, i) => <Card key={i} card={c} colour={deck.colour} cover={covers?.get(i)} />)}
      </div>
    </div>
  );
}

export function Card({ card, colour, cover, compact }: { card: DeckCard; colour: string; cover?: string; compact?: boolean }) {
  const t = useT();
  return (
    <article className={`unit-card ${compact ? 'compact' : ''}`} style={{ ['--role' as string]: ROLE_INK[card.role] }}>
      <div className="unit-card-pic" style={cover ? { backgroundImage: `url(${cover})` } : { background: colour }}>
        {!cover && <span className="halftone" aria-hidden />}
        {card.painted >= card.count && <span className="painted-stamp">{t('pile.paintedStamp')}</span>}
      </div>
      <div className="unit-card-body">
        <div className="unit-card-title">
          <strong>{card.name}</strong>
          {!!card.stars && <span className="stars-on" aria-label={t('pile.starsN', { n: card.stars })}>{'★'.repeat(card.stars)}</span>}
        </div>
        <div className="unit-card-meta">
          <span className={`role-pill role-${card.role}`}>{t(k(`role.${card.role}`))}</span>
          <span className="small">{t('pile.figures', { n: card.count })}{card.points ? ` · ${card.points}` : ''}</span>
        </div>
        {card.note && !compact && <p className="unit-card-note">{card.note}</p>}
      </div>
    </article>
  );
}

/** Public page of a shared deck (`/#/d/…`): the data is in the link, nothing is stored. */
export function SharedDeck({ param }: { param: string }) {
  const t = useT();
  const [deck, setDeck] = useState<Deck | null | undefined>(undefined);
  useEffect(() => {
    decodeDeck(param).then(setDeck, () => setDeck(null));
  }, [param]);
  if (deck === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (deck === null) return <div className="narrow"><p className="hint">{t('pile.badLink')}</p></div>;
  const figures = deck.cards.reduce((s, c) => s + c.count, 0);
  const points = deck.cards.reduce((s, c) => s + (c.points ?? 0), 0);
  return (
    <div className="narrow pile">
      <p className="kicker">{t('pile.sharedKicker')}</p>
      <h1>{deck.name}</h1>
      <p className="lead">{t('pile.figures', { n: figures })} · {t('pile.unitsN', { n: deck.cards.length })}{points ? ` · ${points} ${t('pile.pts')}` : ''}</p>
      <DeckView deck={deck} />
      <div className="card accent">
        <p>{t('pile.sharedCta')}</p>
        <a className="btn primary" href="/paint/pile">{t('pile.title')}</a>
      </div>
    </div>
  );
}

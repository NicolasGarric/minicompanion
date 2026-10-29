import { useEffect, useMemo, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { navigate } from '../../core/router';
import { useSession } from '../../core/auth/session';
import { Icon, IconButton } from '../../core/ui/ui';
import { addCard, linkToAbove, memberUp, moveGroup, removeCard, sumOf, unlink, MAX_CARDS, type Groups } from '../hobby/cards';
import { useHobby, type Army, type LocalDeck } from '../hobby/store';
import { deckShareCode, deckUrl, shareDeck, viewDeck, type OnlineDeck } from '../hobby/sync';
import { SwipeDeck, pileUrl, useInfoOf, useLocalCards, type CardView } from '../components/UnitCard';
import { PileSyncBanner } from '../components/PileSync';

/** Names a number row may have to count as the points of a card (deck total). */
export function usePointsLabels() {
  const t = useT();
  return [t('cards.row.points'), t('pile.pts'), 'points', 'pts'];
}

/** Combat decks (/paint/decks): composed from any army of My pile. */
export function Decks() {
  const t = useT();
  const decks = useHobby((s) => s.decks);
  const armies = useHobby((s) => s.armies);
  const addDeck = useHobby((s) => s.addDeck);
  const infoOf = useInfoOf();
  const pts = usePointsLabels();
  const [name, setName] = useState('');
  const units = useMemo(() => new Map(armies.flatMap((a) => a.units).map((u) => [u.id, u])), [armies]);

  return (
    <div className="narrow decks">
      <div className="page-head">
        <div>
          <h1>{t('cards.decks')}</h1>
          <p className="lead">{t('cards.decksLead')}</p>
        </div>
        <a className="btn ghost" href="/paint/pile">{t('pile.title')}</a>
      </div>
      <PileSyncBanner />
      <form className="card pile-new" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const id = addDeck(name.trim().slice(0, 60));
        setName('');
        navigate(`paint/decks/${id}?tab=build`);
      }}>
        <label className="field">
          <span>{t('cards.newDeck')}</span>
          <input className="text-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('cards.deckPlaceholder')} />
        </label>
        <button className="btn primary" disabled={!name.trim()}><Icon name="plus" size={16} /> {t('pile.create')}</button>
      </form>
      {!armies.some((a) => a.units.length) && <p className="hint">{t('cards.needUnits')}</p>}
      {decks.length === 0 ? <p className="hint">{t('cards.noDecks')}</p> : (
        <ul className="deck-list">
          {decks.map((d) => {
            const cards = d.groups.flat().map((id) => units.get(id)).filter((u) => !!u);
            const total = sumOf(cards.map((u) => ({ info: infoOf(u!) })), pts);
            return (
              <li key={d.id}>
                <a className="card deck-item" href={`/paint/decks/${d.id}`}>
                  <strong>{d.name}</strong>
                  <small className="muted">{t('cards.cardsN', { n: cards.length })}{total ? ` · ${total} ${t('pile.pts')}` : ''}</small>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One deck: swipe mode, composition (cards + scroll order), share link. */
export function DeckPage({ id }: { id: string }) {
  const t = useT();
  const deck = useHobby((s) => s.decks.find((d) => d.id === id));
  const armies = useHobby((s) => s.armies);
  const { updateDeck, removeDeck } = useHobby.getState();
  const [tab, setTab] = useState<'play' | 'build'>(() => (location.search.includes('tab=build') ? 'build' : 'play'));
  const [confirm, setConfirm] = useState(false);
  const cards = useLocalCards(armies, deck?.groups ?? []);
  const pts = usePointsLabels();

  if (!deck) return <div className="narrow"><p className="hint">{t('cards.deckNotFound')}</p><a href="/paint/decks">← {t('cards.decks')}</a></div>;
  const total = sumOf(cards.map((c) => ({ info: c.rows })), pts);

  return (
    <div className="narrow decks">
      <a href="/paint/decks" className="small">← {t('cards.decks')}</a>
      <div className="page-head">
        <input className="army-name" value={deck.name} maxLength={60} aria-label={t('cards.deckName')} onChange={(e) => updateDeck(deck.id, { name: e.target.value })} />
      </div>
      <div className="segmented view-switch" role="tablist">
        <button role="tab" aria-selected={tab === 'play'} className={tab === 'play' ? 'on' : ''} onClick={() => setTab('play')}>{t('cards.tabPlay')}</button>
        <button role="tab" aria-selected={tab === 'build'} className={tab === 'build' ? 'on' : ''} onClick={() => setTab('build')}>{t('cards.tabBuild')}</button>
      </div>
      {tab === 'play' ? (
        <SwipeDeck cards={cards} groups={deck.groups} title={deck.name} total={total ? `${total} ${t('pile.pts')}` : undefined} />
      ) : (
        <div className="deck-build">
          <DeckOrder deck={deck} cards={cards} onChange={(groups) => updateDeck(deck.id, { groups })} />
          <DeckPicker armies={armies} groups={deck.groups} onChange={(groups) => updateDeck(deck.id, { groups })} />
        </div>
      )}
      <DeckShare deck={deck} />
      <div className="field-row wrap danger-zone">
        {confirm ? (
          <>
            <span>{t('cards.deleteDeckConfirm')}</span>
            <button className="btn small danger-ghost" onClick={() => { removeDeck(deck.id); navigate('paint/decks'); }}>{t('common.delete')}</button>
            <button className="btn small ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</button>
          </>
        ) : (
          <button className="btn small danger-ghost" onClick={() => setConfirm(true)}><Icon name="trash" size={14} /> {t('cards.deleteDeck')}</button>
        )}
      </div>
    </div>
  );
}

/** Scroll order: move a card or a linked group, link to the card above, unlink, take out. */
function DeckOrder({ deck, cards, onChange }: { deck: LocalDeck; cards: CardView[]; onChange: (g: Groups) => void }) {
  const t = useT();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const g = deck.groups;
  let n = 0;
  return (
    <section className="deck-order">
      <h2>{t('cards.order')}</h2>
      <p className="hint">{t('cards.orderHint')}</p>
      {g.length === 0 && <p className="hint">{t('cards.deckEmpty')}</p>}
      <ol className="olist">
        {g.map((grp, gi) => (
          <li key={grp.join()} className="og-wrap">
            <div className={`og ${grp.length > 1 ? 'linked' : ''}`}>
              {grp.map((id, mi) => {
                const c = byId.get(id);
                const num = ++n;
                return (
                  <div key={id} className="oi">
                    <span className="num tab">{num}</span>
                    <span className="nm"><b>{c?.name ?? '—'}</b><small className="muted">{c ? t(k(`role.${c.role}`)) : ''}{mi > 0 ? ` · ${t('cards.linked')}` : ''}</small></span>
                    <span className="tools">
                      {mi === 0 ? (
                        <>
                          <IconButton icon="up" label={t('colours.layerUp')} size={14} disabled={gi === 0} onClick={() => onChange(moveGroup(g, gi, -1))} />
                          <IconButton icon="down" label={t('colours.layerDown')} size={14} disabled={gi === g.length - 1} onClick={() => onChange(moveGroup(g, gi, 1))} />
                        </>
                      ) : (
                        <>
                          <IconButton icon="up" label={t('colours.layerUp')} size={14} onClick={() => onChange(memberUp(g, gi, mi))} />
                          <button className="btn small ghost unl" onClick={() => onChange(unlink(g, gi, mi))}>{t('cards.unlink')}</button>
                        </>
                      )}
                      <IconButton icon="x" label={t('cards.remove')} size={14} onClick={() => onChange(removeCard(g, id))} />
                    </span>
                  </div>
                );
              })}
            </div>
            {gi < g.length - 1 && (
              <div className="between">
                <button className="linkbtn" onClick={() => onChange(linkToAbove(g, gi + 1))}><Icon name="link" size={13} /> {t('cards.linkAbove')}</button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Every unit of every army, ticked when in the deck. */
function DeckPicker({ armies, groups, onChange }: { armies: Army[]; groups: Groups; onChange: (g: Groups) => void }) {
  const t = useT();
  const inDeck = new Set(groups.flat());
  const full = inDeck.size >= MAX_CARDS;
  return (
    <section className="deck-picker">
      <h2>{t('cards.pick')}</h2>
      {armies.map((a) => (
        <fieldset key={a.id} style={{ ['--army' as string]: a.colour }}>
          <legend>{a.name}</legend>
          {a.units.length === 0 && <small className="hint">{t('pile.noUnits')}</small>}
          {a.units.map((u) => (
            <label key={u.id} className="check">
              <input type="checkbox" checked={inDeck.has(u.id)} disabled={!inDeck.has(u.id) && full}
                onChange={(e) => onChange(e.target.checked ? addCard(groups, u.id, u.linkedTo) : removeCard(groups, u.id))} />
              <span>{u.name}{u.linkedTo ? <small className="muted"> · {t('cards.linked')}</small> : null}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </section>
  );
}

/** Read-only link (account needed to make it); anyone with it can swipe the deck. */
function DeckShare({ deck }: { deck: LocalDeck }) {
  const t = useT();
  const signedIn = useSession((s) => !!s.session);
  const synced = useHobby((s) => !!s.sync.owner);
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (deck.remoteId && signedIn) deckShareCode(deck.remoteId).then(setCode, () => setCode(null));
  }, [deck.remoteId, signedIn]);
  if (!signedIn || !synced) return <p className="hint">{t('cards.shareNeedsSync')}</p>;
  if (!deck.remoteId) return <p className="hint">{t('cards.sync.pending')}</p>;
  const link = code ? deckUrl(deck.remoteId, code) : '';
  return (
    <section className="card deck-share">
      <h2>{t('cards.share')}</h2>
      <p className="hint">{t(code ? 'cards.shareOn' : 'cards.shareOff')}</p>
      <div className="field-row wrap">
        {code ? (
          <>
            <input className="text-input" readOnly value={link} aria-label={t('cards.share')} onFocus={(e) => e.target.select()} />
            <button className="btn primary" onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title: deck.name, url: link });
                else (await navigator.clipboard.writeText(link), setMsg(t('pile.linkCopied')));
              } catch {
                /* closed */
              }
            }}><Icon name="share" size={16} /> {t('cards.shareSend')}</button>
            <button className="btn ghost" onClick={async () => setCode(await shareDeck(deck.remoteId!, false))}>{t('cards.shareStop')}</button>
          </>
        ) : (
          <button className="btn primary" disabled={code === undefined} onClick={async () => setCode(await shareDeck(deck.remoteId!, true))}>
            <Icon name="link" size={16} /> {t('cards.shareStart')}
          </button>
        )}
        {msg && <span className="hint" role="status">{msg}</span>}
      </div>
    </section>
  );
}

/** Cards of a deck read from the account (share link, game, campaign). */
export function onlineCards(d: Pick<OnlineDeck, 'cards' | 'groups'>): CardView[] {
  const byId = new Map(d.cards.map((c) => [c.id, c]));
  return d.groups.flat().filter((id) => byId.has(id)).map((id) => {
    const c = byId.get(id)!;
    const grp = d.groups.find((g) => g.includes(id)) ?? [];
    return {
      id, name: c.name, role: c.role, colour: c.colour, photo: c.photo ? pileUrl(c.photo) : undefined, rows: c.info,
      links: grp.filter((x) => x !== id && byId.has(x)).map((x) => [x, byId.get(x)!.name]),
    };
  });
}

/** Public page of a shared deck (/deck/:id?c=code), or a deck attached to a game I play in. */
export function OnlineDeckPage({ id }: { id: string }) {
  const t = useT();
  const ready = useSession((s) => s.ready);
  const [deck, setDeck] = useState<OnlineDeck | null | undefined>(undefined);
  const pts = usePointsLabels();
  useEffect(() => {
    if (!ready) return;
    const code = new URLSearchParams(location.search).get('c');
    viewDeck(id, code).then(setDeck, () => setDeck(null));
  }, [id, ready]);
  if (deck === undefined) return <div className="narrow"><span className="spinner" /></div>;
  if (!deck) return <div className="narrow"><p className="hint">{t('cards.deckUnavailable')}</p></div>;
  const cards = onlineCards(deck);
  const total = sumOf(cards.map((c) => ({ info: c.rows })), pts);
  return (
    <div className="narrow decks">
      <p className="hint">{deck.owner ? t('cards.deckBy', { name: deck.owner }) : ''}</p>
      <SwipeDeck cards={cards} groups={deck.groups} title={deck.name} total={total ? `${total} ${t('pile.pts')}` : undefined} />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon, IconButton } from '../../core/ui/ui';
import { supabase } from '../../core/auth/supabase';
import { thumbOf } from '../../core/lib/photoPaths';
import { cleanInfo, legacyInfo, searchCards, toggleType, MAX_LINES, LABEL_MAX, TEXT_MAX, type Groups, type InfoLine } from '../hobby/cards';
import { ROLE_INK } from '../hobby/deck';
import { cardPhotoOf, photoBlob, type Army, type Role, type Unit, type UnitPhoto } from '../hobby/store';

/** A card as every screen shows it (My pile, decks, shared decks, games, campaigns). */
export interface CardView {
  id: string;
  name: string;
  role: Role;
  colour: string;
  photo?: string;
  rows: (InfoLine & { was?: number | string; changed?: boolean })[];
  lost?: InfoLine[];
  /** Other cards of the same group: [id, name] */
  links?: [string, string][];
  history?: { when: string; text: string; state?: 'ok' | 'pending' | 'contested' | 'undone' }[];
}

/** Public URL of a file of the "pile" bucket (thumbnail for lists). */
export function pileUrl(path: string, thumb = false) {
  return supabase?.storage.from('pile').getPublicUrl(thumb ? thumbOf(path) : path).data.publicUrl ?? '';
}

/** Photo URLs of units on this device (blob), or from the account once uploaded. */
export function usePhotoUrls(photos: (UnitPhoto | undefined)[]) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const keyOf = photos.map((p) => p?.id ?? '').join(',');
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    Promise.all(photos.filter((p): p is UnitPhoto => !!p).map(async (p) => {
      const b = await photoBlob(p.id).catch(() => undefined);
      if (b) {
        const u = URL.createObjectURL(b);
        made.push(u);
        return [p.id, u] as const;
      }
      return p.remote ? ([p.id, pileUrl(p.remote)] as const) : null;
    })).then((pairs) => alive && setUrls(new Map(pairs.filter((x): x is readonly [string, string] => !!x))));
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyOf]);
  return urls;
}

/** The info list of a unit: the edited one, or points / stars / note of older units. */
export function useInfoOf() {
  const t = useT();
  return (u: Unit): InfoLine[] => u.info ?? legacyInfo(u, { points: t('cards.row.points'), stars: t('cards.row.stars'), note: t('cards.row.note') });
}

/** Cards of local units, in the given order, with the names of linked cards. */
export function useLocalCards(armies: Army[], groups: Groups) {
  const infoOf = useInfoOf();
  const byId = useMemo(() => {
    const m = new Map<string, { army: Army; unit: Unit }>();
    for (const a of armies) for (const u of a.units) m.set(u.id, { army: a, unit: u });
    return m;
  }, [armies]);
  const ids = groups.flat().filter((id) => byId.has(id));
  const urls = usePhotoUrls(ids.map((id) => cardPhotoOf(byId.get(id)!.unit)));
  return ids.map((id): CardView => {
    const { army, unit } = byId.get(id)!;
    const grp = groups.find((g) => g.includes(id)) ?? [];
    const ph = cardPhotoOf(unit);
    return {
      id,
      name: unit.name,
      role: unit.role,
      colour: army.colour,
      photo: ph ? urls.get(ph.id) : undefined,
      rows: infoOf(unit),
      links: grp.filter((x) => x !== id && byId.has(x)).map((x) => [x, byId.get(x)!.unit.name]),
    };
  });
}

/** Highlights the words searched inside a text. */
function Hl({ text, q }: { text: string; q: string }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

export function UnitCard({ card, q = '', band, onGo }: { card: CardView; q?: string; band?: [string, string]; onGo?: (id: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <article className="ucard" style={{ ['--army' as string]: card.colour, ['--role' as string]: ROLE_INK[card.role] }}>
      {band && <div className="ucard-band"><span>{band[0]}</span><b>{band[1]}</b></div>}
      <div className={`ucard-photo ${card.photo ? '' : 'empty'}`} style={card.photo ? { backgroundImage: `url(${card.photo})` } : undefined}>
        {band && <span className="ucard-stamp">{t('cards.campaignCopy')}</span>}
      </div>
      <div className="ucard-head">
        <h3><Hl text={card.name} q={q} /></h3>
        <div className="ucard-meta">
          <span className={`role-pill role-${card.role}`}>{t(k(`role.${card.role}`))}</span>
          {card.links?.map(([id, name]) => (
            <button key={id} type="button" className="ucard-link" onClick={() => onGo?.(id)} disabled={!onGo}>
              <Icon name="link" size={13} /> {t('cards.linkedTo', { name })}
            </button>
          ))}
        </div>
      </div>
      {card.rows.length + (card.lost?.length ?? 0) === 0 ? <p className="hint ucard-empty">{t('cards.noInfo')}</p> : (
        <ul className="ucard-rows">
          {card.rows.map((x, i) => (
            <li key={i} className={`ucard-row ${x.t === 'n' ? 'n' : 't'} ${x.changed ? 'changed' : ''}`}>
              <span className="l"><Hl text={x.l} q={q} /></span>
              <span className="v">
                {x.was != null && <s className="was">{x.was}</s>}
                {x.t === 'n' ? x.v : <Hl text={String(x.v)} q={q} />}
              </span>
            </li>
          ))}
          {card.lost?.map((x, i) => (
            <li key={`lost${i}`} className={`ucard-row ${x.t === 'n' ? 'n' : 't'} changed gone`}>
              <span className="l">{x.l}</span><span className="v">{String(x.v)}</span>
            </li>
          ))}
        </ul>
      )}
      {!!card.history?.length && (
        <div className="ucard-foot">
          <button type="button" className="ucard-histbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('cards.history', { n: card.history.length })}
          </button>
          {open && (
            <ol className="ucard-hist">
              {card.history.map((h, i) => (
                <li key={i}>
                  <span>{h.when}</span>
                  <span>{h.text}{h.state && h.state !== 'ok' && <em className={`ucard-state ${h.state}`}>{t(k(`cards.state.${h.state}`))}</em>}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

/** Rows of a card: type (123 / Aa), label, value; move up, remove; add a number or a text. */
export function InfoEditor({ lines, onChange, suggestions = [] }: { lines: InfoLine[]; onChange: (l: InfoLine[]) => void; suggestions?: string[] }) {
  const t = useT();
  const set = (i: number, x: InfoLine) => onChange(lines.map((y, j) => (j === i ? x : y)));
  const listId = useMemo(() => `labels-${Math.random().toString(36).slice(2, 8)}`, []);
  const add = (type: 'n' | 't') => onChange([...lines, { l: type === 'n' ? '' : t('cards.rule'), t: type, v: type === 'n' ? 0 : '' }]);
  return (
    <div className="info-editor">
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      {lines.map((x, i) => (
        <div key={i} className="info-row">
          <button type="button" className={`info-type ${x.t}`} onClick={() => set(i, toggleType(x))}
            aria-label={t(x.t === 'n' ? 'cards.typeNumber' : 'cards.typeText')} title={t('cards.toggleType')}>
            {x.t === 'n' ? '123' : 'Aa'}
          </button>
          <input className="text-input" list={listId} value={x.l} maxLength={LABEL_MAX} aria-label={t('cards.label')} placeholder={t('cards.label')}
            onChange={(e) => set(i, { ...x, l: e.target.value })} />
          {x.t === 'n' ? (
            <input className="num-input info-num" type="number" step="any" value={Number.isFinite(Number(x.v)) ? x.v : 0} aria-label={t('cards.value')}
              onChange={(e) => set(i, { ...x, v: e.target.value === '' ? 0 : Number(e.target.value) })} />
          ) : (
            <textarea className="text-input info-text" rows={1} value={String(x.v)} maxLength={TEXT_MAX} aria-label={t('cards.value')} placeholder={t('cards.textPlaceholder')}
              onChange={(e) => set(i, { ...x, v: e.target.value })} />
          )}
          <span className="info-tools">
            <IconButton icon="up" label={t('colours.layerUp')} size={14} disabled={i === 0}
              onClick={() => onChange(lines.map((y, j) => (j === i - 1 ? lines[i] : j === i ? lines[i - 1] : y)))} />
            <IconButton icon="trash" label={t('common.delete')} size={14} onClick={() => onChange(lines.filter((_, j) => j !== i))} />
          </span>
        </div>
      ))}
      <div className="field-row wrap">
        <button type="button" className="btn small" disabled={lines.length >= MAX_LINES} onClick={() => add('n')}><Icon name="plus" size={14} /> {t('cards.addNumber')}</button>
        <button type="button" className="btn small ghost" disabled={lines.length >= MAX_LINES} onClick={() => add('t')}><Icon name="plus" size={14} /> {t('cards.addText')}</button>
      </div>
    </div>
  );
}

/** Saves the rows the database accepts (empty labels dropped). */
export const saveInfo = (lines: InfoLine[]) => cleanInfo(lines);

/**
 * Swipe mode: one full card per screen, swipe or arrows / keys, linked groups shown on the dots,
 * rule search across the deck. Read-only.
 */
export function SwipeDeck({ cards, groups, title, total, band }: { cards: CardView[]; groups: Groups; title: string; total?: string; band?: [string, string] }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [q, setQ] = useState('');
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const n = cards.length;
  const go = (j: number) => setI(Math.max(0, Math.min(n - 1, j)));
  const goId = (id: string) => go(cards.findIndex((c) => c.id === id));
  const hits = useMemo(() => searchCards(cards.map((c) => ({ ...c, info: c.rows })), q), [cards, q]);
  useEffect(() => {
    if (i >= n) setI(Math.max(0, n - 1));
  }, [i, n]);
  if (!n) return <p className="hint">{t('cards.deckEmpty')}</p>;
  let dot = 0;
  return (
    <div className="swipe">
      <div className="swipe-bar"><strong>{title}</strong>{total && <span>{total}</span>}</div>
      <label className="swipe-search">
        <span aria-hidden>⌕</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cards.searchPlaceholder')} aria-label={t('cards.search')} />
      </label>
      {q.trim() && (
        <div className="swipe-hits" aria-live="polite">
          {hits.length ? hits.map((c) => <button key={c.id} className="chip small on" onClick={() => goId(c.id)}>{c.name}</button>) : <span className="hint">{t('cards.noHit')}</span>}
        </div>
      )}
      <div
        className="swipe-viewport"
        tabIndex={0}
        aria-roledescription="carousel"
        onKeyDown={(e) => (e.key === 'ArrowLeft' ? go(i - 1) : e.key === 'ArrowRight' ? go(i + 1) : undefined)}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button, input, a')) return;
          start.current = e.clientX;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => start.current != null && setDx(e.clientX - start.current)}
        onPointerUp={() => {
          if (start.current == null) return;
          start.current = null;
          if (dx < -50) go(i + 1);
          else if (dx > 50) go(i - 1);
          setDx(0);
        }}
        onPointerCancel={() => ((start.current = null), setDx(0))}
      >
        <div className={`swipe-track ${dx ? 'drag' : ''}`} style={{ transform: `translateX(calc(${-i * 100}% + ${dx}px))` }}>
          {cards.map((c) => (
            <div key={c.id} className="swipe-slide" aria-hidden={c !== cards[i]}>
              <UnitCard card={c} q={q} band={band} onGo={goId} />
            </div>
          ))}
        </div>
      </div>
      <div className="swipe-nav">
        <button className="swipe-arrow" onClick={() => go(i - 1)} disabled={i === 0} aria-label={t('cards.prev')}>‹</button>
        <div className="swipe-mid">
          <span className="tab">{i + 1} / {n}</span>
          <div className="swipe-dots">
            {groups.map((g, gi) => {
              const inDeck = g.filter((id) => cards.some((c) => c.id === id));
              if (!inDeck.length) return null;
              return (
                <span key={gi} className={`swipe-grp ${inDeck.length > 1 ? 'linked' : ''}`}>
                  {inDeck.map((id) => {
                    const k2 = dot++;
                    return <button key={id} className={k2 === i ? 'on' : ''} onClick={() => go(k2)} aria-label={`${k2 + 1}`} />;
                  })}
                </span>
              );
            })}
          </div>
        </div>
        <button className="swipe-arrow" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label={t('cards.next')}>›</button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefs } from '../../core/prefs';
import { k, useT } from '../../core/i18n';
import { Icon, IconButton } from '../../core/ui/ui';
import { supabase } from '../../core/auth/supabase';
import { thumbOf } from '../../core/lib/photoPaths';
import { cleanInfo, isSection, legacyInfo, moveToSection, searchCards, sectionRow, splitSections, toggleType, MAX_LINES, LABEL_MAX, TEXT_MAX, type Groups, type InfoLine } from '../hobby/cards';
import { ROLE_INK } from '../hobby/deck';
import { cardPhotoOf, photoBlob, type Army, type Role, type Unit, type UnitPhoto } from '../hobby/store';
import { addRefRow, isRefRow, refsOfRows, type RefLink } from '../../core/lib/refLinks';
import { RefChips, RefLinksEditor } from '../../core/ui/RefLinks';

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

/** One foldable section of a unit card: full-width band, title on the left, chevron on the right. */
function CardSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const closed = usePrefs((s) => s.cardClosed.includes(id));
  const toggle = usePrefs((s) => s.toggleCardSection);
  return (
    <section className={`ucard-sec ${closed ? 'closed' : ''}`}>
      <button type="button" className="ucard-sec-band" aria-expanded={!closed} onClick={() => toggle(id)}>
        <span>{title}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {!closed && <div className="ucard-sec-body">{children}</div>}
    </section>
  );
}

type Row = InfoLine & { was?: number | string; changed?: boolean };

/** Number rows as one column grid: header + values share it, first column frozen when it scrolls. */
function StatGrid({ stats, lost, q }: { stats: Row[]; lost: InfoLine[]; q: string }) {
  const cols = stats.length + lost.length;
  return (
    <div className="ucard-grid-wrap">
      <div className="ucard-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(3.4rem, 1fr))` }}>
        {stats.map((x, i) => <span key={`h${i}`} className={`ucard-gh ${i === 0 ? 'first' : ''}`}><Hl text={x.l} q={q} /></span>)}
        {lost.map((x, i) => <span key={`hl${i}`} className="ucard-gh gone">{x.l}</span>)}
        {stats.map((x, i) => (
          <span key={`v${i}`} className={`ucard-gv ${i === 0 ? 'first' : ''} ${x.changed ? 'changed' : ''}`}>
            {x.was != null && <s className="was">{x.was}</s>}
            {x.v}
          </span>
        ))}
        {lost.map((x, i) => <span key={`vl${i}`} className="ucard-gv gone">{String(x.v)}</span>)}
      </div>
    </div>
  );
}

/** Text rows as name bars with their text. */
function TextItems({ texts, lost, q }: { texts: Row[]; lost: InfoLine[]; q: string }) {
  return (
    <ul className="ucard-items">
      {texts.map((x, i) => (
        <li key={i} className={x.changed ? 'changed' : ''}>
          <span className="ucard-namebar"><Hl text={x.l} q={q} /></span>
          {(x.was != null || String(x.v).trim() !== '') && <p>{x.was != null && <s className="was">{x.was}</s>}<Hl text={String(x.v)} q={q} /></p>}
        </li>
      ))}
      {lost.map((x, i) => (
        <li key={`lost${i}`} className="gone">
          <span className="ucard-namebar">{x.l}</span>
          {String(x.v).trim() !== '' && <p>{String(x.v)}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A unit card as a mobile unit sheet (style B chosen by the owner on 2026-11-28, the app's own look):
 * navy title bar with the name and the cost, foldable sections (state remembered on the device),
 * number rows as one column grid (header + values share it, first column frozen when it scrolls),
 * text rows as name bars with their text, reference links, campaign history.
 */
export function UnitCard({ card, q = '', band, onGo }: { card: CardView; q?: string; band?: [string, string]; onGo?: (id: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const refs = refsOfRows(card.rows);
  const ptsLabels = new Set([t('cards.row.points'), t('pile.pts'), 'points', 'pts'].map((x) => x.trim().toLowerCase()));
  const isPts = (x: InfoLine) => x.t === 'n' && ptsLabels.has(x.l.trim().toLowerCase());
  const rows = card.rows.filter((x) => !isRefRow(x));
  const cost = rows.find(isPts);
  const { lead, sections } = splitSections(rows.filter((x) => x !== cost));
  const stats = lead.filter((x) => x.t === 'n');
  const texts = lead.filter((x) => x.t === 't');
  const lostStats = card.lost?.filter((x) => x.t === 'n') ?? [];
  const lostTexts = card.lost?.filter((x) => x.t === 't' && !isSection(x)) ?? [];
  const content = rows.filter((x) => !isSection(x)).length + (card.lost?.length ?? 0);

  return (
    <article className="ucard" style={{ ['--army' as string]: card.colour, ['--role' as string]: ROLE_INK[card.role] }}>
      {band && <div className="ucard-band"><span>{band[0]}</span><b>{band[1]}</b></div>}
      <header className="ucard-title">
        <div className="ucard-title-main">
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
        {cost && (
          <span className={`ucard-cost ${cost.changed ? 'changed' : ''}`}>
            {cost.was != null && <s className="was">{cost.was}</s>}
            {cost.v} <small>{cost.l}</small>
          </span>
        )}
      </header>
      {card.photo && (
        <div className="ucard-photo" style={{ backgroundImage: `url(${card.photo})` }}>
          {band && <span className="ucard-stamp">{t('cards.campaignCopy')}</span>}
        </div>
      )}
      {content === 0 && !refs.length && <p className="hint ucard-empty">{t('cards.noInfo')}</p>}
      {stats.length + lostStats.length > 0 && (
        <CardSection id="profile" title={t('cards.sec.profile')}>
          <StatGrid stats={stats} lost={lostStats} q={q} />
        </CardSection>
      )}
      {texts.length + lostTexts.length > 0 && (
        <CardSection id="rules" title={t('cards.sec.rules')}>
          <TextItems texts={texts} lost={lostTexts} q={q} />
        </CardSection>
      )}
      {sections.map((sec, i) => (
        <CardSection key={`${i}${sec.title}`} id={`u:${sec.title.toLowerCase()}`} title={sec.title || '—'}>
          {sec.rows.length === 0 ? <p className="hint ucard-empty">{t('cards.noInfo')}</p> : (
            <>
              {sec.rows.some((x) => x.t === 'n') && <StatGrid stats={sec.rows.filter((x) => x.t === 'n')} lost={[]} q={q} />}
              {sec.rows.some((x) => x.t === 't') && <TextItems texts={sec.rows.filter((x) => x.t === 't')} lost={[]} q={q} />}
            </>
          )}
        </CardSection>
      ))}
      {refs.length > 0 && (
        <CardSection id="refs" title={t('refs.title')}>
          <div className="ucard-refs"><RefChips links={refs} compact /></div>
        </CardSection>
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

/**
 * Rows of a card: type (123 / Aa), label, value; move up / down, remove; add a number, a text or a
 * section. Sections (owner request 2026-11-28) are titled bands the player creates; each row picks
 * the section it goes in, or moves across them with the arrows.
 */
export function InfoEditor({ lines, onChange, suggestions = [] }: { lines: InfoLine[]; onChange: (l: InfoLine[]) => void; suggestions?: string[] }) {
  const t = useT();
  const set = (i: number, x: InfoLine) => onChange(lines.map((y, j) => (j === i ? x : y)));
  const listId = useMemo(() => `labels-${Math.random().toString(36).slice(2, 8)}`, []);
  const secListId = `${listId}-s`;
  const add = (type: 'n' | 't') => onChange([...lines, { l: type === 'n' ? '' : t('cards.rule'), t: type, v: type === 'n' ? 0 : '' }]);
  const swap = (i: number, j: number) => onChange(lines.map((y, k) => (k === i ? lines[j] : k === j ? lines[i] : y)));
  const titles = lines.filter(isSection).map((x) => x.l);
  const sectionOf = (i: number) => lines.slice(0, i).filter(isSection).length - 1;
  const presets = ['cards.sec.profile', 'cards.sec.ranged', 'cards.sec.melee', 'cards.sec.abilities', 'cards.sec.wargear', 'cards.sec.keywords'] as const;
  return (
    <div className="info-editor">
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id={secListId}>{presets.map((key) => <option key={key} value={t(key)} />)}</datalist>
      {lines.map((x, i) => isRefRow(x) ? null : isSection(x) ? (
        <div key={i} className="info-row section">
          <span className="info-type s" aria-hidden="true"><Icon name="layers" size={14} /></span>
          <input className="text-input" list={secListId} value={x.l} maxLength={LABEL_MAX} aria-label={t('cards.sectionTitle')} placeholder={t('cards.sectionTitle')}
            onChange={(e) => set(i, { ...x, l: e.target.value })} />
          <span className="info-tools">
            <IconButton icon="up" label={t('colours.layerUp')} size={14} disabled={i === 0} onClick={() => swap(i, i - 1)} />
            <IconButton icon="down" label={t('colours.layerDown')} size={14} disabled={i === lines.length - 1} onClick={() => swap(i, i + 1)} />
            <IconButton icon="trash" label={t('cards.removeSection')} size={14} onClick={() => onChange(lines.filter((_, j) => j !== i))} />
          </span>
        </div>
      ) : (
        <div key={i} className={`info-row ${titles.length ? 'in-sections' : ''}`}>
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
            {titles.length > 0 && (
              <select className="select info-sec" value={sectionOf(i)} aria-label={t('cards.section')} onChange={(e) => onChange(moveToSection(lines, i, +e.target.value))}>
                <option value={-1}>{t('cards.noSection')}</option>
                {titles.map((title, s) => <option key={s} value={s}>{title || '—'}</option>)}
              </select>
            )}
            <IconButton icon="up" label={t('colours.layerUp')} size={14} disabled={i === 0} onClick={() => swap(i, i - 1)} />
            <IconButton icon="down" label={t('colours.layerDown')} size={14} disabled={i === lines.length - 1} onClick={() => swap(i, i + 1)} />
            <IconButton icon="trash" label={t('common.delete')} size={14} onClick={() => onChange(lines.filter((_, j) => j !== i))} />
          </span>
        </div>
      ))}
      <div className="field-row wrap">
        <button type="button" className="btn small" disabled={lines.length >= MAX_LINES} onClick={() => add('n')}><Icon name="plus" size={14} /> {t('cards.addNumber')}</button>
        <button type="button" className="btn small ghost" disabled={lines.length >= MAX_LINES} onClick={() => add('t')}><Icon name="plus" size={14} /> {t('cards.addText')}</button>
        <button type="button" className="btn small ghost" disabled={lines.length >= MAX_LINES} onClick={() => onChange([...lines, sectionRow('')])}><Icon name="layers" size={14} /> {t('cards.addSection')}</button>
      </div>
      {titles.length === 0 && <p className="hint small">{t('cards.sectionHint')}</p>}
    </div>
  );
}

/**
 * Reference links of a card (rules pages, e.g. Wahapedia): kept as rows of its info list, so they
 * follow the card into decks, share links, games and campaign copies.
 */
export function CardRefsEditor({ lines, onChange }: { lines: InfoLine[]; onChange: (l: InfoLine[]) => void }) {
  const t = useT();
  const refs = refsOfRows(lines);
  const set = (next: RefLink[]) => {
    let out: InfoLine[] = lines.filter((x) => !isRefRow(x));
    for (const r of next) out = addRefRow(out, r, LABEL_MAX) as InfoLine[];
    onChange(out.slice(0, MAX_LINES));
  };
  return <RefLinksEditor links={refs} onChange={set} kinds={['factions', 'rules', 'boarding']} hint={t('refs.cardHint')}
    max={Math.min(8, MAX_LINES - (lines.length - refs.length))} />;
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

import { useEffect, useMemo, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { CHECKED, embeddable, FAMILIES, GAMES, GENRES, LICENCE_URL, searchGames, type Family, type Genre } from '../data/rulesHub';
import { factionUrl, anchorLabel, loadWahapedia, pageUrl, searchEntries, unitPath, unitUrl, REF_KINDS, type RefEntry, type RefKind, type WahaIndex } from '../../core/lib/wahapedia';

/**
 * Rules & resources hub (/play/rules, owner request 2026-11-28): every game with the free rules and
 * official tools its publisher gives away, as links (data in `play/data/rulesHub.ts`), grouped as
 * Games Workshop / other big games / open-licence rules. Warhammer 40,000 also opens the detailed
 * index of the rules published on Wahapedia (11th edition), the one that feeds the "Add a reference"
 * picker of cards, decks, games, maps and campaigns. Nothing of any rules is copied here.
 */
const ext = { target: '_blank', rel: 'noopener noreferrer nofollow external' } as const;

export function RulesLinks() {
  const t = useT();
  const [q, setQ] = useState('');
  const [family, setFamily] = useState<Family | ''>('');
  const [genre, setGenre] = useState<Genre | ''>('');
  const [index, setIndex] = useState(false);
  const hits = useMemo(() => searchGames(GAMES, q, { family: family || undefined, genre: genre || undefined }), [q, family, genre]);

  return (
    <div className="narrow rules-links">
      <div className="page-head">
        <div>
          <h1>{t('hub.title')}</h1>
          <p className="lead">{t('hub.lead')}</p>
        </div>
      </div>
      <p className="hint">{t('legal.unofficial')} {t('refs.pageDisclaimer')}</p>

      <section className="card hub-filters">
        <label className="field">
          <span>{t('hub.search')}</span>
          <input className="text-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hub.searchPlaceholder')} />
        </label>
        <div className="chips" role="group" aria-label={t('hub.search')}>
          <button type="button" className={`chip small ${family === '' ? 'on' : ''}`} onClick={() => setFamily('')}>{t('refs.kind.all')}</button>
          {FAMILIES.map((f) => (
            <button key={f} type="button" className={`chip small ${family === f ? 'on' : ''}`} onClick={() => setFamily(f)}>{t(k(`hub.family.${f}`))}</button>
          ))}
        </div>
        <label className="field">
          <span>{t('hub.genre')}</span>
          <select className="text-input" value={genre} onChange={(e) => setGenre(e.target.value as Genre | '')}>
            <option value="">{t('refs.kind.all')}</option>
            {GENRES.map((g) => <option key={g} value={g}>{t(k(`hub.genre.${g}`))}</option>)}
          </select>
        </label>
      </section>

      {hits.length === 0 && <p className="hint">{t('hub.none')}</p>}
      {FAMILIES.map((f) => {
        const games = hits.filter((g) => g.family === f);
        if (!games.length) return null;
        return (
          <section key={f} className="card hub-family">
            <h2>{t(k(`hub.family.${f}`))} <small>{t('hub.count', { n: games.length })}</small></h2>
            <p className="hint">{t(k(`hub.familyHint.${f}`))}</p>
            <ul className="hub-games">
              {games.map((g) => (
                <li key={g.id} className="hub-game">
                  <div className="hub-game-head">
                    <strong>{g.name}</strong>
                    <small>{g.publisher}</small>
                  </div>
                  <p className="hub-tags">
                    <span className={`tag ${g.free === 'full' || g.free === 'core' ? 'ok' : ''}`}>{t(k(`hub.free.${g.free}`))}</span>
                    {LICENCE_URL[g.licence] ? (
                      <a className="tag ok" href={LICENCE_URL[g.licence]} {...ext}>{t(k(`hub.lic.${g.licence}`))}</a>
                    ) : (
                      <span className="tag">{t(k(`hub.lic.${g.licence}`))}</span>
                    )}
                    {g.licence !== 'owner' && <span className="tag ok">{t(k(`hub.embed.${embeddable(g.licence)}`))}</span>}
                  </p>
                  <ul className="ref-chips">
                    {g.links.map((l) => (
                      <li key={l.u + l.k}>
                        <a className="ref-chip" href={l.u} {...ext} title={l.by === 'search' ? t('hub.bySearch') : undefined}>
                          <Icon name={l.k === 'rules' ? 'book' : l.k === 'downloads' ? 'download' : 'link'} size={13} />
                          <span className="ref-label">{t(k(`hub.link.${l.k}`))}</span>
                        </a>
                      </li>
                    ))}
                    {g.index === 'wahapedia' && (
                      <li>
                        <button type="button" className="ref-chip" aria-expanded={index} onClick={() => setIndex(!index)}>
                          <Icon name="grid" size={13} /><span className="ref-label">{t(index ? 'hub.hideIndex' : 'hub.index')}</span>
                        </button>
                      </li>
                    )}
                  </ul>
                  {g.index === 'wahapedia' && index && <WahapediaIndex />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="hint small">{t('hub.checked', { date: CHECKED })}</p>
    </div>
  );
}

/** The pages most players look for first. */
const QUICK: [string, string?][] = [
  ['core-rules'], ['rules-appendix'], ['mission-deck-2026-27'], ['mission-deck-2026-27', 'Mission-Generator'],
  ['warhammer-event-companion'], ['crusade-rules'], ['boarding-action-rules'], ['data-export'],
];

/** Warhammer 40,000: every page of the rules published on Wahapedia, their sections, mission cards and unit pages. */
function WahapediaIndex() {
  const t = useT();
  const [data, setData] = useState<{ ix: WahaIndex; all: RefEntry[] } | null | 'error'>(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<RefKind | ''>('');
  useEffect(() => {
    loadWahapedia().then(setData, () => setData('error'));
  }, []);
  const hits = useMemo(() => (data && data !== 'error' ? searchEntries(data.all, q, { kinds: only ? [only] : undefined, limit: 80 }) : []), [data, q, only]);

  return (
    <div className="hub-index">
      <p className="lead small">{t('refs.pageLead')}</p>
      {data === null ? <span className="spinner" /> : data === 'error' ? <p className="error">{t('refs.loadError')}</p> : (
        <>
          <section className="card">
            <h2>{t('refs.quick')}</h2>
            <ul className="ref-chips">
              {QUICK.map(([slug, a]) => {
                const p = data.ix.pages.find((x) => x.s === slug);
                if (!p) return null;
                const label = a ? p.i.find((x) => x[1] === a)?.[0] ?? anchorLabel(a) : p.t;
                return <li key={slug + (a ?? '')}><a className="ref-chip" href={pageUrl(data.ix, slug, a)} {...ext}><Icon name="book" size={13} /><span className="ref-label">{label}</span></a></li>;
              })}
            </ul>
          </section>

          <section className="card">
            <label className="field">
              <span>{t('refs.search')}</span>
              <input className="text-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('refs.searchPlaceholder')} />
            </label>
            <div className="chips" role="group" aria-label={t('refs.filter')}>
              <button type="button" className={`chip small ${only === '' ? 'on' : ''}`} onClick={() => setOnly('')}>{t('refs.kind.all')}</button>
              {REF_KINDS.map((kd) => (
                <button key={kd} type="button" className={`chip small ${only === kd ? 'on' : ''}`} onClick={() => setOnly(kd)}>{t(k(`refs.kind.${kd}`))}</button>
              ))}
            </div>
            {q.trim() && (hits.length === 0 ? <p className="hint">{t('refs.noHit')}</p> : (
              <ul className="ref-hits">
                {hits.map((e) => (
                  <li key={e.url + e.label}>
                    <a className="ref-hit" href={e.url} {...ext}>
                      <span className="ref-label">{e.label}</span>
                      <small>{t(k(`refs.type.${e.type}`))} · {e.group}</small>
                    </a>
                  </li>
                ))}
              </ul>
            ))}
          </section>

          {!q.trim() && REF_KINDS.filter((kd) => !only || kd === only).map((kd) => (
            <section key={kd} className="card ref-kind">
              <h2>{t(k(`refs.kind.${kd}`))}</h2>
              <p className="hint">{t(k(`refs.kindHint.${kd}`))}</p>
              {kd === 'factions' ? <Factions ix={data.ix} /> : data.ix.pages.filter((p) => p.k === kd).map((p) => (
                <details key={p.s} className="ref-page">
                  <summary><span>{p.t}</span><small>{t('refs.count', { n: p.i.length + p.c.length })}</small></summary>
                  <p><a className="btn small" href={pageUrl(data.ix, p.s)} {...ext}><Icon name="book" size={14} /> {t('refs.openPage')}</a></p>
                  <ul className="ref-sections">
                    {p.i.map(([label, a, depth]) => (
                      <li key={a} className={depth > 1 ? 'sub' : ''}><a href={pageUrl(data.ix, p.s, a)} {...ext}>{label}</a></li>
                    ))}
                  </ul>
                  {p.c.length > 0 && (
                    <>
                      <h3>{t('refs.cards')}</h3>
                      <ul className="ref-chips compact">
                        {p.c.map(([label, a]) => <li key={label + a}><a className="ref-chip" href={pageUrl(data.ix, p.s, a)} {...ext} title={anchorLabel(a)}><span className="ref-label">{label}</span></a></li>)}
                      </ul>
                    </>
                  )}
                </details>
              ))}
            </section>
          ))}
          <p className="hint small">{t('refs.credit')} · {t('refs.checked', { date: data.ix.checked })}</p>
        </>
      )}
    </div>
  );
}

/** Factions: army rules, detachments, stratagems… and every unit page (drawn only when opened). */
function Factions({ ix }: { ix: WahaIndex }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {ix.factions.map((f) => (
        <details key={f.s} className="ref-page" open={open === f.s} onToggle={(e) => (e.currentTarget.open ? setOpen(f.s) : open === f.s && setOpen(null))}>
          <summary><span>{f.t}</span><small>{t('refs.units', { n: f.u.length })}</small></summary>
          {open === f.s && (
            <>
              <ul className="ref-chips">
                <li><a className="ref-chip" href={factionUrl(ix, f.s)} {...ext}><Icon name="book" size={13} /><span className="ref-label">{t('refs.openPage')}</span></a></li>
                {f.a.map((a) => <li key={a}><a className="ref-chip" href={factionUrl(ix, f.s, a)} {...ext}><span className="ref-label">{anchorLabel(a)}</span></a></li>)}
              </ul>
              <ul className="ref-sections cols">
                {f.u.map((u) => {
                  const [label, path] = typeof u === 'string' ? [u, unitPath(u)] : u;
                  return <li key={path}><a href={unitUrl(ix, f.s, path)} {...ext}>{label}</a></li>;
                })}
              </ul>
            </>
          )}
        </details>
      ))}
    </>
  );
}

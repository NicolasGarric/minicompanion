import { useEffect, useMemo, useState } from 'react';
import { k, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { factionUrl, anchorLabel, loadWahapedia, pageUrl, searchEntries, unitPath, unitUrl, REF_KINDS, type RefEntry, type RefKind, type WahaIndex } from '../../core/lib/wahapedia';

/**
 * Rules & references (/play/rules): every page of the rules published on Wahapedia (11th edition),
 * their sections, mission cards and unit pages, as links only. Nothing of the rules is copied here;
 * the same index feeds the "Add a reference" picker of cards, decks, games, maps and campaigns.
 */
const ext = { target: '_blank', rel: 'noopener noreferrer nofollow external' } as const;

/** The pages most players look for first. */
const QUICK: [string, string?][] = [
  ['core-rules'], ['rules-appendix'], ['mission-deck-2026-27'], ['mission-deck-2026-27', 'Mission-Generator'],
  ['warhammer-event-companion'], ['crusade-rules'], ['boarding-action-rules'], ['data-export'],
];

export function RulesLinks() {
  const t = useT();
  const [data, setData] = useState<{ ix: WahaIndex; all: RefEntry[] } | null | 'error'>(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<RefKind | ''>('');
  useEffect(() => {
    loadWahapedia().then(setData, () => setData('error'));
  }, []);
  const hits = useMemo(() => (data && data !== 'error' ? searchEntries(data.all, q, { kinds: only ? [only] : undefined, limit: 80 }) : []), [data, q, only]);

  return (
    <div className="narrow rules-links">
      <div className="page-head">
        <div>
          <h1>{t('refs.pageTitle')}</h1>
          <p className="lead">{t('refs.pageLead')}</p>
        </div>
      </div>
      <p className="hint">{t('refs.pageDisclaimer')}</p>
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

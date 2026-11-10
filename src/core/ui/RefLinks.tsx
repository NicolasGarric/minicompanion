import { useEffect, useMemo, useState } from 'react';
import { k, useT } from '../i18n';
import { Icon, IconButton, Modal } from './ui';
import { cleanRefs, normaliseUrl, refHost, refTitle, MAX_REFS, REF_LABEL_MAX, type RefLink } from '../lib/refLinks';
import { isWahapedia, loadWahapedia, searchEntries, REF_KINDS, type RefEntry, type RefKind } from '../lib/wahapedia';

/**
 * Reference links on cards, decks, games, table maps and campaigns: chips that open the rules where
 * they are published (new tab, no referrer), an editor, and a picker that searches the Wahapedia index
 * or takes any https address.
 */

export function RefChips({ links, compact }: { links: RefLink[]; compact?: boolean }) {
  const t = useT();
  const list = cleanRefs(links);
  if (!list.length) return null;
  return (
    <ul className={`ref-chips ${compact ? 'compact' : ''}`} aria-label={t('refs.title')}>
      {list.map((r) => (
        <li key={r.u}>
          <a className="ref-chip" href={r.u} target="_blank" rel="noopener noreferrer nofollow external" title={r.u}>
            <Icon name="link" size={13} />
            <span className="ref-label">{refTitle(r)}</span>
            {!compact && <small>{refHost(r.u)}</small>}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Editable list: chips with remove / move up, "Add a reference" opens the picker. */
export function RefLinksEditor({ links, onChange, kinds, max = MAX_REFS, hint }: {
  links: RefLink[];
  onChange: (l: RefLink[]) => void;
  kinds?: RefKind[];
  max?: number;
  hint?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const list = cleanRefs(links);
  return (
    <div className="ref-editor">
      {hint && <p className="hint">{hint}</p>}
      {list.length > 0 && (
        <ul className="ref-edit-list">
          {list.map((r, i) => (
            <li key={r.u}>
              <a href={r.u} target="_blank" rel="noopener noreferrer nofollow external" className="ref-chip">
                <Icon name="link" size={13} /><span className="ref-label">{refTitle(r)}</span><small>{refHost(r.u)}</small>
              </a>
              <span className="info-tools">
                <IconButton icon="up" label={t('refs.up')} size={14} disabled={i === 0}
                  onClick={() => onChange(list.map((y, j) => (j === i - 1 ? list[i] : j === i ? list[i - 1] : y)))} />
                <IconButton icon="trash" label={t('common.delete')} size={14} onClick={() => onChange(list.filter((_, j) => j !== i))} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn small" disabled={list.length >= max} onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} /> {t('refs.add')}
      </button>
      {open && (
        <RefPicker kinds={kinds} onClose={() => setOpen(false)} taken={list.map((r) => r.u)}
          onPick={(r) => { onChange(cleanRefs([...list, r]).slice(0, max)); setOpen(false); }} />
      )}
    </div>
  );
}

/** Search the rules index, or paste any https address with a label. */
export function RefPicker({ onPick, onClose, kinds, taken = [] }: {
  onPick: (r: RefLink) => void;
  onClose: () => void;
  kinds?: RefKind[];
  taken?: string[];
}) {
  const t = useT();
  const [tab, setTab] = useState<'search' | 'paste'>('search');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<RefKind | ''>('');
  const [all, setAll] = useState<RefEntry[] | null | 'error'>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  useEffect(() => {
    loadWahapedia().then((x) => setAll(x.all), () => setAll('error'));
  }, []);
  const shown = (kinds?.length ? kinds : REF_KINDS);
  const hits = useMemo(
    () => (Array.isArray(all) ? searchEntries(all, q, { kinds: only ? [only] : shown, limit: 50 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, q, only, shown.join()],
  );
  const pasted = normaliseUrl(url);
  return (
    <Modal title={t('refs.add')} onClose={onClose} wide>
      <div className="segmented view-switch" role="tablist">
        <button role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>{t('refs.tabSearch')}</button>
        <button role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>{t('refs.tabPaste')}</button>
      </div>
      {tab === 'search' ? (
        <div className="ref-picker">
          <input className="text-input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('refs.searchPlaceholder')} aria-label={t('refs.search')} />
          <div className="chips wrap" role="group" aria-label={t('refs.filter')}>
            <button type="button" className={`chip small ${only === '' ? 'on' : ''}`} onClick={() => setOnly('')}>{t('refs.kind.all')}</button>
            {shown.map((kd) => (
              <button key={kd} type="button" className={`chip small ${only === kd ? 'on' : ''}`} onClick={() => setOnly(kd)}>{t(k(`refs.kind.${kd}`))}</button>
            ))}
          </div>
          {all === null ? <span className="spinner" /> : all === 'error' ? <p className="hint">{t('refs.loadError')}</p> : !q.trim() ? (
            <p className="hint">{t('refs.searchHint')}</p>
          ) : hits.length === 0 ? <p className="hint">{t('refs.noHit')}</p> : (
            <ul className="ref-hits">
              {hits.map((e) => (
                <li key={e.url + e.label}>
                  <button type="button" className="ref-hit" disabled={taken.includes(e.url)}
                    onClick={() => onPick({ u: e.url, l: (e.type === 'page' ? e.label : `${e.label} · ${e.group}`).slice(0, REF_LABEL_MAX) })}>
                    <span className="ref-label">{e.label}</span>
                    <small>{t(k(`refs.type.${e.type}`))} · {e.group}</small>
                  </button>
                  <a className="icon-btn" href={e.url} target="_blank" rel="noopener noreferrer nofollow external" aria-label={t('refs.open')} title={t('refs.open')}>
                    <Icon name="eye" size={15} />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="hint small">{t('refs.credit')}</p>
        </div>
      ) : (
        <form className="ref-picker" onSubmit={(e) => {
          e.preventDefault();
          if (pasted) onPick({ u: pasted, l: label.trim().slice(0, REF_LABEL_MAX) || undefined });
        }}>
          <label className="field">
            <span>{t('refs.url')}</span>
            <input className="text-input" type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            {url.trim() && !pasted && <small className="hint">{t('refs.badUrl')}</small>}
          </label>
          <label className="field">
            <span>{t('refs.label')}</span>
            <input className="text-input" value={label} maxLength={REF_LABEL_MAX} onChange={(e) => setLabel(e.target.value)}
              placeholder={pasted ? refTitle({ u: pasted }) : t('refs.labelPlaceholder')} />
          </label>
          <button className="btn primary" disabled={!pasted || taken.includes(pasted)}><Icon name="plus" size={14} /> {t('refs.addThis')}</button>
        </form>
      )}
    </Modal>
  );
}

/** "Wahapedia" chip check for lists that mix sites. */
export const siteOf = (u: string) => (isWahapedia(u) ? 'Wahapedia' : refHost(u));

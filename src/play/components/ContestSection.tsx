import { useEffect, useMemo, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { requireSignIn, useSession } from '../../core/auth/session';
import { Icon, Toggle } from '../../core/ui/ui';
import { download, slug } from '../../core/lib/image';
import { formatWhen } from './GameCard';
import { playError } from '../lib/games';
import { galleryUrls, myGalleryItems } from '../lib/social';
import { podiumCard } from '../lib/podiumCard';
import { devicePhotos, type DevicePhoto } from '../lib/devicePhotos';
import {
  addCategory,
  addJuror,
  categories as loadCategories,
  entriesOf,
  isClosed,
  isJuror,
  jury as loadJury,
  myScores,
  photoUrl,
  removeJuror,
  results as loadResults,
  saveScore,
  setHidden,
  submitEntry,
  thumbUrl,
  vote,
  withdrawEntry,
  type Category,
  type ContestKind,
  type Entry,
  type JuryScore,
  type ResultRow,
} from '../lib/contest';
import type { Tournament } from '../lib/tournaments';

/** Painting contest of a tournament: categories, blind vote, my entry, jury, results and podium. */
export function ContestSection({ tour, organiser }: { tour: Tournament; organiser: boolean }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const me = session?.user.id ?? null;
  const [cats, setCats] = useState<Category[] | null>(null);
  const [catId, setCatId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [juror, setJuror] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cat = cats?.find((c) => c.id === catId) ?? cats?.[0];
  const closed = cat ? isClosed(cat) : false;

  const loadCats = () => loadCategories(tour.id).then(setCats, (e) => setError(playError(e) ?? 'generic'));
  const loadCat = async () => {
    if (!cat) return;
    try {
      setEntries(await entriesOf(cat.id));
      setResults(isClosed(cat) || organiser ? await loadResults(cat.id) : []);
      setJuror(!!me && cat.jury_enabled && (await isJuror(cat.id)));
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
  };
  useEffect(() => {
    loadCats();
  }, [tour.id]);
  useEffect(() => {
    loadCat();
  }, [cat?.id, me]);

  const doVote = async (id: string) => {
    if (!me) return requireSignIn();
    setBusy(true);
    setError(null);
    try {
      await vote(id);
      await loadCat();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    setBusy(false);
  };

  if (!cats) return <span className="spinner" />;
  return (
    <div className="contest">
      {organiser && <OrganiserContest tour={tour} cats={cats} entries={entries} cat={cat} onChange={async () => (await loadCats(), await loadCat())} />}
      {cats.length === 0 ? (
        <p className="hint">{t('contest.none')}</p>
      ) : (
        <>
          <div className="chips">
            {cats.map((c) => (
              <button key={c.id} className={`chip ${c.id === cat?.id ? 'on' : ''}`} onClick={() => setCatId(c.id)}>
                {t(k(`contest.kind.${c.kind}`))}
              </button>
            ))}
          </div>
          {cat && (
            <p className="muted small">
              {closed ? t('contest.closedOn', { date: formatWhen(cat.voting_closes_at, lang) }) : t('contest.openUntil', { date: formatWhen(cat.voting_closes_at, lang) })}
              {cat.jury_enabled ? ` · ${t('contest.withJury')}` : ''}
            </p>
          )}

          {cat && closed && results.length > 0 && <Podium tour={tour} cat={cat} rows={results} />}

          {cat && !closed && <p className="hint">{t('contest.blindHint')}</p>}
          {cat && !closed && me && <MyEntry cat={cat} entry={entries.find((e) => e.is_mine)} me={me} onChange={loadCat} />}

          <ul className="entry-grid">
            {entries.map((e) => (
              <li key={e.id} className={`entry ${e.is_hidden ? 'hidden' : ''} ${e.my_vote ? 'voted' : ''}`}>
                <a href={photoUrl(e.photo_paths[0])} target="_blank" rel="noreferrer" className="entry-photo">
                  <img src={thumbUrl(e.photo_paths[0])} alt={e.title} loading="lazy" />
                  {e.photo_paths.length > 1 && <span className="tag">+{e.photo_paths.length - 1}</span>}
                </a>
                <strong>{e.title}</strong>
                <small className="muted">
                  {e.author_name ? <a href={`/u/${e.author_handle}`}>{e.author_name}</a> : t('contest.anonymous')}
                  {e.votes !== null && ` · ${t('contest.votes', { count: e.votes })}`}
                </small>
                {!closed && !e.is_mine && !e.is_hidden && (
                  <button className={`btn small ${e.my_vote ? 'primary' : ''}`} disabled={busy || e.my_vote} onClick={() => doVote(e.id)}>
                    <Icon name="star" size={14} /> {t(e.my_vote ? 'contest.myVote' : 'contest.vote')}
                  </button>
                )}
                {e.is_mine && <span className="tag ok">{t('contest.mine')}</span>}
                {organiser && (
                  <button className="btn small ghost" onClick={() => setHidden(e.id, !e.is_hidden).then(loadCat)}>{t(e.is_hidden ? 'contest.unhide' : 'contest.hide')}</button>
                )}
              </li>
            ))}
          </ul>
          {entries.length === 0 && <p className="hint">{t('contest.noEntries')}</p>}
          {cat && juror && me && <JuryPanel entries={entries} me={me} />}
        </>
      )}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </div>
  );
}

function Podium({ tour, cat, rows }: { tour: Tournament; cat: Category; rows: ResultRow[] }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const jury = rows.some((r) => r.jury_score !== null);
  const top = rows.filter((r) => r.public_rank <= 3).slice(0, 3);
  const juryTop = [...rows].filter((r) => r.jury_rank !== null).sort((a, b) => (a.jury_rank ?? 99) - (b.jury_rank ?? 99)).slice(0, 3);
  const share = async () => {
    const blob = await podiumCard({ tour, kindLabel: t(k(`contest.kind.${cat.kind}`)), rows: top, lang, photo: photoUrl });
    const file = new File([blob], `${slug(tour.name)}-podium.png`, { type: 'image/png' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: tour.name }).catch(() => undefined);
    else download(blob, file.name);
  };
  return (
    <section className="card accent podium-card">
      <div className="card-head">
        <h2><Icon name="trophy" size={18} /> {t('contest.podium')}</h2>
        <button className="btn small" onClick={share}><Icon name="share" size={14} /> {t('contest.sharePodium')}</button>
      </div>
      <ol className="podium">
        {top.map((r) => (
          <li key={r.entry_id} className={`place-${r.public_rank}`}>
            <img src={thumbUrl(r.photo_paths[0])} alt={r.title} loading="lazy" />
            <span className="podium-rank">{r.public_rank}</span>
            <strong>{r.title}</strong>
            <small className="muted"><a href={`/u/${r.author_handle}`}>{r.author_name}</a> · {t('contest.votes', { count: r.votes })}</small>
          </li>
        ))}
      </ol>
      {jury && (
        <>
          <h3>{t('contest.juryRanking')}</h3>
          <ol className="notif-list">
            {juryTop.map((r) => (
              <li key={r.entry_id}>
                <span>{r.jury_rank}. <strong>{r.title}</strong> · {r.author_name}</span>
                <span className="muted">{t('contest.juryScore', { score: r.jury_score ?? 0 })}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="muted small">{t('contest.resultsOn', { date: formatWhen(cat.voting_closes_at, lang) })}</p>
    </section>
  );
}

function MyEntry({ cat, entry, me, onChange }: { cat: Category; entry?: Entry; me: string; onChange: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [fromGallery, setFromGallery] = useState<string[]>([]);
  const [gallery, setGallery] = useState<{ id: string; title: string; image_path: string; url?: string }[]>([]);
  const [device, setDevice] = useState<DevicePhoto[]>([]);
  const [fromDevice, setFromDevice] = useState<string[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    myGalleryItems(me).then(async (items) => {
      const urls = await galleryUrls(items.map((i) => i.image_path));
      setGallery(items.map((i) => ({ ...i, url: urls.get(i.image_path) })));
    }, () => setGallery([]));
  }, [open, me]);
  // PAINT projects and My pile photos on this device
  useEffect(() => {
    if (!open) return;
    let release = () => undefined as void;
    let alive = true;
    devicePhotos().then((r) => {
      if (alive) (release = r.release), setDevice(r.photos);
      else r.release();
    }, () => setDevice([]));
    return () => {
      alive = false;
      release();
    };
  }, [open]);

  const count = files.length + fromGallery.length + fromDevice.length;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Photos are shrunk with a thumbnail on upload (submitEntry); gallery images are fetched first.
      const blobs: Blob[] = [];
      for (const url of fromGallery) blobs.push(await (await fetch(url)).blob());
      blobs.push(...device.filter((d) => fromDevice.includes(d.id)).map((d) => d.blob));
      blobs.push(...files);
      await submitEntry(cat.id, title, blobs, blobs.length ? [] : entry?.photo_paths ?? []);
      setOpen(false);
      onChange();
    } catch (err) {
      setError(playError(err) ?? 'generic');
    }
    setBusy(false);
  };

  return (
    <section className="card">
      <div className="field-row wrap">
        <p className="grow">{entry ? t('contest.youEntered', { title: entry.title }) : t('contest.enterLead')}</p>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{t(entry ? 'contest.editEntry' : 'contest.enter')}</button>
        {entry && <button className="btn ghost" onClick={() => withdrawEntry(cat.id).then(onChange)}>{t('contest.withdraw')}</button>}
      </div>
      {open && (
        <form className="field-col" onSubmit={submit}>
          <label className="field">
            <span>{t('contest.title')}</span>
            <input className="text-input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('contest.photos')}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 5))} />
            <small className="hint">{t('contest.photosHint')}</small>
          </label>
          {gallery.length > 0 && (
            <div className="field">
              <span>{t('contest.fromGallery')}</span>
              <ul className="pick-grid">
                {gallery.filter((g) => g.url).map((g) => (
                  <li key={g.id}>
                    <label className={fromGallery.includes(g.url!) ? 'on' : ''}>
                      <input type="checkbox" checked={fromGallery.includes(g.url!)} onChange={(e) => setFromGallery((l) => (e.target.checked ? [...l, g.url!] : l.filter((x) => x !== g.url)))} />
                      <img src={g.url} alt={g.title} />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {device.length > 0 && (
            <div className="field">
              <span>{t('bridge.fromDevice')}</span>
              <ul className="pick-grid">
                {device.map((d) => (
                  <li key={d.id}>
                    <label className={fromDevice.includes(d.id) ? 'on' : ''} title={d.label}>
                      <input type="checkbox" checked={fromDevice.includes(d.id)} onChange={(e) => setFromDevice((l) => (e.target.checked ? [...l, d.id] : l.filter((x) => x !== d.id)))} />
                      <img src={d.url} alt={d.label} />
                      <small className="pick-tag">{t(d.source === 'project' ? 'bridge.tagPaint' : 'bridge.tagPile')}</small>
                    </label>
                  </li>
                ))}
              </ul>
              <small className="hint">{t('bridge.fromDeviceHint')}</small>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} required /> {t('contest.rights')}
          </label>
          {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
          <div className="nav-row">
            <span className="muted small">{t('contest.photoCount', { count: count || (entry?.photo_paths.length ?? 0) })}</span>
            <button className="btn primary" disabled={busy || !rights || (!count && !entry)}>{busy ? <span className="spinner small" /> : t('contest.submit')}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function JuryPanel({ entries, me }: { entries: Entry[]; me: string }) {
  const t = useT();
  const [scores, setScores] = useState<Map<string, JuryScore>>(new Map());
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    myScores(me).then((list) => setScores(new Map(list.map((s) => [s.entry_id, s]))), () => undefined);
  }, [me]);
  const set = (id: string, p: Partial<JuryScore>) =>
    setScores((m) => new Map(m).set(id, { entry_id: id, technique: 5, composition: 5, originality: 5, ...m.get(id), ...p }));
  return (
    <section className="card jury">
      <h2>{t('contest.juryTitle')}</h2>
      <p className="hint">{t('contest.juryHint')}</p>
      <ul className="jury-list">
        {entries.filter((e) => !e.is_hidden).map((e) => {
          const s = scores.get(e.id);
          return (
            <li key={e.id}>
              <img src={thumbUrl(e.photo_paths[0])} alt={e.title} loading="lazy" />
              <strong>{e.title}</strong>
              {(['technique', 'composition', 'originality'] as const).map((c) => (
                <label key={c} className="field">
                  <span>{t(k(`contest.${c}`))}</span>
                  <input className="text-input num" type="number" min={1} max={10} value={s?.[c] ?? ''} onChange={(ev) => set(e.id, { [c]: Math.max(1, Math.min(10, Number(ev.target.value) || 1)) })} />
                </label>
              ))}
              <button className="btn small" disabled={!s} onClick={() => s && saveScore(me, s).then(() => setSaved(e.id))}>
                {saved === e.id ? t('contest.saved') : t('common.save')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OrganiserContest({ tour, cats, entries, cat, onChange }: { tour: Tournament; cats: Category[]; entries: Entry[]; cat?: Category; onChange: () => void }) {
  const t = useT();
  const kinds: ContestKind[] = ['single', 'squad', 'vehicle', 'beginner'];
  const free = kinds.filter((x) => !cats.some((c) => c.kind === x));
  const defaultClose = useMemo(() => {
    const d = new Date(Date.parse(tour.ends_at) + 3 * 864e5);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [tour.ends_at]);
  const [kind, setKind] = useState<ContestKind | ''>(free[0] ?? '');
  const [closes, setCloses] = useState(defaultClose);
  const [juryOn, setJuryOn] = useState(false);
  const [jurors, setJurors] = useState<Awaited<ReturnType<typeof loadJury>>>([]);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loadJ = () => loadJury(tour.id).then(setJurors, () => setJurors([]));
  useEffect(() => {
    loadJ();
  }, [tour.id]);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChange();
      loadJ();
    } catch (e) {
      setError((e as Error).message === 'unknown_player' ? 'unknown_player' : playError(e) ?? 'generic');
    }
  };
  return (
    <section className="card accent organiser">
      <h2>{t('contest.organiserTitle')}</h2>
      {free.length > 0 && (
        <div className="field-row wrap">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ContestKind)} aria-label={t('contest.category')}>
            {free.map((x) => <option key={x} value={x}>{t(k(`contest.kind.${x}`))}</option>)}
          </select>
          <label className="field inline">
            <span>{t('contest.closes')}</span>
            <input className="text-input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <Toggle checked={juryOn} onChange={setJuryOn} label={t('contest.juryToggle')} />
          <button className="btn small primary" disabled={!kind} onClick={() => run(() => addCategory(tour.id, kind as ContestKind, new Date(closes).toISOString(), juryOn))}>
            {t('contest.addCategory')}
          </button>
        </div>
      )}
      <div className="field-row wrap">
        <span className="muted small">{t('contest.jurors')}:</span>
        {jurors.map((j) => (
          <span key={j.user_id} className="tag">
            {j.profile?.display_name} <button className="link small" onClick={() => run(() => removeJuror(tour.id, j.user_id))} aria-label={t('contest.removeJuror')}>×</button>
          </span>
        ))}
        <input className="text-input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" aria-label={t('contest.addJuror')} />
        <button className="btn small" disabled={!handle.trim()} onClick={() => run(() => addJuror(tour.id, handle)).then(() => setHandle(''))}>{t('contest.addJuror')}</button>
      </div>
      {cat && <p className="muted small">{t('contest.organiserStats', { entries: entries.length, hidden: entries.filter((e) => e.is_hidden).length })}</p>}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </section>
  );
}

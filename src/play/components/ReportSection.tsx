import { useEffect, useMemo, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { Icon } from '../../core/ui/ui';
import { download, fileToImageData, imageDataToBlob, slug } from '../../core/lib/image';
import { countryName } from '../lib/countries';
import { formatWhen } from './GameCard';
import type { Game, GamePlayer } from '../lib/games';
import {
  answerReport,
  galleryUrls,
  getReport,
  myGalleryItems,
  playError,
  reportPhotoUrl,
  submitReport,
  uploadReportPhoto,
  type GameReport,
} from '../lib/social';
import { resultCard } from '../lib/resultCard';

interface Participant {
  id: string;
  name: string;
}

/** Battle report of a played game: form for the players, confirmation, photos, share card. */
export function ReportSection({ game, players, me }: { game: Game; players: GamePlayer[]; me: string | null }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [report, setReport] = useState<GameReport | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participants: Participant[] = useMemo(
    () => [
      { id: game.host_id, name: game.host?.display_name ?? '?' },
      ...players.filter((p) => p.status === 'accepted').map((p) => ({ id: p.player_id, name: p.profile?.display_name ?? '?' })),
    ],
    [game, players],
  );
  const isParticipant = !!me && participants.some((p) => p.id === me);

  const load = () =>
    getReport(game.id).then(async (r) => {
      setReport(r);
      const paths = (r?.results ?? []).map((x) => x.item?.image_path).filter((p): p is string => !!p);
      setImages(await galleryUrls(paths));
    }, (e) => {
      setError(playError(e) ?? 'generic');
      setReport(null);
    });
  useEffect(() => {
    load();
  }, [game.id]);

  if (report === undefined) return null;
  const mine = report?.results.find((r) => r.player_id === me);

  const answer = async (agree: boolean) => {
    setBusy(true);
    try {
      await answerReport(game.id, agree);
      await load();
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    setBusy(false);
  };

  const share = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const pics = [
        ...report.results.map((r) => (r.item ? images.get(r.item.image_path) : undefined)).filter((u): u is string => !!u),
        ...report.photos.map(reportPhotoUrl),
      ];
      const blob = await resultCard({
        game,
        report,
        lang,
        when: formatWhen(game.starts_at, lang),
        place: [game.area, game.city, countryName(game.country, lang)].filter(Boolean).join(', '),
        images: pics,
      });
      const file = new File([blob], `${slug(game.game_system)}-result.png`, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: game.game_system }).catch(() => undefined);
      } else download(blob, file.name);
    } catch (e) {
      setError(playError(e) ?? 'generic');
    }
    setBusy(false);
  };

  return (
    <section className="card report">
      <div className="card-head">
        <h2>{t('report.title')}</h2>
        {report && <span className={`tag report-${report.status}`}>{t(k(`report.status.${report.status}`))}</span>}
      </div>

      {(!report || editing) && isParticipant ? (
        <ReportForm
          game={game}
          participants={participants}
          me={me!}
          initial={report}
          onDone={async () => {
            setEditing(false);
            await load();
          }}
          onCancel={report ? () => setEditing(false) : undefined}
        />
      ) : !report ? (
        <p className="hint">{t('report.none')}</p>
      ) : (
        <>
          <ol className="results">
            {report.results.map((r) => (
              <li key={r.player_id} className={r.placement === report.results[0].placement ? 'winner' : ''}>
                {r.item && images.get(r.item.image_path) && <img src={images.get(r.item.image_path)} alt={r.item.title} loading="lazy" />}
                <span className="result-text">
                  <strong>{r.profile?.display_name ?? '?'}</strong>
                  <small className="muted">
                    {[t('report.place', { n: r.placement }), r.army, r.item ? t('report.paintedArmy') : null].filter(Boolean).join(' · ')}
                  </small>
                </span>
                {r.score !== null && <span className="result-score">{r.score}</span>}
                {report.status !== 'confirmed' && (
                  <span className="muted small">{r.agreed === true ? '✓' : r.agreed === false ? '✗' : '…'}</span>
                )}
              </li>
            ))}
          </ol>
          {report.summary && <p className="game-note">{report.summary}</p>}
          {report.photos.length > 0 && (
            <div className="report-photos">
              {report.photos.map((p) => (
                <a key={p} href={reportPhotoUrl(p)} target="_blank" rel="noreferrer">
                  <img src={reportPhotoUrl(p)} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          )}
          <div className="field-row wrap">
            {mine && mine.agreed === null && report.status !== 'confirmed' && (
              <>
                <button className="btn primary" disabled={busy} onClick={() => answer(true)}>{t('report.confirm')}</button>
                <button className="btn danger-ghost" disabled={busy} onClick={() => answer(false)}>{t('report.dispute')}</button>
              </>
            )}
            {isParticipant && report.status !== 'confirmed' && (
              <button className="btn ghost" onClick={() => setEditing(true)}>{t('report.edit')}</button>
            )}
            {report.status === 'confirmed' && (
              <button className="btn primary" disabled={busy} onClick={share}>
                <Icon name="share" size={16} /> {t('report.share')}
              </button>
            )}
          </div>
          {report.status === 'reported' && <p className="hint">{t('report.waiting')}</p>}
          {report.status === 'disputed' && <p className="hint">{t('report.disputedHint')}</p>}
        </>
      )}
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
    </section>
  );
}

function ReportForm({
  game,
  participants,
  me,
  initial,
  onDone,
  onCancel,
}: {
  game: Game;
  participants: Participant[];
  me: string;
  initial: GameReport | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const [rows, setRows] = useState(() =>
    participants.map((p, i) => {
      const prev = initial?.results.find((r) => r.player_id === p.id);
      return {
        player_id: p.id,
        name: p.name,
        placement: prev?.placement ?? i + 1,
        score: prev?.score?.toString() ?? '',
        army: prev?.army ?? '',
        gallery_item_id: prev?.gallery_item_id ?? '',
      };
    }),
  );
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myGalleryItems(me).then(setItems, () => setItems([]));
  }, [me]);

  const set = (i: number, p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Photos are resized (1600 px) and uploaded first; the report keeps their paths.
      const photos = [...(initial?.photos ?? [])];
      for (const f of files.slice(0, 4 - photos.length)) {
        const img = await fileToImageData(f, 1600);
        photos.push(await uploadReportPhoto(game.id, await imageDataToBlob(img, 'image/jpeg')));
      }
      await submitReport(
        game.id,
        rows.map((r) => ({
          player_id: r.player_id,
          placement: r.placement,
          score: r.score === '' ? null : Number(r.score),
          army: r.army || null,
          gallery_item_id: r.player_id === me && r.gallery_item_id ? r.gallery_item_id : null,
        })),
        summary,
        photos,
      );
      onDone();
    } catch (err) {
      setError(playError(err) ?? 'generic');
      setBusy(false);
    }
  };

  return (
    <form className="field-col report-form" onSubmit={submit}>
      <p className="hint">{t('report.formHint')}</p>
      {rows.map((r, i) => (
        <fieldset key={r.player_id} className="result-row">
          <legend>{r.name}</legend>
          <label className="field">
            <span>{t('report.placement')}</span>
            <select className="select" value={r.placement} onChange={(e) => set(i, { placement: Number(e.target.value) })}>
              {rows.map((_, n) => <option key={n} value={n + 1}>{n === 0 ? t('report.winner') : t('report.place', { n: n + 1 })}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('report.score')}</span>
            <input className="text-input" type="number" value={r.score} onChange={(e) => set(i, { score: e.target.value })} />
          </label>
          <label className="field">
            <span>{t('report.army')}</span>
            <input className="text-input" maxLength={80} value={r.army} onChange={(e) => set(i, { army: e.target.value })} />
          </label>
          {r.player_id === me && items.length > 0 && (
            <label className="field">
              <span>{t('report.galleryItem')}</span>
              <select className="select" value={r.gallery_item_id} onChange={(e) => set(i, { gallery_item_id: e.target.value })}>
                <option value="">{t('report.noGalleryItem')}</option>
                {items.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <small className="hint">{t('report.galleryHint')}</small>
            </label>
          )}
        </fieldset>
      ))}
      <label className="field">
        <span>{t('report.summary')}</span>
        <textarea className="text-input" rows={3} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('report.photos')}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 4))} />
        <small className="hint">{t('report.photosHint')}</small>
      </label>
      {error && <p className="error" role="alert">{t(k(`games.error.${error}`))}</p>}
      <div className="nav-row">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>{t('common.back')}</button>}
        <button className="btn primary" disabled={busy}>{busy ? <span className="spinner small" /> : t('report.submit')}</button>
      </div>
    </form>
  );
}

import { useEffect, useRef, useState } from 'react';
import { localeOf, useLang, useT } from '../../core/i18n';
import { Icon, Modal } from '../../core/ui/ui';
import { download } from '../../core/lib/image';
import { photoBlob, type Army, type Unit } from '../hobby/store';
import { STORY_H, STORY_W, previewStory, recordStory, videoSupported, type StoryInput } from '../hobby/timelapse';

/** Vertical story of a unit's step photos: live preview, speed, then a video to share or download. */
export function TimelapseDialog({ army, unit, onClose }: { army: Army; unit: Unit; onClose: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [input, setInput] = useState<StoryInput | null>(null);
  const [hold, setHold] = useState(1.2);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const photos: StoryInput['photos'] = [];
      for (const p of unit.photos) {
        const b = await photoBlob(p.id);
        if (b) photos.push({ bitmap: await createImageBitmap(b), at: p.at });
      }
      const days = Math.max(1, Math.round((unit.photos[unit.photos.length - 1].at - unit.photos[0].at) / 86400000));
      if (alive) setInput({
        photos,
        title: unit.name,
        subtitle: `${army.name} · ${t('timelapse.days', { n: days })}`,
        dateLabel: (at) => new Date(at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long' }),
        hold: 1.2,
      });
    })();
    return () => {
      alive = false;
    };
  }, [unit, army.name, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!input || !canvas.current) return;
    return previewStory(canvas.current, { ...input, hold });
  }, [input, hold]);

  const record = async () => {
    if (!input) return;
    setError(false);
    setProgress(0);
    try {
      const { blob, ext } = await recordStory({ ...input, hold }, setProgress);
      const file = new File([blob], `${unit.name}-timelapse.${ext}`, { type: blob.type });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: unit.name }).catch(() => undefined);
      else download(blob, file.name);
    } catch {
      setError(true);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal title={t('timelapse.title')} onClose={onClose}>
      <div className="timelapse">
        <canvas ref={canvas} width={STORY_W} height={STORY_H} className="story-canvas" aria-label={t('timelapse.preview')} />
        <label className="field inline">
          <span>{t('timelapse.speed')}</span>
          <select className="select" value={hold} onChange={(e) => setHold(+e.target.value)}>
            <option value={0.6}>{t('timelapse.fast')}</option>
            <option value={1.2}>{t('timelapse.normal')}</option>
            <option value={2}>{t('timelapse.slow')}</option>
          </select>
        </label>
        {videoSupported() ? (
          <button className="btn primary wide" onClick={record} disabled={!input || progress !== null}>
            {progress !== null ? `${t('timelapse.recording')} ${Math.round(progress * 100)} %` : <><Icon name="share" size={16} /> {t('timelapse.video')}</>}
          </button>
        ) : (
          <p className="hint">{t('timelapse.noVideo')}</p>
        )}
        {error && <p className="error">{t('timelapse.error')}</p>}
      </div>
    </Modal>
  );
}

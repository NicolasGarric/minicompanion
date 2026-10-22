import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useLang, useT } from '../../core/i18n';
import { generateCard, schemeLink, type CardFormat } from '../lib/share';
import { download, slug } from '../../core/lib/image';
import { track } from '../../core/analytics';
import { Icon, Modal, Segmented } from '../../core/ui/ui';

/** "My scheme" card: story / square image + public link. */
export function ShareDialog() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const zones = useStore((s) => s.zones);
  const library = useStore((s) => s.library);
  const primer = useStore((s) => s.primer);
  const projectName = useStore((s) => s.projectName);
  const { set, toast } = useStore.getState();
  const [format, setFormat] = useState<CardFormat>('square');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [link, setLink] = useState('');

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setPreview(null);
    (async () => {
      const l = await schemeLink(projectName, zones);
      const b = await generateCard({ format, name: projectName, zones, primer, library, lang, link: l });
      if (cancelled) return;
      url = URL.createObjectURL(b);
      setLink(l);
      setBlob(b);
      setPreview(url);
      track('card_generated', format);
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [format, lang, projectName, zones, primer, library]);

  const file = () => new File([blob!], `${slug(projectName)}-${format}.png`, { type: 'image/png' });
  const canShareFile = !!blob && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file()] });

  const share = async () => {
    try {
      await navigator.share({ files: [file()], title: projectName, text: t('share.text', { name: projectName }), url: link });
      track('card_shared', 'native');
    } catch {
      /* the user closed the share sheet */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      track('card_shared', 'link');
      toast(t('share.linkCopied'), 'success');
    } catch {
      toast(t('toast.clipboardDenied'), 'error');
    }
  };

  return (
    <Modal title={t('share.title')} onClose={() => set({ shareOpen: false })}>
      <div className="share">
        <Segmented<CardFormat>
          value={format}
          onChange={setFormat}
          options={[
            { value: 'square', label: t('share.square') },
            { value: 'story', label: t('share.story') },
            { value: 'compare', label: t('share.compare') },
          ]}
        />
        <div className={`share-preview ${format}`}>
          {preview ? <img src={preview} alt={t('share.previewAlt')} /> : <span className="spinner" />}
        </div>
        <div className="share-actions">
          <button
            className="btn primary"
            disabled={!blob}
            onClick={() => {
              download(blob!, `${slug(projectName)}-${format}.png`);
              track('card_shared', 'download');
            }}
          >
            <Icon name="download" size={15} /> {t('share.download')}
          </button>
          {canShareFile && (
            <button className="btn" onClick={share}>
              <Icon name="share" size={15} /> {t('share.native')}
            </button>
          )}
          <button className="btn" disabled={!link} onClick={copyLink}>
            <Icon name="link" size={15} /> {t('share.copyLink')}
          </button>
        </div>
        <p className="hint">{t('share.linkHint')}</p>
      </div>
    </Modal>
  );
}

import { useT } from '../i18n';

/** Unknown address (the server answers every path with the app). */
export function NotFound() {
  const t = useT();
  return (
    <div className="narrow">
      <h1>{t('notFound.title')}</h1>
      <p className="lead">{t('notFound.text')}</p>
      <p><a className="btn primary" href="/">{t('nav.home')}</a></p>
    </div>
  );
}

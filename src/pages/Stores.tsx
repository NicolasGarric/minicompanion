import { useT } from '../i18n';
import { StoreFinder } from '../components/StoreFinder';

export function Stores() {
  const t = useT();
  return (
    <div className="narrow">
      <h1>{t('stores.title')}</h1>
      <p className="lead">{t('stores.lead')}</p>
      <StoreFinder />
    </div>
  );
}

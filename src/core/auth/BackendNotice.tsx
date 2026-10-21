import { useT } from '../i18n';

/** Shown on account / PLAY screens when the app runs without Supabase (PAINT keeps working). */
export function BackendNotice() {
  const t = useT();
  return (
    <div className="narrow">
      <p className="notice">{t('backend.missing')}</p>
    </div>
  );
}

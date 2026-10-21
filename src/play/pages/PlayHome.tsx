import { useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { BackendNotice } from '../../core/auth/BackendNotice';

/** PLAY entry point. Becomes the tournament list (step 3 of docs/PLAY_PLAN.md). */
export function PlayHome() {
  const t = useT();
  if (!backendConfigured) return <BackendNotice />;
  return (
    <div className="narrow">
      <h1>{t('play.title')}</h1>
      <p className="lead">{t('play.lead')}</p>
    </div>
  );
}

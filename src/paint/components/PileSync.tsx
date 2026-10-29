import { useEffect, useRef, useState } from 'react';
import { useT } from '../../core/i18n';
import { useSession } from '../../core/auth/session';
import { backendConfigured } from '../../core/auth/supabase';
import { Icon } from '../../core/ui/ui';
import { useHobby } from '../hobby/store';
import { importPile, pullPile, pushPile } from '../hobby/sync';

/** Labels of the rows made from older units (points, stars, note), in the player's language. */
export function useLegacyLabels() {
  const t = useT();
  return { points: t('cards.row.points'), stars: t('cards.row.stars'), note: t('cards.row.note') };
}

/**
 * Keeps My pile in sync with the account (mounted once in the shell): pull when the app opens,
 * push a couple of seconds after each change. Does nothing before the pile is imported.
 */
export function usePileSync() {
  const uid = useSession((s) => s.session?.user.id ?? null);
  const owner = useHobby((s) => s.sync.owner);
  const dirty = useHobby((s) => s.sync.dirty.length + s.sync.gone.armies.length + s.sync.gone.units.length + s.sync.gone.decks.length);
  const labels = useLegacyLabels();
  const busy = useRef(false);
  const linked = backendConfigured && !!uid && owner === uid;

  useEffect(() => {
    if (!linked || !uid) return;
    // Opening: what is pending goes first, then the account's pile comes back
    (async () => {
      busy.current = true;
      try {
        await pushPile(uid, labels);
        await pullPile(uid);
      } catch {
        /* offline: the next change tries again */
      } finally {
        busy.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, uid]);

  useEffect(() => {
    if (!linked || !uid || !dirty) return;
    const timer = setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        await pushPile(uid, labels);
      } catch {
        /* kept for the next change */
      } finally {
        busy.current = false;
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, uid, dirty]);
}

/** On My pile and Decks: offer to save the pile on the account (first time), or say it is saved. */
export function PileSyncBanner() {
  const t = useT();
  const uid = useSession((s) => s.session?.user.id ?? null);
  const owner = useHobby((s) => s.sync.owner);
  const hasPile = useHobby((s) => s.armies.length + s.decks.length > 0);
  const pending = useHobby((s) => s.sync.dirty.length > 0);
  const labels = useLegacyLabels();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  // Nothing on this device yet: simply follow the account
  useEffect(() => {
    if (backendConfigured && uid && owner !== uid && !hasPile) pullPile(uid).catch(() => undefined);
  }, [uid, owner, hasPile]);

  if (!backendConfigured) return null;
  if (!uid) return <p className="hint pile-sync">{t('cards.sync.signin')} <a href="/signin">{t('auth.signin.cta')}</a></p>;
  if (owner === uid) return <p className="hint pile-sync"><Icon name="check" size={14} /> {t(pending ? 'cards.sync.pending' : 'cards.sync.saved')}</p>;
  if (!hasPile) return null;
  return (
    <div className="card accent pile-sync">
      <p>{t('cards.sync.offer')}</p>
      <button className="btn primary" disabled={state === 'busy'} onClick={async () => {
        setState('busy');
        try {
          await importPile(uid, labels);
          setState('idle');
        } catch {
          setState('error');
        }
      }}>
        {state === 'busy' ? <span className="spinner small" /> : <Icon name="upload" size={16} />} {t('cards.sync.import')}
      </button>
      {state === 'error' && <p className="error" role="alert">{t('cards.sync.error')}</p>}
    </div>
  );
}

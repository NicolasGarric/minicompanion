import { create } from 'zustand';

/**
 * Cookie and storage consent (EU GDPR / ePrivacy, Japan APPI). What the app needs to work (sign-in
 * session, language, settings, PAINT projects on this device) needs no consent. Two optional groups:
 *   - stats: Vercel Web Analytics (no cookie, third party), the anonymous page counts sent to our server
 *     and the event counters kept on this device;
 *   - external: content from other services that set their own cookies (the Twitch player).
 * The choice is kept on this device for 6 months, then asked again (CNIL recommendation).
 */
export interface Consent { stats: boolean; external: boolean }
interface Stored extends Consent { v: 1; at: string }

const KEY = 'cf.consent';
const MAX_AGE = 182 * 864e5;

function read(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (s?.v === 1 && Date.now() - Date.parse(s.at) < MAX_AGE) return s;
  } catch {
    /* unreadable: ask again */
  }
  return null;
}

interface State {
  /** null until the visitor has chosen (the banner shows). */
  choice: Consent | null;
  /** The detailed panel is open (from the banner, the footer link or the cookies page). */
  panel: boolean;
  set: (c: Consent) => void;
  openPanel: () => void;
  closePanel: () => void;
}

export const useConsent = create<State>((setState, get) => {
  const s = read();
  return {
    choice: s ? { stats: s.stats, external: s.external } : null,
    panel: false,
    set: (c) => {
      const before = get().choice;
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: 1, at: new Date().toISOString(), ...c } satisfies Stored));
      } catch {
        /* private mode: the choice lasts for this visit only */
      }
      if (!c.stats) clearStats();
      setState({ choice: c, panel: false });
      // Withdrawn consent: reload so that scripts already started (analytics, players) are gone.
      if (before && ((before.stats && !c.stats) || (before.external && !c.external))) location.reload();
    },
    openPanel: () => setState({ panel: true }),
    closePanel: () => setState({ panel: false }),
  };
});

/** Current choice outside React (false until the visitor has chosen). */
export const hasConsent = (k: keyof Consent) => !!useConsent.getState().choice?.[k];

/** Statistics refused or withdrawn: the counters kept on this device go too. */
function clearStats() {
  try {
    localStorage.removeItem('cf.analytics');
    sessionStorage.removeItem('cf.visit');
  } catch {
    /* nothing to clear */
  }
}

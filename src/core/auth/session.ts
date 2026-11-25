import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useLang, type Lang } from '../i18n';
import { currentPath, navigate } from '../router';
import { cityById } from '../data/cities';
import { parsePoint, toPoint, type Point } from '../lib/geo';

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_path: string | null;
  home_city: string | null;
  /** PostGIS point, own profile only */
  home_location?: string | null;
  preferred_lang: Lang;
  factions: string[];
  is_admin: boolean;
  /** Public profile page (/u/handle); private by default. Missing before the social migration. */
  is_public?: boolean;
}

export type ProfileUpdate = Partial<Pick<Profile, 'handle' | 'display_name' | 'home_city' | 'preferred_lang' | 'factions'>> & {
  home_location?: { lat: number; lng: number } | null;
};

interface SessionState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  init: () => void;
  refreshProfile: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  /** True after opening a "reset your password" link: the new password needs no current one. */
  recovering: boolean;
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  /** Checks the current password (unless recovering), sets the new one and signs the other devices out. */
  changePassword: (current: string, next: string) => Promise<{ error?: 'wrong' | 'failed' }>;
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfileUpdate) => Promise<{ error?: string }>;
}

/** Where to go back after an OAuth or email-confirmation round trip. */
const RETURN_KEY = 'cf.auth.return';

/** Set when a reset link is asked for (localStorage: the e-mail link opens a new tab), valid one hour. */
const RECOVERY_KEY = 'cf.auth.recovery';
const RECOVERY_MS = 3600_000;

function takeRecovery(): boolean {
  try {
    const at = Number(localStorage.getItem(RECOVERY_KEY));
    localStorage.removeItem(RECOVERY_KEY);
    return at > 0 && Date.now() - at < RECOVERY_MS;
  } catch {
    return false;
  }
}

// Always the site root (the address allowed in Supabase); the page to return to is kept in sessionStorage.
const redirectUrl = () => `${location.origin}/`;

export const useSession = create<SessionState>((set, get) => ({
  ready: !supabase,
  session: null,
  profile: null,
  recovering: false,

  init: () => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, ready: true });
      if (data.session) get().refreshProfile();
    });
    supabase.auth.onAuthStateChange((event, session) => {
      set({ session });
      if (!session) return set({ profile: null });
      get().refreshProfile();
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        // A reset link comes back with `?code=` like any other: the request left a mark on this browser.
        const fromLink = new URLSearchParams(location.search).has('code');
        const recovery = event === 'PASSWORD_RECOVERY' || (fromLink && takeRecovery());
        // Remove `?code=` left by the PKCE redirect and return to the page the user came from.
        const params = new URLSearchParams(location.search);
        if (params.has('code')) {
          params.delete('code');
          const rest = params.toString();
          history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
        }
        const back = sessionStorage.getItem(RETURN_KEY);
        if (recovery) {
          takeRecovery();
          sessionStorage.removeItem(RETURN_KEY);
          set({ recovering: true });
          navigate('password', { replace: true });
        } else if (back) {
          sessionStorage.removeItem(RETURN_KEY);
          navigate(back);
        }
      }
    });
  },

  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!supabase || !uid) return;
    // Private columns (city, armies, language…) are only readable through my_profile();
    // the plain select is the fallback for databases set up before the security migration.
    const own = await supabase.rpc('my_profile');
    const data = own.error
      ? (await supabase.from('profiles').select('*').eq('id', uid).single()).data
      : ((own.data as Profile[] | null)?.[0] ?? null);
    if (!data) return;
    set({ profile: data as Profile });
    void useLang.getState().setLang((data as Profile).preferred_lang);
  },

  signUp: async (email, password, displayName) => {
    if (!supabase) return { error: 'backend' };
    sessionStorage.setItem(RETURN_KEY, 'account');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl(),
        data: { display_name: displayName, preferred_lang: useLang.getState().lang },
      },
    });
    if (error) return { error: error.message };
    return { needsConfirmation: !data.session };
  },

  signIn: async (email, password) => {
    if (!supabase) return { error: 'backend' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  },

  signInWithGoogle: async () => {
    if (!supabase) return { error: 'backend' };
    const back = currentPath();
    sessionStorage.setItem(RETURN_KEY, back && back !== 'signin' ? back : 'account');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    return error ? { error: error.message } : {};
  },

  requestPasswordReset: async (email) => {
    if (!supabase) return { error: 'backend' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) return { error: error.message };
    try {
      localStorage.setItem(RECOVERY_KEY, String(Date.now()));
    } catch {
      // Private window: the link still signs in, the password is then changed from the account page.
    }
    return {};
  },

  changePassword: async (current, next) => {
    const email = get().session?.user.email;
    if (!supabase || !email) return { error: 'failed' };
    if (!get().recovering) {
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) return { error: 'wrong' };
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { error: 'failed' };
    set({ recovering: false });
    await supabase.auth.signOut({ scope: 'others' });
    return {};
  },

  signOut: async () => {
    await supabase?.auth.signOut();
    set({ session: null, profile: null, recovering: false });
  },

  updateProfile: async (patch) => {
    const uid = get().session?.user.id;
    if (!supabase || !uid) return { error: 'auth' };
    const { home_location, ...rest } = patch;
    const row: Record<string, unknown> = { ...rest };
    if (home_location !== undefined) row.home_location = home_location ? toPoint(home_location) : null;
    const { error } = await supabase.from('profiles').update(row).eq('id', uid);
    if (error) return { error: error.code === '23505' ? 'handleTaken' : error.message };
    await get().refreshProfile();
    return {};
  },
}));

/** Centre of the player's home city, for maps and distances. */
export function homePoint(profile: Profile | null): Point | null {
  return parsePoint(profile?.home_location) ?? cityById(profile?.home_city) ?? null;
}

/** Remember where to come back to after signing in, then open the sign-in page. */
export function requireSignIn() {
  sessionStorage.setItem(RETURN_KEY, currentPath());
  navigate('signin');
}

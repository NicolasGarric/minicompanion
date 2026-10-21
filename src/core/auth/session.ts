import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useLang, type Lang } from '../i18n';
import { navigate } from '../router';

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  avatar_path: string | null;
  home_city: string | null;
  preferred_lang: Lang;
  factions: string[];
  is_admin: boolean;
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
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfileUpdate) => Promise<{ error?: string }>;
}

/** Where to go back after an OAuth or email-confirmation round trip. */
const RETURN_KEY = 'cf.auth.return';

const redirectUrl = () => `${location.origin}${location.pathname}`;

/** PostGIS accepts EWKT for geography columns. */
const toPoint = (p: { lat: number; lng: number }) => `SRID=4326;POINT(${p.lng} ${p.lat})`;

export const useSession = create<SessionState>((set, get) => ({
  ready: !supabase,
  session: null,
  profile: null,

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
      if (event === 'SIGNED_IN') {
        // Remove `?code=` left by the PKCE redirect and return to the page the user came from.
        if (location.search) history.replaceState(null, '', location.pathname + location.hash);
        const back = sessionStorage.getItem(RETURN_KEY);
        if (back) {
          sessionStorage.removeItem(RETURN_KEY);
          navigate(back);
        }
      }
    });
  },

  refreshProfile: async () => {
    const uid = get().session?.user.id;
    if (!supabase || !uid) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, handle, display_name, avatar_path, home_city, preferred_lang, factions, is_admin')
      .eq('id', uid)
      .single();
    if (!data) return;
    set({ profile: data as Profile });
    useLang.getState().setLang((data as Profile).preferred_lang);
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
    const back = location.hash.replace(/^#\/?/, '');
    sessionStorage.setItem(RETURN_KEY, back && back !== 'signin' ? back : 'account');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    return error ? { error: error.message } : {};
  },

  signOut: async () => {
    await supabase?.auth.signOut();
    set({ session: null, profile: null });
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

/** Remember where to come back to after signing in, then open the sign-in page. */
export function requireSignIn() {
  sessionStorage.setItem(RETURN_KEY, location.hash.replace(/^#\/?/, ''));
  navigate('signin');
}

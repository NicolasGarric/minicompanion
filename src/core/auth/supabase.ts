import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client. The URL and the anon (publishable) key are public by design: data is protected
 * by Row Level Security in the database, not by hiding the key. Secrets (service role, Twitch)
 * never reach the browser.
 *
 * When the env vars are missing the app still runs: PAINT works offline, PLAY shows a notice.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // PKCE returns `?code=` in the query string, which does not clash with the hash router.
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;

export const backendConfigured = supabase !== null;

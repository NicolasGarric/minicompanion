import { supabase } from '../auth/supabase';
import type { Route } from '../router';

/** Admin dashboard data (supabase/migrations/*_admin_dashboard.sql). Every function checks is_admin(). */
const db = () => {
  if (!supabase) throw new Error('backend');
  return supabase;
};
const must = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data;
};

export type Overview = Record<string, number>;
export interface Day { day: string; signups: number; active: number; views: number; visits: number }
export interface TopPage { page: string; views: number; visits: number }
export interface AdminUser {
  id: string; handle: string; display_name: string; email: string | null; home_city: string | null; created_at: string;
  last_sign_in_at: string | null; last_active: string | null; active_days: number; is_admin: boolean; is_public: boolean;
  is_suspended: boolean; suspended_reason: string | null; games: number; tournaments: number; reports_against: number;
}
export interface Recent { at: string; kind: string; label: string; handle: string | null; link: string | null }
export interface AdminReport {
  id: string; created_at: string; status: 'open' | 'actioned' | 'dismissed'; target_type: string; target_id: string; reason: string;
  reporter_handle: string; target_label: string | null; owner_id: string | null; owner_handle: string | null; target_hidden: boolean | null; same_target: number;
}
export interface ContentRow { id: string; created_at: string; label: string; owner_handle: string; hidden: boolean; link: string }
export type ContentType = 'swap' | 'challenge' | 'tournament' | 'game' | 'lfg';

export const overview = async () => must(await db().rpc('admin_overview')) as Overview;
export const daily = async (days: number) => must(await db().rpc('admin_daily', { p_days: days })) as Day[];
export const topPages = async (days: number) => must(await db().rpc('admin_top_pages', { p_days: days })) as TopPage[];
export const langs = async (days: number) => must(await db().rpc('admin_langs', { p_days: days })) as { lang: string; visits: number }[];
export const users = async (query: string, sort: string) => must(await db().rpc('admin_users', { p_query: query, p_sort: sort, p_limit: 100 })) as AdminUser[];
export const recent = async () => must(await db().rpc('admin_recent', { p_limit: 40 })) as Recent[];
export const reports = async (status: string) => must(await db().rpc('admin_reports', { p_status: status })) as AdminReport[];
export const content = async (type: ContentType) => must(await db().rpc('admin_content', { p_type: type, p_limit: 60 })) as ContentRow[];
export async function setReport(id: string, status: AdminReport['status']) {
  must(await db().rpc('admin_set_report', { p_id: id, p_status: status }));
}
export async function moderate(type: string, id: string, hidden: boolean) {
  must(await db().rpc('admin_moderate', { p_type: type, p_id: id, p_hidden: hidden }));
}
export async function suspend(user: string, suspended: boolean, reason?: string) {
  must(await db().rpc('admin_suspend', { p_user: user, p_suspended: suspended, p_reason: reason ?? null }));
}

/**
 * Anonymous traffic counter: the page type (route name, never the URL or an id) and the language.
 * The first page of a tab session counts as a visit. Skipped with "Do Not Track" and on admin pages.
 */
const VISIT_KEY = 'cf.visit';
export function trackPageView(route: Route, lang: string) {
  if (!supabase || route.name.startsWith('admin') || route.name === 'notFound') return;
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return;
  let first = false;
  try {
    first = !sessionStorage.getItem(VISIT_KEY);
    sessionStorage.setItem(VISIT_KEY, '1');
  } catch {
    /* storage blocked: count the view only */
  }
  void supabase.rpc('track_page_view', { p_page: route.name, p_lang: lang, p_new_visit: first }).then(() => undefined, () => undefined);
}

// --- Photo storage (supabase/migrations/*_photo_storage.sql) ---------------------------------------
/** Space of the Supabase free plan; the gauge warns from 70 %. */
export const STORAGE_LIMIT = 1024 ** 3;
export const STORAGE_ALERT = 0.7;
export interface BucketUse { bucket: string; files: number; bytes: number }
export interface CleanupFile { bucket: string; name: string; reason: string; bytes: number }
export const storageUse = async () => must(await db().rpc('admin_storage')) as BucketUse[];
export const cleanupCandidates = async () => must(await db().rpc('admin_storage_cleanup')) as CleanupFile[];

/**
 * Deletes the files the retention rules allow, bucket by bucket: the rows that show them are
 * updated first (so nothing points to a missing file), then the files go through the Storage API
 * (Supabase refuses deleting storage rows in SQL). Returns how many files were removed.
 */
export async function cleanUp(files: CleanupFile[], onProgress?: (done: number) => void): Promise<number> {
  let done = 0;
  const byBucket = new Map<string, string[]>();
  for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.name]);
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += 100) {
      const batch = names.slice(i, i + 100);
      must(await db().rpc('admin_storage_forget', { p_bucket: bucket, p_names: batch }));
      must(await db().storage.from(bucket).remove(batch));
      done += batch.length;
      onProgress?.(done);
    }
  }
  return done;
}

// --- Translation suggestions (supabase/migrations/*_translation_suggestions.sql) -------------------
export type SuggestionStatus = 'new' | 'accepted' | 'rejected' | 'done';
export interface Suggestion {
  id: string; created_at: string; lang: string; shown: string; keys: string[]; suggestion: string; note: string | null;
  page: string | null; status: SuggestionStatus; author_handle: string | null;
}
export const suggestions = async (status: SuggestionStatus | '') =>
  must(await db().rpc('admin_translation_suggestions', { p_status: status })) as Suggestion[];
export async function setSuggestion(id: string, status: SuggestionStatus) {
  must(await db().rpc('admin_set_translation_suggestion', { p_id: id, p_status: status }));
}
/** The dictionary line to paste into src/core/i18n/<lang>.ts for one key. */
export const dictionaryLine = (key: string, text: string) => `  ${JSON.stringify(key)}: ${JSON.stringify(text)},`;

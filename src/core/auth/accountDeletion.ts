import { fileBatches } from './fileBatches';
import { supabase } from './supabase';

/** Shown once on the sign-in page after a deletion. */
export const DELETED_KEY = 'cf.auth.deleted';

export type DeleteError = 'wrong' | 'admin' | 'tournament' | 'files' | 'unavailable' | 'failed';

const ERRORS: Record<string, DeleteError> = { admin_account: 'admin', tournament_running: 'tournament', files_left: 'files' };

/**
 * Deletes the player's account: password check (a fresh sign-in, which the server asks for), photos,
 * then everything else in one server call. Nothing is removed when the account cannot be deleted.
 */
export async function deleteAccount(email: string, password: string, isAdmin: boolean): Promise<{ error?: DeleteError }> {
  if (!supabase) return { error: 'failed' };
  if (isAdmin) return { error: 'admin' };
  const check = await supabase.auth.signInWithPassword({ email, password });
  if (check.error) return { error: 'wrong' };
  const uid = check.data.user.id;

  const running = await supabase.from('tournaments').select('id').eq('organiser_id', uid).eq('status', 'in_progress').limit(1);
  if (running.error) return { error: 'failed' };
  if (running.data.length) return { error: 'tournament' };

  // The database without migration 28 has no my_files(): stop before touching anything.
  const files = await supabase.rpc('my_files');
  if (files.error) return { error: files.error.code === 'PGRST202' ? 'unavailable' : 'failed' };
  for (const b of fileBatches((files.data ?? []) as { bucket: string; name: string }[])) {
    const { error } = await supabase.storage.from(b.bucket).remove(b.names);
    if (error) return { error: 'files' };
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { error: ERRORS[error.message] ?? 'failed' };
  // Before signing out: the account page hands over to the sign-in page as soon as the session ends.
  sessionStorage.setItem(DELETED_KEY, '1');
  await supabase.auth.signOut({ scope: 'local' });
  return {};
}

import { supabase } from '../auth/supabase';
import { useLang } from '../i18n';
import { fileToImageData, imageDataToBlob } from '../lib/image';

/** Screenshots are shrunk on the device before upload (enough to read a bug, a few hundred kB). */
export async function prepareScreenshot(file: Blob): Promise<Blob> {
  return imageDataToBlob(await fileToImageData(file, 1600), 'image/jpeg');
}

/** What helps reproduce a bug, nothing personal: page, language, browser, screen, app build. */
export function bugContext() {
  return {
    page: `${location.pathname}${location.search}`,
    lang: useLang.getState().lang,
    userAgent: navigator.userAgent.slice(0, 300),
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    touch: matchMedia('(pointer: coarse)').matches,
    build: import.meta.env.MODE,
    time: new Date().toISOString(),
  };
}

/** Uploads the screenshots (signed-in users only) to the private bucket, then records the report. */
export async function submitBugReport(r: { message: string; contact: string; shots: Blob[]; withContext: boolean }) {
  if (!supabase) throw new Error('backend');
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  const paths: string[] = [];
  if (uid) {
    for (const shot of r.shots.slice(0, 3)) {
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from('bug-reports').upload(path, shot, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      paths.push(path);
    }
  }
  const ctx = bugContext();
  const { error } = await supabase.rpc('submit_bug_report', {
    p_message: r.message,
    p_page: ctx.page,
    p_context: r.withContext ? ctx : { page: ctx.page },
    p_contact: uid ? null : r.contact,
    p_photos: paths,
  });
  if (error) throw error;
}

// --- Admin -----------------------------------------------------------------------------------------
export interface BugReport {
  id: string;
  message: string;
  page: string | null;
  context: Record<string, unknown>;
  contact: string | null;
  photos: string[];
  status: 'new' | 'seen' | 'fixed' | 'wontfix';
  created_at: string;
  reporter?: { handle: string } | null;
  urls?: string[];
}

export async function listBugReports(): Promise<BugReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bug_reports')
    .select('*, reporter:profiles(handle)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data as BugReport[];
  const all = rows.flatMap((r) => r.photos);
  if (all.length) {
    const { data: signed } = await supabase.storage.from('bug-reports').createSignedUrls(all, 3600);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const r of rows) r.urls = r.photos.map((p) => byPath.get(p) ?? '').filter(Boolean);
  }
  return rows;
}

export async function setBugStatus(id: string, status: BugReport['status']) {
  if (!supabase) return;
  const { error } = await supabase.from('bug_reports').update({ status }).eq('id', id);
  if (error) throw error;
}

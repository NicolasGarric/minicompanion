import { supabase } from '../auth/supabase';

/**
 * Player gallery: painted renders saved from PAINT to the profile. Files live in the private
 * "gallery" bucket (one folder per player) and are shown through short-lived signed URLs.
 */
export interface GalleryPaint {
  name: string;
  brand: string;
  hex: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  image_path: string;
  paints: GalleryPaint[];
  created_at: string;
  /** Shown on the public profile and on battle reports (missing before the social migration) */
  is_public?: boolean;
  /** Signed URL, valid one hour */
  url?: string;
}

const BUCKET = 'gallery';

export async function listGallery(): Promise<GalleryItem[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) return [];
  // Public items of other players are readable too: keep only mine.
  const { data, error } = await supabase
    .from('gallery_items')
    .select('*')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const items = (data ?? []) as GalleryItem[];
  if (!items.length) return items;
  const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(items.map((i) => i.image_path), 3600);
  const byPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  return items.map((i) => ({ ...i, url: byPath.get(i.image_path) ?? undefined }));
}

/** Uploads the image, then records it; the file is removed again if the record fails. */
export async function addToGallery(image: Blob, title: string, paints: GalleryPaint[]): Promise<void> {
  if (!supabase) throw new Error('backend');
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('signin');
  const path = `${uid}/${crypto.randomUUID()}.${image.type === 'image/png' ? 'png' : 'jpg'}`;
  const up = await supabase.storage.from(BUCKET).upload(path, image, { contentType: image.type });
  if (up.error) throw up.error;
  const { error } = await supabase
    .from('gallery_items')
    .insert({ owner_id: uid, title: title.trim().slice(0, 80) || 'Untitled', image_path: path, paints: paints.slice(0, 40) });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export async function removeFromGallery(item: GalleryItem): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('gallery_items').delete().eq('id', item.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([item.image_path]);
}

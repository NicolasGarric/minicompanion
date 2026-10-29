import { supabase } from '../auth/supabase';
import { useLang } from '../i18n';

/** What a suggestion is about (chips in the dialog, filter in the admin inbox). */
export const TOPICS = ['feature', 'improve', 'content', 'design', 'other'] as const;
export type Topic = (typeof TOPICS)[number];
export const STATUSES = ['new', 'seen', 'planned', 'done', 'declined'] as const;
export type SuggestionStatus = (typeof STATUSES)[number];

/** Sent from the footer; every admin gets a notification. Visitors may leave an email. */
export async function submitSuggestion(s: { topic: Topic; message: string; contact: string }) {
  if (!supabase) throw new Error('backend');
  const { error } = await supabase.rpc('submit_suggestion', {
    p_topic: s.topic,
    p_message: s.message,
    p_page: `${location.pathname}${location.search}`,
    p_lang: useLang.getState().lang,
    p_contact: s.contact || null,
  });
  if (error) throw error;
}

// --- Admin -----------------------------------------------------------------------------------------
export interface Suggestion {
  id: string;
  topic: Topic;
  message: string;
  page: string | null;
  lang: string | null;
  contact: string | null;
  status: SuggestionStatus;
  answered_at: string | null;
  created_at: string;
  user_id: string | null;
  author?: { handle: string; display_name: string } | null;
}

export async function listSuggestions(): Promise<Suggestion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('suggestions')
    .select('*, author:profiles(handle, display_name)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data as Suggestion[];
}

export async function setSuggestionStatus(id: string, status: SuggestionStatus) {
  if (!supabase) return;
  const { error } = await supabase.from('suggestions').update({ status }).eq('id', id);
  if (error) throw error;
}

/** The answer goes to the author as a direct message (Messages + notification). */
export async function answerSuggestion(id: string, body: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc('answer_suggestion', { p_id: id, p_body: body });
  if (error) throw error;
}

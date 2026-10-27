import { useState } from 'react';
import { keysWithText, k, useLang, useT } from '../i18n';
import { Icon, Modal } from '../ui/ui';
import { supabase, backendConfigured } from '../auth/supabase';

/**
 * Footer button + dialog: "this wording sounds wrong in my language, here is better". Text
 * selected on the page before opening fills the first field. The keys of the matching texts are
 * sent along so the fix is one line (admins review them in /admin, Translations tab).
 */
export function TranslationSuggestButton() {
  const t = useT();
  const [shown, setShown] = useState<string | null>(null);
  if (!backendConfigured) return null;
  return (
    <>
      <button type="button" className="link-button bug-button" onClick={() => setShown(getSelection()?.toString().trim().slice(0, 500) ?? '')}>
        <Icon name="globe" size={14} /> {t('tr.button')}
      </button>
      {shown !== null && <SuggestDialog initial={shown} onClose={() => setShown(null)} />}
    </>
  );
}

function SuggestDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [text, setText] = useState(initial);
  const [suggestion, setSuggestion] = useState(initial);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error' | 'rate_limited' | 'same_text'>('idle');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setState('busy');
    const { error } = await supabase.rpc('suggest_translation', {
      p_lang: lang,
      p_shown: text.trim(),
      p_keys: keysWithText(text, lang),
      p_suggestion: suggestion.trim(),
      p_note: note.trim(),
      p_page: location.pathname,
    });
    const m = error?.message ?? '';
    setState(!error ? 'sent' : m.includes('rate_limited') ? 'rate_limited' : m.includes('same_text') ? 'same_text' : 'error');
  };

  if (state === 'sent')
    return (
      <Modal title={t('tr.title')} onClose={onClose}>
        <p>{t('tr.thanks')}</p>
        <div className="nav-row"><button className="btn primary" onClick={onClose}>{t('common.close')}</button></div>
      </Modal>
    );

  return (
    <Modal title={t('tr.title')} onClose={onClose}>
      <form className="bug-form" onSubmit={send}>
        <p className="hint">{t('tr.lead')}</p>
        <label className="field">
          <span>{t('tr.shown')}</span>
          <textarea className="text-input" rows={2} required maxLength={500} autoFocus={!initial} value={text} onChange={(e) => setText(e.target.value)} />
          <small className="hint">{t('tr.shownHint')}</small>
        </label>
        <label className="field">
          <span>{t('tr.suggestion')}</span>
          <textarea className="text-input" rows={2} required maxLength={500} autoFocus={!!initial} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('tr.note')}</span>
          <input className="text-input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {(state === 'error' || state === 'rate_limited' || state === 'same_text') && (
          <p className="error" role="alert">{t(k(state === 'rate_limited' ? 'games.error.rate_limited' : state === 'same_text' ? 'tr.sameText' : 'bug.error'))}</p>
        )}
        <div className="nav-row">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.back')}</button>
          <button className="btn primary" disabled={state === 'busy' || !text.trim() || !suggestion.trim()}>{t('tr.send')}</button>
        </div>
      </form>
    </Modal>
  );
}

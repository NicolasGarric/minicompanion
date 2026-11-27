import { useState } from 'react';
import { k, LANGS, useT } from '../../core/i18n';
import { Toggle } from '../../core/ui/ui';
import { CREST_RANGES, randomCrest, type CompanyInput, type CrestSpec } from '../lib/companies';
import { Crest, INKS } from './Crest';

export const emptyCompany = (): CompanyInput => ({
  name: '', motto: '', description: '', city: '', country: '', is_online: false, languages: [], games: '',
  crest: randomCrest(), is_public: true, join_open: false, join_invite: true, join_link: true,
});

/**
 * Company card form, for creation and settings. Officers edit the card only: `leader` shows the
 * settings (visibility, joining modes, member limit, challenges).
 */
export function CompanyForm({ initial, leader, ceiling, busy, submitLabel, onSubmit }: {
  initial: CompanyInput;
  leader: boolean;
  ceiling?: number;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (p: CompanyInput) => void;
}) {
  const t = useT();
  const [p, setP] = useState<CompanyInput>(initial);
  const set = <K extends keyof CompanyInput>(key: K, v: CompanyInput[K]) => setP((x) => ({ ...x, [key]: v }));
  const ok = p.name.trim().length >= 2 && (p.join_open || p.join_invite || p.join_link);
  const toggleLang = (code: string) => set('languages', p.languages.includes(code) ? p.languages.filter((l) => l !== code) : [...p.languages, code]);

  return (
    <form className="field-col company-form" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(p); }}>
      <label className="field"><span>{t('co.name')}</span>
        <input className="text-input" required minLength={2} maxLength={60} value={p.name} onChange={(e) => set('name', e.target.value)} placeholder={t('co.namePlaceholder')} /></label>
      <label className="field"><span>{t('co.motto')}</span>
        <input className="text-input" maxLength={120} value={p.motto} onChange={(e) => set('motto', e.target.value)} placeholder={t('co.mottoPlaceholder')} /></label>

      <CrestEditor crest={p.crest} name={p.name} onChange={(c) => set('crest', c)} />

      <Toggle checked={p.is_online} onChange={(v) => set('is_online', v)} label={t('co.online')} />
      <label className="field"><span>{t(p.is_online ? 'co.cityOptional' : 'co.city')}</span>
        <input className="text-input" maxLength={80} value={p.city} onChange={(e) => set('city', e.target.value)} placeholder={t('co.cityPlaceholder')} /></label>
      <label className="field"><span>{t('co.games')}</span>
        <input className="text-input" maxLength={200} value={p.games} onChange={(e) => set('games', e.target.value)} placeholder={t('co.gamesPlaceholder')} /></label>
      <fieldset className="field">
        <span>{t('co.languages')}</span>
        <div className="chips">
          {LANGS.map((l) => (
            <button type="button" key={l.code} className={`chip small ${p.languages.includes(l.code) ? 'on' : ''}`} aria-pressed={p.languages.includes(l.code)} onClick={() => toggleLang(l.code)}>{l.name}</button>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>{t('co.description')}</span>
        <textarea className="text-input" rows={4} maxLength={1000} value={p.description} onChange={(e) => set('description', e.target.value)} placeholder={t('co.descriptionPlaceholder')} /></label>

      {leader && (
        <>
          <h3 className="section-title">{t('co.settings')}</h3>
          <div className="segmented" role="radiogroup" aria-label={t('co.visibility')}>
            {[true, false].map((pub) => (
              <button type="button" key={String(pub)} role="radio" aria-checked={p.is_public === pub} className={p.is_public === pub ? 'on' : ''} onClick={() => set('is_public', pub)}>
                {t(pub ? 'co.public' : 'co.private')}
              </button>
            ))}
          </div>
          <p className="hint">{t(p.is_public ? 'co.publicHint' : 'co.privateHint')}</p>
          <span className="field"><span>{t('co.joinModes')}</span></span>
          <Toggle checked={p.join_invite} onChange={(v) => set('join_invite', v)} label={t('co.joinInvite')} />
          <Toggle checked={p.join_link} onChange={(v) => set('join_link', v)} label={t('co.joinLink')} />
          <Toggle checked={p.join_open} onChange={(v) => set('join_open', v)} label={t('co.joinOpen')} />
          {!(p.join_open || p.join_invite || p.join_link) && <p className="error">{t('co.joinNone')}</p>}
          {ceiling !== undefined && (
            <label className="field"><span>{t('co.limit', { n: ceiling })}</span>
              <input className="text-input" type="number" min={2} max={ceiling} value={p.member_limit ?? ceiling}
                onChange={(e) => set('member_limit', Math.min(Math.max(Number(e.target.value) || 2, 2), ceiling))} /></label>
          )}
          {ceiling !== undefined && <Toggle checked={p.competitive ?? true} onChange={(v) => set('competitive', v)} label={t('co.competitive')} />}
        </>
      )}
      <button className="btn primary" disabled={!ok || busy}>{submitLabel}</button>
    </form>
  );
}

const PARTS = ['shape', 'division', 'pattern', 'symbol'] as const;

function CrestEditor({ crest, name, onChange }: { crest: CrestSpec; name: string; onChange: (c: CrestSpec) => void }) {
  const t = useT();
  const step = (part: (typeof PARTS)[number], d: number) => {
    const max = CREST_RANGES[part];
    onChange({ ...crest, [part]: (crest[part] + d + max) % max });
  };
  const setInk = (slot: number, ink: number) => {
    const inks = [...crest.inks] as CrestSpec['inks'];
    inks[slot] = ink;
    onChange({ ...crest, inks });
  };
  return (
    <fieldset className="field crest-editor">
      <span>{t('co.crest')}</span>
      <div className="crest-editor-row">
        <Crest crest={crest} size={88} title={name || t('co.crest')} />
        <div className="crest-controls">
          {PARTS.map((part) => (
            <div key={part} className="crest-step">
              <button type="button" className="btn small ghost" aria-label={`${t(k(`co.crest.${part}`))} −`} onClick={() => step(part, -1)}>‹</button>
              <span>{t(k(`co.crest.${part}`))}</span>
              <button type="button" className="btn small ghost" aria-label={`${t(k(`co.crest.${part}`))} +`} onClick={() => step(part, 1)}>›</button>
            </div>
          ))}
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="crest-inks" role="radiogroup" aria-label={t(k(`co.crest.ink${slot}`))}>
              <small className="muted">{t(k(`co.crest.ink${slot}`))}</small>
              {INKS.map((hex, i) => (
                <button type="button" key={hex} role="radio" aria-checked={crest.inks[slot] === i} aria-label={hex}
                  className={`ink-dot ${crest.inks[slot] === i ? 'on' : ''}`} style={{ background: hex }} onClick={() => setInk(slot, i)} />
              ))}
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => onChange(randomCrest())}>{t('co.crest.random')}</button>
        </div>
      </div>
    </fieldset>
  );
}

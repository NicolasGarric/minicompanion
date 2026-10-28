import { useEffect, useState } from 'react';
import { k, useLang, useT } from '../../core/i18n';
import { backendConfigured } from '../../core/auth/supabase';
import { requireSignIn, useSession } from '../../core/auth/session';
import { navigate } from '../../core/router';
import { Icon } from '../../core/ui/ui';
import { blankBoard, campaignError, createCampaign, myCampaigns, rollPlaceMap, type CampId, type MyCampaign } from '../lib/narrative';
import { TEMPLATES, templateBoard, templatePitch, templateTitle } from '../data/campaignTemplates';

/**
 * Narrative campaigns: my campaigns, and a new one from a ready-made sector or a blank map.
 * The campaign itself lives at /play/campaign/<id>.
 */
export function Campaigns() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const session = useSession((s) => s.session);
  const [list, setList] = useState<MyCampaign[] | null>(null);
  const [template, setTemplate] = useState<string>(TEMPLATES[0]?.key ?? 'blank');
  const [title, setTitle] = useState('');
  const [names, setNames] = useState<[string, string]>(['', '']);
  const [camp, setCamp] = useState<CampId | ''>('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendConfigured || !session) return;
    myCampaigns().then(setList, () => setList([]));
  }, [session]);

  const tpl = TEMPLATES.find((x) => x.key === template);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const campNames: [string, string] = [names[0].trim() || t('nc.campN', { id: 'A' }), names[1].trim() || t('nc.campN', { id: 'B' })];
      const board = tpl ? templateBoard(tpl, lang, campNames) : { ...blankBoard(), camps: blankBoard().camps.map((c, i) => ({ ...c, name: campNames[i] })) };
      // Every place with a scenario comes with a table map ready to play
      board.places = await Promise.all(board.places.map(async (p) => (p.scenario ? { ...p, map: await rollPlaceMap(p, `${p.name} · ${p.scenario}`) } : p)));
      const id = await createCampaign(title.trim() || (tpl ? templateTitle(tpl, lang) : t('nc.untitled')), tpl?.sector ?? '', tpl ? templatePitch(tpl, lang) : '', tpl?.key ?? null, board, camp || null);
      navigate(`play/campaign/${id}`);
    } catch (e) {
      setError(campaignError(e));
      setBusy(false);
    }
  };

  return (
    <div className="narrow nc-list">
      <div className="page-head">
        <div>
          <h1>{t('nc.title')}</h1>
          <p className="lead">{t('nc.lead')}</p>
        </div>
      </div>

      <ul className="nc-features">
        <li><Icon name="map" size={18} /> {t('nc.feature.map')}</li>
        <li><Icon name="chat" size={18} /> {t('nc.feature.online')}</li>
        <li><Icon name="calendar" size={18} /> {t('nc.feature.battles')}</li>
      </ul>

      {!backendConfigured ? null : !session ? (
        <section className="card"><p>{t('nc.signinLead')}</p><button className="btn primary" onClick={() => requireSignIn()}>{t('nc.signin')}</button></section>
      ) : (
        <>
          <section>
            <h2>{t('nc.mine')}</h2>
            {list === null ? <span className="spinner" /> : !list.length ? <p className="hint">{t('nc.none')}</p> : (
              <div className="nc-cards">
                {list.map((c) => (
                  <a key={c.id} className={`game-card ${c.status === 'finished' ? 'past' : ''}`} href={`/play/campaign/${c.id}`}>
                    <strong>{c.title}</strong>
                    <small className="muted">{[c.sector, t('nc.turn', { n: c.turn }), t('nc.membersN', { n: c.members })].filter(Boolean).join(' · ')}</small>
                    <span className="game-tags">
                      {c.is_master && <span className="tag">{t('nc.master')}</span>}
                      {c.camp && <span className="tag on">{t('nc.campN', { id: c.camp })}</span>}
                      {c.next_battle && <span className="tag pk">{t('nc.nextBattle', { date: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(`${c.next_battle}T12:00:00`)) })}</span>}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="card nc-create">
            <h2>{t('nc.newTitle')}</h2>
            <div className="nc-templates" role="radiogroup" aria-label={t('nc.start')}>
              {TEMPLATES.map((x) => (
                <button key={x.key} role="radio" aria-checked={template === x.key} className={`nc-template ${template === x.key ? 'on' : ''}`} onClick={() => setTemplate(x.key)}>
                  <strong>{templateTitle(x, lang)}</strong>
                  <small>{x.sector} · {t('nc.templatePlaces', { n: x.places.length })}</small>
                  <span>{templatePitch(x, lang)}</span>
                </button>
              ))}
              <button role="radio" aria-checked={template === 'blank'} className={`nc-template ${template === 'blank' ? 'on' : ''}`} onClick={() => setTemplate('blank')}>
                <strong>{t('nc.blank')}</strong>
                <span>{t('nc.blankLead')}</span>
              </button>
            </div>
            <div className="field-grid">
              <label className="field"><span>{t('nc.campaignTitle')}</span><input className="text-input" maxLength={80} value={title} placeholder={tpl ? templateTitle(tpl, lang) : t('nc.untitled')} onChange={(e) => setTitle(e.target.value)} /></label>
              <label className="field"><span>{t('nc.campNameN', { id: 'A' })}</span><input className="text-input" maxLength={40} value={names[0]} placeholder={t('nc.campN', { id: 'A' })} onChange={(e) => setNames([e.target.value, names[1]])} /></label>
              <label className="field"><span>{t('nc.campNameN', { id: 'B' })}</span><input className="text-input" maxLength={40} value={names[1]} placeholder={t('nc.campN', { id: 'B' })} onChange={(e) => setNames([names[0], e.target.value])} /></label>
              <label className="field"><span>{t('nc.myCamp')}</span>
                <select className="select" value={camp} onChange={(e) => setCamp(e.target.value as CampId | '')}>
                  <option value="A">{names[0] || t('nc.campN', { id: 'A' })}</option>
                  <option value="B">{names[1] || t('nc.campN', { id: 'B' })}</option>
                  <option value="">{t('nc.masterOnly')}</option>
                </select></label>
            </div>
            <p className="hint">{t('nc.createHint')}</p>
            {error && <p className="error" role="alert">{t(k(`nc.error.${error}`))}</p>}
            <button className="btn primary" disabled={busy} onClick={create}><Icon name="plus" size={16} /> {t('nc.create')}</button>
          </section>
        </>
      )}
    </div>
  );
}

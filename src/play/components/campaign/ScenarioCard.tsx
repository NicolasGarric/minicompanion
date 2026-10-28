import { useState } from 'react';
import { k, useLang, useT } from '../../../core/i18n';
import { Icon } from '../../../core/ui/ui';
import { rollPlaceMap } from '../../lib/narrative';
import { scenarioTexts, type ScenarioRef } from '../../data/campaignTemplates';

/**
 * A scenario of the library in the reader's language: story, mission (with the camp names), special
 * rule, deployment, aftermath. Optionally a button that rolls a table map for it and opens the editor.
 */
export function ScenarioCard({ refd, campA, campB, withMap = false, compact = false }: {
  refd: ScenarioRef; campA: string; campB: string; withMap?: boolean; compact?: boolean;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [busy, setBusy] = useState(false);
  const s = refd.scenario;
  const x = scenarioTexts(s, lang, campA, campB);
  const openMap = async () => {
    setBusy(true);
    const code = await rollPlaceMap({ id: 0, name: x.title, type: 'planet', x: 0, y: 0, owner: null, capital: false, fort: 0, value: 0, scenario: '', notes: '', map: null },
      { theme: s.theme, deploy: s.deploy });
    location.href = `/play/table-generator?tab=build&map=${code}`;
  };
  return (
    <article className={`nc-scenario ${compact ? 'compact' : ''}`}>
      <h3>{x.title}</h3>
      <p className="nc-hook">{x.hook}</p>
      <dl>
        <dt>{t('nc.sc.mission')}</dt><dd>{x.mission}</dd>
        <dt>{t('nc.sc.rule')}</dt><dd>{x.rule}</dd>
        <dt>{t('nc.sc.deploy')}</dt><dd>{t(k(`table.deploy.${s.deploy}`))}</dd>
        <dt>{t('nc.sc.after')}</dt><dd>{x.aftermath}</dd>
      </dl>
      {withMap && (
        <button className="btn small" disabled={busy} onClick={openMap}><Icon name="map" size={14} /> {t('nc.sc.openTable')}</button>
      )}
    </article>
  );
}

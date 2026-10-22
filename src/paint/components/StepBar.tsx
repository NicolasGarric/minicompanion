import { useStore, type Step } from '../store';
import { k, useT } from '../../core/i18n';

const STEPS: Step[] = [1, 2, 3];

/** The 3-step flow of the editor: image → colours → paints & share. */
export function StepBar() {
  const t = useT();
  const step = useStore((s) => s.step);
  const set = useStore((s) => s.set);
  return (
    <nav className="stepbar" aria-label={t('steps.label')}>
      <ol>
        {STEPS.map((n) => (
          <li key={n} className={n === step ? 'on' : n < step ? 'done' : ''}>
            <button onClick={() => set({ step: n })} aria-current={n === step ? 'step' : undefined}>
              <span className="step-n">{n}</span> {t(k(`steps.${n}`))}
            </button>
          </li>
        ))}
      </ol>
      {step < 3 && (
        <button className="btn small primary" onClick={() => set({ step: (step + 1) as Step })}>
          {t('common.next')} →
        </button>
      )}
    </nav>
  );
}

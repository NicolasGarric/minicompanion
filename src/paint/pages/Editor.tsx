import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { k, useT } from '../../core/i18n';
import { TopBar } from '../components/TopBar';
import { StepBar } from '../components/StepBar';
import { Toolbar, ToolOptions, TOOLS } from '../components/Toolbar';
import { CanvasView } from '../components/CanvasView';
import { StepImage } from '../components/StepImage';
import { StepColours } from '../components/StepColours';
import { StepFinish } from '../components/StepFinish';
import { CompareView } from '../components/CompareView';
import { ColourDock } from '../components/ColourDock';
import { ShareDialog } from '../components/ShareDialog';
import { Footer } from '../../core/layout/Shell';
import { Modal } from '../../core/ui/ui';
import { useEditorShortcuts } from './useEditorShortcuts';

/** PAINT editor: canvas + the panel of the current step (1 image, 2 colours, 3 paints & share). */
export function Editor() {
  const t = useT();
  const step = useStore((s) => s.step);
  const compareOpen = useStore((s) => s.compareOpen);
  const shareOpen = useStore((s) => s.shareOpen);
  const activeZoneId = useStore((s) => s.activeZoneId);
  const [help, setHelp] = useState(false);
  // Mobile: the panel is a bottom sheet. On step 2 the image takes the screen with a colour bar
  // under it (the sheet only rises on "Details" and drops as soon as the image is touched);
  // on the other steps, selecting a colour raises it.
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (activeZoneId && step !== 2) setSheetOpen(true);
  }, [activeZoneId, step]);
  useEffect(() => setSheetOpen(false), [step]);
  useEditorShortcuts(() => setHelp(true));

  return (
    <div className={`editor step-${step} ${sheetOpen ? 'sheet-open' : ''}`}>
      <TopBar onShortcuts={() => setHelp(true)} />
      <StepBar />
      {step === 2 && <Toolbar />}
      <main className="center" onPointerDown={() => step === 2 && setSheetOpen(false)}>
        {step === 2 && <ToolOptions />}
        <CanvasView />
      </main>
      <aside className="side panel-col" aria-label={t(k(`steps.${step}`))}>
        <button className="sheet-handle" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}>
          <span className="grip" aria-hidden />
          <span>{t(sheetOpen ? 'editor.sheetLower' : 'editor.sheetRaise')}</span>
        </button>
        <div className="tab-body">
          {step === 1 && <StepImage />}
          {step === 2 && <StepColours />}
          {step === 3 && <StepFinish />}
        </div>
      </aside>
      {step === 2 && <ColourDock onDetails={() => setSheetOpen(true)} />}
      <div className="editor-footer">
        <Footer compact />
      </div>
      {compareOpen && <CompareView />}
      {shareOpen && <ShareDialog />}
      {help && (
        <Modal title={t('editor.shortcuts')} onClose={() => setHelp(false)}>
          <dl className="shortcuts">
            {[
              ...TOOLS.map((x) => [x.key, t(k(`tool.${x.id}`))] as const),
              ['[ / ]', t('keys.brushSize')],
              [t('keys.spaceDrag'), t('keys.pan')],
              [t('keys.wheel'), t('keys.zoom')],
              ['F', t('canvas.fit')],
              ['M', t('editor.showMask')],
              ['\\', t('editor.beforeAfter')],
              ['N', t('colours.addDrawn')],
              ['1 / 2 / 3', t('steps.label')],
              ['Ctrl+Z', t('editor.undo')],
              ['Ctrl+Shift+Z / Ctrl+Y', t('editor.redo')],
              ['Ctrl+S', t('keys.save')],
            ].map(([key, d]) => (
              <div key={key}>
                <dt><kbd>{key}</kbd></dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </div>
  );
}

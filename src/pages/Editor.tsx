import { useState } from 'react';
import { useStore, type RightTab } from '../store';
import { k, useT } from '../i18n';
import { TopBar } from '../components/TopBar';
import { Toolbar, ToolOptions, TOOLS } from '../components/Toolbar';
import { CanvasView } from '../components/CanvasView';
import { ReferencePanel } from '../components/ReferencePanel';
import { ZonesPanel } from '../components/ZonesPanel';
import { PalettePanel } from '../components/PalettePanel';
import { SchemesPanel } from '../components/SchemesPanel';
import { HarmonyPanel } from '../components/HarmonyPanel';
import { VariantsPanel } from '../components/VariantsPanel';
import { CompareView } from '../components/CompareView';
import { ShareDialog } from '../components/ShareDialog';
import { Footer } from '../components/Shell';
import { Icon, Modal } from '../components/ui';
import { useEditorShortcuts } from './useEditorShortcuts';

const TABS: { id: RightTab; icon: string }[] = [
  { id: 'zones', icon: 'layers' },
  { id: 'palette', icon: 'palette' },
  { id: 'schemes', icon: 'book' },
  { id: 'harmony', icon: 'wheel' },
  { id: 'variants', icon: 'compare' },
];

export function Editor() {
  const t = useT();
  const rightTab = useStore((s) => s.rightTab);
  const compareOpen = useStore((s) => s.compareOpen);
  const shareOpen = useStore((s) => s.shareOpen);
  const set = useStore((s) => s.set);
  const [help, setHelp] = useState(false);
  useEditorShortcuts(() => setHelp(true));

  return (
    <div className="editor">
      <TopBar onShortcuts={() => setHelp(true)} />
      <Toolbar />
      <main className="center">
        <ToolOptions />
        <CanvasView />
      </main>
      <aside className="side reference-col">
        <ReferencePanel />
      </aside>
      <aside className="side panel-col">
        <div className="tabs" role="tablist">
          {TABS.map((tab) => (
            <button key={tab.id} role="tab" aria-selected={rightTab === tab.id} className={rightTab === tab.id ? 'on' : ''} onClick={() => set({ rightTab: tab.id })}>
              <Icon name={tab.icon} size={15} /> <span>{t(k(`tab.${tab.id}`))}</span>
            </button>
          ))}
        </div>
        <div className="tab-body">
          {rightTab === 'zones' && <ZonesPanel />}
          {rightTab === 'palette' && <PalettePanel />}
          {rightTab === 'schemes' && <SchemesPanel />}
          {rightTab === 'harmony' && <HarmonyPanel />}
          {rightTab === 'variants' && <VariantsPanel />}
        </div>
      </aside>
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
              ['N', t('keys.newZone')],
              ['Ctrl+Z', t('editor.undo')],
              ['Ctrl+Shift+Z / Ctrl+Y', t('editor.redo')],
              ['Ctrl+S', t('keys.save')],
              [t('keys.altClick'), t('tool.picker')],
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

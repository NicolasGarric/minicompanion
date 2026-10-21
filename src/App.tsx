import { useEffect, useState } from 'react';
import { useStore, type RightTab } from './store';
import { Home } from './components/Home';
import { TopBar } from './components/TopBar';
import { Toolbar, ToolOptions, TOOLS } from './components/Toolbar';
import { CanvasView } from './components/CanvasView';
import { ZonesPanel } from './components/ZonesPanel';
import { PalettePanel } from './components/PalettePanel';
import { SchemesPanel } from './components/SchemesPanel';
import { HarmonyPanel } from './components/HarmonyPanel';
import { VariantsPanel } from './components/VariantsPanel';
import { CompareView } from './components/CompareView';
import { Icon, Modal } from './components/ui';

const TABS: { id: RightTab; label: string; icon: string }[] = [
  { id: 'palette', label: 'Palette', icon: 'palette' },
  { id: 'schemes', label: 'Schémas', icon: 'book' },
  { id: 'harmony', label: 'Harmonies', icon: 'wheel' },
  { id: 'variants', label: 'Variantes', icon: 'compare' },
];

const SHORTCUTS: [string, string][] = [
  ...TOOLS.map((t) => [t.key, t.label] as [string, string]),
  ['[ / ]', 'Réduire / agrandir le pinceau'],
  ['Espace + glisser', 'Déplacer la vue'],
  ['Molette', 'Zoomer'],
  ['F', 'Ajuster à l’écran'],
  ['M', 'Afficher le masque de la zone active'],
  ['\\', 'Comparaison avant / après'],
  ['N', 'Nouvelle zone'],
  ['Ctrl+Z', 'Annuler'],
  ['Ctrl+Shift+Z / Ctrl+Y', 'Rétablir'],
  ['Ctrl+S', 'Sauvegarder maintenant'],
  ['Alt + clic (pinceau)', 'Pipette'],
  ['Maj / Alt + clic (baguette, lasso)', 'Ajouter / retirer'],
];

function useShortcuts(openHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      const s = useStore.getState();
      if (!s.projectId) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && k === 's') {
        e.preventDefault();
        s.saveNow().then(() => s.toast('Projet sauvegardé.', 'success'));
        return;
      }
      if (mod || e.altKey) return;
      const tool = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (tool) {
        s.set({ tool: tool.id });
        return;
      }
      switch (e.key) {
        case '[':
          s.set({ brush: { ...s.brush, size: Math.max(1, Math.round(s.brush.size / 1.2)) } });
          break;
        case ']':
          s.set({ brush: { ...s.brush, size: Math.min(300, Math.round(s.brush.size * 1.2) + 1) } });
          break;
        case 'm':
        case 'M':
          s.set({ showMask: !s.showMask });
          break;
        case '\\':
          s.set({ split: s.split === null ? 0.5 : null });
          break;
        case 'f':
        case 'F':
          window.dispatchEvent(new Event('chroma:fit'));
          break;
        case 'n':
        case 'N':
          s.addZone('other');
          break;
        case '?':
          openHelp();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openHelp]);
}

function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (!s.projectId || s.projectId !== prev.projectId) return;
      if (s.zones === prev.zones && s.maskVersion === prev.maskVersion && s.variants === prev.variants && s.projectName === prev.projectName) return;
      clearTimeout(timer);
      timer = setTimeout(() => useStore.getState().saveNow(), 1500);
    });
    const onUnload = () => {
      useStore.getState().saveNow();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const projectId = useStore((s) => s.projectId);
  const rightTab = useStore((s) => s.rightTab);
  const compareOpen = useStore((s) => s.compareOpen);
  const set = useStore((s) => s.set);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    useStore.getState().loadLibrary();
  }, []);
  useShortcuts(() => setHelp(true));
  useAutosave();

  if (!projectId) {
    return (
      <>
        <Home />
        <Toasts />
      </>
    );
  }

  return (
    <div className="workspace">
      <TopBar onShortcuts={() => setHelp(true)} />
      <Toolbar />
      <main className="center">
        <ToolOptions />
        <CanvasView />
      </main>
      <ZonesPanel />
      <aside className="panel right-panel">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={rightTab === t.id} className={rightTab === t.id ? 'on' : ''} onClick={() => set({ rightTab: t.id })}>
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </div>
        <div className="tab-body">
          {rightTab === 'palette' && <PalettePanel />}
          {rightTab === 'schemes' && <SchemesPanel />}
          {rightTab === 'harmony' && <HarmonyPanel />}
          {rightTab === 'variants' && <VariantsPanel />}
        </div>
      </aside>
      {compareOpen && <CompareView />}
      {help && (
        <Modal title="Raccourcis clavier" onClose={() => setHelp(false)}>
          <dl className="shortcuts">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k}>
                <dt><kbd>{k}</kbd></dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
      <Toasts />
    </div>
  );
}

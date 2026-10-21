import { useEffect } from 'react';
import { useStore } from '../store';
import { translate } from '../../core/i18n';
import { TOOLS } from '../components/Toolbar';

export function useEditorShortcuts(openHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        s.saveNow().then(() => s.toast(translate('toast.saved'), 'success'));
        return;
      }
      if (mod || e.altKey) return;
      const tool = TOOLS.find((x) => x.key.toLowerCase() === key);
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

import { useStore } from '../store';
import { buildRecipe, recipeToText } from '../lib/recipe';
import { exportRenderPNG } from '../lib/render';
import { exportProjectFile } from '../lib/projectFile';
import { navigate } from '../../core/router';
import { useT } from '../../core/i18n';
import { LangSwitch, Logo } from '../../core/layout/Shell';
import { Icon, IconButton, Menu } from '../../core/ui/ui';

export function TopBar({ onShortcuts }: { onShortcuts: () => void }) {
  const t = useT();
  const projectName = useStore((s) => s.projectName);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const split = useStore((s) => s.split);
  const showMask = useStore((s) => s.showMask);
  const { set, undo, redo, toast, saveNow, closeProject, buildRecord } = useStore.getState();

  const goHome = async () => {
    await saveNow();
    closeProject();
    navigate('paint');
  };

  return (
    <header className="topbar">
      <button className="home-btn" onClick={goHome} title={t('editor.backHome')}>
        <Logo />
      </button>
      <input className="project-name" value={projectName} onChange={(e) => set({ projectName: e.target.value })} aria-label={t('editor.projectName')} />
      <div className="topbar-group">
        <IconButton icon="undo" label={t('editor.undo')} shortcut="Ctrl+Z" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" label={t('editor.redo')} shortcut="Ctrl+Shift+Z" onClick={redo} disabled={!canRedo} />
      </div>
      <div className="topbar-group hide-sm">
        <IconButton icon="split" label={t('editor.beforeAfter')} shortcut="\" active={split !== null} onClick={() => set({ split: split === null ? 0.5 : null })} />
        <IconButton icon="mask" label={t('editor.showMask')} shortcut="M" active={showMask} onClick={() => set({ showMask: !showMask })} />
        <IconButton icon="keyboard" label={t('editor.shortcuts')} shortcut="?" onClick={onShortcuts} />
      </div>
      <div className="spacer" />
      <LangSwitch />
      <button className="btn primary" onClick={() => set({ shareOpen: true })}>
        <Icon name="share" size={15} /> <span className="hide-sm">{t('share.button')}</span>
      </button>
      <Menu trigger={(open) => <IconButton icon="download" label={t('export.menu')} onClick={open} />}>
        {(close) => (
          <>
            <button
              className="menu-item"
              onClick={async () => {
                close();
                const st = useStore.getState();
                await exportRenderPNG(st.zones, projectName, st.primer);
              }}
            >
              <Icon name="image" size={14} /> {t('export.png')}
            </button>
            <button
              className="menu-item"
              onClick={async () => {
                close();
                const s = useStore.getState();
                try {
                  await navigator.clipboard.writeText(recipeToText(projectName, buildRecipe(s.zones, s.library, undefined, s.primer)));
                  toast(t('toast.recipeCopied'), 'success');
                } catch {
                  toast(t('toast.clipboardDenied'), 'error');
                }
              }}
            >
              <Icon name="copy" size={14} /> {t('export.recipe')}
            </button>
            <button className="menu-item" onClick={() => { close(); set({ split: split === null ? 0.5 : null }); }}>
              <Icon name="split" size={14} /> {t('editor.beforeAfter')}
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={async () => {
                close();
                const rec = await buildRecord();
                if (rec) await exportProjectFile(rec);
              }}
            >
              <Icon name="save" size={14} /> {t('export.project')}
            </button>
          </>
        )}
      </Menu>
    </header>
  );
}

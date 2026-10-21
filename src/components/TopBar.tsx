import { useStore } from '../store';
import { buildRecipe, recipeToText } from '../lib/recipe';
import { exportProjectFile, exportRenderPNG, exportSheetPNG } from '../lib/image';
import { Icon, IconButton, Menu } from './ui';

export function Logo() {
  return (
    <span className="logo">
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e3b04b" />
            <stop offset="1" stopColor="#9a2b2b" />
          </linearGradient>
        </defs>
        <path d="M32 6l22 11v17c0 13-10 21-22 24C20 55 10 47 10 34V17z" fill="url(#lg)" />
        <circle cx="32" cy="30" r="8" fill="#14161c" />
      </svg>
      <span>Chromaforge</span>
    </span>
  );
}

export function TopBar({ onShortcuts }: { onShortcuts: () => void }) {
  const projectName = useStore((s) => s.projectName);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const split = useStore((s) => s.split);
  const showMask = useStore((s) => s.showMask);
  const { set, undo, redo, toast, saveNow, closeProject, buildRecord } = useStore.getState();

  const recipe = () => {
    const s = useStore.getState();
    return buildRecipe(s.zones, s.library);
  };

  const goHome = async () => {
    await saveNow();
    closeProject();
  };

  return (
    <header className="topbar">
      <button className="home-btn" onClick={goHome} title="Retour aux projets">
        <Logo />
      </button>
      <input className="project-name" value={projectName} onChange={(e) => set({ projectName: e.target.value })} aria-label="Nom du projet" />
      <div className="topbar-group">
        <IconButton icon="undo" label="Annuler" shortcut="Ctrl+Z" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" label="Rétablir" shortcut="Ctrl+Shift+Z" onClick={redo} disabled={!canRedo} />
      </div>
      <div className="topbar-group">
        <IconButton icon="split" label="Avant / après" shortcut="\" active={split !== null} onClick={() => set({ split: split === null ? 0.5 : null })} />
        <IconButton icon="mask" label="Afficher le masque de la zone" shortcut="M" active={showMask} onClick={() => set({ showMask: !showMask })} />
        <IconButton icon="compare" label="Comparer les variantes" onClick={() => set({ compareOpen: true })} />
      </div>
      <div className="spacer" />
      <IconButton icon="keyboard" label="Raccourcis clavier" shortcut="?" onClick={onShortcuts} />
      <Menu
        trigger={(open) => (
          <button className="btn primary" onClick={open}>
            <Icon name="download" size={15} /> Exporter
          </button>
        )}
      >
        {(close) => (
          <>
            <button className="menu-item" onClick={async () => { close(); await exportRenderPNG(useStore.getState().zones, projectName); }}>
              <Icon name="download" size={14} /> Image du rendu (PNG)
            </button>
            <button
              className="menu-item"
              onClick={async () => {
                close();
                const s = useStore.getState();
                await exportSheetPNG(s.zones, recipe(), projectName, `Recette de peinture · ${new Date().toLocaleDateString('fr-FR')}`);
              }}
            >
              <Icon name="book" size={14} /> Fiche recette (PNG)
            </button>
            <button
              className="menu-item"
              onClick={async () => {
                close();
                try {
                  await navigator.clipboard.writeText(recipeToText(projectName, recipe()));
                  toast('Recette copiée dans le presse-papiers.', 'success');
                } catch {
                  toast('Copie impossible : autorisez l’accès au presse-papiers.', 'error');
                }
              }}
            >
              <Icon name="copy" size={14} /> Copier la recette (texte)
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
              <Icon name="save" size={14} /> Fichier projet (.chroma.json)
            </button>
          </>
        )}
      </Menu>
    </header>
  );
}

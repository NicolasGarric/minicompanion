import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { db } from '../storage/db';
import type { ProjectMeta } from '../types';
import { fileToImageData, parseProjectFile } from '../lib/image';
import { createDemo } from '../engine/demo';
import { Logo } from './TopBar';
import { Icon, IconButton } from './ui';

export function Home() {
  const { newProject, openProject, importProject, toast } = useStore.getState();
  const loading = useStore((s) => s.loading);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const projRef = useRef<HTMLInputElement>(null);

  const refresh = () => db.listProjects().then(setProjects).catch(() => setProjects([]));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message || 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openFile = (file: File) =>
    run(async () => {
      if (file.name.endsWith('.json')) {
        const rec = await parseProjectFile(file);
        await importProject(rec);
        await useStore.getState().saveNow();
        return;
      }
      if (!file.type.startsWith('image/')) throw new Error('Format non pris en charge : choisissez une image (JPG, PNG, WebP).');
      const img = await fileToImageData(file);
      await newProject(img, file.name.replace(/\.[^.]+$/, '') || 'Ma figurine');
    });

  const demo = () =>
    run(async () => {
      const { image, masks } = createDemo();
      await newProject(image, 'Démo — Space Marine', masks);
      const scheme = (await import('../data/presets')).BUILTIN_SCHEMES[0];
      useStore.getState().applyScheme(scheme);
      useStore.setState({ past: [] });
    });

  return (
    <div
      className={`home ${drag ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) openFile(f);
      }}
    >
      <header className="home-head">
        <Logo />
      </header>
      <section className="hero">
        <h1>Testez vos schémas de peinture <em>avant</em> de sortir les pinceaux.</h1>
        <p>
          Importez une photo de votre figurine sous-couchée, découpez ses zones en quelques coups de pinceau, puis essayez des
          centaines de peintures Citadel, Vallejo et Army Painter avec lavis, brossage à sec et éclaircissements — l'ombrage
          de la photo est conservé.
        </p>
        <div className="hero-actions">
          <button className="btn primary big" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="upload" size={18} /> Importer une photo
          </button>
          <button className="btn big" onClick={demo} disabled={busy}>
            <Icon name="sparkle" size={18} /> Essayer la démo
          </button>
          <button className="btn ghost big" onClick={() => projRef.current?.click()} disabled={busy}>
            <Icon name="save" size={18} /> Ouvrir un fichier projet
          </button>
        </div>
        <p className="hint">Astuce : glissez-déposez une image n'importe où sur cette page. Tout reste dans votre navigateur.</p>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
        <input ref={projRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
      </section>

      <section className="steps">
        {[
          ['1', 'Photo', 'Une figurine sous-couchée grise ou blanche, bien éclairée, sur fond neutre donne le meilleur rendu.'],
          ['2', 'Zones', 'Pinceau, baguette magique ou lasso : délimitez armure, liserés, tissu, lentilles…'],
          ['3', 'Peinture', 'Choisissez base, lavis, brossage à sec et éclaircissement, ou appliquez un schéma de chapitre.'],
          ['4', 'Comparer', 'Sauvez des variantes, comparez-les, exportez la fiche recette avec la liste des pots.'],
        ].map(([n, t, d]) => (
          <div key={n} className="step">
            <span className="step-n">{n}</span>
            <strong>{t}</strong>
            <p>{d}</p>
          </div>
        ))}
      </section>

      <section className="projects">
        <h2>Projets récents</h2>
        {projects.length === 0 ? (
          <p className="hint">Aucun projet pour l'instant. Commencez avec la démo ou une photo.</p>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card">
                <button className="project-thumb" onClick={() => openProject(p.id)} disabled={loading}>
                  {p.thumb ? <img src={p.thumb} alt="" /> : <Icon name="palette" size={32} />}
                </button>
                <div className="project-info">
                  <strong>{p.name}</strong>
                  <small>{new Date(p.updatedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                </div>
                <IconButton
                  icon="trash"
                  label="Supprimer le projet"
                  size={15}
                  onClick={async () => {
                    if (!confirm(`Supprimer définitivement « ${p.name} » ?`)) return;
                    await db.deleteProject(p.id);
                    refresh();
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      {(busy || loading) && <div className="busy"><span className="spinner" /> Préparation de l'image…</div>}
    </div>
  );
}

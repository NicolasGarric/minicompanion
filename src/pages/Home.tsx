import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { db } from '../storage/db';
import type { ProjectMeta } from '../types';
import { parseProjectFile } from '../lib/image';
import { createDemo } from '../engine/demo';
import { BUILTIN_SCHEMES } from '../data/presets';
import { navigate } from '../lib/router';
import { useLang, useT } from '../i18n';
import { ImageUpload } from '../components/ImageUpload';
import { Icon, IconButton } from '../components/ui';

export function Home() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { newProject, openProject, importProject, toast } = useStore.getState();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const projRef = useRef<HTMLInputElement>(null);

  const refresh = () => db.listProjects().then(setProjects).catch(() => setProjects([]));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      navigate('editor');
    } catch (e) {
      console.error(e);
      toast(t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const demo = () =>
    run(async () => {
      const { image, masks } = createDemo();
      await newProject(image, t('home.demoName'), { masks });
      useStore.getState().applyScheme(BUILTIN_SCHEMES[0]);
      useStore.setState({ past: [] });
    });

  return (
    <div className="home">
      <section className="hero">
        <h1>{t('home.title')}</h1>
        <p className="lead">{t('home.lead')}</p>
        <div className="paths">
          <div className="path-card accent">
            <span className="path-tag">{t('home.newTag')}</span>
            <h2>{t('home.beginnerTitle')}</h2>
            <p>{t('home.beginnerText')}</p>
            <button className="btn primary" onClick={() => navigate('beginner')}>
              <Icon name="sparkle" size={16} /> {t('home.beginnerCta')}
            </button>
          </div>
          <div className="path-card">
            <h2>{t('home.projectTitle')}</h2>
            <p>{t('home.projectText')}</p>
            <ImageUpload onImage={(img, name) => run(() => newProject(img, name))} label={t('home.projectCta')} />
          </div>
        </div>
        <div className="hero-secondary">
          <button className="btn ghost" onClick={demo} disabled={busy}>
            <Icon name="sparkle" size={15} /> {t('home.demo')}
          </button>
          <button className="btn ghost" onClick={() => projRef.current?.click()} disabled={busy}>
            <Icon name="save" size={15} /> {t('home.openFile')}
          </button>
          <input
            ref={projRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) run(async () => {
                await importProject(await parseProjectFile(f));
                await useStore.getState().saveNow();
              });
            }}
          />
        </div>
        <p className="hint">{t('home.privacy')}</p>
      </section>

      <section className="steps">
        {([1, 2, 3, 4] as const).map((n) => (
          <div key={n} className="step">
            <span className="step-n">{n}</span>
            <strong>{t(`home.step${n}` as const)}</strong>
            <p>{t(`home.step${n}.text` as const)}</p>
          </div>
        ))}
      </section>

      <section className="projects">
        <h2>{t('home.recent')}</h2>
        {projects.length === 0 ? (
          <p className="hint">{t('home.noProjects')}</p>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card">
                <button className="project-thumb" onClick={async () => { if (await openProject(p.id)) navigate('editor'); }}>
                  {p.thumb ? <img src={p.thumb} alt="" /> : <Icon name="palette" size={32} />}
                </button>
                <div className="project-info">
                  <strong>{p.name}</strong>
                  <small>{new Date(p.updatedAt).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                </div>
                <IconButton
                  icon="trash"
                  label={t('home.deleteProject')}
                  size={15}
                  onClick={async () => {
                    if (!confirm(t('home.confirmDelete', { name: p.name }))) return;
                    await db.deleteProject(p.id);
                    refresh();
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
      {busy && <div className="busy"><span className="spinner" /> {t('common.preparing')}</div>}
    </div>
  );
}

import { useEffect } from 'react';
import { useStore } from './store';
import { navigate, useRoute } from './lib/router';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { Editor } from './pages/Editor';
import { Beginner } from './pages/Beginner';
import { Stores } from './pages/Stores';
import { Legal } from './pages/Legal';
import { Stats } from './pages/Stats';
import { SharedScheme } from './pages/SharedScheme';

/** Saves the open project 1.5 s after the last change, and on tab close. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (!s.projectId || s.projectId !== prev.projectId) return;
      const changed =
        s.zones !== prev.zones || s.maskVersion !== prev.maskVersion || s.variants !== prev.variants || s.projectName !== prev.projectName || s.palette !== prev.palette;
      if (!changed) return;
      clearTimeout(timer);
      timer = setTimeout(() => useStore.getState().saveNow(), 1500);
    });
    const onUnload = () => void useStore.getState().saveNow();
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
  const route = useRoute();
  const projectId = useStore((s) => s.projectId);

  useEffect(() => {
    useStore.getState().loadLibrary();
  }, []);
  useAutosave();

  // A project cannot exist without its reference image: no project open -> back to home.
  useEffect(() => {
    if (route.name === 'editor' && !projectId) navigate('');
  }, [route.name, projectId]);

  if (route.name === 'editor' && projectId) {
    return (
      <>
        <Editor />
        <Toasts />
      </>
    );
  }

  const page = (() => {
    switch (route.name) {
      case 'beginner': return <Beginner />;
      case 'stores': return <Stores />;
      case 'legal': return <Legal />;
      case 'stats': return <Stats />;
      case 'shared': return <SharedScheme param={route.param ?? ''} />;
      default: return <Home />;
    }
  })();

  return (
    <>
      <Shell current={route.name}>{page}</Shell>
      <Toasts />
    </>
  );
}

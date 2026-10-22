import { useEffect } from 'react';
import { useStore } from './paint/store';
import { navigate, useRoute, type Route } from './core/router';
import { useSession } from './core/auth/session';
import { Shell } from './core/layout/Shell';
import { Home } from './core/pages/Home';
import { Legal } from './core/pages/Legal';
import { Stats } from './core/pages/Stats';
import { Stores } from './core/stores/StoresPage';
import { SignInPage } from './core/auth/SignInPage';
import { AccountPage } from './core/auth/AccountPage';
import { PaintHome } from './paint/pages/PaintHome';
import { Editor } from './paint/pages/Editor';
import { Beginner } from './paint/pages/Beginner';
import { SharedScheme } from './paint/pages/SharedScheme';
import { PlayHome } from './play/pages/PlayHome';
import { QuickPlay } from './play/pages/QuickPlay';
import { MyGames } from './play/pages/MyGames';
import { GameNew } from './play/pages/GameNew';
import { GameDetail } from './play/pages/GameDetail';

/** Saves the open PAINT project 1.5 s after the last change, and on tab close. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (!s.projectId || s.projectId !== prev.projectId) return;
      const changed =
        s.zones !== prev.zones || s.maskVersion !== prev.maskVersion || s.variants !== prev.variants || s.projectName !== prev.projectName;
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

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'paint': return <PaintHome />;
    case 'paint.beginner': return <Beginner />;
    case 'paint.shared': return <SharedScheme param={route.params.data ?? ''} />;
    case 'play': return <PlayHome />;
    case 'play.quick': return <QuickPlay />;
    case 'play.mine': return <MyGames />;
    case 'play.new': return <GameNew />;
    case 'play.game': return <GameDetail id={route.params.id ?? ''} />;
    case 'stores': return <Stores />;
    case 'signin': return <SignInPage />;
    case 'account': return <AccountPage />;
    case 'legal': return <Legal />;
    case 'stats': return <Stats />;
    default: return <Home />;
  }
}

export default function App() {
  const route = useRoute();
  const projectId = useStore((s) => s.projectId);

  useEffect(() => {
    useStore.getState().loadLibrary();
    useSession.getState().init();
  }, []);
  useAutosave();

  // A PAINT project cannot exist without its reference image: no project open -> PAINT home.
  useEffect(() => {
    if (route.name === 'paint.editor' && !projectId) navigate('paint', { replace: true });
  }, [route.name, projectId]);

  if (route.name === 'paint.editor' && projectId) {
    return (
      <>
        <Editor />
        <Toasts />
      </>
    );
  }

  return (
    <>
      <Shell route={route}>
        <Page route={route} />
      </Shell>
      <Toasts />
    </>
  );
}

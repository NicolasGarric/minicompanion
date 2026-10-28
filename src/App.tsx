import { BugReportsAdmin } from './core/feedback/BugReportsAdmin';
import { AdminDashboard } from './core/admin/AdminDashboard';
import { trackPageView } from './core/admin/admin';
import { useLang } from './core/i18n';
import { useEffect } from 'react';
import { useRouteMeta } from './core/seo';
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
import { DiceStats } from './play/pages/DiceStats';
import { ArmyPage, Pile } from './paint/pages/Pile';
import { Sessions } from './paint/pages/Sessions';
import { Shelf } from './paint/pages/Shelf';
import { Challenges } from './paint/pages/Challenges';
import { SharedDeck } from './paint/components/DeckCards';
import { TableGen } from './play/pages/TableGen';
import { Campaigns } from './play/pages/Campaigns';
import { CampaignPage } from './play/pages/CampaignPage';
import { Mentors } from './play/pages/Mentors';
import { Swap } from './play/pages/Swap';
import { LevelPage } from './me/LevelPage';
import { PlayerCard } from './me/PlayerCard';
import { YearInReview } from './me/YearInReview';
import { QuickPlay } from './play/pages/QuickPlay';
import { MyGames } from './play/pages/MyGames';
import { GameNew } from './play/pages/GameNew';
import { GameDetail } from './play/pages/GameDetail';
import { TournamentDetail } from './play/pages/TournamentDetail';
import { TournamentNew } from './play/pages/TournamentNew';
import { TablePage, TableQrSheet } from './play/pages/TablePages';
import { LeagueDetail, Leagues } from './play/pages/Leagues';
import { StorePage } from './play/pages/StorePage';
import { PlayerProfile } from './play/pages/PlayerProfile';
import { Inbox, MessageThread } from './play/pages/Messages';
import { Notifications } from './play/pages/Notifications';

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
    case 'paint.deck': return <SharedDeck param={route.params.data ?? ''} />;
    case 'paint.pile': return <Pile />;
    case 'paint.army': return <ArmyPage id={route.params.id ?? ''} />;
    case 'paint.sessions': return <Sessions />;
    case 'paint.shelf': return <Shelf />;
    case 'paint.challenges': return <Challenges />;
    case 'play.tablegen': return <TableGen />;
    case 'play.campaigns': return <Campaigns />;
    case 'play.campaign': return <CampaignPage id={route.params.id ?? ''} />;
    case 'play.mentors': return <Mentors />;
    case 'play.swap': return <Swap />;
    case 'me.level': return <LevelPage />;
    case 'me.card': return <PlayerCard />;
    case 'me.year': return <YearInReview />;
    case 'play': return <PlayHome />;
    case 'play.quick': return <QuickPlay />;
    case 'play.mine': return <MyGames />;
    case 'play.new': return <GameNew />;
    case 'play.game': return <GameDetail id={route.params.id ?? ''} />;
    case 'play.tournament': return <TournamentDetail slug={route.params.slug ?? ''} />;
    case 'play.tournament.new': return <TournamentNew />;
    case 'play.tournament.tables': return <TableQrSheet slug={route.params.slug ?? ''} />;
    case 'play.table': return <TablePage token={route.params.token ?? ''} />;
    case 'play.leagues': return <Leagues />;
    case 'play.league': return <LeagueDetail id={route.params.id ?? ''} />;
    case 'play.store': return <StorePage id={route.params.id ?? ''} />;
    case 'player': return <PlayerProfile handle={route.params.handle ?? ''} />;
    case 'messages': return <Inbox />;
    case 'messages.thread': return <MessageThread userId={route.params.id ?? ''} />;
    case 'notifications': return <Notifications />;
    case 'stores': return <Stores />;
    case 'dice': return <DiceStats />;
    case 'signin': return <SignInPage />;
    case 'account': return <AccountPage />;
    case 'legal': return <Legal />;
    case 'stats': return <Stats />;
    case 'admin.bugs': return <BugReportsAdmin />;
    case 'admin': return <AdminDashboard />;
    default: return <Home />;
  }
}

export default function App() {
  const route = useRoute();
  useRouteMeta(route);
  const lang = useLang((s) => s.lang);
  // Anonymous page-type counter for the admin dashboard (not the URL, no identifier)
  useEffect(() => trackPageView(route, lang), [route.name]); // eslint-disable-line react-hooks/exhaustive-deps
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

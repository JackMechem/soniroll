import { useEffect, type ReactNode } from "react";
import CreditsPage from "@/app/credits/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import AccountPage from "@/components/AccountPage";
import AdminPage from "@/components/admin/AdminPage";
import BassGenius from "@/components/BassGenius";
import ChangelogPage from "@/components/changelog/ChangelogPage";
import Community, { CommunitySubPage } from "@/components/Community";
import DrumGenerator from "@/components/DrumGenerator";
import FeedbackPage from "@/components/feedback/FeedbackPage";
import SharedFilePage from "@/components/files/SharedFilePage";
import SharedTunePage from "@/components/files/SharedTunePage";
import FollowLists from "@/components/FollowLists";
import GuessTheChord from "@/components/GuessTheChord";
import GuessTheInterval from "@/components/GuessTheInterval";
import GuessTheProgression from "@/components/GuessTheProgression";
import HelpPage from "@/components/help/HelpPage";
import Home from "@/components/Home";
import IntervalTrainer from "@/components/IntervalTrainer";
import JamPractice from "@/components/JamPractice";
import BookPage from "@/components/lessons/BookPage";
import JoinPage from "@/components/lessons/JoinPage";
import LessonPage from "@/components/lessons/LessonPage";
import LessonSettingsPage from "@/components/lessons/LessonSettingsPage";
import LessonsPage from "@/components/lessons/LessonsPage";
import MaterialsPage from "@/components/lessons/MaterialsPage";
import NotesPage from "@/components/lessons/NotesPage";
import StudentPage from "@/components/lessons/StudentPage";
import TeacherPage from "@/components/lessons/TeacherPage";
import ChartEditorPage from "@/components/library/ChartEditorPage";
import ChartViewPage from "@/components/library/ChartViewPage";
import ImportChartsPage from "@/components/library/ImportChartsPage";
import LibraryHub from "@/components/library/LibraryHub";
import PlaylistPage from "@/components/library/PlaylistPage";
import SetlistChartsPage from "@/components/library/SetlistChartsPage";
import SetlistPage from "@/components/library/SetlistPage";
import TuneListPage from "@/components/library/TuneListPage";
import LikedPosts from "@/components/LikedPosts";
import Metronome from "@/components/Metronome";
import MyPostsTab from "@/components/MyPostsTab";
import NewPostPage from "@/components/NewPostPage";
import NoteTrainer from "@/components/NoteTrainer";
import PostPage from "@/components/PostPage";
import PracticeLog from "@/components/PracticeLog";
import RoutineEditorPage from "@/components/practicelog/RoutineEditor";
import RoutinePage from "@/components/practicelog/RoutinePage";
import RoutinesPage from "@/components/practicelog/RoutinesPage";
import SharedRoutinePage from "@/components/practicelog/SharedRoutinePage";
import ShedLogGate from "@/components/practicelog/ShedLogGate";
import PracticeTimer from "@/components/PracticeTimer";
import PublicProfilePage from "@/components/PublicProfilePage";
import RandomMetricModulation from "@/components/RandomMetricModulation";
import Recorder from "@/components/Recorder";
import RecordingPage from "@/components/recordings/RecordingPage";
import RecordingsPage from "@/components/recordings/RecordingsPage";
import ResetPassword from "@/components/ResetPassword";
import ScaleTrainer from "@/components/ScaleTrainer";
import ScoreWriter from "@/components/scorewriter/ScoreWriter";
import SharedSetlistPage from "@/components/SharedSetlistPage";
import GatedShedNotes from "@/components/shednotes/GatedShedNotes";
import SharedNotePage from "@/components/shednotes/SharedNotePage";
import SlowDowner from "@/components/SlowDowner";
import StickControl from "@/components/StickControl";
import SupportPage from "@/components/support/SupportPage";
import Syncopation from "@/components/Syncopation";
import TempoTrainer from "@/components/TempoTrainer";
import TuneHub from "@/components/TuneHub";
import Tuner from "@/components/Tuner";
import NativeAudioChip from "./NativeAudioChip";
import NotFound from "./pages/NotFound";
import SignIn from "./pages/SignIn";
import { navigate, setRouteParams, useLocation } from "./router";

/** The desktop app's pages: the same routes as `apps/web/app/`, each rendering the same
    component with the same props (path parameters and `?query` values read here instead of by
    Next.js). Keep in step when a route is added to the website. */

type Query = URLSearchParams;
type Route = { path: string; render: (params: Record<string, string>, query: Query) => ReactNode };

const q = (query: Query, key: string) => query.get(key) ?? "";
const opt = (query: Query, key: string) => query.get(key) ?? undefined;

/** A native-audio tool: the website's page plus the desktop's audio chip. */
function NativeTool({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <NativeAudioChip />
      {children}
    </div>
  );
}

const ROUTES: Route[] = [
  { path: "/dashboard", render: () => <Home /> },
  { path: "/metronome", render: () => <NativeTool><Metronome /></NativeTool> },
  { path: "/tuner", render: () => <NativeTool><Tuner /></NativeTool> },
  { path: "/jam-practice", render: () => <JamPractice /> },
  { path: "/bass-genius", render: () => <BassGenius /> },
  { path: "/drum-generator", render: () => <DrumGenerator /> },
  { path: "/slow-downer", render: () => <SlowDowner /> },
  { path: "/recorder", render: (_, query) => <Recorder tuneId={opt(query, "tuneId")} /> },
  { path: "/note-trainer", render: () => <NoteTrainer /> },
  { path: "/scale-trainer", render: () => <ScaleTrainer /> },
  { path: "/interval-trainer", render: () => <IntervalTrainer /> },
  { path: "/guess-the-interval", render: () => <GuessTheInterval /> },
  { path: "/guess-the-chord", render: () => <GuessTheChord /> },
  { path: "/guess-the-progression", render: () => <GuessTheProgression /> },
  { path: "/practice-timer", render: () => <PracticeTimer /> },
  { path: "/random-metric-modulation", render: () => <RandomMetricModulation /> },
  { path: "/tempo-trainer", render: () => <TempoTrainer /> },
  { path: "/random-sticking-warmup", render: () => <StickControl /> },
  { path: "/syncopation", render: () => <Syncopation /> },
  { path: "/score-writer", render: (_, query) => <ScoreWriter initialId={opt(query, "id")} /> },

  { path: "/shed-log", render: (_, query) => <ShedLogGate><PracticeLog initialDate={opt(query, "date")} /></ShedLogGate> },
  { path: "/shed-log/routines", render: () => <ShedLogGate><RoutinesPage /></ShedLogGate> },
  { path: "/shed-log/routine", render: (_, query) => <ShedLogGate><RoutinePage id={q(query, "id")} /></ShedLogGate> },
  {
    path: "/shed-log/routine/edit",
    render: (_, query) => <ShedLogGate><RoutineEditorPage id={opt(query, "id")} date={opt(query, "date")} /></ShedLogGate>,
  },
  { path: "/shed-notes", render: (_, query) => <GatedShedNotes initialId={opt(query, "id")} /> },

  { path: "/tunes", render: () => <LibraryHub /> },
  { path: "/tunes/list", render: (_, query) => <TuneListPage list={query.get("list") === "learn" ? "learn" : "tunes"} /> },
  { path: "/tunes/setlist", render: (_, query) => <SetlistPage id={q(query, "id")} /> },
  { path: "/tunes/tune", render: (_, query) => <TuneHub id={q(query, "id")} list={opt(query, "list")} /> },
  { path: "/chord-charts/view", render: (_, query) => <ChartViewPage id={q(query, "id")} /> },
  { path: "/chord-charts/edit", render: (_, query) => <ChartEditorPage editId={q(query, "id")} /> },
  { path: "/chord-charts/new", render: (_, query) => <ChartEditorPage playlist={opt(query, "playlist")} /> },
  { path: "/chord-charts/import", render: () => <ImportChartsPage /> },
  { path: "/chord-charts/playlist", render: (_, query) => <PlaylistPage id={q(query, "id")} /> },
  {
    path: "/setlist-charts",
    render: (_, query) => (
      <SetlistChartsPage
        mine={opt(query, "mine")}
        post={opt(query, "post")}
        shared={opt(query, "shared")}
        start={Math.max(0, Number(query.get("start")) || 0)}
      />
    ),
  },
  { path: "/recordings", render: () => <RecordingsPage /> },
  { path: "/recordings/view", render: (_, query) => <RecordingPage id={q(query, "id")} /> },

  { path: "/community", render: () => <Community /> },
  { path: "/community/new", render: (_, query) => <NewPostPage setlistId={opt(query, "setlist")} /> },
  { path: "/community/following", render: () => <CommunitySubPage title="Following"><FollowLists /></CommunitySubPage> },
  { path: "/community/liked", render: () => <CommunitySubPage title="Liked posts"><LikedPosts /></CommunitySubPage> },
  { path: "/community/posts", render: () => <CommunitySubPage title="My posts"><MyPostsTab /></CommunitySubPage> },
  { path: "/post/:id", render: ({ id }) => <PostPage id={id} /> },
  { path: "/u/:username", render: ({ username }) => <PublicProfilePage username={username} /> },

  { path: "/lessons", render: () => <LessonsPage /> },
  { path: "/lessons/settings", render: () => <LessonSettingsPage /> },
  { path: "/lessons/book", render: (_, query) => <BookPage token={q(query, "offer")} /> },
  { path: "/lessons/join", render: (_, query) => <JoinPage code={q(query, "invite")} /> },
  { path: "/lessons/lesson", render: (_, query) => <LessonPage pair={q(query, "pair")} id={q(query, "id")} /> },
  { path: "/lessons/materials", render: (_, query) => <MaterialsPage pair={q(query, "pair")} /> },
  {
    path: "/lessons/notes",
    render: (_, query) => <NotesPage lessonId={q(query, "lesson")} noteId={opt(query, "note")} session={opt(query, "session")} />,
  },
  { path: "/lessons/student", render: (_, query) => <StudentPage id={q(query, "id")} /> },
  { path: "/lessons/teacher", render: (_, query) => <TeacherPage id={q(query, "id")} /> },

  { path: "/setlist/:id", render: ({ id }) => <SharedSetlistPage id={id} /> },
  { path: "/routine/:id", render: ({ id }) => <SharedRoutinePage id={id} /> },
  { path: "/tune/:id", render: ({ id }) => <SharedTunePage id={id} /> },
  { path: "/file/:id", render: ({ id }) => <SharedFilePage id={id} /> },
  { path: "/note/:token", render: ({ token }, query) => <SharedNotePage token={token} note={opt(query, "n")} /> },

  { path: "/account", render: (_, query) => <AccountPage initialTab={opt(query, "tab")} /> },
  { path: "/admin", render: () => <AdminPage /> },
  { path: "/help", render: (_, query) => <HelpPage initialTopic={opt(query, "topic")} /> },
  { path: "/changelog", render: () => <ChangelogPage /> },
  { path: "/feedback", render: () => <FeedbackPage /> },
  { path: "/support", render: () => <SupportPage /> },
  { path: "/privacy", render: () => <PrivacyPage /> },
  { path: "/terms", render: () => <TermsPage /> },
  { path: "/credits", render: () => <CreditsPage /> },
  { path: "/reset-password", render: (_, query) => <ResetPassword email={q(query, "email")} token={q(query, "token")} /> },
];

/** The website's redirects (`next.config.ts` and the redirect-only pages). */
function redirectFor(pathname: string, query: Query): string | null {
  if (pathname === "/welcome") return "/";
  if (pathname === "/practice-log" || pathname.startsWith("/practice-log/")) return pathname.replace("/practice-log", "/shed-log");
  if (pathname === "/tunes/setlists") return "/tunes?tab=setlists";
  if (pathname === "/chord-charts") return "/tunes?tab=charts";
  if (pathname === "/files") return "/tunes?tab=files";
  if (pathname === "/settings") return `/account?tab=${encodeURIComponent(query.get("tab") || "general")}`;
  if (pathname === "/lessons/availability") return "/lessons/settings#hours";
  if (pathname === "/tune") {
    return `/tunes/tune?list=${encodeURIComponent(query.get("list") || "tunes")}&id=${encodeURIComponent(query.get("id") || "")}`;
  }
  return null;
}

function match(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/");
  const got = pathname.replace(/\/$/, "").split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

export function Routes() {
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search);
  // The website's "/" is its landing page; the app starts at the dashboard, and the landing
  // page's sign-in modal (`/?auth=login`) is a page of its own.
  if (pathname === "/") {
    const auth = query.get("auth");
    return auth ? <SignIn initialFlow={auth === "signup" ? "signUp" : "signIn"} /> : <Redirect to="/dashboard" />;
  }
  const redirect = redirectFor(pathname, query);
  if (redirect) return <Redirect to={redirect} />;
  for (const route of ROUTES) {
    const params = match(route.path, pathname);
    if (params) {
      setRouteParams(params);
      return <>{route.render(params, query)}</>;
    }
  }
  setRouteParams({});
  return <NotFound />;
}

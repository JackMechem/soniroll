"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { currentToolHref } from "@jam-practice/core/navLinks";
import Logo from "@/components/Logo";
import { NAV_LINKS } from "@/components/tools";

/** Same pulsing logo `app/loading.tsx` shows for a normal page navigation, a little smaller since
    a pane can be much slimmer than a full page. */
function PaneLoading() {
  return (
    <div className="flex h-full items-center justify-center p-4 pt-20">
      <Logo height={46} className="max-w-full animate-pulse" />
    </div>
  );
}

// `next/dynamic` needs a literal path per import, so each page is listed by hand. Keep in step
// with the routes in `app/` (and the desktop app's `apps/desktop/src/routes.tsx`).
const Home = dynamic(() => import("@/components/Home"), { loading: PaneLoading });
const JamPractice = dynamic(() => import("@/components/JamPractice"), { loading: PaneLoading });
const NoteTrainer = dynamic(() => import("@/components/NoteTrainer"), { loading: PaneLoading });
const ScaleTrainer = dynamic(() => import("@/components/ScaleTrainer"), { loading: PaneLoading });
const IntervalTrainer = dynamic(() => import("@/components/IntervalTrainer"), { loading: PaneLoading });
const GuessTheInterval = dynamic(() => import("@/components/GuessTheInterval"), { loading: PaneLoading });
const GuessTheChord = dynamic(() => import("@/components/GuessTheChord"), { loading: PaneLoading });
const GuessTheProgression = dynamic(() => import("@/components/GuessTheProgression"), { loading: PaneLoading });
const FindTheRoot = dynamic(() => import("@/components/FindTheRoot"), { loading: PaneLoading });
const PracticeTimer = dynamic(() => import("@/components/PracticeTimer"), { loading: PaneLoading });
const Metronome = dynamic(() => import("@/components/Metronome"), { loading: PaneLoading });
const RandomMetricModulation = dynamic(() => import("@/components/RandomMetricModulation"), { loading: PaneLoading });
const TempoTrainer = dynamic(() => import("@/components/TempoTrainer"), { loading: PaneLoading });
const Tuner = dynamic(() => import("@/components/Tuner"), { loading: PaneLoading });
const SlowDowner = dynamic(() => import("@/components/SlowDowner"), { loading: PaneLoading });
const RhythmSection = dynamic(() => import("@/components/RhythmSection"), { loading: PaneLoading });
const Recorder = dynamic(() => import("@/components/Recorder"), { loading: PaneLoading });
const StickControl = dynamic(() => import("@/components/StickControl"), { loading: PaneLoading });
const Syncopation = dynamic(() => import("@/components/Syncopation"), { loading: PaneLoading });
const TimeTest = dynamic(() => import("@/components/TimeTest"), { loading: PaneLoading });
const ScoreWriter = dynamic(() => import("@/components/scorewriter/ScoreWriter"), { loading: PaneLoading });

const ShedLogGate = dynamic(() => import("@/components/practicelog/ShedLogGate"), { loading: PaneLoading });
const PracticeLog = dynamic(() => import("@/components/PracticeLog"), { loading: PaneLoading });
const RoutinesPage = dynamic(() => import("@/components/practicelog/RoutinesPage"), { loading: PaneLoading });
const RoutinePage = dynamic(() => import("@/components/practicelog/RoutinePage"), { loading: PaneLoading });
const TaskPage = dynamic(() => import("@/components/practicelog/TaskPage"), { loading: PaneLoading });
const RoutineEditorPage = dynamic(() => import("@/components/practicelog/RoutineEditor"), { loading: PaneLoading });
const GatedShedNotes = dynamic(() => import("@/components/shednotes/GatedShedNotes"), { loading: PaneLoading });
const NoteSidePane = dynamic(() => import("@/components/shednotes/NoteSidePane"), { loading: PaneLoading });

const LibraryPane = dynamic(() => import("@/components/library/LibraryHub").then((m) => m.LibraryPane), { loading: PaneLoading });
const TuneListPage = dynamic(() => import("@/components/library/TuneListPage"), { loading: PaneLoading });
const SetlistPage = dynamic(() => import("@/components/library/SetlistPage"), { loading: PaneLoading });
const TuneHub = dynamic(() => import("@/components/TuneHub"), { loading: PaneLoading });
const RecordingPage = dynamic(() => import("@/components/recordings/RecordingPage"), { loading: PaneLoading });
const ChartViewPage = dynamic(() => import("@/components/library/ChartViewPage"), { loading: PaneLoading });
const ChartEditorPage = dynamic(() => import("@/components/library/ChartEditorPage"), { loading: PaneLoading });
const ImportChartsPage = dynamic(() => import("@/components/library/ImportChartsPage"), { loading: PaneLoading });
const PlaylistPage = dynamic(() => import("@/components/library/PlaylistPage"), { loading: PaneLoading });
const SetlistChartsPage = dynamic(() => import("@/components/library/SetlistChartsPage"), { loading: PaneLoading });

const Community = dynamic(() => import("@/components/Community"), { loading: PaneLoading });
const CommunitySubPage = dynamic(() => import("@/components/Community").then((m) => m.CommunitySubPage), { loading: PaneLoading });
const FollowLists = dynamic(() => import("@/components/FollowLists"), { loading: PaneLoading });
const LikedPosts = dynamic(() => import("@/components/LikedPosts"), { loading: PaneLoading });
const MyPostsTab = dynamic(() => import("@/components/MyPostsTab"), { loading: PaneLoading });
const PostPage = dynamic(() => import("@/components/PostPage"), { loading: PaneLoading });
const PublicProfilePage = dynamic(() => import("@/components/PublicProfilePage"), { loading: PaneLoading });
const NewPostPage = dynamic(() => import("@/components/NewPostPage"), { loading: PaneLoading });
const LessonsPage = dynamic(() => import("@/components/lessons/LessonsPage"), { loading: PaneLoading });
const LessonPage = dynamic(() => import("@/components/lessons/LessonPage"), { loading: PaneLoading });
const LessonNotesPage = dynamic(() => import("@/components/lessons/NotesPage"), { loading: PaneLoading });
const MaterialsPage = dynamic(() => import("@/components/lessons/MaterialsPage"), { loading: PaneLoading });
const StudentPage = dynamic(() => import("@/components/lessons/StudentPage"), { loading: PaneLoading });
const TeacherPage = dynamic(() => import("@/components/lessons/TeacherPage"), { loading: PaneLoading });

const SharedFilePage = dynamic(() => import("@/components/files/SharedFilePage"), { loading: PaneLoading });
const SharedTunePage = dynamic(() => import("@/components/files/SharedTunePage"), { loading: PaneLoading });
const SharedSetlistPage = dynamic(() => import("@/components/SharedSetlistPage"), { loading: PaneLoading });

const AccountPage = dynamic(() => import("@/components/AccountPage"), { loading: PaneLoading });
const HelpPage = dynamic(() => import("@/components/help/HelpPage"), { loading: PaneLoading });

type Query = URLSearchParams;
type PaneRoute = { path: string; render: (query: Query, params: Record<string, string>) => ReactNode };

const q = (query: Query, key: string) => query.get(key) ?? "";
const opt = (query: Query, key: string) => query.get(key) || undefined;

/**
 * The pages a split-screen pane or the side view can show, by address — the same pages (and
 * props from the address) as `app/`. A pane can't be a Next.js page of its own (the App Router
 * renders one route at a time), so it renders the page's component from here, inside its own
 * address (`components/panes/PaneNav.tsx`: `usePathname`/`useSearchParams`/`useRouter` there are the
 * pane's). Not here on purpose: the landing page, sign-in, admin and the legal pages.
 */
const PANE_ROUTES: PaneRoute[] = [
  { path: "/dashboard", render: () => <Home /> },
  { path: "/jam-practice", render: () => <JamPractice /> },
  { path: "/note-trainer", render: () => <NoteTrainer /> },
  { path: "/scale-trainer", render: () => <ScaleTrainer /> },
  { path: "/interval-trainer", render: () => <IntervalTrainer /> },
  { path: "/guess-the-interval", render: () => <GuessTheInterval /> },
  { path: "/guess-the-chord", render: () => <GuessTheChord /> },
  { path: "/guess-the-progression", render: () => <GuessTheProgression /> },
  { path: "/find-the-root", render: () => <FindTheRoot /> },
  { path: "/practice-timer", render: () => <PracticeTimer /> },
  { path: "/metronome", render: () => <Metronome /> },
  { path: "/random-metric-modulation", render: () => <RandomMetricModulation /> },
  { path: "/tempo-trainer", render: () => <TempoTrainer /> },
  { path: "/tuner", render: (query) => <Tuner openTakeId={opt(query, "take")} /> },
  { path: "/slow-downer", render: (query) => <SlowDowner openStored={opt(query, "open")} /> },
  {
    path: "/rhythm-section",
    render: (query) => <RhythmSection initialTab={opt(query, "tab")} initialPlay={opt(query, "play")} initialChart={opt(query, "chart")} initialKey={opt(query, "key")} />,
  },
  { path: "/recorder", render: (query) => <Recorder tuneId={opt(query, "tuneId")} /> },
  { path: "/random-sticking-warmup", render: () => <StickControl /> },
  { path: "/syncopation", render: () => <Syncopation /> },
  { path: "/time-test", render: () => <TimeTest /> },
  { path: "/score-writer", render: (query) => <ScoreWriter initialId={opt(query, "id")} /> },

  { path: "/shed-log", render: (query) => <ShedLogGate><PracticeLog initialDate={opt(query, "date")} /></ShedLogGate> },
  { path: "/shed-log/routines", render: () => <ShedLogGate><RoutinesPage /></ShedLogGate> },
  { path: "/shed-log/routine", render: (query) => <ShedLogGate><RoutinePage id={q(query, "id")} date={opt(query, "date")} /></ShedLogGate> },
  {
    path: "/shed-log/task",
    render: (query) => (
      <ShedLogGate>
        <TaskPage routineId={opt(query, "routine")} date={opt(query, "date")} taskId={q(query, "task")} />
      </ShedLogGate>
    ),
  },
  { path: "/shed-log/routine/edit", render: (query) => <ShedLogGate><RoutineEditorPage id={opt(query, "id")} date={opt(query, "date")} /></ShedLogGate> },
  // `view=note`: just the note (the side view); otherwise all of Shed Notes.
  {
    path: "/shed-notes",
    render: (query) => (query.get("view") === "note" && query.get("id") ? <NoteSidePane noteId={q(query, "id")} /> : <GatedShedNotes initialId={opt(query, "id")} />),
  },

  { path: "/tunes", render: () => <LibraryPane /> },
  { path: "/tunes/list", render: (query) => <TuneListPage list={query.get("list") === "learn" ? "learn" : query.get("list") === "library" ? "library" : "tunes"} /> },
  { path: "/tunes/setlist", render: (query) => <SetlistPage id={q(query, "id")} /> },
  { path: "/tunes/tune", render: (query) => <TuneHub id={q(query, "id")} list={opt(query, "list")} /> },
  { path: "/tunes/recording", render: (query) => <RecordingPage id={q(query, "id")} /> },
  { path: "/chord-charts/view", render: (query) => <ChartViewPage id={q(query, "id")} /> },
  { path: "/chord-charts/edit", render: (query) => <ChartEditorPage editId={q(query, "id")} /> },
  { path: "/chord-charts/new", render: (query) => <ChartEditorPage playlist={opt(query, "playlist")} /> },
  { path: "/chord-charts/import", render: () => <ImportChartsPage /> },
  { path: "/chord-charts/playlist", render: (query) => <PlaylistPage id={q(query, "id")} /> },
  {
    path: "/setlist-charts",
    render: (query) => (
      <SetlistChartsPage mine={opt(query, "mine")} post={opt(query, "post")} shared={opt(query, "shared")} start={Math.max(0, Number(query.get("start")) || 0)} />
    ),
  },

  { path: "/community", render: (query) => <Community initialTab={opt(query, "tab")} /> },
  { path: "/community/new", render: (query) => <NewPostPage setlistId={opt(query, "setlist")} /> },
  { path: "/community/following", render: () => <CommunitySubPage title="Following"><FollowLists /></CommunitySubPage> },
  { path: "/community/liked", render: () => <CommunitySubPage title="Liked posts"><LikedPosts /></CommunitySubPage> },
  { path: "/community/posts", render: () => <CommunitySubPage title="My posts"><MyPostsTab /></CommunitySubPage> },
  { path: "/post/:id", render: (_, { id }) => <PostPage id={id} /> },
  { path: "/u/:username", render: (_, { username }) => <PublicProfilePage username={username} /> },
  { path: "/lessons", render: () => <LessonsPage /> },
  { path: "/lessons/lesson", render: (query) => <LessonPage pair={q(query, "pair")} id={q(query, "id")} /> },
  { path: "/lessons/notes", render: (query) => <LessonNotesPage lessonId={q(query, "lesson")} noteId={opt(query, "note")} session={opt(query, "session")} /> },
  { path: "/lessons/materials", render: (query) => <MaterialsPage pair={q(query, "pair")} /> },
  { path: "/lessons/student", render: (query) => <StudentPage id={q(query, "id")} /> },
  { path: "/lessons/teacher", render: (query) => <TeacherPage id={q(query, "id")} /> },

  { path: "/file/:id", render: (_, { id }) => <SharedFilePage id={id} /> },
  { path: "/tune/:id", render: (_, { id }) => <SharedTunePage id={id} /> },
  { path: "/setlist/:id", render: (_, { id }) => <SharedSetlistPage id={id} /> },

  // Were panes before this list existed; kept so saved layouts still open them.
  { path: "/account", render: (query) => <AccountPage initialTab={opt(query, "tab")} /> },
  { path: "/help", render: (query) => <HelpPage initialTopic={opt(query, "topic")} /> },
];

/** The website's redirects that matter for a saved pane (`next.config.ts`): retired tools and the
    Library's old addresses. */
export function normalizePaneHref(href: string): string {
  const url = new URL(href, "http://x");
  let path = currentToolHref(url.pathname);
  const query = url.searchParams;
  if (url.pathname === "/drum-generator") query.set("play", "drums");
  const libraryTab: Record<string, string> = { "/files": "files", "/recordings": "recordings", "/tunes/setlists": "setlists" };
  if (path === "/chord-charts" || path === "/library") path = "/tunes";
  else if (libraryTab[path]) {
    query.set("tab", libraryTab[path]);
    path = "/tunes";
  } else if (path === "/practice-log" || path.startsWith("/practice-log/")) path = path.replace("/practice-log", "/shed-log");
  else if (path === "/") path = "/dashboard";
  else if (path === "/settings") {
    query.set("tab", query.get("tab") || "general");
    path = "/account";
  }
  const search = query.toString();
  return `${path}${search ? `?${search}` : ""}${url.hash}`;
}

function match(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/");
  const got = pathname.replace(/(.)\/$/, "$1").split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

function findRoute(pathname: string): { route: PaneRoute; params: Record<string, string> } | null {
  for (const route of PANE_ROUTES) {
    const params = match(route.path, pathname);
    if (params) return { route, params };
  }
  return null;
}

/** Whether a pane can show this address (an in-app path that's in `PANE_ROUTES`). */
export function canShowInPane(href: string | null | undefined): boolean {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return false;
  return findRoute(new URL(normalizePaneHref(href), "http://x").pathname) !== null;
}

/** The page for `href` in a pane, or null when a pane can't show it. */
export function renderPaneHref(href: string): ReactNode | null {
  const url = new URL(href, "http://x");
  const found = findRoute(url.pathname);
  return found ? found.route.render(url.searchParams, found.params) : null;
}

/** The tools (`NAV_LINKS`) a pane can show. */
export const TILEABLE_LINKS = NAV_LINKS.filter((link) => canShowInPane(link.href));

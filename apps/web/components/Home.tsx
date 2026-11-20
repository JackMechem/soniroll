"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SUPPORT_PATH, SupportCard, useSupportCardHidden } from "@/components/support/SupportParts";
import { DesktopAppCard, useDesktopCardApplies, useDesktopCardDismissed } from "@/components/download/DesktopAppCard";
import { useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { tuneSummary } from "@/components/library/shared";
import { chartHref, searchCharts } from "@/components/library/useChartSearch";
import { KeyBadge } from "@/components/library/ui";
import PracticeTimerWidget from "@/components/PracticeTimerWidget";
import {
  CATEGORY_COLORS,
  ChevronRightIcon,
  ChordChartIcon,
  CloseIcon,
  NAV_LINKS,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SetlistIcon,
  StarIcon,
  StopwatchIcon,
  groupByCategory,
} from "@/components/tools";
import { filterNavLinks } from "@jam-practice/core/navLinks";
import { CHORD_QUALITIES } from "@/lib/chords";
import { INTERVALS } from "@/lib/intervals";
import { progressionById } from "@/lib/progressions";
import { getSnapshot as getTimerSnapshot, getServerSnapshot as getTimerServerSnapshot, subscribe as subscribeTimer } from "@/lib/practiceTimerEngine";
import { describeSession } from "@/lib/practiceTimer";
import { useRecentCharts, useRecentTunes } from "@/lib/recents";
import { attempts, rankWeak, type GradeCounts } from "@/lib/struggleStats";
import { useRecentTools } from "@/lib/toolRecents";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useFavorites } from "@/lib/useFavorites";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { usePracticeSessions } from "@/lib/usePracticeSessions";
import { useSetlists } from "@/lib/useSetlists";
import { isToolHidden, useSiteSettings } from "@/lib/siteSettings";
import { cardDef, resolveLayout, type CardSize, type DashboardItem } from "@/lib/dashboardLayout";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import EarTrainingProgress from "@/components/learning/EarTrainingProgress";
import TodayPractice, { HeatGrid, TodayMomentum } from "@/components/practicelog/TodayPractice";
import LessonsDashboard, { useLessonsData } from "@/components/lessons/LessonsDashboard";
import ConfirmDialog from "@/components/ConfirmDialog";
import DashboardGrid, { DashboardEditingContext } from "@/components/dashboard/DashboardGrid";
import { DEFAULT_LEARNING_PROGRESS, LEARNING_KEY, summarizeLearning } from "@/lib/learningPath";

type ToolLink = (typeof NAV_LINKS)[number];
type Icon = ToolLink["icon"];

/** Community, Tunes and Chord Charts are "your library", not tools (the sidebar shows them apart too). */
const LIBRARY_HREFS = ["/community", "/tunes", "/chord-charts"];
const TOOLS = NAV_LINKS.filter((l) => !LIBRARY_HREFS.includes(l.href) && l.href !== "/");
const TOOL_BY_HREF = new Map(TOOLS.map((l) => [l.href, l]));
/** Shown in place of Favorites until you've starred some tools. */
const STARTER_HREFS = ["/metronome", "/jam-practice", "/tuner", "/practice-timer"];

// Only the struggle stats are read from the ear trainers' synced settings (never written here).
const INTERVAL_STATS_DEFAULTS = { intervalStats: {} as Record<string, GradeCounts> };
const CHORD_STATS_DEFAULTS = { chordStats: {} as Record<string, GradeCounts> };
const PROGRESSION_STATS_DEFAULTS = { progressionStats: {} as Record<string, GradeCounts> };

const noop = () => () => {};
/** Today's date as a stable string, read on the client only (the server's clock and timezone
    would cause a hydration mismatch). */
function useToday(): string | null {
  return useSyncExternalStore(noop, () => new Date().toDateString(), () => null);
}

function greeting(today: string | null) {
  if (!today) return "Welcome back";
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** `?edit` (Settings → Dashboard links here) opens the dashboard in edit mode. */
function urlAsksToEdit() {
  return new URLSearchParams(window.location.search).has("edit");
}

/** How many weeks the "Days practiced" grid shows at each size. The squares fill the card's
    width, so fewer weeks make them bigger: a small card shows a season (13 weeks) with squares big
    enough to fill it beside Favorites instead of leaving its bottom half empty. */
/** Columns each size takes in the 12-column desktop grid. */
const SPAN: Record<CardSize, number> = { small: 4, medium: 6, large: 8, full: 12 };

/** The cards with any row that would end short widened to fill it. Places them the way the grid
    does outside Edit (in order, each in the first row with room — `grid-flow-row-dense`), then a
    row that still ends early has its last card grown into the gap when that card is allowed the
    size it needs. Later cards didn't fit that gap, so growing into it moves nothing else. Display
    only — the saved sizes don't change. */
function fillRowGaps(items: DashboardItem[]): DashboardItem[] {
  const out = items.map((i) => ({ ...i }));
  const rows: boolean[][] = [];
  const placed: { item: DashboardItem; row: number; end: number }[] = [];
  for (const item of out) {
    const span = SPAN[item.size];
    for (let r = 0; ; r++) {
      rows[r] ??= Array(12).fill(false);
      const col = rows[r].findIndex((_, c) => c + span <= 12 && rows[r].slice(c, c + span).every((taken) => !taken));
      if (col < 0) continue;
      for (let c = col; c < col + span; c++) rows[r][c] = true;
      placed.push({ item, row: r, end: col + span });
      break;
    }
  }
  rows.forEach((_, r) => {
    const inRow = placed.filter((p) => p.row === r);
    const last = inRow.reduce<(typeof inRow)[number] | null>((a, p) => (!a || p.end > a.end ? p : a), null);
    if (!last || last.end === 12) return;
    const want = (Object.keys(SPAN) as CardSize[]).find((size) => SPAN[size] === SPAN[last.item.size] + 12 - last.end);
    const allowed: readonly CardSize[] = cardDef(last.item.id)?.sizes ?? [];
    if (want && allowed.includes(want)) last.item.size = want;
  });
  return out;
}

const GRID_WEEKS: Record<CardSize, number> = { small: 13, medium: 26, large: 40, full: 52 };

/**
 * Home: the app's dashboard (the sidebar's "Dashboard"; the logo goes to the landing page).
 * A greeting and search on top, then your cards: which ones, in what order and how big is yours to
 * choose with Edit (`DashboardGrid`, saved in the site settings; `lib/dashboardLayout.ts` has the
 * cards and the default). The search finds tools and your tunes.
 */
export default function Home() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const today = useToday();
  const [query, setQuery] = useState("");
  const user = useQuery(api.users.current);
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : "skip");
  const { favorites, toggleFavorite } = useFavorites();
  const recentTools = useRecentTools();
  const recentTunes = useRecentTunes();
  const recentCharts = useRecentCharts();
  const lists = useTuneLists();
  const { setlists } = useSetlists();
  const { allSongs, totalSongs, playlists } = useChordChartsLibrary(null);
  const { sessions } = usePracticeSessions();
  const timer = useSyncExternalStore(subscribeTimer, getTimerSnapshot, getTimerServerSnapshot);
  const [{ intervalStats }] = useSyncedSettings("jam-practice-guess-the-interval", INTERVAL_STATS_DEFAULTS);
  const [{ chordStats }] = useSyncedSettings("jam-practice-guess-the-chord", CHORD_STATS_DEFAULTS);
  const [{ progressionStats }] = useSyncedSettings("jam-practice-guess-the-progression", PROGRESSION_STATS_DEFAULTS);
  const [learningProgress] = useSyncedSettings(LEARNING_KEY, DEFAULT_LEARNING_PROGRESS);
  const learningSummaries = summarizeLearning(learningProgress);
  const lessonsData = useLessonsData();
  const supportHidden = useSupportCardHidden();
  const desktopCardDismissed = useDesktopCardDismissed();
  const desktopCardApplies = useDesktopCardApplies();
  // At most one ask at a time: when both the desktop app and the support card would show, they take
  // turns by day (the desktop one on even days).
  const desktopShows = desktopCardApplies && !desktopCardDismissed;
  const dayNumber = today ? Math.floor(new Date(today).getTime() / 86400000) : 0;
  const promo: "support" | "desktopApp" | null =
    desktopShows && !supportHidden ? (dayNumber % 2 === 0 ? "desktopApp" : "support") : desktopShows ? "desktopApp" : supportHidden ? null : "support";

  // Edit mode: from the Edit button, or `?edit` in the address.
  const urlEdit = useSyncExternalStore(noop, urlAsksToEdit, () => false);
  const [editChoice, setEditChoice] = useState<boolean | null>(null);
  const editing = editChoice ?? urlEdit;
  const [confirmReset, setConfirmReset] = useState(false);
  const finishEditing = () => {
    setEditChoice(false);
    if (urlAsksToEdit()) window.history.replaceState(window.history.state, "", window.location.pathname);
  };
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setEditChoice(false);
      if (urlAsksToEdit()) window.history.replaceState(window.history.state, "", window.location.pathname);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const q = editing ? "" : query.trim();
  const known = lists.tunes.tunes;
  const learning = lists.learn.tunes;

  const chartMeta = useMemo(() => {
    const m = new Map<string, { title: string; key: string }>();
    for (const s of allSongs) m.set(s.id, { title: s.title, key: s.key });
    return m;
  }, [allSongs]);

  const tuneMatches = useMemo(() => {
    if (!q) return [];
    const words = q.toLowerCase().split(/\s+/);
    const out: { tune: Tune; list: TuneListId }[] = [];
    for (const list of ["tunes", "learn", "library"] as TuneListId[]) {
      for (const tune of lists[list].tunes) if (words.every((w) => tune.name.toLowerCase().includes(w))) out.push({ tune, list });
    }
    return out.slice(0, 8);
  }, [q, lists]);

  // Settings: the layout, features that are off, and tools you've hidden (a search still finds them).
  const [site, updateSite] = useSiteSettings();
  const saved = resolveLayout(site.dashboard, site.hiddenCards);
  // The desktop app card came after people saved their layouts: show it at the end of a saved one
  // (not while editing) until it's closed with ×.
  const layout =
    !editing && site.dashboard && !desktopCardDismissed && desktopCardApplies && !saved.some((c) => c.id === "desktopApp")
      ? [...saved, { id: "desktopApp", size: "full" as CardSize }]
      : saved;
  const available = (id: string) => {
    const feature = (cardDef(id) as { feature?: "shedLog" | "lessons" } | undefined)?.feature;
    return !feature || site[feature];
  };
  const tools = TOOLS.filter((t) => !isToolHidden(site.hiddenTools, t.href));
  const favoriteTools = tools.filter((t) => favorites.includes(t.href));
  const pinned = favoriteTools.length ? favoriteTools : tools.filter((t) => STARTER_HREFS.includes(t.href));
  const canStar = isAuthenticated;

  // Where you left off: recent tools, then recent tunes and charts.
  // Tools in their category colour (like the sidebar); tunes and charts say what they are.
  const recents: { key: string; icon: Icon; color: string; title: string; detail?: string; href: string }[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    if (tool) recents.push({ key: href, icon: tool.icon, color: CATEGORY_COLORS[tool.category], title: tool.label, href });
    if (recents.length >= 4) break;
  }
  for (const id of recentTunes.ids.slice(0, 2)) {
    const list = (["tunes", "learn", "library"] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === id));
    const tune = list ? lists[list].tunes.find((t) => t.id === id) : undefined;
    if (list && tune) recents.push({ key: `t:${id}`, icon: NoteIcon, color: "var(--accent)", title: tune.name, detail: "Tune", href: tuneHref(list, id) });
  }
  for (const id of recentCharts.ids.slice(0, 2)) {
    const meta = chartMeta.get(id);
    if (meta) recents.push({ key: `c:${id}`, icon: ChordChartIcon, color: "var(--accent)", title: meta.title, detail: meta.key ? `Chart · ${meta.key}` : "Chart", href: chartHref(id) });
  }

  // Tune of the day: the same one all day, from Tunes I Know.
  const tuneOfDay = useMemo(() => {
    if (!today || !known.length) return null;
    const day = Math.floor(new Date(today).getTime() / 86400000);
    const tune = known[day % known.length];
    const keys = tune.keys.filter((k) => k.enabled);
    const tempos = tune.tempos.filter((t) => t.enabled);
    return { tune, key: keys.length ? keys[day % keys.length].value : null, tempo: tempos.length ? tempos[day % tempos.length].value : null };
  }, [today, known]);

  const weakSpots = [
    ...rankWeak(intervalStats).flatMap((e) => {
      const iv = INTERVALS.find((i) => i.id === e.key);
      return iv ? [{ key: `i:${e.key}`, label: iv.label, kind: "Interval", counts: e.counts, score: e.score, href: "/guess-the-interval" }] : [];
    }),
    ...rankWeak(chordStats).flatMap((e) => {
      const cq = CHORD_QUALITIES.find((c) => c.id === e.key);
      return cq ? [{ key: `c:${e.key}`, label: `${cq.name} chords`, kind: "Chord", counts: e.counts, score: e.score, href: "/guess-the-chord" }] : [];
    }),
    ...rankWeak(progressionStats).flatMap((e) => {
      const pr = progressionById(e.key);
      return pr ? [{ key: `p:${e.key}`, label: pr.name, kind: "Progression", counts: e.counts, score: e.score, href: "/guess-the-progression" }] : [];
    }),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const name = profile?.username || user?.name?.split(" ")[0];
  const toolMatches = q ? filterNavLinks(TOOLS, q) : [];
  // Chord charts by title, a few at most (a library can hold 1,500+).
  const chartMatches = useMemo(() => searchCharts(allSongs, q, 6), [allSongs, q]);

  /** One card's content, or null when it has nothing to show right now. */
  const renderCard = ({ id, size }: DashboardItem): ReactNode | null => {
    switch (id) {
      case "momentum":
        return isAuthenticated ? (
          <Card title="Goal and streak" tone="plain">
            <TodayMomentum />
          </Card>
        ) : null;
      case "today":
        return (
          <Card title="Today's practice" action={{ label: "Shed Log", href: "/shed-log" }}>
            <TodayPractice />
          </Card>
        );
      case "practiceGrid":
        return isAuthenticated ? (
          <Card title="Days practiced">
            <HeatGrid bare weeks={GRID_WEEKS[size]} />
          </Card>
        ) : null;
      case "recent":
        return (
          <Card title="Pick up where you left off">
            {recents.length ? (
              <div className="-mx-2 grid gap-px @xl:grid-cols-2">
                {recents.slice(0, 8).map((r) => (
                  <Link key={r.key} href={r.href} className="flex min-w-0 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
                    <span data-nav-icon className="flex shrink-0" style={{ color: r.color }}>
                      <r.icon className="h-4 w-4" />
                    </span>
                    {/* The detail sits right after the name, so a lone row doesn't leave it floating mid-card. */}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {r.title}
                      {r.detail && <span className="ml-2 text-xs font-normal text-muted">{r.detail}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>The tools, tunes and charts you open will show up here.</Empty>
            )}
          </Card>
        );
      case "tuneOfDay":
        return (
          <Card title="Tune of the day" action={tuneOfDay ? { label: "Shuffle in Jam Practice", href: "/jam-practice" } : undefined}>
            {tuneOfDay ? (
              <div className="flex flex-col gap-4">
                <div>
                  <Link href={tuneHref("tunes", tuneOfDay.tune.id)} className="block text-xl font-semibold leading-tight tracking-tight hover:underline">
                    {tuneOfDay.tune.name}
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tuneOfDay.key && <Chip>in {tuneOfDay.key}</Chip>}
                    {tuneOfDay.tempo && <Chip>{tuneOfDay.tempo} BPM</Chip>}
                    <Chip muted>{tuneOfDay.tune.timeSignature}</Chip>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Link href={tuneHref("tunes", tuneOfDay.tune.id)} className="flex h-9 items-center justify-center gap-1 self-start rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
                    Open the tune <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                  <p className="text-xs text-muted">A new one from Tunes I Know every day.</p>
                </div>
              </div>
            ) : (
              <Empty>
                Add the tunes you know and one comes up here each day.{" "}
                <Link href="/tunes" className="font-semibold text-accent hover:underline">Add tunes</Link>
              </Empty>
            )}
          </Card>
        );
      case "favorites":
        return (
          <Card title={favoriteTools.length ? "Favorites" : "Get started"} detail={favoriteTools.length || !canStar ? undefined : "Star a tool to pin it here"}>
            {/* Columns that the tiles fill evenly: four tiles (the starters) go 2 × 2, or 4 in a row
                once that's wide enough, never 3 + 1 with one left alone. */}
            <div
              className={`grid auto-rows-fr content-start gap-2 max-sm:gap-1.5 ${
                pinned.length <= 2 ? "@lg:grid-cols-2" : pinned.length === 4 ? "@lg:grid-cols-2 @7xl:grid-cols-4" : "@lg:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4"
              }`}
            >
              {pinned.map((item) => (
                <ToolTile key={item.href} item={item} favorited={favorites.includes(item.href)} canStar={canStar} onToggle={() => toggleFavorite(item.href)} />
              ))}
            </div>
            {favoriteTools.length > 0 && favoriteTools.length < 3 && (
              <p className="mt-auto flex items-center gap-1.5 text-xs text-muted">
                <StarIcon className="h-3.5 w-3.5" /> Star more tools in the sidebar to pin them here.
              </p>
            )}
          </Card>
        );
      case "library":
        return (
          <Card title="Your library">
            <div className="-mx-2 flex flex-col gap-px">
              <StatRow icon={NoteIcon} label="Tunes I know" value={known.length} href="/tunes/list?list=tunes" />
              <StatRow icon={NoteIcon} label="Tunes to learn" value={learning.length} href="/tunes/list?list=learn" />
              <StatRow icon={SetlistIcon} label="Setlists" value={setlists.length} href="/tunes?tab=setlists" />
              <StatRow icon={ChordChartIcon} label="Chord charts" value={totalSongs} href="/tunes" detail={playlists.length ? `${playlists.length} folder${playlists.length === 1 ? "" : "s"}` : undefined} />
            </div>
          </Card>
        );
      case "setlists":
        return (
          <Card title="Setlists" action={{ label: setlists.length ? "All" : "New", href: "/tunes?tab=setlists" }}>
            {setlists.length ? (
              <div className="-mx-2 flex flex-col">
                {[...setlists]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .slice(0, 4)
                  .map((s) => (
                    <Link key={s.id} href={`/tunes/setlist?id=${encodeURIComponent(s.id)}`} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
                      <IconChip icon={SetlistIcon} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                      <span className="text-xs tabular-nums text-muted">{s.tuneIds.length} tunes</span>
                    </Link>
                  ))}
              </div>
            ) : (
              <Empty>
                Put tunes in order for a gig or a session, with the key and tempo for each.{" "}
                <Link href="/tunes?tab=setlists" className="font-semibold text-accent hover:underline">Make a setlist</Link>
              </Empty>
            )}
          </Card>
        );
      case "sessions":
        return (
          <Card title={timer ? "Practicing now" : "Practice sessions"} action={{ label: "Open timer", href: "/practice-timer" }}>
            {timer ? (
              <div className="-mx-1">
                <PracticeTimerWidget />
              </div>
            ) : sessions.length ? (
              <div className="-mx-2 flex flex-col">
                {sessions.slice(0, 4).map((s) => (
                  <Link key={s.id} href="/practice-timer" className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
                    <IconChip icon={StopwatchIcon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name || "Untitled session"}</span>
                      <span className="block truncate text-xs text-muted">{describeSession(s)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>
                Chain timed blocks (scales, then tunes, then a break) or run a Pomodoro.{" "}
                <Link href="/practice-timer" className="font-semibold text-accent hover:underline">Plan a session</Link>
              </Empty>
            )}
          </Card>
        );
      case "weakSpots":
        return (
          <Card title="Ear training weak spots">
            {weakSpots.length ? (
              <div className="flex flex-col gap-3">
                {weakSpots.map((w) => {
                  const total = attempts(w.counts);
                  const pct = total ? Math.round(((w.counts.correct + w.counts.partial * 0.5) / total) * 100) : 0;
                  return (
                    <Link key={w.key} href={w.href} className="group flex flex-col gap-1.5">
                      <span className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium group-hover:underline">{w.label}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">{pct}% of {total}</span>
                      </span>
                      <span className="h-1 overflow-hidden rounded-full bg-foreground/10">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 4)}%` }} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty>
                Play a few rounds of{" "}
                <Link href="/guess-the-interval" className="font-semibold text-accent hover:underline">Guess the Interval</Link>,{" "}
                <Link href="/guess-the-chord" className="font-semibold text-accent hover:underline">Guess the Chord</Link> or{" "}
                <Link href="/guess-the-progression" className="font-semibold text-accent hover:underline">Guess the Progression</Link> and the ones you miss most show up here.
              </Empty>
            )}
          </Card>
        );
      case "earPath":
        return (
          <Card title="Ear training path" detail="Learn mode in each tool">
            <EarTrainingProgress summaries={learningSummaries} links />
          </Card>
        );
      case "allTools":
        return (
          <Card title="All tools">
            <div className="grid gap-x-6 gap-y-5 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
              {groupByCategory(tools).map(({ category, items }) => (
                <div key={category} className="min-w-0">
                  <h3 className="mb-1 px-2 text-xs font-medium text-muted">{category}</h3>
                  <ToolRows items={items} favorites={favorites} canStar={canStar} isDesktop={isDesktop} onToggle={toggleFavorite} />
                </div>
              ))}
            </div>
          </Card>
        );
      case "lessons":
        return lessonsData ? (
          <Card title="Lessons" tone="plain" action={{ label: "All lessons", href: "/lessons" }}>
            <LessonsDashboard data={lessonsData} />
          </Card>
        ) : null;
      case "support":
        return editing || (!supportHidden && promo !== "desktopApp") ? <SupportCard always={editing} /> : null;
      case "desktopApp":
        return editing || promo === "desktopApp" ? <DesktopAppCard always={editing} /> : null;
      default:
        return null;
    }
  };

  const emptyText = (id: string) =>
    id === "lessons" ? "Shows once you have a student or a teacher." : id === "momentum" || id === "practiceGrid" ? "Shows once you're signed in." : "Nothing to show right now.";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:max-w-none lg:px-8 lg:pt-8">
        {editing ? (
          <div className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 flex flex-wrap items-center gap-3 rounded-lg ring-1 ring-foreground/[0.06] bg-surface p-3 pl-4 shadow-lg lg:top-4">
            <PencilIcon className="h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Editing your dashboard</p>
              <p className="text-xs text-muted">Drag a card to move it, change its size, or take it off. Add more at the bottom.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setConfirmReset(true)} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover">
                Reset
              </button>
              <button type="button" onClick={finishEditing} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
                Done
              </button>
            </div>
          </div>
        ) : (
          <header className="flex flex-col gap-4 border-b border-foreground/10 pb-6 md:flex-row md:items-center md:justify-between">
            {/* The title at the same height and size as every other page's; the date under it. */}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {isAuthenticated ? `${greeting(today)}${name ? `, ${name}` : ""}` : "Your practice space"}
              </h1>
              <p className="mt-0.5 text-sm text-muted">{today ? new Date(today).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : " "}</p>
            </div>
            <div className="flex w-full items-center gap-2 md:w-auto">
              <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-foreground/[0.05] pl-3 pr-1 focus-within:ring-2 focus-within:ring-accent/40 md:w-80 md:flex-none">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter opens the top result: the first tool, else the first tune, else chart.
                    if (e.key !== "Enter") return;
                    const first =
                      toolMatches[0]?.href ??
                      (tuneMatches[0] ? tuneHref(tuneMatches[0].list, tuneMatches[0].tune.id) : chartMatches[0] ? chartHref(chartMatches[0].id) : null);
                    if (first) router.push(first);
                  }}
                  placeholder="Search tools, tunes, charts"
                  aria-label="Search tools, tunes and charts"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setEditChoice(true);
                }}
                title="Choose and arrange your cards"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover"
              >
                <PencilIcon className="h-4 w-4" /> Edit
              </button>
            </div>
          </header>
        )}

        {/* Search results: only the groups with something in them (like the menu's search), and
            one line when nothing matches at all. */}
        {q ? (
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {!toolMatches.length && !tuneMatches.length && !chartMatches.length && (
              <Card title="Search">
                <Empty>Nothing matches “{q}”.</Empty>
              </Card>
            )}
            {toolMatches.length > 0 && (
              <Card title="Tools">
                <ToolRows items={toolMatches} favorites={favorites} canStar={canStar} isDesktop={isDesktop} onToggle={toggleFavorite} />
              </Card>
            )}
            {tuneMatches.length > 0 && (
              <Card title="Your tunes">
                <div className="-mx-2 flex flex-col">
                  {tuneMatches.map(({ tune, list }) => (
                    <Link key={tune.id} href={tuneHref(list, tune.id)} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
                      <IconChip icon={NoteIcon} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{tune.name}</span>
                        <span className="block truncate text-xs text-muted">{[list === "learn" ? "To learn" : "I know", tuneSummary(tune)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
            {chartMatches.length > 0 && (
              <Card title="Your chord charts">
                <div className="-mx-2 flex flex-col">
                  {chartMatches.map((c) => (
                    <Link key={c.id} href={chartHref(c.id)} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
                      <KeyBadge label={c.key} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.title}</span>
                        <span className="block truncate text-xs text-muted">{c.composer || "Chord chart"}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <DashboardGrid
            // Outside Edit, cards that show nothing are left out and a row's hole is closed by
            // widening a card beside it (signed out, "Pick up where you left off" sat alone).
            items={editing ? layout : fillRowGaps(layout.filter((i) => available(i.id) && renderCard(i) != null))}
            editing={editing}
            onChange={(dashboard) => updateSite({ dashboard })}
            renderCard={renderCard}
            available={available}
            emptyText={emptyText}
            labelOf={(id) => (id === "favorites" && !favoriteTools.length ? "Get started" : id === "sessions" && timer ? "Practicing now" : undefined)}
          />
        )}
        {!editing && layout.every((i) => !available(i.id)) && !q && (
          <p className="rounded-lg border border-dashed border-foreground/15 p-5 text-sm text-muted">
            Your dashboard is empty. Press Edit to add cards.
          </p>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2 pb-6 text-center text-xs text-muted">
        <span>
          Made by{" "}
          <a href="https://jackmechem.dev" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
            Jack Mechem
          </a>
        </span>
        <a href="https://github.com/JackMechem/soniroll" target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">GitHub</a>
        <Link href="/" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">About</Link>
        <Link href={SUPPORT_PATH} className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">Support soniroll</Link>
        <Link href="/feedback" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">Send feedback</Link>
        <Link href="/changelog" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">What&apos;s new</Link>
        <Link href="/privacy" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">Privacy</Link>
        <Link href="/terms" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">Terms</Link>
        <Link href="/credits" className="inline-flex items-center hover:text-foreground pointer-coarse:min-h-9">Credits</Link>
      </footer>

      {confirmReset && (
        <ConfirmDialog
          title="Reset the dashboard?"
          message="Your cards go back to the default ones, in the default order and sizes."
          confirmLabel="Reset"
          onConfirm={() => {
            updateSite({ dashboard: null, hiddenCards: [] });
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}

/** A dashboard card: a bordered panel with its title (and an optional detail and link) on a header
    row above the content. `plain` has no frame of its own (for content made of its own tiles). */
function Card({
  title,
  detail,
  action,
  tone = "surface",
  children,
}: {
  title: string;
  detail?: string;
  action?: { label: string; href: string };
  tone?: "surface" | "plain";
  children: ReactNode;
}) {
  const plain = tone === "plain";
  // In Edit, the card's frame shows its name: leave the title row out so it isn't there twice.
  const inEditFrame = useContext(DashboardEditingContext);
  return (
    <section className={`flex h-full min-w-0 flex-col ${plain ? "gap-3" : "overflow-hidden rounded-lg bg-surface"}`}>
      <div className={`flex min-w-0 items-center gap-2 ${plain ? "px-1" : "h-11 shrink-0 px-4"} ${inEditFrame ? "hidden" : ""}`}>
        <h2 className="shrink-0 text-sm font-medium">{title}</h2>
        {detail && <span className="truncate text-xs text-muted">{detail}</span>}
        {action && (
          <Link href={action.href} className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-muted transition-colors hover:text-foreground">
            {action.label === "New" && <PlusIcon className="h-3.5 w-3.5" />}
            {action.label}
            {action.label !== "New" && <ChevronRightIcon className="h-3.5 w-3.5" />}
          </Link>
        )}
      </div>
      <div className={`flex flex-1 flex-col gap-4 ${plain ? "" : "p-4"}`}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

function Chip({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={`rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs font-medium ${muted ? "text-muted" : "text-foreground"}`}>{children}</span>;
}

function IconChip({ icon: I }: { icon: Icon }) {
  return (
    <I className="h-4 w-4 shrink-0 text-muted" />
  );
}

function StatRow({ icon, label, value, href, detail }: { icon: Icon; label: string; value: number; href: string; detail?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
      <IconChip icon={icon} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {detail && <span className="truncate text-xs text-muted">{detail}</span>}
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted">{value}</span>
    </Link>
  );
}

function Star({ label, favorited, onToggle, small }: { label: string; favorited: boolean; onToggle: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={favorited ? `Unfavorite ${label}` : `Favorite ${label}`}
      aria-pressed={favorited}
      className={`flex shrink-0 items-center justify-center rounded-md hover:bg-surface-hover ${small ? "h-7 w-7" : "h-8 w-8"} ${favorited ? "text-foreground/70" : "text-muted hover:text-foreground"}`}
    >
      <StarIcon className={small ? "h-3.5 w-3.5" : "h-4 w-4"} filled={favorited} />
    </button>
  );
}

/** A card for a favorite (or starter) tool: icon, name, what it does. On phones it's a slim row
    (icon and name, no description), so Today's practice isn't pushed far down. */
function ToolTile({ item, favorited, canStar, onToggle }: { item: ToolLink; favorited: boolean; canStar: boolean; onToggle: () => void }) {
  return (
    <div className="relative h-full">
      <Link
        href={item.href}
        className="group flex h-full items-start gap-3 rounded-md bg-foreground/[0.05] p-3 transition-colors hover:bg-surface-hover/40 max-sm:items-center max-sm:py-2.5"
      >
        <span data-nav-icon className="mt-0.5 flex shrink-0 max-sm:mt-0" style={{ color: CATEGORY_COLORS[item.category] }}>
          <item.icon className="h-4 w-4" />
        </span>
        <span className={`min-w-0 flex-1 ${canStar ? "pr-6" : ""}`}>
          <span className="block truncate text-sm font-medium">{item.label}</span>
          {item.description && <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted max-sm:hidden">{item.description}</span>}
        </span>
      </Link>
      {canStar && (
        <div className="absolute right-1.5 top-1.5 max-sm:top-1/2 max-sm:-translate-y-1/2">
          <Star small label={item.label} favorited={favorited} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

/** Compact tool rows for the launcher and search results: icon, name, a ☆ to favorite (signed in). */
function ToolRows({ items, favorites, canStar, isDesktop, onToggle }: { items: ToolLink[]; favorites: string[]; canStar: boolean; isDesktop: boolean; onToggle: (href: string) => void }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const disabled = !!item.desktopOnly && !isDesktop;
        return (
          <div key={item.href} className={`group flex items-center rounded-md ${disabled ? "opacity-50" : "hover:bg-surface-hover"}`}>
            {disabled ? (
              <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-sm" title="Desktop only">
                <span data-nav-icon className="flex shrink-0" style={{ color: CATEGORY_COLORS[item.category] }}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="truncate">{item.label}</span>
              </span>
            ) : (
              <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-sm">
                <span data-nav-icon className="flex shrink-0" style={{ color: CATEGORY_COLORS[item.category] }}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            )}
            {canStar && (
              <span className={favorites.includes(item.href) ? "" : "opacity-0 group-hover:opacity-100 max-lg:opacity-100"}>
                <Star small label={item.label} favorited={favorites.includes(item.href)} onToggle={() => onToggle(item.href)} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

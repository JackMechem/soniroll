"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { FlameIcon, SHARE_PROGRESS_EVENT } from "@/components/practicelog/Celebrations";
import { useDayTimerMs } from "@/components/practicelog/DayTimer";
import StatsDialog from "@/components/practicelog/StatsDialog";
import GoalDialog from "@/components/practicelog/GoalDialog";
import ShedLogTour, { tourSeen } from "@/components/practicelog/ShedLogTour";
import TaskDialog from "@/components/practicelog/TaskDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { DayView, MonthView, WeekView } from "@/components/practicelog/Calendar";
import DayPanel from "@/components/practicelog/DayPanel";
import { HelpIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon, PlusIcon, ShareIcon, SlidersIcon, SpeakerIcon } from "@/components/tools";
import { ChartIcon } from "@/components/practicelog/RoutineIcon";
import {
  type DayTask,
  type PracticeLogData,
  type ProgressCardKind,
  MONTH_NAMES,
  WEEKDAY_SHORT,
  newDayTask,
  addDays,
  addMonths,
  formatShortDate,
  fromDateKey,
  goalOn,
  isDateKey,
  minutesOn,
  monthGrid,
  startOfWeek,
  streak,
  todayKey,
} from "@/lib/practiceLog";
import { recordingsApi } from "@/lib/recordings";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { useSiteSettings } from "@/lib/siteSettings";
import { usePracticeLog } from "@/lib/usePracticeLog";

export const VIEW_KEY = "jam-practice-practice-log-view";
export const VIEW_DEFAULTS = { view: "month" as "month" | "week" | "day", showStats: true, dayWidth: 448, dayHidden: false };
const DAY_MIN = 300;
const DAY_DEFAULT = 448;
const noopSubscribe = () => () => {};

/** A small target, for "Daily goal". */
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-muted" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * The Shed Log — a calendar for planning and logging practice. Routines (lists of tasks, each
 * with minutes and optionally a time) repeat on a schedule; on each day you check tasks off — or
 * run the routine on the Practice Timer, which checks them off as each one finishes — write
 * notes, attach tunes / setlists / charts / tools, and record clips (on the day, or on one of its
 * routines). Plain Practice Timer sessions are logged on the day they ran, too.
 */
export default function PracticeLog({ initialDate }: { initialDate?: string }) {
  const log = usePracticeLog();
  const { data, ready } = log;
  const router = useRouter();
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [newTask, setNewTask] = useState<DayTask | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  // The tour opens by itself the first time you visit (on this device).
  const [tourOpen, setTourOpen] = useState(() => typeof window !== "undefined" && !tourSeen());
  // "Share your progress" is the app-wide dialog (`PracticeLogGlobal`).
  const setSharingKind = (kind: ProgressCardKind) => window.dispatchEvent(new CustomEvent(SHARE_PROGRESS_EVENT, { detail: kind }));
  const { isAuthenticated } = useConvexAuth();
  const [{ view: lastView, dayWidth, dayHidden }, setView] = usePersistedSettings(VIEW_KEY, VIEW_DEFAULTS);
  // Settings → Shed Log picks the view it opens on ("last" = whichever you used last).
  const [{ shedLogOpenOn }] = useSiteSettings();
  const [chosenView, setChosenView] = useState<typeof lastView | null>(null);
  const view = chosenView ?? (shedLogOpenOn === "last" ? lastView : shedLogOpenOn);
  const pickView = (v: typeof lastView) => {
    setChosenView(v);
    setView({ view: v });
  };
  // The day panel's width on desktop: dragged with the handle between it and the calendar.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const shownDayWidth = dragWidth ?? dayWidth;
  const clampDay = (w: number, grid: HTMLElement | null) => {
    const max = grid ? Math.max(DAY_MIN, grid.getBoundingClientRect().width * 0.6) : 760;
    return Math.round(Math.max(DAY_MIN, Math.min(max, w)));
  };
  // "Today" is the visitor's own day, which the server can't know — so nothing date-dependent is
  // rendered until the page is running in the browser.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<string | null>(isDateKey(initialDate) ? initialDate : null);
  const today = mounted ? todayKey() : null;
  const selected = picked ?? today;

  const range = useMemo(() => {
    if (!selected) return null;
    if (view === "day") return { from: selected, to: selected };
    if (view === "week") {
      const from = startOfWeek(selected);
      return { from, to: addDays(from, 6) };
    }
    const d = fromDateKey(selected);
    const grid = monthGrid(d.getFullYear(), d.getMonth());
    return { from: grid[0], to: grid[grid.length - 1] };
  }, [selected, view]);
  const recordings = useQuery(recordingsApi.listForLogRange, isAuthenticated && range ? range : "skip");
  const clipsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recordings ?? []) if (r.logDate) m.set(r.logDate, (m.get(r.logDate) ?? 0) + 1);
    return m;
  }, [recordings]);

  if (!selected || !today) {
    return (
      <Shell>
        <LoadingSpinner />
      </Shell>
    );
  }

  const d = fromDateKey(selected);

  const title =
    view === "month"
      ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      : view === "day"
        ? (
            // "Oct 19" on a phone, "Mon, Oct 19" from sm.
            <>
              <span className="hidden sm:inline">{WEEKDAY_SHORT[d.getDay()]}, </span>
              {formatShortDate(selected)}
              {d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ""}
            </>
          )
        : (() => {
          const from = startOfWeek(selected);
          const to = addDays(from, 6);
          // "Oct 18 – 24" within a month, so it fits on a phone.
          const sameMonth = fromDateKey(from).getMonth() === fromDateKey(to).getMonth();
          return `${formatShortDate(from)} – ${sameMonth ? fromDateKey(to).getDate() : formatShortDate(to)}${fromDateKey(to).getFullYear() !== new Date().getFullYear() ? `, ${fromDateKey(to).getFullYear()}` : ""}`;
        })();
  const step = (n: number) => setPicked(view === "month" ? addMonths(selected, n) : addDays(selected, (view === "day" ? 1 : 7) * n));
  const unit = view === "month" ? "month" : view === "day" ? "day" : "week";
  const viewSwitch = (
    <div className="w-[10.5rem] shrink-0 sm:w-56">
      <Segmented
        label="Calendar view"
        onPage
        value={view}
        onChange={pickView}
        options={[
          { value: "month", label: "Month" },
          { value: "week", label: "Week" },
          { value: "day", label: "Day" },
        ]}
      />
    </div>
  );
  const todayButton = selected !== today && (
    <button type="button" onClick={() => setPicked(today)} className="h-8 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover">
      Today
    </button>
  );

  return (
    <Shell>
      {/* The title with today's goal and streak in one line under it, and the actions on the right
          (on phones they wrap under the title). The full stats are behind Stats. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-foreground/10 pb-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
            <span className="truncate">Shed Log</span>
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              aria-label="How the Shed Log works"
              title="How the Shed Log works"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <HelpIcon className="h-4 w-4" />
            </button>
          </h1>
          <TodaySummary data={data} today={today} onGoal={() => setGoalOpen(true)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStatsOpen(true)} className={SECONDARY}>
            <ChartIcon className="h-4 w-4 text-muted" /> Stats
          </button>
          <button type="button" onClick={() => setSharingKind("year")} title="Share progress" aria-label="Share progress" className={SECONDARY}>
            <ShareIcon className="h-4 w-4 text-muted" /> <span className="hidden sm:inline">Share</span>
          </button>
          <Link href="/shed-log/routines" title="Routines" className={SECONDARY}>
            <ListIcon className="h-4 w-4 text-muted" /> Routines
            {data.routines.length > 0 && <span className="tabular-nums text-muted">{data.routines.length}</span>}
          </Link>
          <button
            type="button"
            aria-label="Shed Log settings"
            title="Settings"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setAddMenu({
                x: Math.max(8, r.right - 208),
                y: r.bottom + 6,
                items: [
                  { label: "Daily goal…", icon: <TargetIcon />, onSelect: () => setGoalOpen(true) },
                  { label: data.prefs.sounds ? "Sounds: on" : "Sounds: off", icon: <SpeakerIcon className={`h-4 w-4 ${data.prefs.sounds ? "text-foreground" : "text-muted"}`} />, onSelect: () => log.setPrefs({ sounds: !data.prefs.sounds }) },
                ],
              });
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <SlidersIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Add a task or routine"
            title="Add a task or routine"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setAddMenu({
                x: Math.max(8, r.right - 208),
                y: r.bottom + 6,
                items: [
                  { label: `Task on ${selected === today ? "today" : formatShortDate(selected)}`, onSelect: () => setNewTask(newDayTask()) },
                  { label: "Routine", onSelect: () => router.push(`/shed-log/routine/edit?date=${selected}`) },
                ],
              });
            }}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" /> New
          </button>
        </div>
      </div>

      {/* Desktop: the page is the window's height — the day (left) scrolls on its own, the calendar
          (right) fills the rest; the page itself only scrolls if the window's too short for it. */}
      <div
        className={`grid items-start gap-6 lg:min-h-[28rem] lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-0 ${dayHidden ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[var(--day-w)_1.5rem_minmax(0,1fr)]"}`}
        style={{ "--day-w": `${shownDayWidth}px` } as React.CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-3 lg:order-3 lg:min-h-0">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Desktop: fold the day panel away so the calendar gets the whole width. */}
            <button
              type="button"
              onClick={() => setView({ dayHidden: !dayHidden })}
              aria-label={dayHidden ? "Show the day panel" : "Hide the day panel"}
              aria-pressed={!dayHidden}
              title={dayHidden ? "Show the day panel" : "Hide the day panel"}
              className="mr-1 hidden rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground lg:flex"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <path d="M9 4v16" />
                <path d={dayHidden ? "m13 10 2 2-2 2" : "m15 10-2 2 2 2"} />
              </svg>
            </button>
            <button type="button" onClick={() => step(-1)} aria-label={`Previous ${unit}`} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label={`Next ${unit}`} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
              <ChevronRightIcon className="h-5 w-5" />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{title}</h2>
            {todayButton}
            {viewSwitch}
          </div>
          {view === "month" ? (
            <MonthView year={d.getFullYear()} month={d.getMonth()} data={data} selected={selected} onSelect={setPicked} clipsByDate={clipsByDate} />
          ) : view === "day" ? (
            <DayView
              log={log}
              date={selected}
              onSelect={setPicked}
              onAddTask={(date, time) => {
                setPicked(date);
                setNewTask({ ...newDayTask(), time });
              }}
            />
          ) : (
            <WeekView
              log={log}
              selected={selected}
              onSelect={setPicked}
              onStep={step}
              onOpenDay={(date) => {
                setPicked(date);
                pickView("day");
              }}
              onAddTask={(date, time) => {
                setPicked(date);
                setNewTask({ ...newDayTask(), time });
              }}
            />
          )}
          {!ready && <LoadingSpinner size="sm" label="Loading your log" showLabel />}
        </div>
        <div className={`min-w-0 lg:order-1 lg:-mr-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2 ${dayHidden ? "lg:hidden" : ""}`}>
          <DayPanel date={selected} log={log} recordings={recordings} onDateChange={setPicked} />
        </div>
        {/* Drag to resize the day panel; double-click to reset; arrow keys too. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the day panel"
          aria-valuenow={shownDayWidth}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragWidth(dayWidth);
          }}
          onPointerMove={(e) => {
            if (dragWidth === null) return;
            const grid = e.currentTarget.parentElement;
            const left = grid?.getBoundingClientRect().left ?? 0;
            setDragWidth(clampDay(e.clientX - left - 12, grid));
          }}
          onPointerUp={() => {
            if (dragWidth !== null) setView({ dayWidth: dragWidth });
            setDragWidth(null);
          }}
          onPointerCancel={() => setDragWidth(null)}
          onDoubleClick={() => setView({ dayWidth: DAY_DEFAULT })}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setView({ dayWidth: clampDay(dayWidth + (e.key === "ArrowLeft" ? -24 : 24), e.currentTarget.parentElement) });
          }}
          className={`group order-2 hidden cursor-col-resize touch-none items-center justify-center outline-none ${dayHidden ? "" : "lg:flex"}`}
        >
          <span className={`flex h-full w-px items-center justify-center transition-colors group-hover:bg-accent group-focus-visible:bg-accent ${dragWidth !== null ? "bg-accent" : "bg-foreground/10"}`} />
        </div>
      </div>
      {addMenu && <ContextMenu menu={addMenu} onClose={() => setAddMenu(null)} />}
      {tourOpen && <ShedLogTour onClose={() => setTourOpen(false)} />}
      {goalOpen && <GoalDialog data={data} onSave={log.setPrefs} onClose={() => setGoalOpen(false)} />}
      {statsOpen && (
        <StatsDialog
          data={data}
          today={today}
          onPrefs={log.setPrefs}
          onShare={(kind) => {
            setStatsOpen(false);
            setSharingKind(kind);
          }}
          onClose={() => setStatsOpen(false)}
        />
      )}
      {newTask && (
        <TaskDialog
          initial={newTask}
          date={selected}
          isNew
          onSave={(task, to) => {
            log.saveDayTask(to, task);
            setPicked(to);
          }}
          onClose={() => setNewTask(null)}
        />
      )}
    </Shell>
  );
}

const SECONDARY = "flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover";

/** One quiet line under the title: today's minutes against the goal (a thin bar; press it to
    change the goal) and the streak. */
function TodaySummary({ data, today, onGoal }: { data: PracticeLogData; today: string; onGoal: () => void }) {
  const watch = useDayTimerMs(data, today);
  const minutes = Math.round(minutesOn(data, today, watch.liveMs));
  const goal = goalOn(data, today);
  const met = goal > 0 && minutes >= goal;
  const s = streak(data, today);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <button type="button" onClick={onGoal} title="Today's goal — change it" className="flex items-center gap-2 rounded-sm hover:text-foreground">
        {goal > 0 && (
          <span className="h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
            <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (minutes / goal) * 100)}%`, background: met ? "#22c55e" : "var(--accent)" }} />
          </span>
        )}
        <span className="tabular-nums">
          {goal > 0 ? `${minutes} of ${goal} min today` : `${minutes} min today`}
          {met && " · goal met"}
        </span>
      </button>
      <span className="flex items-center gap-1 tabular-nums" title={s > 0 ? `${s}-day streak` : "Practice today to start a streak"}>
        <FlameIcon className={`h-3.5 w-3.5 ${minutes > 0 && s > 0 ? "text-orange-500" : ""}`} />
        {s}-day streak
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex w-full flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:h-full lg:px-8 lg:pb-6 lg:pt-8">{children}</main>
  );
}


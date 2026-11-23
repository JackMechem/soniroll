"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { RemainingLabel } from "@/components/RemainingLabel";
import { TOUCH_HIT } from "@/components/SettingsBar";
import { PauseIcon, PlayIcon, SkipForwardIcon, StopIcon, StopwatchIcon } from "@/components/tools";
import RoutineIcon from "@/components/practicelog/RoutineIcon";
import { useNowPracticing, useOpenNowPracticing } from "@/components/practicelog/NowPracticing";
import {
  getServerSnapshot,
  getSnapshot,
  pause,
  resume,
  skip,
  stop,
  subscribe,
} from "@/lib/practiceTimerEngine";

/** A small round icon button for the widget's control row — kept local since its sizing/style is
    specific to sitting inline in this compact a space (the tool page's own transport buttons are
    much bigger, with text labels). */
function ControlButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // This sits inside a link-containing card (a sibling of the <Link>, not nested inside
        // it — a button nested in an anchor is invalid HTML), but the click could still bubble
        // to something that treats it as "open the tool" if this were ever nested differently
        // later; stopping propagation here is cheap insurance either way.
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-hover ${
        danger ? "text-danger" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** The "what's running right now" glimpse shown outside the Practice Timer tool itself while a
    session is running — a compact card in the desktop sidebar footer (full width; the collapsed
    width and the phone top bar's chip both stay a plain link, with no room for controls) or the
    mobile menu's own footer (the same full-width card, since it shares this same code path).
    Renders nothing at all while no session is running. The title/time area is still a link back
    to the tool page for the full view; the control row below it — pause/resume, skip (also what
    dismisses an active alarm), stop — are real `<button>`s and siblings of that `<Link>`, not
    nested inside it (invalid HTML, breaks click handling), so clicking a control never also
    navigates.

    `bar`: the phone top bar's chip (`Sidebar`), in the bar's row just before the bug button.

    Running a Shed Log routine, the step's name opens its task's page in the side view (its notes,
    files and recordings), not the Practice Timer — the same as the header's "now practicing" pill
    (`components/practicelog/NowPracticing.tsx`). On a phone, with nothing running, the chip is the
    next task today (just its routine's icon, to keep the bar's room for the page name). */
export default function PracticeTimerWidget({
  collapsed,
  bar,
}: {
  collapsed?: boolean;
  bar?: boolean;
}) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();
  const now = useNowPracticing();
  const openNow = useOpenNowPracticing();
  // A routine's step: its task page (else the Practice Timer).
  const taskHref = now?.running && now.href !== "/practice-timer" ? now.href : null;
  const openTask = (e: React.MouseEvent) => {
    if (!taskHref) return;
    e.preventDefault();
    openNow(taskHref);
  };
  if (!state) {
    if (!bar || !now || now.running || pathname.startsWith("/shed-log")) return null;
    return (
      <button
        type="button"
        onClick={() => openNow(now.href)}
        aria-label={`Next up today: ${now.routine ? `${now.routine} · ` : ""}${now.title}`}
        title={`Next: ${now.title}`}
        className={`${TOUCH_HIT} flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.05] lg:hidden`}
      >
        {now.color !== null ? <RoutineIcon icon={now.icon} color={now.color} size="xs" /> : <StopwatchIcon className="h-4 w-4 text-muted" />}
      </button>
    );
  }
  // The phone's top-bar chip would only repeat the big timer on the tool's own page.
  if (bar && pathname === "/practice-timer") return null;

  const remaining = (
    <RemainingLabel
      startedAt={state.startedAt}
      durationMs={state.durationMs}
      paused={state.paused}
      remainingMsAtPause={state.remainingMsAtPause}
      alarming={state.alarming}
    />
  );

  if (bar) {
    // The stopwatch and the time left (on a phone the step's name is in the label and on the
    // tool page, so the page name beside it keeps its room; a wider screen has room for it).
    return (
      <Link
        href={taskHref ?? "/practice-timer"}
        onClick={openTask}
        aria-label={`${state.alarming ? "Time's up" : taskHref ? "Now practicing" : "Practice Timer"}: ${state.current.title}`}
        title={state.current.title}
        className={`${TOUCH_HIT} flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 text-xs font-medium lg:hidden ${
          state.alarming ? "animate-pulse text-danger" : "text-foreground"
        }`}
      >
        <StopwatchIcon className={`h-4 w-4 shrink-0 ${state.alarming ? "" : "text-accent"}`} />
        <span className="hidden max-w-[10rem] truncate sm:inline">{state.current.title}</span>
        {state.alarming ? <span className="whitespace-nowrap">Time&apos;s up</span> : remaining}
      </Link>
    );
  }

  if (collapsed) {
    return (
      <Link
        href="/practice-timer"
        title={`${state.alarming ? "Time's up — " : ""}${state.current.title}${
          state.next ? ` — next: ${state.next.title}` : ""
        }`}
        className={`flex items-center justify-center rounded-xl py-2 transition-colors hover:bg-surface-hover ${
          state.alarming ? "animate-pulse text-danger" : "text-accent"
        }`}
      >
        <StopwatchIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-background px-3 py-2 text-xs">
      <Link
        href={taskHref ?? "/practice-timer"}
        onClick={openTask}
        title={taskHref ? `${now?.routine ? `${now.routine} · ` : ""}${state.current.title}: open it beside the page` : undefined}
        className="flex items-center gap-2 font-medium text-foreground transition-colors hover:text-accent"
      >
        <StopwatchIcon
          className={`h-4 w-4 shrink-0 ${state.alarming ? "animate-pulse text-danger" : "text-accent"}`}
        />
        <span className="truncate">{state.current.title}</span>
        <span className={`ml-auto ${state.alarming ? "font-semibold text-danger" : "text-muted"}`}>
          {remaining}
        </span>
      </Link>
      {state.alarming ? (
        <p className="pl-6 font-semibold text-danger">Time&apos;s up!</p>
      ) : (
        state.next && <p className="truncate pl-6 text-muted">Next: {state.next.title}</p>
      )}
      <div className="flex items-center gap-0.5 pl-6">
        {state.alarming ? (
          <ControlButton onClick={skip} label="Continue to next segment">
            <PlayIcon className="h-3.5 w-3.5" />
          </ControlButton>
        ) : (
          <>
            <ControlButton
              onClick={state.paused ? resume : pause}
              label={state.paused ? "Resume" : "Pause"}
            >
              {state.paused ? (
                <PlayIcon className="h-3.5 w-3.5" />
              ) : (
                <PauseIcon className="h-3.5 w-3.5" />
              )}
            </ControlButton>
            {state.next && (
              <ControlButton onClick={skip} label="Skip to next segment">
                <SkipForwardIcon className="h-3.5 w-3.5" />
              </ControlButton>
            )}
          </>
        )}
        <ControlButton onClick={stop} label="Stop" danger>
          <StopIcon className="h-3.5 w-3.5" />
        </ControlButton>
      </div>
    </div>
  );
}

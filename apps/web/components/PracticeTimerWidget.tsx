"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { PauseIcon, PlayIcon, SkipForwardIcon, StopIcon, StopwatchIcon } from "@/components/tools";
import { formatClock } from "@/lib/practiceTimer";
import {
  getServerSnapshot,
  getSnapshot,
  pause,
  resume,
  skip,
  stop,
  subscribe,
} from "@/lib/practiceTimerEngine";

/** A ticking "M:SS" readout for a running (or frozen-while-paused/alarming) Practice Timer step.
    Writes straight to the DOM via rAF rather than React state, same reasoning as CountdownLabel —
    a once-a-second-or-faster text update shouldn't re-render the whole sidebar. Computes off
    Date.now() directly, and formats via the same `formatClock` the tool page's own
    `PracticeTimerRing` uses, so the two can never show different numbers for the same step. */
function RemainingLabel({
  startedAt,
  durationMs,
  paused,
  remainingMsAtPause,
  alarming,
}: {
  startedAt: number;
  durationMs: number;
  paused: boolean;
  remainingMsAtPause: number | null;
  alarming: boolean;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (alarming) {
      if (spanRef.current) spanRef.current.textContent = formatClock(0);
      return;
    }
    if (paused) {
      if (spanRef.current) spanRef.current.textContent = formatClock(remainingMsAtPause ?? 0);
      return;
    }
    let frame = 0;
    const tick = () => {
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      if (spanRef.current) spanRef.current.textContent = formatClock(remaining);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, durationMs, paused, remainingMsAtPause, alarming]);

  return <span className="shrink-0 tabular-nums" ref={spanRef} />;
}

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
    width and the mobile top-right badge both stay a plain link, with no room for controls) or the
    mobile menu's own footer (the same full-width card, since it shares this same code path).
    Renders nothing at all while no session is running. The title/time area is still a link back
    to the tool page for the full view; the control row below it — pause/resume, skip (also what
    dismisses an active alarm), stop — are real `<button>`s and siblings of that `<Link>`, not
    nested inside it (invalid HTML, breaks click handling), so clicking a control never also
    navigates. */
export default function PracticeTimerWidget({
  collapsed,
  mobile,
}: {
  collapsed?: boolean;
  mobile?: boolean;
}) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!state) return null;

  const remaining = (
    <RemainingLabel
      startedAt={state.startedAt}
      durationMs={state.durationMs}
      paused={state.paused}
      remainingMsAtPause={state.remainingMsAtPause}
      alarming={state.alarming}
    />
  );

  if (mobile) {
    return (
      <Link
        href="/practice-timer"
        aria-label={`Practice Timer running: ${state.current.title}`}
        className={`fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-8 max-w-[55vw] items-center gap-1.5 rounded-md bg-surface px-2.5 text-xs font-medium lg:hidden ${
          state.alarming ? "animate-pulse text-danger" : "text-foreground"
        }`}
      >
        <StopwatchIcon className={`h-4 w-4 shrink-0 ${state.alarming ? "" : "text-accent"}`} />
        <span className="truncate">{state.alarming ? "Time's up!" : state.current.title}</span>
        {remaining}
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
        href="/practice-timer"
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
            <ControlButton onClick={skip} label="Skip to next segment">
              <SkipForwardIcon className="h-3.5 w-3.5" />
            </ControlButton>
          </>
        )}
        <ControlButton onClick={stop} label="Stop" danger>
          <StopIcon className="h-3.5 w-3.5" />
        </ControlButton>
      </div>
    </div>
  );
}

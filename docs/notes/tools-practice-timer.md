<!-- Moved word for word from the old single PROJECT.md (lines 4128–4224) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

- **Practice Timer** (`components/PracticeTimer.tsx`, `lib/practiceTimer.ts`,
  `lib/practiceTimerEngine.ts`) — chains named timers back to back (e.g. "10 min scales, 5 min
  break, 10 min tune"), or runs a configurable Pomodoro (work/short break/long break minutes,
  cycles before a long break, and either a fixed total number of work cycles or "keep going
  indefinitely", mirroring Jam Practice's own toggle of that name). Work cycles can each have
  their own name (`PomodoroConfig.workTitles: string[]`, editable as an ordered add/remove/
  reorder list in the editor, same shape as a custom session's segment list) — e.g.
  `["Scales", "Chords", "Improv"]` names cycle 1 "Scales", cycle 2 "Chords", cycle 3 "Improv",
  cycle 4 back to "Scales", wrapping via modulo so it works for an indefinite session too (no
  fixed cycle count to size the list to) and for any totalCycles/list-length mismatch; an empty
  list, or a blank entry in it, falls back to plain "Work" for that cycle. Breaks are deliberately
  **not** individually nameable — just the fixed "Short break"/"Long break" labels — per an
  explicit follow-up request narrowing this down from an earlier version that made all three step
  kinds nameable. `lib/practiceTimer.ts` is pure
  session-shape logic with no engine/UI concerns: a `PracticeSession` is a discriminated union
  (`type: "custom"` with a `Segment[]`, or `type: "pomodoro"` with a `PomodoroConfig`), and
  `stepAt(session, index)` is the one function both the engine and the UI call to ask "what's step
  N" — for Pomodoro this lazily expands the work/break pattern (`pomodoroStepAt`) rather than ever
  materializing a real array, since an indefinite Pomodoro has no fixed length.
  `lib/practiceTimerEngine.ts` is a self-contained, module-level-state JS engine — same shape as
  `lib/clickEngine.ts`, not tied to any component's lifecycle — exposed via a `subscribe`/
  `getSnapshot` pair so any component (the tool page, the sidebar widget, the mobile badge) can be
  an independent `useSyncExternalStore` view onto one shared running timer, none of them
  responsible for keeping it alive. It's also the first timer in this codebase built to survive an
  actual page reload, not just a re-render: `startedAt` is wall-clock (`Date.now()`), not
  `performance.now()` like every other timer/ring here, and the whole state round-trips through
  `localStorage` (`jam-practice-timer-running`) so `ensureInitialized()` can restore it on the next
  load — paused restores frozen as-is; a still-running step restores and reschedules against
  however much time is actually left; a step whose time had already fully elapsed while the tab
  was closed advances exactly one step fresh (no chime, no attempt to simulate/cascade through
  every step that might have silently elapsed for a long-closed tab). `components/
  PracticeTimerRing.tsx` is the tool page's own countdown ring + "M:SS" label — deliberately
  **not** built on the shared `CountdownRing`/`CountdownLabel` (hardcoded to `performance.now()`,
  the page-load-relative clock every other timer here uses); an earlier version of this component
  converted into `performance.now()` terms via `performance.timeOrigin` specifically to reuse
  those shared components without modifying them, but that produced a running-timer display that
  didn't match the sidebar widget's own (correct) reading of the same segment — diagnosed as a bug
  in that conversion rather than chasing it further, since this sandbox has no browser to actually
  debug a `performance.timeOrigin` mismatch in. Replaced with a small self-contained component
  that computes straight off `Date.now()` — the exact same clock `lib/practiceTimerEngine.ts`
  itself and `PracticeTimerWidget.tsx` already use — and formats via the shared `formatClock`
  (`lib/practiceTimer.ts`, "M:SS", e.g. "24:59" — not `formatMinutes`, which is for a *static*
  duration label like "10 min", not a ticking countdown), so the tool page and the sidebar/mobile
  widget literally cannot show two different numbers for the same running step anymore, and a long
  segment reads as minutes:seconds instead of a raw, hard-to-parse second count. While paused, it
  freezes at `remainingMsAtPause` instead of the live tick. `components/PracticeTimerWidget.tsx` is
  the "what's running right now" glimpse shown outside the tool itself while a session is active —
  a card in the desktop sidebar footer (both its full and collapsed widths,
  `components/Sidebar.tsx`), the same card again in the mobile menu's own footer (shares the same
  code path as the desktop one), or a fixed top-right badge on mobile mirroring the hamburger
  button's top-left placement (`app/layout.tsx`); renders nothing while nothing's running. The
  full-width card (desktop sidebar and the mobile menu, not the collapsed sidebar or the top-right
  badge — no room for controls in either of those) has its own pause/resume, skip, and stop
  buttons, real `<button>`s as siblings of the card's own `<Link>` rather than nested inside it (a
  button inside an anchor is invalid HTML and breaks click handling) — added per a direct follow-up
  request to control a running session from the sidebar, not just glance at it.

  **Alarm mode and full-screen alerts** (the `practice-timer-sound-settings` synced object's
  `alarmMode`/`fullScreenAlert`, alongside the existing `soundEnabled`/`toneId`): by default, a
  segment ending plays one transition chime and the engine auto-advances silently underneath,
  unchanged from before. With alarm mode on, the engine instead holds — `EngineState.alarming:
  true` — repeating that same chime every 1.5s (`lib/practiceTimerEngine.ts`'s
  `startAlarmSound`/`ALARM_REPEAT_MS`) until `skip()` is called (dismiss and move on — the exact
  same function as a normal manual skip) or `stop()` ends the run outright; `pause()`/`resume()`
  are no-ops while alarming, since there's nothing actively counting down to pause. Every
  Practice-Timer-aware surface reflects `alarming`: the tool page's own controls swap to
  Continue/Stop (no Pause, no plain Skip) and `PracticeTimerRing` paints fully drained and pulses
  in the danger color instead of ticking; the sidebar widget shows "Time's up!" with the same
  Continue/Stop pair; and — only while `fullScreenAlert` is also on — `components/
  PracticeTimerAlert.tsx`, mounted once in `app/layout.tsx` (so it interrupts you app-wide, not
  just on the tool page), shows a full-screen takeover with the same Continue/Stop choice,
  deliberately **not** dismissible via Escape or a backdrop click the way `ConfirmDialog` is — this
  is meant to be genuinely sticky, like a real alarm clock, until an actual choice is made.
  `fullScreenAlert` only does anything while `alarmMode` is also on (there's no "held, waiting"
  moment to interrupt for otherwise — without alarm mode the engine has already silently advanced
  by the time anything could show), so its own `SwitchRow` is disabled whenever `alarmMode` is off,
  and turning `alarmMode` off forces it back off too rather than leaving it toggled-on-but-dormant.
  Restoring from a reload (`ensureInitialized()`) treats "was already alarming" and "alarm-mode
  time elapsed while the tab was closed" as the same case — both restore straight into
  `alarming: true` on the *same* step, never silently advancing past it the way non-alarm-mode
  restores do; no sound autoplay on that restore either, same reasoning as the existing
  chime-after-restore skip (a browser would very likely block an unprompted autoplay with no user
  gesture anyway). Verified with a synthetic script driving the engine's alarm state machine
  directly (holds on `alarming` instead of auto-advancing, stays held indefinitely rather than only
  once, `skip()` dismisses and advances, `stop()` ends cleanly from an alarming state, and
  `alarmMode: false` is completely behaviorally unchanged) plus two new restore-from-storage cases
  (elapsed-while-away-with-alarm-mode-on, and already-alarming) alongside the existing ones.

  Saved sessions sync per Jack's explicit call on how sophisticated this should be: signed
  out, they live in `localStorage` via `lib/practiceSessionsStore.ts` (the same hand-rolled
  external-store shape as `lib/tunesStore.ts`); signed in, `lib/usePracticeSessions.ts` reads/
  writes the `practiceSessions` Convex table instead (`convex/practiceSessions.ts`) — **with no
  merge at all**: signing in simply stops consulting local storage, it doesn't import, offer a
  choice, or look at what's already there. Both `useConvexAuth()` and the Convex/local-store hooks
  in `usePracticeSessions` run unconditionally on every render regardless of sign-in state, per
  rules-of-hooks; only the returned `sessions`/mutators branch on it, same pattern as
  `AccountPage.tsx`.

## 2026-11-22 — A step's tool opens when the step starts (Practice Timer and Shed Log)

Jack: "if a task has a tool attached to it, the tool will automatically open when the task starts",
in both the Practice Timer and the Shed Log.

- **`Segment.tool`** (optional href, `packages/core/practiceTimer.ts`), carried into `RunSegment.tool`
  by `stepAt`. Saved sessions keep it: the Convex `practiceSessions` segment validator and the
  schema have `tool: v.optional(v.string())` (pushed to dev; prod gets it with the next production
  deploy). Pomodoro steps never have one.
- **Practice Timer editor:** each step has a tool picker under its name and minutes ("No tool", then
  the same tools the Shed Log lets you attach, minus the timer itself). Steps are spaced a little
  further apart (`gap-4`) so each step's two lines read as one.
- **Shed Log:** `startRoutine` and `startDayTasks` (`lib/usePracticeLog.ts`) give each step the
  task's **first** attached tool (`taskTool`).
- **Opening it:** `loadStep` in `lib/practiceTimerEngine.ts` fires `STEP_TOOL_EVENT` on `window`
  when a step with a tool starts live (start, skip, auto-advance, Continue after an alarm), never when
  a run is restored on page load (`chime: false`), so reloading or opening another page mid-step
  doesn't jump back. `lib/useOpenStepTools.ts` listens and `router.push`es the tool (through
  `findToolLink`, so a retired href goes to the tool it became), unless you're already on it. It's
  mounted in `PracticeTimerAlert`, which both `app/layout.tsx` and the desktop `main.tsx` mount
  (the desktop app has no `AppShell`). In split screen the push retargets the active pane, like a
  sidebar link.
- **Turning it off:** Practice Timer → **Tools** chip → "Open each step's tool" (`openTools`, on by
  default, in the synced sound settings the Shed Log's runs already share).
- Help: the Practice Timer's options and the Shed Log's attachments line say so.

Verified: `tsc` (web, mobile, desktop, convex), eslint, `convex dev --once`. Headless Chromium:
Practice Timer signed out, a two-step draft (no tool, then Metronome): Start now stayed on the timer,
skipping opened `/metronome`, reload stayed put; editor at 1440 and 390, no overflow. Signed in (a
throwaway `.test` account, deleted afterwards): a Shed Log extra task with Metronome attached, timed
from the day panel, opened `/metronome`; going to `/tuner` mid-step stayed on the Tuner. Not verified:
a routine run (same mapping as day tasks), saving a session with a tool signed in (the Convex
validator), the desktop app, split screen, the mobile app (it doesn't do this).

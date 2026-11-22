/** One named, timed step in a custom session — "10 min scales", "5 min break", etc. */
export type Segment = {
  id: string;
  title: string;
  /** Decimal minutes (e.g. 2.5 = 2:30), so a single field covers both whole-minute and
      finer-grained durations without a separate seconds field. */
  minutes: number;
  /** A tool to open when this step starts (its href), if the "Open each step's tool" setting is
      on. A Shed Log task's first attached tool, when a routine runs on the timer. */
  tool?: string;
};

export type PomodoroConfig = {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** Names for successive work cycles, in order — e.g. `["Scales", "Chords", "Improv"]` gives
      cycle 1 "Scales", cycle 2 "Chords", cycle 3 "Improv", cycle 4 back to "Scales", and so on
      (wraps via modulo, so this works fine for an indefinite session too, and for a
      `totalCycles`/list-length mismatch either direction). Breaks aren't individually nameable —
      just the two fixed "Short break"/"Long break" labels — since Jack specifically only wanted
      work cycles to be nameable. An empty list, or a blank entry in it, falls back to plain
      "Work" for that cycle. */
  workTitles: string[];
  /** How many work intervals happen before a long break instead of a short one. */
  cyclesBeforeLongBreak: number;
  /** How many work cycles the session runs before stopping on its own — `null` keeps going
      indefinitely (mirrors Jam Practice's own `keepGoingIndefinitely` setting) until manually
      stopped. */
  totalCycles: number | null;
};

export type PracticeSession =
  | {
      id: string;
      name: string;
      type: "custom";
      segments: Segment[];
      updatedAt: number;
      /** Set when this run is a Shed Log routine on a day — each segment's id is then a task's
          id, and finished steps check those tasks off (`practiceLog.applyTimerEntries`). */
      link?: { routineId: string; date: string };
    }
  | { id: string; name: string; type: "pomodoro"; pomodoro: PomodoroConfig; updatedAt: number };

export const DEFAULT_POMODORO: PomodoroConfig = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  workTitles: [],
  cyclesBeforeLongBreak: 4,
  totalCycles: 4,
};

/** A single step of a running session — what's actually shown/counted down, regardless of
    whether it came from a fixed custom list or a generated Pomodoro cycle. */
export type RunSegment = {
  title: string;
  minutes: number;
  /** True for a Pomodoro break step (short or long) — lets the UI style breaks differently
      (e.g. a calmer color) without re-deriving it from the title text. */
  isBreak: boolean;
  /** The step's tool (`Segment.tool`). */
  tool?: string;
};

/** The Pomodoro step at a given 0-based index, expanding the pattern (work, break, work, break,
    ..., long break every `cyclesBeforeLongBreak`th work interval) lazily — a Pomodoro session
    with `totalCycles: null` runs forever, so this is never pre-materialized into a real array,
    only ever asked for "the step at index N" as the run advances. Returns `null` once
    `totalCycles` work intervals have all completed (session naturally over) — never `null` for
    an indefinite session. */
export function pomodoroStepAt(config: PomodoroConfig, index: number): RunSegment | null {
  const {
    workMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    workTitles,
    cyclesBeforeLongBreak,
    totalCycles,
  } = config;
  const cycle = Math.floor(index / 2) + 1; // 1-based work-interval number this step belongs to
  if (totalCycles !== null && cycle > totalCycles) return null;
  const isWorkStep = index % 2 === 0;
  if (isWorkStep) {
    // Cycles through the named list in order, wrapping around — works for an indefinite session
    // (no fixed cycle count to size the list to) and for any totalCycles/list-length mismatch.
    const rawTitle = workTitles.length > 0 ? workTitles[(cycle - 1) % workTitles.length] : "";
    return { title: rawTitle.trim() || "Work", minutes: workMinutes, isBreak: false };
  }
  const isLongBreak = cycle % cyclesBeforeLongBreak === 0;
  return isLongBreak
    ? { title: "Long break", minutes: longBreakMinutes, isBreak: true }
    : { title: "Short break", minutes: shortBreakMinutes, isBreak: true };
}

/** The step at `index` for either session type — the one function the running engine and the UI
    both call, so neither has to branch on `session.type` itself. `null` means the session is over
    (ran past the end of a custom list, or a capped Pomodoro's last cycle). */
export function stepAt(session: PracticeSession, index: number): RunSegment | null {
  if (session.type === "pomodoro") return pomodoroStepAt(session.pomodoro, index);
  const segment = session.segments[index];
  return segment ? { title: segment.title, minutes: segment.minutes, isBreak: false, ...(segment.tool ? { tool: segment.tool } : {}) } : null;
}

/** A short, human summary for a session's card in the library — "3 segments, 25 min total" or
    "Pomodoro · 25/5 min, 4 cycles". Total time for an indefinite Pomodoro session is left out
    (there isn't one). */
export function describeSession(session: PracticeSession): string {
  if (session.type === "custom") {
    const totalMinutes = session.segments.reduce((sum, s) => sum + s.minutes, 0);
    const count = session.segments.length;
    return `${count} segment${count === 1 ? "" : "s"}, ${formatMinutes(totalMinutes)} total`;
  }
  const { workMinutes, shortBreakMinutes, totalCycles } = session.pomodoro;
  const cycles = totalCycles === null ? "runs until stopped" : `${totalCycles} cycles`;
  return `Pomodoro · ${workMinutes}/${shortBreakMinutes} min, ${cycles}`;
}

/** Formats a decimal-minutes duration as e.g. "2:30" or, for a whole number, "10 min". */
export function formatMinutes(minutes: number): string {
  if (Number.isInteger(minutes)) return `${minutes} min`;
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Formats a millisecond duration as a live countdown clock, "M:SS" (e.g. "9:58", "24:59") —
    unlike `formatMinutes` (a static label for a fixed duration, like "10 min"), this is for a
    ticking countdown that needs to read the same way at every second, not just whole minutes.
    Shared by the tool page's own running-timer display (`PracticeTimerRing.tsx`) and the sidebar/
    mobile "what's running" widget (`PracticeTimerWidget.tsx`) so the two can never drift apart by
    formatting the same underlying number two different ways. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Same defensive fallback as `structure.ts`'s own `randomId` — `crypto.randomUUID` is available in
// both a real browser and recent React Native/Hermes, but these ids are ephemeral, client-local
// identifiers (a brand-new, never-saved draft's own id, overwritten by the server's real id the
// moment it's actually created), so a plain fallback is fine if it's ever missing on some runtime
// rather than crashing a shared file both apps depend on.
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function newSegment(): Segment {
  return { id: randomId(), title: "", minutes: 10 };
}

export function newCustomSession(): PracticeSession {
  return {
    id: randomId(),
    name: "",
    type: "custom",
    segments: [newSegment()],
    updatedAt: Date.now(),
  };
}

export function newPomodoroSession(): PracticeSession {
  return {
    id: randomId(),
    name: "",
    type: "pomodoro",
    pomodoro: { ...DEFAULT_POMODORO },
    updatedAt: Date.now(),
  };
}

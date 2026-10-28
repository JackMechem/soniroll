/**
 * This drum warmup tool's click-scheduling/playback engine — a plain module with no React, the
 * same shape `lib/metronomeEngine.ts` and `lib/metricModulationEngine.ts` already use so a tool's
 * audio keeps running across page navigation (nothing here is tied to any component's mount
 * lifecycle). `components/StickControl.tsx` is just a view: push settings in whenever they
 * change, read the live snapshot back out via `useSyncExternalStore`.
 *
 * Unlike those two, this doesn't go through `lib/clickEngine.ts`'s generic `startClickEngine` —
 * that engine's `ClickSettings` only knows "which beat/sub am I on," not "which hand is this
 * stroke, and which repeat of the 4-bar phrase am I on, and should I count off first" — all of
 * which this tool needs for the "distinct click per hand" option and for knowing when a repeat
 * count (or the whole pattern) is finished. So this is its own small scheduler, built the same
 * way (a single `setInterval` lookahead loop, borrowing `clickEngine.ts`'s own `scheduleClick`
 * helper and `CLICK_SOUNDS` palette) but with its own tick semantics.
 *
 * Timeline model: a count-off (only before the *first* repeat — one count-off happens once, at
 * the start, not before every loop back to bar 1) of plain beat clicks, then `repeats` passes
 * through the current pattern's bars, walked one *cell* at a time rather than through uniform
 * fixed-duration "slots" — a roll segment's cells are played at double speed (16th notes) or, for
 * the "Triplets" roll type, a third of a beat each (8th-note triplets) — see `lib/stickControl.ts`'s
 * own `NoteCell`/`CellSpeed`/`CELL_BEAT_FRACTION` — so a bar's cells no longer all take the same
 * amount of time the way they did before that was added, and the schedule has to be built
 * cell-by-cell to reflect that rather than by dividing a bar into equal slots.
 */

import { type BeatLevel, CLICK_SOUNDS, mainBeatClick, scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import {
  CELL_BEAT_FRACTION,
  CONCRETE_ROLL_TYPES,
  type GeneratedPattern,
  type Hand,
  type StickControlOptions,
  generatePattern,
} from "@/lib/stickControl";

export type ClickMode = "pulse" | "everyNote" | "byHand";

export interface StickControlSettings {
  bpm: number;
  volume: number;
  soundId: string;
  clickMode: ClickMode;
  countOffBars: number;
  repeats: number;
  autoAdvance: boolean;
  /** Accent level per beat (0 = muted, 1 = normal, 2 = accent) — the same `BeatLevel` concept and
      cycling interaction `lib/metronomeEngine.ts`'s own `accents` already uses, shown/edited via
      the same `BeatIndicator` component, per a direct request ("make the metronome like the one in
      the metronome tool... I should be able to do the same options"). Drives every plain per-beat
      click this engine schedules — the count-off and the "pulse" click mode — the same way
      `lib/clickEngine.ts`'s own generic main-beat accent logic does; "everyNote"/"byHand" click
      modes are about hearing the actual sticking pattern's own notes, a different purpose, and
      don't read this. Always exactly 4 long, since `beatsPerBar` is fixed at 4 — see
      `lib/stickControl.ts`'s own doc comment for why meter stopped being configurable. */
  accents: BeatLevel[];
}

export type StickControlPhase = "idle" | "countoff" | "playing";

export interface StickControlSnapshot {
  running: boolean;
  pattern: GeneratedPattern | null;
  /** The pattern that will play once this one finishes — precomputed ahead of time (not just
      derived at render time) specifically so it can be generated to start on whichever hand the
      current pattern's own last stroke didn't just end on; see `promoteNextPattern` below. Shown
      in the UI as a preview below the current pattern. */
  nextPattern: GeneratedPattern | null;
  phase: StickControlPhase;
  currentBarIndex: number | null;
  currentRepeat: number;
  /** Which beat (0-based, within the current 4/4 bar) is currently sounding — count-off beats
      included, so the same `BeatIndicator` lights up correctly through both phases. `null` while
      stopped. Independent of `currentBarIndex`, which instead tracks which bar of the *pattern*
      (not the meter) is playing. */
  currentBeat: number | null;
}

let options: StickControlOptions = {
  rollType: "double",
  enabledRollTypes: CONCRETE_ROLL_TYPES,
  enabledTripletStickings: ["alternating", "brokenDouble"],
};

let settings: StickControlSettings = {
  bpm: 100,
  volume: 0.8,
  soundId: "classic",
  clickMode: "pulse",
  countOffBars: 1,
  repeats: 20,
  autoAdvance: true,
  accents: [2, 1, 1, 1],
};

let pattern: GeneratedPattern | null = null;
let nextPattern: GeneratedPattern | null = null;
let running = false;
let phase: StickControlPhase = "idle";
let currentBarIndex: number | null = null;
let currentRepeat = 0;
let currentBeat: number | null = null;

let timerId: ReturnType<typeof setInterval> | null = null;
const timeouts = new Set<ReturnType<typeof setTimeout>>();

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.12;

function buildSnapshot(): StickControlSnapshot {
  return { running, pattern, nextPattern, phase, currentBarIndex, currentRepeat, currentBeat };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeStickControl(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStickControlSnapshot(): StickControlSnapshot {
  return cachedSnapshot;
}

export function getStickControlServerSnapshot(): StickControlSnapshot {
  return SERVER_SNAPSHOT;
}

/** Same "push settings in, don't notify" shape as `updateMetronomeSettings` — the component
    already re-renders from its own synced settings, and notifying here on every render would
    risk the same infinite-loop class of bug that function's own doc comment describes. */
export function updateStickControlOptions(next: StickControlOptions) {
  options = next;
}

export function updateStickControlSettings(next: StickControlSettings) {
  settings = next;
}

/** The hand the very last stroke of a pattern (its last bar's last cell) actually ends on — what
    the *next* pattern's own first stroke has to be the opposite of (see `promoteNextPattern`
    below). */
function endHand(p: GeneratedPattern): Hand {
  const lastBar = p.bars[p.bars.length - 1];
  return lastBar[lastBar.length - 1].hand;
}

/** Generates a completely fresh pattern (and a fresh upcoming preview to match), with no
    continuity constraint against whatever was playing before — used when the roll type changes (a
    structural option, since it can change a bar's own cell count/rhythm) and for the very first
    idle preview, before anything has ever played. The "New pattern" button and auto-advance
    instead call `advanceStickControlPattern`/`promoteNextPattern`, which keep the hand-continuity
    chain between consecutive patterns intact rather than resetting it — see that function's own
    comment. Safe to call whether or not anything is currently running. */
export function regenerateStickControlPattern() {
  pattern = generatePattern(options);
  nextPattern = generatePattern(options, endHand(pattern));
  if (running) beginScheduling();
  notify();
}

function stopInterval() {
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
  for (const t of timeouts) clearTimeout(t);
  timeouts.clear();
}

/** Reads the module-level `pattern`, generating one first if there somehow isn't one yet (and
    likewise `nextPattern`, the precomputed upcoming preview — see `promoteNextPattern` below). A
    plain function (rather than inlining the null-checks) so the scheduling closure below — which
    TypeScript can't narrow the mutable module-level `let`s through, since they might in principle
    be reassigned before the closure runs — can get a non-null value back by type. */
function currentPattern(): GeneratedPattern {
  if (!pattern) pattern = generatePattern(options);
  if (!nextPattern) nextPattern = generatePattern(options, endHand(pattern));
  return pattern;
}

/** Shared by the exported `advanceStickControlPattern` and auto-advance inside the scheduler
    below: promotes the already-precomputed `nextPattern` — built, the last time this or
    `regenerateStickControlPattern` ran, to start on whichever hand the *current* pattern's own
    last stroke didn't just end on (per a direct request: "make sure the next pattern is always
    starting with a sticking opposite to what the previous ended with") — into the new current
    pattern, then precomputes a fresh `nextPattern` from *that* pattern's own ending hand, so the
    chain keeps extending one step ahead no matter how many times this runs. */
function promoteNextPattern() {
  const base = currentPattern();
  pattern = nextPattern ?? generatePattern(options, endHand(base));
  nextPattern = generatePattern(options, endHand(pattern));
}

/** Advances to the next pattern in the continuity chain — see `promoteNextPattern`'s own comment.
    Used by the "New pattern" button; auto-advance (inside the scheduler below) calls the same
    shared helper directly once a repeat count finishes, rather than through this export. Safe to
    call whether or not anything is currently running, same as `regenerateStickControlPattern`. */
export function advanceStickControlPattern() {
  promoteNextPattern();
  if (running) beginScheduling();
  notify();
}

function beginScheduling() {
  stopInterval();
  const seedPattern = currentPattern();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  const beatsPerBar = seedPattern.beatsPerBar;
  const countOffBeats = Math.max(0, Math.round(settings.countOffBars)) * beatsPerBar;

  let countOffLeft = countOffBeats;
  let repeatIndex = 0;
  let barIndex = 0;
  let cellIndex = 0;
  // Accumulated time *within the current bar*, in real beats (each cell contributes its own
  // `CELL_BEAT_FRACTION[cell.speed]` — a half for a normal 8th note, a quarter for a fast 16th, a
  // third for a triplet 8th) — this is what detects "a new beat just started" (whenever it sits on
  // a whole number) without assuming every cell in the bar takes the same amount of time, which no
  // longer holds once a bar mixes straight and roll (or triplet) cells.
  let timeInBar = 0;
  let nextTime = ctx.currentTime + 0.06;
  let stopRequested = false;

  timerId = setInterval(() => {
    while (!stopRequested && nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      const bpm = Math.max(1, settings.bpm);
      const beatDuration = 60 / bpm;
      const sound = CLICK_SOUNDS.find((c) => c.id === settings.soundId) ?? CLICK_SOUNDS[0];
      const vol = settings.volume * sound.gain;

      let shownPhase: StickControlPhase;
      let shownBar: number | null = null;
      let shownBeat: number | null = null;
      let shownRepeat = repeatIndex + 1;
      let cellDuration: number;

      if (countOffLeft > 0) {
        shownPhase = "countoff";
        shownRepeat = 0;
        const countOffBeatIndex = countOffBeats - countOffLeft;
        const beatInBar = countOffBeatIndex % beatsPerBar;
        shownBeat = beatInBar;
        // The count-off is just plain metronome bars in the same meter, so it reads the same
        // per-beat `accents` the "pulse" click mode below does — a muted beat (level 0) plays no
        // click at all, same as `lib/clickEngine.ts`'s own generic main-beat accent logic.
        const click = mainBeatClick(settings.accents[beatInBar] ?? 1, sound, vol);
        if (click) scheduleClick(ctx, nextTime, sound.wave, click.freq, click.gain, click.length);
        cellDuration = beatDuration;
        countOffLeft--;
      } else {
        shownPhase = "playing";
        shownBar = barIndex;
        const bar = currentPattern().bars[barIndex] ?? [];
        const thisCell = bar[cellIndex];
        const hand: Hand = thisCell?.hand ?? "R";
        const speed = thisCell?.speed ?? "normal";
        cellDuration = beatDuration * CELL_BEAT_FRACTION[speed];
        const isBeatStart = Math.abs(timeInBar % 1) < 1e-6;
        const isBarStart = cellIndex === 0;
        const beatInBar = Math.min(beatsPerBar - 1, Math.floor(timeInBar));
        shownBeat = beatInBar;

        if (settings.clickMode === "pulse") {
          if (isBeatStart) {
            const click = mainBeatClick(settings.accents[beatInBar] ?? 1, sound, vol);
            if (click) scheduleClick(ctx, nextTime, sound.wave, click.freq, click.gain, click.length);
          }
        } else if (settings.clickMode === "byHand") {
          scheduleClick(
            ctx,
            nextTime,
            sound.wave,
            hand === "R" ? sound.accentFreq : sound.subFreq,
            (isBarStart ? 0.85 : 0.5) * vol,
            sound.length * (speed !== "normal" ? 0.6 : isBeatStart ? 1 : 0.75),
          );
        } else {
          // "everyNote": plain 3-tier click, same loudness/pitch tiers the regular metronome's
          // own subdivision clicks use, just applied to every stroke of the pattern.
          if (isBarStart) {
            scheduleClick(ctx, nextTime, sound.wave, sound.accentFreq, 0.9 * vol, sound.length);
          } else if (isBeatStart) {
            scheduleClick(ctx, nextTime, sound.wave, sound.normalFreq, 0.55 * vol, sound.length);
          } else {
            scheduleClick(ctx, nextTime, sound.wave, sound.subFreq, 0.25 * vol, sound.length * 0.6);
          }
        }
      }

      const delayMs = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      const capturedPhase = shownPhase;
      const capturedBar = shownBar;
      const capturedBeat = shownBeat;
      const capturedRepeat = shownRepeat;
      const t = setTimeout(() => {
        timeouts.delete(t);
        phase = capturedPhase;
        currentBarIndex = capturedBar;
        currentBeat = capturedBeat;
        currentRepeat = capturedRepeat;
        notify();
      }, delayMs);
      timeouts.add(t);

      nextTime += cellDuration;

      // Count-off ticks advance only the count-off counter (already decremented above) — the
      // pattern's own bar/cell position doesn't move until count-off is actually finished.
      if (shownPhase === "countoff") continue;

      const bar = currentPattern().bars[barIndex] ?? [];
      const playedCell = bar[cellIndex];
      timeInBar += CELL_BEAT_FRACTION[playedCell?.speed ?? "normal"];
      cellIndex++;
      if (cellIndex >= bar.length) {
        cellIndex = 0;
        timeInBar = 0;
        barIndex++;
        if (barIndex >= currentPattern().bars.length) {
          barIndex = 0;
          repeatIndex++;
          if (repeatIndex >= Math.max(1, Math.round(settings.repeats))) {
            if (settings.autoAdvance) {
              promoteNextPattern();
              repeatIndex = 0;
              notify();
            } else {
              // The run is done: stop taking any further cells *this tick* (and clear the
              // interval right away, below) so a slower-firing final `setTimeout` can't race a
              // later tick into scheduling one more repeat's worth of clicks before it fires.
              stopRequested = true;
              const stopDelayMs = delayMs;
              const t = setTimeout(() => stopStickControl(), stopDelayMs);
              timeouts.add(t);
            }
          }
        }
      }
    }
    if (stopRequested && timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }, SCHEDULER_INTERVAL_MS);
}

export function startStickControl() {
  running = true;
  beginScheduling();
  notify();
}

export function stopStickControl() {
  stopInterval();
  running = false;
  phase = "idle";
  currentBarIndex = null;
  currentBeat = null;
  currentRepeat = 0;
  notify();
}

/**
 * Tempo Trainer's click-scheduling engine and running state. Deliberately built as a close mirror
 * of `lib/metronomeEngine.ts` — full meter/subdivision settings, the "tempo note value" BPM
 * conversion, and the same "structure" (chained, differently-metered sections) feature, all
 * handled exactly the same way — per a direct request that this tool's own metronome be identical
 * to the plain Metronome's, with only the mute cycle layered on top as something extra, not a
 * simplified metronome with the mute cycle bolted onto it. Same plain, module-level-state shape
 * for the same reason as that file: nothing here is tied to any component's mount lifecycle, so
 * the click (or the silent counting through a muted stretch) keeps running across a page
 * navigation. `components/TempoTrainer.tsx` is just a view: push settings in whenever they
 * change, read the live snapshot back out via `useSyncExternalStore`.
 *
 * The one thing this tool adds on top of a plain metronome: it alternates between a stretch of
 * `onBars` audible bars and a stretch of `offBars` silent ones, looping that on/off cycle for as
 * long as it's running — a trainer for holding a tempo internally once the click disappears,
 * rather than a metronome you're meant to listen to the whole time. The mute-cycle phase and the
 * structure's own section/bar advance are tracked independently (both keyed off the same
 * `beat === 0 && sub === 0` "a new bar just started" tick, the same detection
 * `lib/metronomeEngine.ts`'s own structure advance already uses) — a structure section's bars and
 * the mute cycle's on/off bars are two unrelated things counting at once, not one driving the
 * other. Reuses `lib/clickEngine.ts`'s generic `startClickEngine` exactly the way
 * `lib/metronomeEngine.ts` does (one track, `getSettings`/`onBeat`); the muted bars aren't a
 * second code path or a paused engine — they're the *same* click track, just handed an all-zero
 * `accents`/`subAccents` for those bars, so `startClickEngine`'s own per-tick logic schedules no
 * sound at all (an all-zero `BeatLevel` already means "no click," the same as a muted beat/tick
 * anywhere else in this app).
 */

import {
  type BeatLevel,
  type ClickEngine,
  type ClickSettings,
  startClickEngine,
} from "@/lib/clickEngine";
import { convertTempo, defaultAccents, defaultSubAccents } from "@/lib/meterControls";
import { EMPTY_STRUCTURE, type Structure, sectionAt } from "@/lib/structure";

export interface TempoTrainerSettingsInput {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  tempoNoteValue: number | null;
  /** How many bars play audibly before muting — always at least 1 (see `getSettingsForTick`). */
  onBars: number;
  /** How many bars stay silent before the click comes back — always at least 1. */
  offBars: number;
}

export interface TempoTrainerStructureInput {
  useStructure: boolean;
  structure: Structure;
}

export type TempoTrainerPhase = "on" | "off";

export interface TempoTrainerSnapshot {
  running: boolean;
  /** Which stretch of the mute cycle is currently playing — `"on"` (audible) or `"off"` (silent,
      no click scheduled and nothing timing-related shown). Starts (and idles) on `"on"`, same as
      a plain metronome always has been. */
  phase: TempoTrainerPhase;
  /** How many bars into the current phase (0-based) — shown as "Bar n of 4" while the click plays. */
  barInPhase: number;
  currentBeat: number | null;
  currentSub: number;
  /** What `BeatIndicator`/the structure editor should show right now — the plain meter's own
      accents, or (in structure mode) whichever section is currently playing. Same shape and
      purpose as `lib/metronomeEngine.ts`'s own `MetronomeSnapshot` fields of these names. */
  displayAccents: BeatLevel[];
  displaySubdivision: number;
  displaySubAccents: BeatLevel[];
  activeSectionName: string | null;
  activeSectionBars: number;
  barInSection: number;
  formIndex: number;
}

let settings: TempoTrainerSettingsInput = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: "classic",
  tempoNoteValue: 4,
  onBars: 4,
  offBars: 4,
};
let structureInput: TempoTrainerStructureInput = { useStructure: false, structure: EMPTY_STRUCTURE };

let engine: ClickEngine | null = null;
let running = false;
let phase: TempoTrainerPhase = "on";
let barsIntoPhase = 0;
let currentBeat: number | null = null;
let currentSub = 0;
let structFormIndex = 0;
let structBarsInto = 0;
// Gates *both* the structure's own first-bar skip and the mute cycle's first-bar skip — the very
// first bar of a run shouldn't count as "elapsed" for either one, the same reasoning
// `lib/metronomeEngine.ts`'s own `structSeenFirst` already uses, just shared by both state
// machines here since they both start counting from the same moment.
let seenFirstBar = false;

function computeDisplay(): Pick<
  TempoTrainerSnapshot,
  | "displayAccents"
  | "displaySubdivision"
  | "displaySubAccents"
  | "activeSectionName"
  | "activeSectionBars"
  | "barInSection"
> {
  const { useStructure, structure } = structureInput;
  const activeSection =
    useStructure && structure.form.length > 0 ? sectionAt(structure, structFormIndex) : null;
  if (activeSection) {
    return {
      displayAccents: defaultAccents(activeSection.beatsPerBar, activeSection.accents),
      displaySubdivision: activeSection.subdivision,
      displaySubAccents: defaultSubAccents(
        activeSection.beatsPerBar,
        activeSection.subdivision,
        activeSection.subAccents,
      ),
      activeSectionName: activeSection.name,
      activeSectionBars: activeSection.bars,
      barInSection: structBarsInto,
    };
  }
  return {
    displayAccents: settings.accents,
    displaySubdivision: settings.subdivision,
    displaySubAccents: settings.subAccents,
    activeSectionName: null,
    activeSectionBars: 0,
    barInSection: 0,
  };
}

function buildSnapshot(): TempoTrainerSnapshot {
  return {
    running,
    phase,
    barInPhase: barsIntoPhase,
    currentBeat,
    currentSub,
    formIndex: structFormIndex,
    ...computeDisplay(),
  };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeTempoTrainer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTempoTrainerSnapshot(): TempoTrainerSnapshot {
  return cachedSnapshot;
}

export function getTempoTrainerServerSnapshot(): TempoTrainerSnapshot {
  return SERVER_SNAPSHOT;
}

/** Same "push settings in, don't notify" shape as `updateMetronomeSettings` — see that function's
    own comment for why notifying here would risk an infinite render loop. */
export function updateTempoTrainerSettings(next: TempoTrainerSettingsInput) {
  settings = next;
}

export function updateTempoTrainerStructure(next: TempoTrainerStructureInput) {
  structureInput = next;
}

/** All zero (muted) — same length/shape as whatever was passed in, so it still matches the
    currently-active meter's own `beatsPerBar`/subdivision slot count exactly. */
function silence(levels: BeatLevel[]): BeatLevel[] {
  return levels.map((): BeatLevel => 0);
}

/**
 * Called by the click engine right as it schedules each tick. `beat === 0 && sub === 0` (a new
 * bar starting) is when both independent state machines below get a chance to advance: the
 * structure's own section/bar count (identical to `lib/metronomeEngine.ts`'s own logic) and the
 * mute cycle's on/off phase. Whichever meter is currently active (the plain one, or — in
 * structure mode — whichever section is playing) is resolved first, exactly as
 * `lib/metronomeEngine.ts` does; the mute cycle is then applied on top, by zeroing that resolved
 * meter's own accents/subAccents while `phase === "off"` rather than returning a differently-shaped
 * settings object.
 */
function getSettingsForTick(beat: number, sub: number): ClickSettings {
  const base = settings;
  const { useStructure: active, structure: struct } = structureInput;

  if (beat === 0 && sub === 0) {
    if (!seenFirstBar) {
      seenFirstBar = true;
    } else {
      if (active && struct.form.length > 0) {
        const current = sectionAt(struct, structFormIndex);
        const barsInSection = current?.bars ?? 1;
        const barsElapsed = structBarsInto + 1;
        if (barsElapsed < barsInSection) {
          structBarsInto = barsElapsed;
        } else {
          structBarsInto = 0;
          structFormIndex = (structFormIndex + 1) % struct.form.length;
        }
      }

      const phaseBars = Math.max(1, Math.round(phase === "on" ? base.onBars : base.offBars));
      const phaseBarsElapsed = barsIntoPhase + 1;
      if (phaseBarsElapsed < phaseBars) {
        barsIntoPhase = phaseBarsElapsed;
      } else {
        barsIntoPhase = 0;
        phase = phase === "on" ? "off" : "on";
      }
    }
    notify();
  }

  const plain = (): ClickSettings => ({
    bpm: base.tempoNoteValue ? convertTempo(base.bpm, base.tempoNoteValue, base.beatUnit) : base.bpm,
    beatsPerBar: base.beatsPerBar,
    accents: base.accents,
    subdivision: base.subdivision,
    subAccents: base.subAccents,
    volume: base.volume,
    soundId: base.soundId,
  });

  const resolved = (() => {
    if (!active || struct.form.length === 0) return plain();
    const section = sectionAt(struct, structFormIndex);
    if (!section) return plain();
    return {
      bpm: base.tempoNoteValue
        ? convertTempo(base.bpm, base.tempoNoteValue, section.beatUnit)
        : base.bpm,
      beatsPerBar: section.beatsPerBar,
      accents: defaultAccents(section.beatsPerBar, section.accents),
      subdivision: section.subdivision,
      subAccents: defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents),
      volume: base.volume,
      soundId: base.soundId,
    };
  })();

  if (phase === "off") {
    return {
      ...resolved,
      accents: silence(resolved.accents),
      subAccents: silence(resolved.subAccents),
    };
  }
  return resolved;
}

function handleBeat(beat: number, sub: number) {
  currentBeat = beat;
  currentSub = sub;
  notify();
}

export function startTempoTrainer() {
  engine?.stop();
  phase = "on";
  barsIntoPhase = 0;
  structFormIndex = 0;
  structBarsInto = 0;
  seenFirstBar = false;
  running = true;
  engine = startClickEngine([{ getSettings: getSettingsForTick, onBeat: handleBeat }]);
  notify();
}

export function stopTempoTrainer() {
  engine?.stop();
  engine = null;
  running = false;
  phase = "on";
  barsIntoPhase = 0;
  structFormIndex = 0;
  structBarsInto = 0;
  seenFirstBar = false;
  currentBeat = null;
  currentSub = 0;
  notify();
}

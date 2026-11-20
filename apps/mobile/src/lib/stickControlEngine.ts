import { type BeatLevel, getClickSound } from '@jam-practice/core/clickSounds';
import {
  CELL_BEAT_FRACTION,
  CONCRETE_ROLL_TYPES,
  type GeneratedPattern,
  type Hand,
  type StickControlOptions,
  generatePattern,
} from '@jam-practice/core/stickControl';

import { getAudioContext } from '@/lib/audioContext';
import { setSteadyInterval } from '@/lib/steadyTimer';
import { scheduleClick } from '@/lib/metronomeClickEngine';

/**
 * The native sibling of `apps/web/lib/stickControlEngine.ts` — same lookahead scheduler walking
 * the pattern cell by cell (count-off, repeats, auto-advance), same three click modes and
 * accent levels, same hand-continuity chain between patterns (`nextPattern` is always generated
 * to open on the opposite hand of the current pattern's last stroke). Clicks go through
 * `react-native-audio-api`'s real `AudioContext` (`metronomeClickEngine.scheduleClick`), so timing
 * is sample-accurate the same way the web's Web Audio scheduling is.
 *
 * One deliberate difference: `updateStickControlOptions` reports whether the options actually
 * changed, and the screen only regenerates the pattern when they did. Web regenerates on every
 * mount, which restarts a running pattern just by navigating back to the tool.
 */

export type ClickMode = 'pulse' | 'everyNote' | 'byHand';

export type StickControlSettings = {
  bpm: number;
  volume: number;
  soundId: string;
  clickMode: ClickMode;
  countOffBars: number;
  repeats: number;
  autoAdvance: boolean;
  accents: BeatLevel[];
};

export type StickControlPhase = 'idle' | 'countoff' | 'playing';

export type StickControlSnapshot = {
  running: boolean;
  pattern: GeneratedPattern | null;
  nextPattern: GeneratedPattern | null;
  phase: StickControlPhase;
  currentBarIndex: number | null;
  currentRepeat: number;
  currentBeat: number | null;
};

let options: StickControlOptions = {
  rollType: 'double',
  enabledRollTypes: CONCRETE_ROLL_TYPES,
  enabledTripletStickings: ['alternating', 'brokenDouble'],
};
let optionsKey = '';

let settings: StickControlSettings = {
  bpm: 100,
  volume: 0.8,
  soundId: 'classic',
  clickMode: 'pulse',
  countOffBars: 1,
  repeats: 20,
  autoAdvance: true,
  accents: [2, 1, 1, 1],
};

let snapshot: StickControlSnapshot = {
  running: false,
  pattern: null,
  nextPattern: null,
  phase: 'idle',
  currentBarIndex: null,
  currentRepeat: 0,
  currentBeat: null,
};

let stopTicks: (() => void) | null = null;
const timeouts = new Set<ReturnType<typeof setTimeout>>();

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.12;

const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<StickControlSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeStickControl(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStickControlSnapshot(): StickControlSnapshot {
  return snapshot;
}

/** Returns true when the options differ from what the current pattern was generated with. */
export function updateStickControlOptions(next: StickControlOptions): boolean {
  options = next;
  const key = JSON.stringify(next);
  const changed = key !== optionsKey;
  optionsKey = key;
  return changed;
}

export function updateStickControlSettings(next: StickControlSettings) {
  settings = next;
}

function endHand(p: GeneratedPattern): Hand {
  const lastBar = p.bars[p.bars.length - 1];
  return lastBar[lastBar.length - 1].hand;
}

/** A fresh pattern with no continuity constraint — for an options change or the first preview. */
export function regenerateStickControlPattern() {
  const pattern = generatePattern(options);
  setSnapshot({ pattern, nextPattern: generatePattern(options, endHand(pattern)) });
  if (snapshot.running) beginScheduling();
}

/** Makes sure there's something to show, without disturbing an existing pattern. */
export function ensureStickControlPattern() {
  if (!snapshot.pattern) regenerateStickControlPattern();
}

function currentPattern(): GeneratedPattern {
  if (!snapshot.pattern) {
    const pattern = generatePattern(options);
    snapshot = { ...snapshot, pattern, nextPattern: generatePattern(options, endHand(pattern)) };
  }
  return snapshot.pattern as GeneratedPattern;
}

/** Promotes the precomputed next pattern (which already opens on the opposite hand of the current
    one's last stroke) and precomputes a new next one from it. */
function promoteNextPattern() {
  const base = currentPattern();
  const pattern = snapshot.nextPattern ?? generatePattern(options, endHand(base));
  setSnapshot({ pattern, nextPattern: generatePattern(options, endHand(pattern)) });
}

/** The "New pattern" button — keeps the hand-continuity chain intact. */
export function advanceStickControlPattern() {
  promoteNextPattern();
  if (snapshot.running) beginScheduling();
}

function stopInterval() {
  stopTicks?.();
  stopTicks = null;
  for (const t of timeouts) clearTimeout(t);
  timeouts.clear();
}

function beginScheduling() {
  stopInterval();
  const seedPattern = currentPattern();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();

  const beatsPerBar = seedPattern.beatsPerBar;
  const countOffBeats = Math.max(0, Math.round(settings.countOffBars)) * beatsPerBar;

  let countOffLeft = countOffBeats;
  let repeatIndex = 0;
  let barIndex = 0;
  let cellIndex = 0;
  let timeInBar = 0;
  let nextTime = ctx.currentTime + 0.06;
  let stopRequested = false;

  stopTicks = setSteadyInterval(() => {
    while (!stopRequested && nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      const beatDuration = 60 / Math.max(1, settings.bpm);
      const sound = getClickSound(settings.soundId);
      const vol = settings.volume * sound.gain;

      let shownPhase: StickControlPhase;
      let shownBar: number | null = null;
      let shownBeat: number | null;
      let shownRepeat = repeatIndex + 1;
      let cellDuration: number;

      if (countOffLeft > 0) {
        shownPhase = 'countoff';
        shownRepeat = 0;
        const beatInBar = (countOffBeats - countOffLeft) % beatsPerBar;
        shownBeat = beatInBar;
        const level = settings.accents[beatInBar] ?? 1;
        if (level === 2) {
          scheduleClick(ctx, nextTime, sound.wave, sound.accentFreq, 0.9 * vol, sound.length);
        } else if (level === 1) {
          scheduleClick(ctx, nextTime, sound.wave, sound.normalFreq, 0.55 * vol, sound.length);
        }
        cellDuration = beatDuration;
        countOffLeft--;
      } else {
        shownPhase = 'playing';
        shownBar = barIndex;
        const bar = currentPattern().bars[barIndex] ?? [];
        const thisCell = bar[cellIndex];
        const hand: Hand = thisCell?.hand ?? 'R';
        const speed = thisCell?.speed ?? 'normal';
        cellDuration = beatDuration * CELL_BEAT_FRACTION[speed];
        const isBeatStart = Math.abs(timeInBar % 1) < 1e-6;
        const isBarStart = cellIndex === 0;
        const beatInBar = Math.min(beatsPerBar - 1, Math.floor(timeInBar));
        shownBeat = beatInBar;

        if (settings.clickMode === 'pulse') {
          if (isBeatStart) {
            const level = settings.accents[beatInBar] ?? 1;
            if (level === 2) {
              scheduleClick(ctx, nextTime, sound.wave, sound.accentFreq, 0.9 * vol, sound.length);
            } else if (level === 1) {
              scheduleClick(ctx, nextTime, sound.wave, sound.normalFreq, 0.55 * vol, sound.length);
            }
          }
        } else if (settings.clickMode === 'byHand') {
          scheduleClick(
            ctx,
            nextTime,
            sound.wave,
            hand === 'R' ? sound.accentFreq : sound.subFreq,
            (isBarStart ? 0.85 : 0.5) * vol,
            sound.length * (speed !== 'normal' ? 0.6 : isBeatStart ? 1 : 0.75),
          );
        } else if (isBarStart) {
          scheduleClick(ctx, nextTime, sound.wave, sound.accentFreq, 0.9 * vol, sound.length);
        } else if (isBeatStart) {
          scheduleClick(ctx, nextTime, sound.wave, sound.normalFreq, 0.55 * vol, sound.length);
        } else {
          scheduleClick(ctx, nextTime, sound.wave, sound.subFreq, 0.25 * vol, sound.length * 0.6);
        }
      }

      const delayMs = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      const capturedPhase = shownPhase;
      const capturedBar = shownBar;
      const capturedBeat = shownBeat;
      const capturedRepeat = shownRepeat;
      const t = setTimeout(() => {
        timeouts.delete(t);
        setSnapshot({
          phase: capturedPhase,
          currentBarIndex: capturedBar,
          currentBeat: capturedBeat,
          currentRepeat: capturedRepeat,
        });
      }, delayMs);
      timeouts.add(t);

      nextTime += cellDuration;

      if (shownPhase === 'countoff') continue;

      const bar = currentPattern().bars[barIndex] ?? [];
      timeInBar += CELL_BEAT_FRACTION[bar[cellIndex]?.speed ?? 'normal'];
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
            } else {
              stopRequested = true;
              const stopTimer = setTimeout(() => stopStickControl(), delayMs);
              timeouts.add(stopTimer);
            }
          }
        }
      }
    }
    if (stopRequested && stopTicks) {
      stopTicks();
      stopTicks = null;
    }
  }, SCHEDULER_INTERVAL_MS);
}

export function startStickControl() {
  setSnapshot({ running: true });
  beginScheduling();
}

export function stopStickControl() {
  stopInterval();
  setSnapshot({ running: false, phase: 'idle', currentBarIndex: null, currentBeat: null, currentRepeat: 0 });
}

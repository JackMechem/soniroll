import type { GainNode } from 'react-native-audio-api';

import { getAudioContext } from '@/lib/audioContext';

/**
 * `setInterval` / `setTimeout` that keep going while the app is in the background — the phone's
 * sibling of the website's `lib/steadyTimer.ts`.
 *
 * React Native on Android runs JS timers off the screen's frame callbacks, and stops them once the
 * app is in the background: an audio scheduler on a plain `setInterval` stops queueing sound a
 * moment after you leave the app (Jack's Metronome did). The audio library's own events still
 * reach JS then, so the ticks come from the audio clock: a silent source, a few milliseconds long,
 * whose "ended" event fires the due callbacks and starts the next one. A plain `setInterval` runs
 * alongside it while the app is open (if the audio clock is held up, nothing waits on it); the
 * callbacks are lookahead schedulers, so an extra call does no harm.
 *
 * The app also needs Android to keep it running: `lib/nowPlaying.ts` shows the media
 * notification (the audio library's foreground service) while a tool plays.
 */

const TICK_SEC = 0.02;

type Timer = { fn: () => void; ms: number; due: number; once: boolean };
const timers = new Map<number, Timer>();
let nextId = 1;
let ticking = false;
let silent: GainNode | null = null;

function fireDue() {
  const now = Date.now();
  for (const [id, t] of [...timers]) {
    if (now < t.due) continue;
    if (t.once) timers.delete(id);
    else t.due = now + t.ms;
    try {
      t.fn();
    } catch {
      // One failing callback mustn't stop the others' ticks.
    }
  }
}

/** One link of the audio-clock chain: a muted source that ends `TICK_SEC` from now. */
function tick() {
  if (!timers.size) {
    ticking = false;
    return;
  }
  try {
    const ctx = getAudioContext();
    if (!silent) {
      silent = ctx.createGain();
      silent.gain.value = 0;
      silent.connect(ctx.destination);
    }
    const src = ctx.createConstantSource();
    src.connect(silent);
    src.onEnded = () => {
      src.onEnded = null;
      src.disconnect();
      fireDue();
      tick();
    };
    const t = ctx.currentTime;
    src.start(t);
    src.stop(t + TICK_SEC);
  } catch {
    ticking = false;
  }
}

function add(fn: () => void, ms: number, once: boolean): () => void {
  const id = nextId++;
  timers.set(id, { fn, ms, due: Date.now() + ms, once });
  if (!ticking) {
    ticking = true;
    tick();
  }
  // The foreground backup.
  const backup = once ? setTimeout(fireDue, Math.max(0, ms)) : setInterval(fireDue, ms);
  return () => {
    timers.delete(id);
    if (once) clearTimeout(backup as ReturnType<typeof setTimeout>);
    else clearInterval(backup as ReturnType<typeof setInterval>);
  };
}

/** Calls `fn` every `ms` milliseconds, in the background too. Returns a function that stops it. */
export function setSteadyInterval(fn: () => void, ms: number): () => void {
  return add(fn, ms, false);
}

/** Calls `fn` once, `ms` milliseconds from now, in the background too. Returns a function that
    cancels it. */
export function setSteadyTimeout(fn: () => void, ms: number): () => void {
  return add(fn, Math.max(0, ms), true);
}

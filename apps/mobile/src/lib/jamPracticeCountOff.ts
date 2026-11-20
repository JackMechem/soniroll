import { getAudioContext } from '@/lib/audioContext';
import { setSteadyInterval } from '@/lib/steadyTimer';

/**
 * The native sibling of `apps/web/lib/metronome.ts`'s own `playCountOff`/`parseBeatsPerBar` — for
 * Jam Practice's own one-off "click N bars, then either stop or hand off to a running metronome"
 * job rather than a configurable multi-track click engine.
 *
 * **Deliberately *not* a port of web's own scheduling shape**, unlike this file's first version —
 * web's `playCountOff` schedules every count-off beat in one synchronous burst up front (perfectly
 * fine for a browser's own mature Web Audio implementation), but real on-device testing found this
 * produced audibly distorted/"8-bit"-sounding clicks on *some* beats on Android, while
 * `metronomeClickEngine.ts`'s own click engine — which has never had this complaint — paces every
 * single click through a `setInterval`-driven lookahead window instead, never creating more than a
 * couple of oscillators in one JS tick. This file now follows that same always-paced shape (same
 * `SCHEDULER_INTERVAL_MS`/`LOOKAHEAD_SEC` values, even) instead of bursting the whole count-off at
 * once — the most likely real cause, not confirmed by a lower-level trace, but strongly suggested
 * by "the proven-good engine never bursts; the newly-written one did; the newly-written one was the
 * one that glitched."
 */
export function parseBeatsPerBar(timeSignature: string): number {
  const numerator = Number(timeSignature.split('/')[0]);
  return Number.isFinite(numerator) && numerator > 0 ? numerator : 4;
}

/** See `metronomeClickEngine.ts`'s own `ATTACK_SEC` doc comment — a real, on-device-confirmed pop/
    click artifact from stepping gain straight from silence to full volume with no attack ramp,
    present on every click regardless of accent/frequency. Same fix here. */
const ATTACK_SEC = 0.003;

function scheduleClick(ctx: ReturnType<typeof getAudioContext>, time: number, accent: boolean) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = accent ? 1500 : 900;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.5, time + ATTACK_SEC);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  osc.start(time);
  osc.stop(time + 0.06);
  return osc;
}

export type CountOff = {
  stop: () => void;
  durationMs: number;
};

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.12;

export function playCountOff(
  bpm: number,
  timeSignature: string,
  bars = 8,
  accentFirstBeat = false,
  continueIndefinitely = false,
  onBeat?: (beat: number) => void,
): CountOff {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();

  const beatsPerBar = parseBeatsPerBar(timeSignature);
  const beatDuration = 60 / bpm;
  const totalBeats = beatsPerBar * bars;
  const startTime = ctx.currentTime + 0.06;

  const oscillators = new Set<ReturnType<typeof scheduleClick>>();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let nextBeat = 0;

  function scheduleBeat(i: number) {
    const time = startTime + i * beatDuration;
    if (onBeat) {
      const t = setTimeout(
        () => {
          timeouts.delete(t);
          onBeat(i % beatsPerBar);
        },
        Math.max(0, (time - ctx.currentTime) * 1000),
      );
      timeouts.add(t);
    }
    const osc = scheduleClick(ctx, time, accentFirstBeat && i % beatsPerBar === 0);
    oscillators.add(osc);
    osc.onEnded = () => oscillators.delete(osc);
  }

  const durationMs = (totalBeats * beatDuration + 0.1) * 1000;

  const stopTicks = setSteadyInterval(() => {
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    while ((continueIndefinitely || nextBeat < totalBeats) && startTime + nextBeat * beatDuration < horizon) {
      scheduleBeat(nextBeat);
      nextBeat++;
    }
    if (!continueIndefinitely && nextBeat >= totalBeats) stopTicks();
  }, SCHEDULER_INTERVAL_MS);

  return {
    durationMs: continueIndefinitely ? Infinity : durationMs,
    stop: () => {
      stopTicks();
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
      // Each click's own `osc.stop(time + 0.06)` only takes effect at that already-scheduled
      // future time — clearing the lookahead interval above stops *new* clicks from being
      // queued, but anything already scheduled (up to `LOOKAHEAD_SEC` ahead) would otherwise keep
      // ringing out on its own schedule. Stopping each tracked oscillator immediately is what
      // actually silences it the moment `stop()` is called, not up to ~120ms later.
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          // already stopped
        }
      }
      oscillators.clear();
    },
  };
}

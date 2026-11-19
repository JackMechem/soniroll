import {
  getClickSound,
  resolveMainBeatClick,
  resolveSubClick,
  type BeatLevel,
  type ClickSettings,
} from '@jam-practice/core/clickSounds';

import { getAudioContext } from '@/lib/audioContext';

/**
 * The native sibling of `apps/web/lib/clickEngine.ts` — same lookahead-scheduling algorithm (one
 * shared `setInterval` tick, a short lookahead window, per-track `{nextTime, beat, sub}` state,
 * the exact same `ClickSettings`/`ClickTrack`/gain formulas from `@jam-practice/core/clickSounds`),
 * and now, as of `react-native-audio-api` replacing `expo-audio`, the *exact same scheduling
 * mechanism too* — real oscillators scheduled against `AudioContext.currentTime` via `osc.start
 * (time)`, sample-accurate regardless of any JS-thread jitter between scheduling and playback.
 *
 * **This replaced a real, confirmed-on-device bug, not a hypothetical one.** The original version
 * of this file (when this tool was first ported) had no native equivalent of the Web Audio API
 * available at all, so it fired each click from a plain `setTimeout` computed against wall-clock
 * `Date.now()` and played back pre-rendered WAV samples via `expo-audio`'s `AudioPlayer` — whose
 * own `play()` only ever means "start now, whenever this JS call happens to actually execute,"
 * with no way to schedule a future sample-accurate start time the way `AudioContext.currentTime` +
 * `osc.start(time)` does. Reported directly, by ear, on a real device: "the metronome is a bit
 * inconsistent and doesn't really seem to be in time" — exactly the audible symptom a `setTimeout`-
 * driven scheduler would produce under any JS-thread jitter (GC pauses, bridge traffic, React
 * re-renders), and exactly what this file's own original doc comment had already flagged as an
 * accepted, unverified-by-ear risk the day it was written. `react-native-audio-api` (Software
 * Mansion — the same team behind `react-native-reanimated`/`react-native-screens`, already
 * dependencies here) closes that gap by implementing the real Web Audio API spec natively, so this
 * file is now close to a line-for-line port of the web engine rather than a differently-shaped
 * workaround — same `scheduleClick`, same oscillator/gain-node graph, same `AudioParam` envelope
 * calls, just reading `ClickSound`'s `wave`/`accentFreq`/`normalFreq`/`subFreq` fields directly
 * instead of looking up a pre-rendered sample file for them.
 *
 * The whole pre-rendered-sample system this file used to depend on — `scripts/
 * generate-click-sounds.mjs`, the twenty baked `assets/sounds/*.wav` files, the per-(sound,variant)
 * `AudioPlayer` pool — is gone outright now that real oscillator synthesis is available, not left
 * as unused dead weight.
 */
const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.12;
/** A near-instant but non-zero attack ramp. Jumping a `GainNode` straight from silence to full
    volume in zero time (`setValueAtTime(gain, time)` with nothing before it, what this file used
    to do) is a textbook cause of an audible pop/click artifact — a genuine discontinuity in the
    waveform's amplitude, not just a figure of speech — and was reported directly, on a real
    device, as "like slapping a mic," present on *every* click, not an occasional glitch. 3ms is
    short enough to still read as a sharp, percussive attack (nothing like `toneGenerator.ts`'s own
    30ms musical attack) while giving the amplitude somewhere to ramp from instead of stepping.
    Confirmed as the fix, not a guess: audible on every current click sound regardless of wave
    shape or frequency, consistent with an attack-envelope cause rather than anything specific to
    one `ClickSound`. */
const ATTACK_SEC = 0.003;

export function scheduleClick(
  ctx: ReturnType<typeof getAudioContext>,
  time: number,
  wave: 'sine' | 'square' | 'triangle' | 'sawtooth',
  freq: number,
  gain: number,
  length: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = wave;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), time + ATTACK_SEC);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  osc.start(time);
  osc.stop(time + length);
}

export type ClickTrack = {
  getSettings: (beat: number, sub: number) => ClickSettings;
  onBeat: (beat: number, sub: number) => void;
  /** Called as each tick is scheduled (ahead of time), muted ones too, with the exact
      `AudioContext` time it plays at and its level — the web engine's `onSchedule`. The Time Test
      lines its recording up with these. */
  onSchedule?: (tick: { time: number; beat: number; sub: number; level: BeatLevel; settings: ClickSettings }) => void;
};

export type ClickEngineHandle = { stop: () => void };

export function startClickEngine(tracks: ClickTrack[]): ClickEngineHandle {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();

  const startAt = ctx.currentTime + 0.06;
  const state = tracks.map(() => ({ nextTime: startAt, beat: 0, sub: 0 }));
  const timeouts = new Set<ReturnType<typeof setTimeout>>();

  const intervalId = setInterval(() => {
    for (let i = 0; i < tracks.length; i++) {
      const { getSettings, onBeat, onSchedule } = tracks[i];
      const st = state[i];
      while (st.nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
        const s = getSettings(st.beat, st.sub);
        if (st.beat >= s.beatsPerBar) st.beat = 0;
        if (st.sub >= s.subdivision) st.sub = 0;

        const sound = getClickSound(s.soundId);
        const vol = s.volume * sound.gain;
        const subSlots = Math.max(0, s.subdivision - 1);

        let click: { freq: number; gain: number; length: number } | null = null;
        let level: BeatLevel = 0;
        if (st.sub === 0) {
          level = s.accents[st.beat] ?? 1;
          click = resolveMainBeatClick(level, sound, vol);
        } else if (subSlots > 0) {
          const subIndex = st.beat * subSlots + (st.sub - 1);
          level = s.subAccents[subIndex] ?? 1;
          click = resolveSubClick(level, sound, vol);
        }
        if (click) scheduleClick(ctx, st.nextTime, sound.wave, click.freq, click.gain, click.length);
        onSchedule?.({ time: st.nextTime, beat: st.beat, sub: st.sub, level, settings: s });

        const shownBeat = st.beat;
        const shownSub = st.sub;
        const delayMs = Math.max(0, (st.nextTime - ctx.currentTime) * 1000);
        const timeoutHandle = setTimeout(() => {
          timeouts.delete(timeoutHandle);
          onBeat(shownBeat, shownSub);
        }, delayMs);
        timeouts.add(timeoutHandle);

        st.nextTime += 60 / s.bpm / s.subdivision;
        st.sub++;
        if (st.sub >= s.subdivision) {
          st.sub = 0;
          st.beat++;
          if (st.beat >= s.beatsPerBar) st.beat = 0;
        }
      }
    }
  }, SCHEDULER_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(intervalId);
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
    },
  };
}

import { getAudioContext } from "@/lib/metronome";

/** 0 = silent, 1 = normal click, 2 = accented click. */
export type BeatLevel = 0 | 1 | 2;

type ClickSound = {
  id: string;
  label: string;
  wave: OscillatorType;
  accentFreq: number;
  normalFreq: number;
  subFreq: number;
  length: number;
  gain: number;
};

export const CLICK_SOUNDS: ClickSound[] = [
  {
    id: "classic",
    label: "Classic click",
    wave: "sine",
    accentFreq: 1500,
    normalFreq: 900,
    subFreq: 700,
    length: 0.06,
    gain: 1,
  },
  {
    id: "beep",
    label: "Beep",
    wave: "sine",
    accentFreq: 1046,
    normalFreq: 784,
    subFreq: 523,
    length: 0.12,
    gain: 0.8,
  },
  {
    id: "wood",
    label: "Woodblock",
    wave: "triangle",
    accentFreq: 1300,
    normalFreq: 950,
    subFreq: 750,
    length: 0.045,
    gain: 1,
  },
  {
    id: "digital",
    label: "Digital",
    wave: "square",
    accentFreq: 1760,
    normalFreq: 1175,
    subFreq: 880,
    length: 0.04,
    gain: 0.35,
  },
  {
    id: "soft",
    label: "Soft thump",
    wave: "triangle",
    accentFreq: 330,
    normalFreq: 220,
    subFreq: 165,
    length: 0.09,
    gain: 1.1,
  },
];

export const DEFAULT_CLICK_SOUND_ID = CLICK_SOUNDS[0].id;

export type ClickSettings = {
  bpm: number;
  beatsPerBar: number;
  accents: BeatLevel[];
  subdivision: number;
  /** One accent level per *subdivision* click within a beat (not the main beat itself, which
      `accents` already covers) — flattened beat-major, `beat * (subdivision - 1) + subIndex`,
      the same order `BeatIndicator`'s dots are drawn in. Empty/short is fine (missing entries
      default to "normal", same as every subdivision click always played before this existed). */
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
};

export type ClickEngine = {
  stop: () => void;
};

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.12;

export function scheduleClick(
  ctx: AudioContext,
  time: number,
  wave: OscillatorType,
  freq: number,
  gain: number,
  length: number,
): OscillatorNode {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = wave;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(Math.max(gain, 0.0001), time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  osc.start(time);
  osc.stop(time + length);
  return osc;
}

export type ClickTrack = {
  /**
   * Also given the beat/subdivision counters it's about to schedule, so a caller that needs a
   * tempo change to land exactly on a bar line (e.g. a metric-modulation trainer) can apply it
   * right when `beat === 0 && sub === 0` — before this tick computes the gap to the next beat,
   * rather than reacting to `onBeat` afterward, which is too late for that gap to reflect it.
   */
  getSettings: (beat: number, sub: number) => ClickSettings;
  /** Fires (roughly) when each tick of this track is heard — not just the main beat (`sub === 0`)
      but every subdivision click in between too, so a caller that shows subdivision dots
      (`BeatIndicator`'s `currentSub`) can highlight exactly which one just played. */
  onBeat: (beat: number, sub: number) => void;
};

/** What the scheduler needs from an audio engine: its clock (seconds) and a way to play one click
    at a time on that clock. The website uses Web Audio; the desktop app passes its native engine. */
export type ClickOutput = {
  now: () => number;
  play: (time: number, wave: OscillatorType, freq: number, gain: number, length: number) => void;
  /** Seconds between a click's scheduled time and it being heard (default 0), so the beat
      display can wait for it. */
  latency?: () => number;
};

/**
 * Starts one or more drift-free, simultaneous clicks (e.g. a main click and a reference click at
 * a different tempo) off a single shared scheduler tick. Running them off one `setInterval`
 * rather than one each means they can only ever drift apart from their own intentional tempo
 * difference — never from browser timer jitter nudging one track's schedule but not the other's.
 */
export function startClickEngine(tracks: ClickTrack[]): ClickEngine {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return runClickScheduler(tracks, {
    now: () => ctx.currentTime,
    play: (time, wave, freq, gain, length) => {
      scheduleClick(ctx, time, wave, freq, gain, length);
    },
  });
}

/** `startClickEngine`'s scheduler, for any `ClickOutput`. */
export function runClickScheduler(tracks: ClickTrack[], output: ClickOutput): ClickEngine {
  const startAt = output.now() + 0.06;
  const state = tracks.map(() => ({ nextTime: startAt, beat: 0, sub: 0 }));
  const timeouts = new Set<ReturnType<typeof setTimeout>>();

  const id = setInterval(() => {
    for (let i = 0; i < tracks.length; i++) {
      const { getSettings, onBeat } = tracks[i];
      const st = state[i];
      while (st.nextTime < output.now() + LOOKAHEAD_SEC) {
        const s = getSettings(st.beat, st.sub);
        if (st.beat >= s.beatsPerBar) st.beat = 0;
        if (st.sub >= s.subdivision) st.sub = 0;

        const sound =
          CLICK_SOUNDS.find((c) => c.id === s.soundId) ?? CLICK_SOUNDS[0];
        const vol = s.volume * sound.gain;
        const subSlots = Math.max(0, s.subdivision - 1);

        if (st.sub === 0) {
          const level = s.accents[st.beat] ?? 1;
          if (level === 2) {
            output.play(
              st.nextTime,
              sound.wave,
              sound.accentFreq,
              0.9 * vol,
              sound.length,
            );
          } else if (level === 1) {
            output.play(
              st.nextTime,
              sound.wave,
              sound.normalFreq,
              0.55 * vol,
              sound.length,
            );
          }
        } else if (subSlots > 0) {
          const subIndex = st.beat * subSlots + (st.sub - 1);
          const level = s.subAccents[subIndex] ?? 1;
          if (level === 2) {
            // Louder/higher-pitched than a normal subdivision click (same `normalFreq` a normal
            // main beat uses), but quieter than one — an accented "&" should stand out from the
            // other subdivision clicks without being confused for an actual downbeat.
            output.play(
              st.nextTime,
              sound.wave,
              sound.normalFreq,
              0.4 * vol,
              sound.length * 0.8,
            );
          } else if (level === 1) {
            output.play(
              st.nextTime,
              sound.wave,
              sound.subFreq,
              0.25 * vol,
              sound.length * 0.6,
            );
          }
        }

        const shownBeat = st.beat;
        const shownSub = st.sub;
        const delayMs = Math.max(0, (st.nextTime - output.now() + (output.latency?.() ?? 0)) * 1000);
        const t = setTimeout(() => {
          timeouts.delete(t);
          onBeat(shownBeat, shownSub);
        }, delayMs);
        timeouts.add(t);

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
      clearInterval(id);
      for (const t of timeouts) clearTimeout(t);
      timeouts.clear();
    },
  };
}

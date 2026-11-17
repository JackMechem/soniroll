import { getAudioContext } from "./metronome";
import { playDrum } from "./drumSounds";
import { setSteadyInterval } from "./steadyTimer";
import type { DrumVoice } from "./drums";
import { BAR_TICKS, BEATS_PER_BAR, barHits, TICKS_PER_BEAT, type Ostinato, type SyncopationBar } from "./syncopation";

// Plays Syncopation: the pattern (snare, or snare and bass drum) and the part underneath on the real kit, scheduled a bar at a
// time on the audio clock. What a bar plays (snare on/off, ostinato, click) is read when the bar
// is scheduled, so changes take over from the next bar; tempo changes apply at once.

export type SyncopationPlayback = {
  ostinato: Ostinato;
  /** Hear the written pattern (off = read it against what's underneath alone). */
  snare: boolean;
  /** A closed hi-hat on every beat. */
  click: boolean;
};

export type SyncopationRun = {
  stop: () => void;
  setBpm: (bpm: number) => void;
  setPlayback: (p: SyncopationPlayback) => void;
  setVoiceGains: (gains: Partial<Record<DrumVoice, number>>) => void;
  /** Where the music is: bar (from the current exercise's start; negative in the count-in) and
      tick within it, plus which exercise (0 = the first). */
  position: () => { exercise: number; bar: number; tick: number } | null;
};

export type SyncopationStart = {
  bars: SyncopationBar[];
  bpm: number;
  countIn: boolean;
  playback: SyncopationPlayback;
  voiceGains?: Partial<Record<DrumVoice, number>>;
  /** At the end of an exercise: the next one to play (the same bars to repeat it), or null to stop. */
  next: () => SyncopationBar[] | null;
  /** Called when the run stops by itself at the end. */
  onEnd: () => void;
};

const TICK_MS = 25;
const LOOKAHEAD = 0.2;
export const VOICES: DrumVoice[] = ["snare", "kick", "pedal", "hhClosed"];

export function startSyncopation(opts: SyncopationStart): SyncopationRun {
  const ctx = getAudioContext();
  void ctx.resume();
  let bpm = opts.bpm;
  let playback = opts.playback;
  let gains = opts.voiceGains ?? {};
  const countInBeats = opts.countIn ? BEATS_PER_BAR : 0;

  // Beats are counted from the first exercise's downbeat.
  let anchorTime = ctx.currentTime + 0.12;
  let anchorBeat = -countInBeats;
  const timeOf = (beat: number) => anchorTime + ((beat - anchorBeat) * 60) / bpm;
  const beatAt = (time: number) => anchorBeat + ((time - anchorTime) * bpm) / 60;

  const exercises: { startBar: number; bars: SyncopationBar[] }[] = [{ startBar: 0, bars: opts.bars }];
  let nextBar = 0; // the next bar (overall) to schedule
  let endBeat: number | null = null;

  let countBeat = -countInBeats; // the next count-in beat to schedule

  const play = (voice: DrumVoice, beat: number, velocity: number) => {
    const v = Math.max(0.05, Math.min(1, velocity * (1 + (Math.random() - 0.5) * 0.08)));
    playDrum("sticks", voice, Math.max(ctx.currentTime, timeOf(beat) + (Math.random() - 0.5) * 0.004), v, undefined, undefined, gains[voice] ?? 1);
  };

  const scheduleBar = (overall: number) => {
    let ex = exercises[exercises.length - 1];
    if (overall >= ex.startBar + ex.bars.length) {
      const bars = opts.next();
      if (!bars) {
        endBeat = overall * BEATS_PER_BAR;
        return false;
      }
      ex = { startBar: overall, bars };
      exercises.push(ex);
    }
    const bar = ex.bars[overall - ex.startBar];
    const base = overall * BEATS_PER_BAR;
    for (const h of barHits(bar, playback.ostinato)) {
      const beat = base + h.tick / TICKS_PER_BEAT;
      const onBeat = h.tick % TICKS_PER_BEAT === 0;
      if (h.pattern) {
        if (playback.snare) play(h.voice, beat, h.voice === "kick" ? 0.6 : onBeat ? 0.62 : 0.52);
      } else if (h.voice === "kick") play("kick", beat, h.accent ? 0.6 : 0.5);
      else if (h.voice === "hhClosed") play("hhClosed", beat, h.accent ? 0.5 : 0.36);
      else play("pedal", beat, 0.6);
    }
    if (playback.click) for (let b = 0; b < BEATS_PER_BAR; b++) play("hhClosed", base + b, b === 0 ? 0.5 : 0.35);
    return true;
  };

  let stopped = false;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    if (stopped) return;
    const horizon = beatAt(ctx.currentTime + LOOKAHEAD);
    // Count-in: the closed hi-hat on each beat of one bar.
    for (; countBeat < 0 && countBeat <= horizon; countBeat++)
      playDrum("sticks", "hhClosed", Math.max(ctx.currentTime, timeOf(countBeat)), countBeat === -countInBeats ? 0.75 : 0.55, undefined, undefined, gains.hhClosed ?? 1);
    while (endBeat === null && nextBar * BEATS_PER_BAR <= horizon) {
      if (!scheduleBar(nextBar)) break;
      nextBar++;
    }
    if (endBeat !== null && !endTimer) {
      endTimer = setTimeout(() => {
        if (!stopped) {
          stopped = true;
          stopTimer();
          opts.onEnd();
        }
      }, Math.max(0, (timeOf(endBeat) - ctx.currentTime) * 1000 + 150));
    }
  };
  const stopTimer = setSteadyInterval(tick, TICK_MS);
  tick();

  return {
    stop: () => {
      stopped = true;
      stopTimer();
      if (endTimer) clearTimeout(endTimer);
    },
    setBpm: (next) => {
      const now = beatAt(ctx.currentTime);
      anchorTime = ctx.currentTime;
      anchorBeat = now;
      bpm = next;
      // An end already planned moves with the tempo.
      if (endTimer && endBeat !== null) {
        clearTimeout(endTimer);
        endTimer = null;
      }
    },
    setPlayback: (p) => {
      playback = p;
    },
    setVoiceGains: (g) => {
      gains = g;
    },
    position: () => {
      const beat = beatAt(ctx.currentTime);
      const overall = Math.floor(beat / BEATS_PER_BAR);
      if (beat < 0) return { exercise: 0, bar: overall, tick: 0 };
      let idx = 0;
      for (let i = 0; i < exercises.length; i++) if (exercises[i].startBar <= overall) idx = i;
      const tickInBar = Math.floor((beat - overall * BEATS_PER_BAR) * TICKS_PER_BEAT + 1e-6);
      return { exercise: idx, bar: overall - exercises[idx].startBar, tick: Math.min(BAR_TICKS - 1, tickInBar) };
    },
  };
}

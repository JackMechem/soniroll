import { scheduleClick } from "./clickEngine";
import { getAudioContext } from "./metronome";
import { setSteadyInterval } from "./steadyTimer";
import {
  chartHarmony,
  generateChorus,
  initialBassState,
  makeRng,
  performedBeats,
  playbackOrder,
  type BassLineOptions,
  type BassLineState,
  type BassNote,
  type BassPhrase,
  type Harmony,
  type PerformedBeat,
} from "./bassLine";
import { generateLearnedChorus, type StyleModel } from "./bassLearned";
import { makePlayable } from "./bassPlayable";
import { compChorus, type CompEvent, type CompStyle } from "./comping";
import { compReady, playCompNote, type CompInstrument } from "./compSounds";
import { DEFAULT_DRUM_CONFIG, drumSkipPoint, type DrumConfig, type DrumHit, type DrumVoice } from "./drums";
import { ALL_VOICES, drumsReady, playDrum } from "./drumSounds";
import { generateStyledChorus, type BassStyle } from "./bassStyle";
import type { DrumStyle, GrooveBar, GrooveOptions } from "./drumStyles";
import type { IRealSong } from "./iRealPro";
import {
  barsOf,
  bassFamilyOf,
  chorusDrums,
  chorusSeed,
  grooveBeats,
  INITIAL_STYLE_BASS,
  styleBassChorus,
  type BassFamily,
  type StyleBassState,
} from "./rhythmSection";
import { playUprightBassNote } from "./uprightBass";

// Plays Rhythm Section: bass, chords and drums on one clock. Everything is written a chorus at a
// time (a chart's form, or 8 bars with no chart), a chorus ahead of the music, and scheduled on the
// audio clock a little ahead of time. The drum style decides how the band plays (see
// `packages/core/rhythmSection.ts`): the swing styles walk, comp and swing; the others play the
// Drum Generator's groove with a style bass part and held chords. Tempo changes apply at once (the
// clock re-anchors); a new style or groove option takes over at the next bar line — everything
// written from there is rewritten, so the bass, chords and drums always change together.

export type RhythmSectionRun = {
  stop: () => void;
  setBpm: (bpm: number) => void;
  setClick: (on: boolean) => void;
  /** Hi-hat click level, 0–1. */
  setClickVolume: (volume: number) => void;
  setSwing: (swing: BassSwing) => void;
  /** Chords under the bass (null = off); from the next chord played. */
  setComp: (comp: { instrument: CompInstrument; style: CompStyle } | null) => void;
  setBass: (on: boolean) => void;
  setDrums: (on: boolean) => void;
  /** The swing drummer comping (snare chatter, section accents) or just keeping time. */
  setDrumsComping: (on: boolean) => void;
  /** The swing drummer's settings: swing, lay back and timing at once, patterns from the next chorus. */
  setDrumConfig: (config: DrumConfig) => void;
  /** The groove styles' timing and level looseness, 0–1. */
  setHumanize: (amount: number) => void;
  /** Each kit part's fader (a gain per voice, 1 = as recorded). */
  setVoiceGains: (gains: Partial<Record<DrumVoice, number>>) => void;
  /** A new drum style and/or groove options, from the next bar line (the bass and chords follow
      the style too). */
  setGroove: (style: DrumStyle, opts: GrooveOptions) => void;
  /** Swap in a changed chart (an edited typed progression), from the next chorus written. */
  setSong: (song: IRealSong) => void;
  /** Where the music is now: the performance beat, the performance bar (−1 in the count-in) and
      how far into it. */
  position: () => { beat: number; bar: number; inBar: number };
};

/** How far the off-beat eighths are pushed: "auto" follows the tempo. */
export type BassSwing = "straight" | "auto" | "light" | "hard";

/** Where the off-beat eighth lands, as a fraction of the beat (0.5 = straight, 2/3 = triplet). */
export function swingPoint(swing: BassSwing, bpm: number): number {
  // Long-to-short ratio: about triplet swing up to medium tempos, flattening out as it gets fast.
  const ratio =
    swing === "straight" ? 1 : swing === "light" ? 1.5 : swing === "hard" ? 2.3 : Math.max(1.15, Math.min(2, 2 - ((bpm - 140) * 0.8) / 160));
  return ratio / (1 + ratio);
}

/** Where the drummer's skip note falls (fraction of the beat): the drum settings' swing (easing
    at fast tempos if set), nudged by the Swing setting — lighter or harder; straight is straight. */
export function drumSwingPoint(swing: BassSwing, bpm: number, config: DrumConfig = DEFAULT_DRUM_CONFIG): number {
  const base = drumSkipPoint(config, bpm, swing === "straight");
  return swing === "light" ? Math.max(0.5, base - 0.05) : swing === "hard" ? Math.min(0.8, base + 0.03) : base;
}

type LineSource = { song: IRealSong; line: BassLineOptions; style?: BassStyle | null; model?: StyleModel | null };

/** One chorus of the walking line, by whoever is playing it (the Computer, a player's phrases, or
    their style), made playable on an upright at `bpm`. */
function writeLine(
  src: LineSource,
  harmony: ReturnType<typeof chartHarmony>,
  state: BassLineState,
  chorusIndex: number,
  startBeat: number,
  isLast: boolean,
  bpm: number,
  previousNote: BassNote | null,
) {
  const { chorus, state: next } =
    src.line.styleMode === "learn" && src.model
      ? generateLearnedChorus(src.song, src.line, src.model, state, chorusIndex, startBeat, isLast, harmony)
      : src.style
        ? generateStyledChorus(src.song, src.line, src.style, state, chorusIndex, startBeat, isLast, harmony)
        : generateChorus(src.song, src.line, state, chorusIndex, startBeat, isLast, harmony);
  // Whatever wrote it, it has to be playable on an upright at this tempo.
  const playable = makePlayable(chorus.notes, bpm, previousNote).notes;
  const last = playable[playable.length - 1];
  return { chorus, playable, state: last && !last.ghost ? { ...next, lastNote: last.midi } : next };
}

/** The chord on the first beat of the form (where a push over the end of a chorus lands). */
function firstHarmony(song: IRealSong, harmony: ReturnType<typeof chartHarmony>): Harmony | null {
  return harmony[playbackOrder(song.bars, false)[0] ?? 0]?.perBeat[0] ?? null;
}

/** The bass line of a chorus, for the family the style plays. */
function writeBass(
  family: BassFamily,
  src: LineSource,
  harmony: ReturnType<typeof chartHarmony>,
  beats: PerformedBeat[],
  snap: { bass: BassLineState; styleBass: StyleBassState; prevNote: BassNote | null },
  chorus: number,
  start: number,
  isLast: boolean,
  bpm: number,
  seed: number,
) {
  if (family === "walking") {
    const out = writeLine(src, harmony, snap.bass, chorus, start, isLast, bpm, snap.prevNote);
    return { notes: out.playable, beats: out.chorus.beats, phrases: out.chorus.phrases ?? [], bass: out.state, styleBass: INITIAL_STYLE_BASS };
  }
  const out = styleBassChorus(family, beats, start, {
    touch: src.line.touch,
    isLast,
    seed: chorusSeed(seed, chorus, 0xba55),
    nextHarmony: isLast ? null : firstHarmony(src.song, harmony),
    state: snap.styleBass,
  });
  const notes = makePlayable(out.notes, bpm, snap.prevNote).notes;
  const last = notes[notes.length - 1];
  // The walking line's seed moves on too, so switching back to swing doesn't repeat itself.
  const bass = { ...snap.bass, seed: makeRng(snap.bass.seed).seed(), lastNote: last?.midi ?? snap.bass.lastNote };
  return { notes, beats, phrases: [] as BassPhrase[], bass, styleBass: out.state };
}

/** The first chorus a performance with these settings and `seed` would play — written without
    playing anything, to show the line before Play. */
export function previewChorus(src: LineSource & { bpm: number; choruses: number; seed: number; groove: DrumStyle }) {
  const harmony = chartHarmony(src.song);
  const isLast = src.choruses === 1;
  const { beats } = performedBeats(src.song, harmony, 0, isLast);
  const out = writeBass(
    bassFamilyOf(src.groove),
    src,
    harmony,
    beats,
    { bass: initialBassState(src.seed), styleBass: INITIAL_STYLE_BASS, prevNote: null },
    0,
    0,
    isLast,
    src.bpm,
    src.seed,
  );
  return { notes: out.notes, beats: out.beats, start: 0, phrases: out.phrases };
}

/** Bars per chorus with no chart. */
export const GROOVE_BARS = 8;

/** The drums a performance would play first (the preview before Play): the first chorus. */
export function previewDrums(opts: {
  song: IRealSong | null;
  groove: DrumStyle;
  grooveOpts: GrooveOptions;
  drumConfig: DrumConfig;
  choruses: number;
  grooveSeed: number;
}) {
  const isLast = !!opts.song && opts.choruses === 1;
  const beats = opts.song ? performedBeats(opts.song, chartHarmony(opts.song), 0, isLast).beats : grooveBeats(opts.groove, 0, GROOVE_BARS, 0);
  return chorusDrums(opts.groove, beats, 0, 0, chorusSeed(opts.grooveSeed, 0, 0x3d), {
    chorus: 0,
    isLast,
    sectionBars: opts.song ? sectionBarsOf(opts.song) : undefined,
    config: opts.drumConfig,
    groove: opts.grooveOpts,
  }).bars;
}

/** Written bars of a chart that start a section (`*A`, `*B`…). */
function sectionBarsOf(song: IRealSong): Set<number> {
  return new Set(song.bars.map((b, i) => (b.section ? i : -1)).filter((i) => i >= 0));
}

export type RhythmSectionStart = {
  /** The chart; null = no chart, the drums play on their own. */
  song: IRealSong | null;
  bass: boolean;
  line: BassLineOptions;
  /** A modelled player's analysed transcriptions; null = the Computer. */
  style?: BassStyle | null;
  /** The same player's habits, for "learn their style" (`line.styleMode === "learn"`). */
  model?: StyleModel | null;
  groove: DrumStyle;
  grooveOpts: GrooveOptions;
  drums: boolean;
  drumsComping: boolean;
  drumConfig: DrumConfig;
  humanize: number;
  voiceGains: Partial<Record<DrumVoice, number>>;
  bpm: number;
  /** The bass line's seed and the drums' seed: the same seeds (and settings) play what
      `previewChorus` / `previewDrums` showed. */
  seed: number;
  grooveSeed: number;
  /** How many times through the form; 0 = keep going until stopped (always, with no chart). */
  choruses: number;
  countIn: boolean;
  click: boolean;
  clickVolume: number;
  swing: BassSwing;
  comp: { instrument: CompInstrument; style: CompStyle } | null;
  /** Fires as each beat is heard: its index in the performance (negative during the count-in). */
  onBeat: (beat: number, info: PerformedBeat | null) => void;
  /** Each chorus's bass line as soon as it's written (ahead of the music), and again if it's
      rewritten from a bar line: its notes and beats, and the performance beat it starts on. */
  onWrite?: (chorus: number, notes: BassNote[], beats: PerformedBeat[], startBeat: number, phrases: BassPhrase[]) => void;
  /** Each chorus's drums as notation bars (just time / comping), as written or rewritten. */
  onDrums?: (chorus: number, bars: { time: GrooveBar[]; comp: GrooveBar[] }) => void;
  onEnd: () => void;
};

const TICK_MS = 25;
const LOOKAHEAD = 0.2;

/** A drum hit queued to play; `pattern`: a groove style's hit (straight, humanized by the Human
    feel setting) rather than the swing drummer's. */
type QueuedHit = DrumHit & { pattern?: boolean };

/** One chorus as written: where it starts, its beats, and the state everything started from (so
    it can be rewritten from a bar line). */
type Chorus = {
  index: number;
  start: number;
  startBar: number;
  isLast: boolean;
  beats: PerformedBeat[];
  snap: { bass: BassLineState; styleBass: StyleBassState; voicing: Record<CompStyle, number[] | null>; prevNote: BassNote | null };
  notes: BassNote[];
  drumBars: { time: GrooveBar[]; comp: GrooveBar[] };
};

export function startRhythmSection(opts: RhythmSectionStart): RhythmSectionRun {
  const ctx = getAudioContext();
  void ctx.resume();
  let song = opts.song;
  let harmony = song ? chartHarmony(song) : [];
  let groove = opts.groove;
  let grooveOpts = opts.grooveOpts;
  const firstBeats = song ? (harmony[playbackOrder(song.bars, false)[0] ?? 0]?.beats ?? 4) : groove.beats;
  const countIn = opts.countIn ? firstBeats : 0;

  let bpm = opts.bpm;
  let click = opts.click;
  let clickVolume = opts.clickVolume;
  let swing = opts.swing;
  let comp = opts.comp;
  let bassOn = opts.bass;
  let drumsOn = opts.drums;
  let drumsComping = opts.drumsComping;
  let drumConfig = opts.drumConfig;
  let humanize = opts.humanize;
  let gains = opts.voiceGains;

  // Where the family (walking or not) changes, by performance beat: the walking families swing
  // their eighths, the others play them straight.
  let walkingFrom: { at: number; walking: boolean }[] = [{ at: -Infinity, walking: bassFamilyOf(groove) === "walking" }];
  const walkingAt = (beat: number) => {
    let w = walkingFrom[0].walking;
    for (const f of walkingFrom) if (beat >= f.at - 1e-6) w = f.walking;
    return w;
  };
  const swingAt = (beat: number): BassSwing => (walkingAt(beat) ? swing : "straight");

  // One human offset per moment, shared by every drum struck then, so the hi-hat foot, ride and
  // kick on a beat stay locked together.
  const feel = new Map<number, number>();
  const feelAt = (time: number, spread: number) => {
    const key = Math.round(time * 1000);
    let f = feel.get(key);
    if (f === undefined) {
      f = (Math.random() - 0.5) * 2 * spread;
      feel.set(key, f);
      if (feel.size > 512) feel.delete(feel.keys().next().value as number);
    }
    return f;
  };
  /** Swings a point in time: an off-beat eighth ("and") moves late; everything else (beats,
      triplets, sixteenths) stays put. */
  const swung = (beat: number) => {
    const whole = Math.floor(beat + 1e-6);
    return Math.abs(beat - whole - 0.5) < 1e-6 ? whole + swingPoint(swingAt(beat), bpm) : beat;
  };
  // Beat `anchorBeat` (performance beats; the count-in is negative) sounds at `anchorTime`.
  let anchorTime = ctx.currentTime + 0.12;
  let anchorBeat = -countIn;
  const timeOf = (beat: number) => anchorTime + ((beat - anchorBeat) * 60) / bpm;
  const beatAt = (time: number) => anchorBeat + ((time - anchorTime) * bpm) / 60;

  // What's been written: every beat and bar of the performance, the queues still to play.
  const beats: PerformedBeat[] = [];
  const barStarts: number[] = [];
  const choruses: Chorus[] = [];
  const notes: BassNote[] = [];
  const comps: Record<CompStyle, CompEvent[]> = { comp: [], sustain: [] };
  const drumHits: Record<"time" | "comp", QueuedHit[]> = { time: [], comp: [] };
  let nextNote = 0;
  const nextComp: Record<CompStyle, number> = { comp: 0, sustain: 0 };
  const nextDrum: Record<"time" | "comp", number> = { time: 0, comp: 0 };
  // What the next chorus starts from.
  let running = {
    bass: initialBassState(opts.seed),
    styleBass: INITIAL_STYLE_BASS,
    voicing: { comp: null, sustain: null } as Record<CompStyle, number[] | null>,
  };
  let finished = false;

  /** Puts `items` into the part of `list` not played yet, keeping it in time order. */
  function enqueue<T extends { beat: number }>(list: T[], from: number, items: T[]) {
    const tail = list.splice(from).concat(items);
    tail.sort((a, b) => a.beat - b.beat);
    list.push(...tail);
  }
  /** Drops what isn't played yet from beat `cut` on. */
  function dropFrom<T extends { beat: number }>(list: T[], from: number, cut: number) {
    const keep = list.splice(from).filter((x) => x.beat < cut - 1e-6);
    list.push(...keep);
  }

  /** Writes chorus `c`'s music with the current settings, keeping what was written before beat
      `from` and replacing everything from there. */
  function compose(c: Chorus, from: number) {
    const family = bassFamilyOf(groove);
    const walking = family === "walking";
    if (song) {
      const b = writeBass(family, { song, line: opts.line, style: opts.style, model: opts.model }, harmony, c.beats, c.snap, c.index, c.start, c.isLast, bpm, opts.seed);
      // The walking line's beats carry where each phrase came from (for the status line).
      b.beats.forEach((bt, i) => {
        if (c.start + i >= from - 1e-6) {
          c.beats[i] = bt;
          if (beats.length > c.start + i) beats[c.start + i] = bt;
        }
      });
      const fresh = b.notes.filter((n) => n.beat >= from - 1e-6);
      c.notes = [...c.notes.filter((n) => n.beat < from - 1e-6), ...fresh];
      enqueue(notes, nextNote, fresh);
      running = { ...running, bass: b.bass, styleBass: b.styleBass };
      opts.onWrite?.(c.index, c.notes, c.beats, c.start, b.phrases);
      // Chords: both comping styles written (switchable while playing); the groove styles hold them.
      const voicing = { ...c.snap.voicing };
      for (const st of ["comp", "sustain"] as const) {
        const out = compChorus(c.beats, c.start, walking ? st : "sustain", chorusSeed(opts.seed, c.index, st === "comp" ? 0x51 : 0x77), c.snap.voicing[st]);
        enqueue(comps[st], nextComp[st], out.events.filter((e) => e.beat >= from - 1e-6));
        voicing[st] = out.last;
      }
      running = { ...running, voicing };
    }
    const d = chorusDrums(groove, c.beats, c.start, c.startBar, chorusSeed(opts.grooveSeed, c.index, 0x3d), {
      chorus: c.index,
      isLast: c.isLast,
      sectionBars: song ? sectionBarsOf(song) : undefined,
      config: drumConfig,
      groove: grooveOpts,
    });
    const pattern = !groove.swing;
    for (const way of ["time", "comp"] as const)
      enqueue(
        drumHits[way],
        nextDrum[way],
        d[way].filter((h) => h.beat >= from - 1e-6).map((h) => ({ ...h, pattern })),
      );
    const fromBar = c.startBar + barsOf(c.beats).findIndex((_, i, all) => c.start + all[i].b >= from - 1e-6);
    const splice = (old: GrooveBar[], next: GrooveBar[]) =>
      from === -Infinity ? next : [...old.filter((b) => b.bar < fromBar), ...next.filter((b) => b.bar >= fromBar)];
    c.drumBars = { time: splice(c.drumBars.time, d.bars.time), comp: splice(c.drumBars.comp, d.bars.comp) };
    opts.onDrums?.(c.index, c.drumBars);
  }

  const writeChorus = () => {
    const index = choruses.length ? choruses[choruses.length - 1].index + 1 : 0;
    const isLast = !!song && opts.choruses > 0 && index === opts.choruses - 1;
    const start = beats.length;
    const startBar = barStarts.length;
    const chorusBeats = song ? performedBeats(song, harmony, index, isLast).beats : grooveBeats(groove, startBar, GROOVE_BARS, index);
    const c: Chorus = {
      index,
      start,
      startBar,
      isLast,
      beats: chorusBeats,
      snap: { ...running, prevNote: notes[notes.length - 1] ?? null },
      notes: [],
      drumBars: { time: [], comp: [] },
    };
    compose(c, -Infinity);
    beats.push(...c.beats);
    for (const bar of barsOf(c.beats)) barStarts.push(start + bar.b);
    choruses.push(c);
    if (isLast) finished = true;
  };
  writeChorus();

  let nextBeat = -countIn; // next beat to schedule clicks/UI for
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  const later = (fn: () => void, at: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, Math.max(0, (at - ctx.currentTime) * 1000));
    timers.add(t);
  };

  const kitReady = () => drumsReady("sticks", ALL_VOICES);

  const tick = () => {
    const horizon = ctx.currentTime + LOOKAHEAD;
    // Keep at least two bars written ahead.
    while (!finished && beats.length - Math.max(0, Math.ceil(beatAt(horizon))) < 8) writeChorus();

    while (nextNote < notes.length && timeOf(notes[nextNote].beat) < horizon) {
      const n = notes[nextNote++];
      if (!bassOn) continue;
      const jitter = (Math.random() - 0.5) * 0.012; // a few ms either way, so it breathes
      const startBeat = swung(n.beat);
      const start = timeOf(startBeat) + (n.beat > 0 ? jitter : 0);
      const length = ((swung(n.beat + n.length) - startBeat) * 60) / bpm;
      const last = finished && nextNote === notes.length;
      playUprightBassNote(n.midi, start, last ? length + 1.5 : length + 0.015, n.velocity, n.ghost);
    }

    for (const style of ["comp", "sustain"] as const) {
      const list = comps[style];
      while (nextComp[style] < list.length && timeOf(swung(list[nextComp[style]].beat)) < horizon) {
        const e = list[nextComp[style]++];
        if (!comp || comp.style !== style || !compReady(comp.instrument)) continue;
        const start = timeOf(swung(e.beat));
        const seconds = timeOf(swung(e.beat + e.length)) - start;
        // A hair of spread, like real fingers, bottom note first.
        e.midis.forEach((m, i) => playCompNote(comp!.instrument, m, start + i * 0.006 + Math.random() * 0.004, seconds, e.velocity));
      }
    }

    for (const way of ["time", "comp"] as const) {
      const list = drumHits[way];
      while (nextDrum[way] < list.length && timeOf(swung(list[nextDrum[way]].beat)) < horizon) {
        const h = list[nextDrum[way]++];
        if (!drumsOn || (way === "comp") !== drumsComping || !kitReady()) continue;
        const gain = gains[h.voice] ?? 1;
        if (h.pattern) {
          // A groove style: straight on its grid, loosened by the Human feel setting.
          const at = timeOf(h.beat);
          const time = at + feelAt(at, 0.012 * humanize);
          const velocity = Math.max(0.03, Math.min(1, h.velocity * (1 + (Math.random() - 0.5) * 0.16 * humanize)));
          playDrum("sticks", h.voice, Math.max(ctx.currentTime, time), velocity, undefined, h.tone, gain);
          continue;
        }
        const sw = swingAt(h.beat);
        const where = h.skip
          ? h.beat + (sw === "straight" ? 0.5 : Math.max(0.52, Math.min(0.82, drumSwingPoint(sw, bpm, drumConfig) + (h.swing ?? 0))))
          : swung(h.beat);
        // A human touch shared by the beat, plus any laid-back lag.
        const start = timeOf(where) + feelAt(timeOf(where), drumConfig.timingMs / 1000) + (h.late !== undefined ? drumConfig.layBackMs / 1000 : 0);
        const seconds = h.length !== undefined ? timeOf(swung(h.beat + h.length)) - timeOf(swung(h.beat)) + 0.15 : undefined;
        playDrum("sticks", h.voice, start, h.velocity, seconds, h.tone, gain);
      }
    }

    while (timeOf(nextBeat) < horizon && nextBeat < beats.length) {
      const b = nextBeat++;
      const at = timeOf(b);
      if (b < 0) {
        // The count-in: the closed hi-hat with the drums, else a click.
        if (drumsOn && kitReady()) playDrum("sticks", "hhClosed", at, b === -countIn ? 0.75 : 0.55, undefined, undefined, gains.hhClosed ?? 1);
        else scheduleClick(ctx, at, "triangle", b === -countIn ? 1600 : 1100, 0.35, 0.05);
      } else {
        const info = beats[b];
        if (click && !drumsOn && info && info.beatsInBar % 2 === 0 && info.beatInBar % 2 === 1) {
          if (clickVolume > 0) scheduleClick(ctx, at, "square", 5200, 0.085 * clickVolume, 0.03);
        }
      }
      later(() => opts.onBeat(b, b >= 0 ? (beats[b] ?? null) : null), at);
    }

    if (finished && nextNote >= notes.length && nextBeat >= beats.length) {
      stopInterval();
      later(() => {
        stopped = true;
        opts.onEnd();
      }, timeOf(beats.length) + 1.5);
    }
  };
  const stopInterval = setSteadyInterval(tick, TICK_MS);
  tick();

  /** The first bar line at or after `beat` (or the end of what's written). */
  const barLineFrom = (beat: number) => barStarts.find((s) => s >= beat - 1e-6) ?? beats.length;

  return {
    stop() {
      stopped = true;
      stopInterval();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
    setBpm(next: number) {
      if (next === bpm) return;
      const now = ctx.currentTime + LOOKAHEAD; // everything before this is already scheduled
      anchorBeat = beatAt(now);
      anchorTime = now;
      bpm = next;
    },
    setClick(on) {
      click = on;
    },
    setClickVolume(v) {
      clickVolume = v;
    },
    setSwing(next) {
      swing = next;
    },
    setComp(next) {
      comp = next;
    },
    setBass(on) {
      bassOn = on;
    },
    setDrums(on) {
      drumsOn = on;
    },
    setDrumsComping(on) {
      drumsComping = on;
    },
    setDrumConfig(next) {
      drumConfig = next;
    },
    setHumanize(amount) {
      humanize = amount;
    },
    setVoiceGains(next) {
      gains = next;
    },
    setGroove(nextStyle, nextOpts) {
      if (nextStyle.id === groove.id && JSON.stringify(nextOpts) === JSON.stringify(grooveOpts)) return;
      // From the next bar line of what's playing now (or the top, during the count-in).
      const cut = barLineFrom(Math.max(0, beatAt(ctx.currentTime + LOOKAHEAD)));
      const familyChanged = bassFamilyOf(nextStyle) !== bassFamilyOf(groove);
      groove = nextStyle;
      grooveOpts = nextOpts;
      if (familyChanged) walkingFrom = [...walkingFrom.filter((f) => f.at < cut), { at: cut, walking: bassFamilyOf(nextStyle) === "walking" }];
      dropFrom(notes, nextNote, cut);
      for (const st of ["comp", "sustain"] as const) dropFrom(comps[st], nextComp[st], cut);
      for (const way of ["time", "comp"] as const) dropFrom(drumHits[way], nextDrum[way], cut);
      if (cut >= beats.length) return; // nothing written past it: the next chorus is written the new way

      if (!song) {
        // No chart: the bars from the cut follow the new style's meter, so they're written afresh.
        const k = choruses.findIndex((c) => cut >= c.start && cut < c.start + c.beats.length);
        const c = choruses[k];
        choruses.splice(k + 1);
        c.beats = c.beats.slice(0, cut - c.start);
        const cutBar = barStarts.findIndex((s) => s >= cut - 1e-6);
        c.drumBars = { time: c.drumBars.time.filter((b) => b.bar < cutBar), comp: c.drumBars.comp.filter((b) => b.bar < cutBar) };
        opts.onDrums?.(c.index, c.drumBars);
        beats.length = cut;
        barStarts.splice(cutBar);
        if (c.beats.length === 0) choruses.splice(k, 1);
        finished = false;
        return;
      }
      // A chart: rewrite every chorus written from the cut on, each from where the one before it
      // now ends.
      let first = true;
      for (const c of choruses) {
        if (c.start + c.beats.length <= cut) continue;
        if (!first) c.snap = { ...running, prevNote: [...notes].reverse().find((n) => n.beat < c.start) ?? null };
        first = false;
        compose(c, cut);
      }
    },
    setSong(next) {
      song = next;
      harmony = chartHarmony(next);
    },
    position() {
      const beat = beatAt(ctx.currentTime);
      if (beat < 0) return { beat, bar: -1, inBar: beat };
      let lo = 0;
      let hi = barStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (barStarts[mid] <= beat + 1e-6) lo = mid;
        else hi = mid - 1;
      }
      return { beat, bar: lo, inBar: beat - (barStarts[lo] ?? 0) };
    },
  };
}

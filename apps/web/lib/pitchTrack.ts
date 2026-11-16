/**
 * The Tuner's look back at a take: the take's pitch, worked out ahead of time for the whole file,
 * with the same detector the live tuner uses (`detectPitch`, YIN) on the same 30 ms steps. The
 * needle and the pitch graph then just read it at the playhead.
 *
 * To keep that quick (a minute of audio takes a couple of seconds), the audio is first mixed to
 * mono and brought down to about 24 kHz (a gentle low-pass, then every 2nd sample at 48 kHz), and
 * the detector looks at the same ~85 ms window the live tuner does (4096 samples at 48 kHz, 2048
 * here). At 24 kHz YIN is still well under a cent out for the notes an instrument plays.
 */

import { SENSITIVITY } from "@/lib/audioInput";
import { detectPitch } from "@/lib/pitchDetect";

/** Bump when the analysis changes, so stored tracks are worked out again. */
export const PITCH_TRACK_VERSION = 1;

export type PitchTrack = {
  version: number;
  /** Seconds between frames. */
  hop: number;
  /** Time of frame 0 (the middle of its window), in seconds. */
  offset: number;
  /** Detected pitch per frame in Hz (0: none). */
  freq: Float32Array;
  /** Loudness per frame (RMS), for the Sensitivity setting. */
  rms: Float32Array;
  /** How many frames are worked out so far (all of them when finished). */
  done: number;
};

export type TrackReading = { target: number; cents: number; freq: number };

/** One played note: a run of frames heard as the same note. */
export type TrackNote = {
  /** MIDI note (concert pitch). */
  target: number;
  first: number;
  last: number;
  /** Median cents off, for the note as a whole. */
  cents: number;
  /** Too short to count (a slide, a ghost note, the attack of something else). */
  short: boolean;
};

const HOP_SEC = 0.03;
const WINDOW_SEC = 4096 / 48000;
const TARGET_RATE = 24000;
/** Nothing quieter than the most sensitive setting is worth analysing. */
const MIN_RMS = Math.min(...Object.values(SENSITIVITY).map((s) => s.rms));
/** The live tuner keeps showing a note this long after it stops hearing it. */
const HOLD_SEC = 0.8;
/** A note survives this many silent frames in the middle (a little dropout). */
const GAP_FRAMES = 2;
/** Notes shorter than this many frames (~90 ms) aren't labelled or counted. */
const SHORT_FRAMES = 3;
/** Within this many cents counts as in tune (the live tuner's green). */
export const IN_TUNE_CENTS = 8;
/** Within this many is close (amber); further is off (red). */
export const CLOSE_CENTS = 25;

/** The theme colour for being this many cents off (`--tune-in`, `--tune-close`, `--tune-off`). */
export function centsColor(cents: number): string {
  const abs = Math.abs(cents);
  return abs <= IN_TUNE_CENTS ? "var(--tune-in)" : abs <= CLOSE_CENTS ? "var(--tune-close)" : "var(--tune-off)";
}

/** Mono, at about 24 kHz. */
function prepare(buffer: AudioBuffer): { data: Float32Array; rate: number } {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const len = buffer.length;
  const factor = Math.max(1, Math.round(buffer.sampleRate / TARGET_RATE));
  const mono = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i];
  if (channels.length > 1) for (let i = 0; i < len; i++) mono[i] /= channels.length;
  if (factor === 1) return { data: mono, rate: buffer.sampleRate };
  // A triangular low-pass (two boxes of `factor` samples), then every `factor`th sample.
  const width = 2 * factor - 1;
  const weights = Array.from({ length: width }, (_, k) => factor - Math.abs(k - (factor - 1)));
  const total = factor * factor;
  const out = new Float32Array(Math.floor(len / factor));
  for (let j = 0; j < out.length; j++) {
    const centre = j * factor;
    let sum = 0;
    for (let k = 0; k < width; k++) {
      const i = centre + k - (factor - 1);
      if (i >= 0 && i < len) sum += mono[i] * weights[k];
    }
    out[j] = sum / total;
  }
  return { data: out, rate: buffer.sampleRate / factor };
}

/** Works out a take's pitch track, a slice at a time so the page stays responsive. `onProgress`
    gets the same (growing) track as frames are done. Resolves null if `cancelled()` turns true. */
export async function analyseTake(
  buffer: AudioBuffer,
  onProgress: (track: PitchTrack) => void,
  cancelled: () => boolean,
): Promise<PitchTrack | null> {
  const { data, rate } = prepare(buffer);
  const win = Math.round(WINDOW_SEC * rate);
  const hop = Math.round(HOP_SEC * rate);
  const frames = data.length < win ? (data.length > 0 ? 1 : 0) : Math.floor((data.length - win) / hop) + 1;
  const track: PitchTrack = {
    version: PITCH_TRACK_VERSION,
    hop: hop / rate,
    offset: win / 2 / rate,
    freq: new Float32Array(frames),
    rms: new Float32Array(frames),
    done: 0,
  };
  const frame = new Float32Array(win);
  let sliceStart = performance.now();
  let lastReport = sliceStart;
  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    frame.fill(0);
    frame.set(data.subarray(start, Math.min(data.length, start + win)));
    let sum = 0;
    for (let i = 0; i < win; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / win);
    track.rms[f] = rms;
    track.freq[f] = rms < MIN_RMS ? 0 : (detectPitch(frame, rate) ?? 0);
    track.done = f + 1;
    const now = performance.now();
    if (now - sliceStart > 12) {
      if (now - lastReport > 150) {
        lastReport = now;
        onProgress(track);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (cancelled()) return null;
      sliceStart = performance.now();
    }
  }
  onProgress(track);
  return track;
}

/** Is a stored track usable (same analysis, finished)? */
export function isCurrentTrack(track: PitchTrack | undefined): track is PitchTrack {
  return !!track && track.version === PITCH_TRACK_VERSION && track.done === track.freq.length;
}

function voiced(track: PitchTrack, f: number, minRms: number) {
  return track.freq[f] > 0 && track.rms[f] >= minRms;
}

function midiOf(freq: number, refA: number) {
  return 69 + 12 * Math.log2(freq / refA);
}

/** The frame nearest to `t` seconds. */
export function frameAt(track: PitchTrack, t: number): number {
  return Math.min(Math.max(0, Math.round((t - track.offset) / track.hop)), Math.max(0, track.done - 1));
}

export function timeOfFrame(track: PitchTrack, f: number): number {
  return track.offset + f * track.hop;
}

/** What the needle shows at `t`: the nearest note (chromatic) and how far off it, held for a
    moment through silence like the live tuner, and smoothed over two frames the same way. */
export function readingAt(track: PitchTrack, t: number, refA: number, minRms: number): TrackReading | null {
  if (track.done === 0 || t < 0) return null;
  const f = frameAt(track, t);
  const hold = Math.round(HOLD_SEC / track.hop);
  for (let k = f; k >= Math.max(0, f - hold); k--) {
    if (!voiced(track, k, minRms)) continue;
    const freq = track.freq[k];
    const midi = midiOf(freq, refA);
    const target = Math.round(midi);
    let cents = (midi - target) * 100;
    if (k > 0 && voiced(track, k - 1, minRms)) {
      const prev = midiOf(track.freq[k - 1], refA);
      if (Math.round(prev) === target) cents = cents * 0.5 + (prev - target) * 50;
    }
    return { target, cents, freq };
  }
  return null;
}

/** Cents off the nearest note for a voiced frame, else null. */
export function centsOfFrame(track: PitchTrack, f: number, refA: number, minRms: number): { target: number; cents: number } | null {
  if (!voiced(track, f, minRms)) return null;
  const midi = midiOf(track.freq[f], refA);
  const target = Math.round(midi);
  return { target, cents: (midi - target) * 100 };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The notes in a track: runs of frames on the same note, with how far off each was. */
export function notesOf(track: PitchTrack, refA: number, minRms: number): TrackNote[] {
  const notes: TrackNote[] = [];
  let cur: { target: number; first: number; last: number; cents: number[] } | null = null;
  const close = () => {
    if (!cur) return;
    notes.push({
      target: cur.target,
      first: cur.first,
      last: cur.last,
      cents: median(cur.cents),
      short: cur.cents.length < SHORT_FRAMES,
    });
    cur = null;
  };
  for (let f = 0; f < track.done; f++) {
    const c = centsOfFrame(track, f, refA, minRms);
    if (!c) {
      if (cur && f - cur.last > GAP_FRAMES) close();
      continue;
    }
    if (cur && (cur.target !== c.target || f - cur.last > GAP_FRAMES + 1)) close();
    if (!cur) cur = { target: c.target, first: f, last: f, cents: [] };
    cur.last = f;
    cur.cents.push(c.cents);
  }
  close();
  return notes;
}

export type TrackSummary = { notes: number; inTune: number; sharp: number; flat: number; average: number };

/** How a take went, over the notes long enough to count. */
export function summarise(notes: TrackNote[]): TrackSummary {
  const counted = notes.filter((n) => !n.short);
  const inTune = counted.filter((n) => Math.abs(n.cents) <= IN_TUNE_CENTS).length;
  const sharp = counted.filter((n) => n.cents > IN_TUNE_CENTS).length;
  const average = counted.length ? counted.reduce((s, n) => s + n.cents, 0) / counted.length : 0;
  return { notes: counted.length, inTune, sharp, flat: counted.length - inTune - sharp, average };
}

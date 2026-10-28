import {
  CLICK_SOUNDS,
  mainBeatClick,
  scheduleClick,
  startClickEngine,
  subClick,
  type BeatLevel,
  type ClickEngine,
  type ClickSettings,
} from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import { startPadInput, type PadChunk, type PadInput } from "@/lib/padInput";
import { calibrate as gradeCalibration, detectorFor, LiveGrader, type Calibration, type Take } from "./analysis";
import { ClockMap } from "./clock";
import { Detector, type Onset } from "./onset";

/**
 * The Time Test's engine: the click, the mic, live stroke detection, recording a take,
 * calibration and playing a take back. A plain module (like `metronomeEngine.ts`), read by the
 * page through two small stores: the main state, and the mic's level (which changes 20 times a
 * second, so only the meter re-renders for it).
 *
 * Everything is measured on the click's clock (the AudioContext's time). The mic module tags
 * each chunk of samples with where it sits on that clock (see `lib/padInput.ts`), the click
 * engine reports the exact time of every click it schedules, and a take puts both on the
 * recording's own timeline.
 */

export type Phase = "idle" | "recording" | "calibrating";
export type LiveHit = { id: number; errorMs: number };
export type Tick = { beat: number; sub: number; bar: number };

export type TimeTestSnapshot = {
  phase: Phase;
  /** The tick being heard; `bar` counts from 0 at the first bar (count-in included). */
  tick: Tick | null;
  /** Strokes graded live while recording, after the count-in. */
  liveHits: LiveHit[];
  micOpen: boolean;
  micError: string | null;
  /** A guess at the round trip, for before the first calibration. */
  latencyGuessMs: number | null;
  playing: boolean;
};

export type MicMeter = { levelDb: number; stroke: { key: number; db: number } | null };

/** Longest take kept (samples beyond this are dropped). */
const MAX_TAKE_SEC = 30 * 60;
const CALIBRATION_BEATS = 12;
const CALIBRATION_BPM = 100;
export const METER_FLOOR_DB = -66;

// ---- stores ---------------------------------------------------------------------------------

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    initial,
    set(patch: Partial<T>) {
      value = { ...value, ...patch };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const state = store<TimeTestSnapshot>({
  phase: "idle",
  tick: null,
  liveHits: [],
  micOpen: false,
  micError: null,
  latencyGuessMs: null,
  playing: false,
});
const meter = store<MicMeter>({ levelDb: METER_FLOOR_DB, stroke: null });

export const subscribeTimeTest = state.subscribe;
export const getTimeTestSnapshot = state.get;
export const getTimeTestServerSnapshot = () => state.initial;
export const subscribeMicMeter = meter.subscribe;
export const getMicMeterSnapshot = meter.get;
export const getMicMeterServerSnapshot = () => meter.initial;

// ---- live settings --------------------------------------------------------------------------

type LiveParams = { sensitivity: number; latencyMs: number; notesPerBeat: number };
let live: LiveParams = { sensitivity: 0.6, latencyMs: 0, notesPerBeat: 0 };

/** What live stroke detection and grading use (the final analysis takes its own). */
export function setLiveParams(p: LiveParams) {
  live = p;
  detector?.setConfig(detectorFor(p));
}

// ---- the mic --------------------------------------------------------------------------------

let mic: PadInput | null = null;
let micDevice = "";
let micOpening: Promise<void> | null = null;
/** Why the mic is open ("meter": the Mic options are showing; "take": recording). */
const micHolds = new Set<string>();
let clock: ClockMap | null = null;
let detector: Detector | null = null;
let levelPeak = 0;
let lastLevelAt = 0;
let strokeKey = 0;

function onChunk(c: PadChunk) {
  if (!clock || !mic) return;
  clock.push(c.frame, c.time);
  detector ??= new Detector(mic.sampleRate, detectorFor(live), c.frame);
  const onsets: Onset[] = [];
  detector.process(c.samples, onsets);
  for (const v of c.samples) levelPeak = Math.max(levelPeak, Math.abs(v));

  if (rec) {
    rec.startFrame ??= c.frame;
    const room = Math.floor(MAX_TAKE_SEC * mic.sampleRate) - rec.length;
    if (room > 0) {
      const part = c.samples.length > room ? c.samples.slice(0, room) : c.samples;
      rec.chunks.push(part);
      rec.length += part.length;
    }
  } else {
    clock.trim(400);
  }

  const now = performance.now();
  if (onsets.length > 0) {
    const db = 20 * Math.log10(Math.max(1e-6, onsets[onsets.length - 1].peak));
    meter.set({ stroke: { key: ++strokeKey, db } });
    if (rec && !rec.calibration) gradeLive(onsets);
  }
  if (now - lastLevelAt > 50) {
    lastLevelAt = now;
    meter.set({ levelDb: Math.max(METER_FLOOR_DB, 20 * Math.log10(Math.max(1e-6, levelPeak))) });
    levelPeak = 0;
  }
}

async function openMic(deviceId: string) {
  closeMicNow();
  micDevice = deviceId;
  clock = null;
  detector = null;
  try {
    const input = await startPadInput(deviceId, onChunk);
    if (micDevice !== deviceId || micHolds.size === 0) {
      input.stop();
      return;
    }
    clock = new ClockMap(input.sampleRate);
    mic = input;
    state.set({ micOpen: true, micError: null, latencyGuessMs: input.latencyGuessMs });
  } catch (error) {
    state.set({ micOpen: false, micError: micErrorMessage(error) });
    throw error;
  }
}

function micErrorMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "soniroll isn't allowed to use the mic. Allow it in your browser's site settings, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone found.";
  return error instanceof Error ? error.message : String(error);
}

function closeMicNow() {
  mic?.stop();
  mic = null;
  clock = null;
  detector = null;
  if (state.get().micOpen) state.set({ micOpen: false });
  meter.set({ levelDb: METER_FLOOR_DB, stroke: null });
}

/** Opens the mic (or switches it to `deviceId`) and keeps it open until released. */
export async function holdMic(reason: string, deviceId: string): Promise<void> {
  micHolds.add(reason);
  if (mic && micDevice === deviceId) return;
  if (micOpening && micDevice === deviceId) return micOpening;
  if (rec) return; // Never switch inputs in the middle of a take.
  micOpening = openMic(deviceId).finally(() => {
    micOpening = null;
  });
  return micOpening;
}

export function releaseMic(reason: string) {
  micHolds.delete(reason);
  if (micHolds.size === 0 && !rec) {
    micDevice = "";
    closeMicNow();
  }
}

// ---- the click ------------------------------------------------------------------------------

type RecClick = { time: number; beat: number; sub: number; level: BeatLevel; bar: number; beatLen: number };
type Recording = {
  chunks: Float32Array[];
  length: number;
  startFrame: number | null;
  clicks: RecClick[];
  countInBars: number;
  calibration: boolean;
};

let engine: ClickEngine | null = null;
let rec: Recording | null = null;
const grader = new LiveGrader();
let liveId = 0;

function startClicks(getSettings: () => ClickSettings) {
  stopClicks();
  let scheduledBar = -1;
  let heardBar = -1;
  engine = startClickEngine([
    {
      getSettings: () => getSettings(),
      onBeat: (beat, sub) => {
        if (beat === 0 && sub === 0) heardBar++;
        state.set({ tick: { beat, sub, bar: Math.max(0, heardBar) } });
      },
      onSchedule: ({ time, beat, sub, level, settings }) => {
        if (beat === 0 && sub === 0) scheduledBar++;
        rec?.clicks.push({ time, beat, sub, level, bar: Math.max(0, scheduledBar), beatLen: 60 / settings.bpm });
      },
    },
  ]);
}

function stopClicks() {
  engine?.stop();
  engine = null;
}

function gradeLive(onsets: Onset[]) {
  if (!rec || !clock) return;
  const beats = rec.clicks.filter((c) => c.sub === 0 && c.bar >= rec!.countInBars);
  const first = beats[0];
  const last = beats[beats.length - 1];
  if (!first || !last) return;
  const lat = live.latencyMs / 1000;
  const hits: LiveHit[] = [];
  for (const o of onsets) {
    const t = clock.timeOf(o.frame) - lat;
    const errorMs = grader.grade(t, { time: first.time, len: first.beatLen }, { time: last.time, len: last.beatLen }, live.notesPerBeat);
    if (errorMs !== null) hits.push({ id: ++liveId, errorMs });
  }
  if (hits.length) state.set({ liveHits: [...state.get().liveHits.slice(-199), ...hits] });
}

/** Starts a take: the mic opens (if it isn't already), the click starts, and everything the mic
    hears is kept until `stopRecording`. */
export async function startRecording(opts: {
  deviceId: string;
  getSettings: () => ClickSettings;
  countInBars: number;
  calibration?: boolean;
}): Promise<void> {
  stopPlayback();
  stopClicks();
  rec = null;
  state.set({ phase: "idle", tick: null, liveHits: [] });
  await holdMic("take", opts.deviceId);
  if (!mic) throw new Error(state.get().micError ?? "The mic didn't open.");
  rec = { chunks: [], length: 0, startFrame: null, clicks: [], countInBars: opts.countInBars, calibration: !!opts.calibration };
  grader.reset();
  startClicks(opts.getSettings);
  state.set({ phase: opts.calibration ? "calibrating" : "recording" });
}

/** Stops the click and turns what was recorded into a take (null if nothing was). */
export async function stopRecording(): Promise<Take | null> {
  stopClicks();
  // The last few chunks are still on their way from the mic.
  await new Promise((resolve) => setTimeout(resolve, 150));
  const r = rec;
  const map = clock;
  const sr = mic?.sampleRate;
  rec = null;
  state.set({ phase: "idle", tick: null });
  releaseMic("take");
  if (!r || !map || !sr || r.startFrame === null || r.length === 0) return null;
  const samples = new Float32Array(r.length);
  let at = 0;
  for (const c of r.chunks) {
    samples.set(c, at);
    at += c.length;
  }
  const start = r.startFrame;
  return {
    samples,
    sr,
    countInBars: r.countInBars,
    clicks: r.clicks.map((c) => ({
      pos: (map.frameOf(c.time) - start) / sr,
      beat: c.beat,
      sub: c.sub,
      level: c.level,
      bar: c.bar,
      beatLen: c.beatLen,
    })),
  };
}

/** Plays 12 clicks into the mic and measures how long they take to come back. */
export async function runCalibration(deviceId: string, soundId: string, volume: number): Promise<Calibration> {
  const settings: ClickSettings = {
    bpm: CALIBRATION_BPM,
    beatsPerBar: 4,
    accents: [1, 1, 1, 1],
    subdivision: 1,
    subAccents: [],
    volume: Math.max(volume, 0.6),
    soundId,
  };
  await startRecording({ deviceId, getSettings: () => settings, countInBars: 0, calibration: true });
  await new Promise((resolve) => setTimeout(resolve, (CALIBRATION_BEATS * 60 * 1000) / CALIBRATION_BPM + 600));
  const take = await stopRecording();
  if (!take) throw new Error("Nothing was recorded.");
  return gradeCalibration(take);
}

/** Stops whatever is running (leaving the page). */
export function stopAll() {
  stopClicks();
  stopPlayback();
  rec = null;
  state.set({ phase: "idle", tick: null });
  micHolds.clear();
  micDevice = "";
  closeMicNow();
}

// ---- playback -------------------------------------------------------------------------------

type Playback = { source: AudioBufferSourceNode; timer: ReturnType<typeof setInterval>; startAt: number; from: number; end: number };
let playback: Playback | null = null;
const buffers = new WeakMap<Take, AudioBuffer>();

/** Plays the take from `from` seconds, with the clicks put back where the mic heard them (at
    `latencyMs`) so what you hear lines up with the waveform. `clickVolume` 0 = no click. */
export async function playTake(take: Take, opts: { from: number; latencyMs: number; clickVolume: number; soundId: string }) {
  stopPlayback();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  let buffer = buffers.get(take);
  if (!buffer) {
    buffer = ctx.createBuffer(1, take.samples.length, take.sr);
    buffer.getChannelData(0).set(take.samples);
    buffers.set(take, buffer);
  }
  const duration = take.samples.length / take.sr;
  const from = Math.min(Math.max(0, opts.from), duration);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const startAt = ctx.currentTime + 0.05;
  source.start(startAt, from);

  const sound = CLICK_SOUNDS.find((c) => c.id === opts.soundId) ?? CLICK_SOUNDS[0];
  const vol = opts.clickVolume * sound.gain;
  const lat = opts.latencyMs / 1000;
  const clicks = take.clicks.map((c) => ({ t: c.pos + lat, sub: c.sub, level: c.level as BeatLevel })).sort((a, b) => a.t - b.t);
  let next = clicks.findIndex((c) => c.t >= from);
  if (next < 0) next = clicks.length;
  const timer = setInterval(() => {
    const horizon = from + (ctx.currentTime - startAt) + 0.15;
    while (vol > 0 && next < clicks.length && clicks[next].t < horizon) {
      const c = clicks[next++];
      const click = c.sub === 0 ? mainBeatClick(c.level, sound, vol) : subClick(c.level, sound, vol);
      if (click) scheduleClick(ctx, startAt + (c.t - from), sound.wave, click.freq, click.gain, click.length);
    }
  }, 25);
  const pb: Playback = { source, timer, startAt, from, end: duration };
  source.onended = () => {
    if (playback !== pb) return;
    clearInterval(timer);
    playback = null;
    state.set({ playing: false });
  };
  playback = pb;
  state.set({ playing: true });
}

export function stopPlayback() {
  if (!playback) return;
  const pb = playback;
  playback = null;
  clearInterval(pb.timer);
  try {
    pb.source.stop();
  } catch {
    // already stopped
  }
  state.set({ playing: false });
}

/** Where playback is in the take (seconds), or null when it isn't playing. */
export function playbackPosition(): number | null {
  if (!playback) return null;
  const t = playback.from + (getAudioContext().currentTime - playback.startAt);
  return Math.min(playback.end, Math.max(playback.from, t));
}

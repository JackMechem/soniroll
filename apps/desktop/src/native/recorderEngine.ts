import { convertTempo } from "@/lib/meterControls";
import {
  startMetronome,
  stopMetronome,
  updateMetronomeSettings,
  updateMetronomeStructure,
} from "@/lib/metronomeEngine";
import { sectionAt } from "@/lib/structure";
import { snapshotOf } from "@/lib/usePersistedSettings";
import type {
  FinishedTake,
  RecorderInput,
  RecorderMetronome,
  RecorderSnapshot,
  RecorderSong,
} from "@web/lib/recorderEngine";
import { latestFirstBeat } from "./clickEngine";
import { Channel, engineLatency, engineNow, invoke } from "./engine";

/**
 * Desktop version of `lib/recorderEngine`: the same exports and behaviour, but the take is
 * recorded by the native engine (`src-tauri/src/recorder.rs`) from the input picked in the Native
 * audio chip, and encoded there as MP3 (why MP3: see recorder.rs). The metronome is the
 * Metronome tool's own engine, as on the website, which on desktop clicks through the native
 * engine too.
 *
 * What the native engine does better than `MediaRecorder`:
 * - With a count-in, the take starts on the exact sample where the first beat after it was heard
 *   (the click's output delay and the input's capture delay are both known), not "about when the
 *   count-in timer fired".
 * - `durationSec` is the real number of samples recorded.
 * - The line-up with the tune's song (`songOffsetSec`) uses the capture delay the audio system
 *   reports instead of the browser's guess.
 *
 * The computer's sound (`desktopAudio`) is recorded by the native engine too: the output the app
 * plays through, opened as an input (PipeWire's monitor, WASAPI loopback), mixed into the take.
 *
 * Auto gain is a gentle gain control in Rust standing in for the browser's `autoGainControl`;
 * Mono works the same way as the website's (Left / Mix / Right), and so does the input level
 * (`gain`, applied in Rust, live through `recorder_set_gain`). Checking the level
 * (`startMonitor`) opens the input without beginning a take; a take started from there keeps it.
 */

export type {
  FinishedTake,
  RecorderInput,
  RecorderMetronome,
  RecorderMono,
  RecorderPhase,
  RecorderSnapshot,
  RecorderSong,
} from "@web/lib/recorderEngine";

// Per computer, shared with the Native audio chip (`src/NativeAudioChip.tsx`).
const AUDIO_PREFS_KEY = "jam-practice-desktop-audio";
const INPUT_PREFS = { inputDeviceId: "" };

let snapshot: RecorderSnapshot = { phase: "idle", startedAt: null, level: 0, peak: 0, error: null, monitoring: false };
const SERVER_SNAPSHOT = snapshot;
const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<RecorderSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeRecorder(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getRecorderSnapshot(): RecorderSnapshot {
  return snapshot;
}
export function getRecorderServerSnapshot(): RecorderSnapshot {
  return SERVER_SNAPSHOT;
}

/** Bumped by every start and stop, so a start that's still waiting (for the input, or for the
    metronome's first beat) knows it was stopped in the meantime. */
let session = 0;
let open = false;
let recording = false;
let countInTimer: ReturnType<typeof setTimeout> | null = null;
let metronomeRunning = false;
let songEl: HTMLAudioElement | null = null;
let songStartSec = 0;
let songOffsetSec: number | undefined;

function stopSong() {
  songEl?.pause();
  songEl?.removeAttribute("src");
  songEl?.load();
  songEl = null;
}

/** Changes the song's volume while it plays along. */
export function setRecorderSongVolume(volume: number) {
  if (songEl) songEl.volume = Math.min(1, Math.max(0, volume));
}

function stopClick() {
  if (metronomeRunning) stopMetronome();
  metronomeRunning = false;
}

function closeInput() {
  if (open) void invoke("recorder_cancel");
  open = false;
  openedWith = null;
}

/** The input the open session was opened with (a level check's input is reused by a take). */
let openedWith: RecorderInput | null = null;
const sameInput = (a: RecorderInput, b: RecorderInput) =>
  (a.deviceId ?? "") === (b.deviceId ?? "") && a.autoGain === b.autoGain && a.mono === b.mono && !!a.desktopAudio === !!b.desktopAudio;

/** The native engine records the computer's sound itself (on macOS, if the system lets it). */
export function canRecordDesktopAudio(): boolean {
  return true;
}

/** Changes the input level live (checking the level, or mid-take). */
export function setRecorderGain(gain: number) {
  if (!open) return;
  void invoke("recorder_set_gain", { gain });
  if (openedWith) openedWith = { ...openedWith, gain };
}

/** Opens the native input (or keeps the open one if it matches); levels go to the snapshot.
    False (with the error set) if it couldn't. `id`: the session it belongs to. */
async function openInput(options: RecorderInput, id: number): Promise<boolean> {
  if (open && openedWith && sameInput(openedWith, options)) {
    setRecorderGain(options.gain);
    return true;
  }
  closeInput();
  const onLevel = new Channel<[number, number]>();
  onLevel.onmessage = ([level, peak]) => {
    if (open) setSnapshot({ level, peak });
  };
  try {
    const { inputDeviceId } = snapshotOf(AUDIO_PREFS_KEY, INPUT_PREFS);
    await invoke("recorder_open", {
      deviceId: options.deviceId || inputDeviceId,
      mono: options.mono ?? null,
      autoGain: options.autoGain,
      gain: options.gain,
      desktopAudio: !!options.desktopAudio,
      onLevel,
    });
  } catch (error) {
    console.error("recorder: couldn't open the input", error);
    setSnapshot({
      error: String(error).includes("computer's sound")
        ? "Couldn't record the computer's sound here. Turn it off under Microphone to record just the microphone."
        : "Couldn't open the microphone. Pick another input.",
    });
    return false;
  }
  if (id !== session) {
    // Stopped while the input was opening.
    void invoke("recorder_cancel");
    return false;
  }
  open = true;
  openedWith = { ...options };
  return true;
}

/** Opens the input just to check the level (nothing is recorded). */
export async function startMonitor(options: RecorderInput) {
  if (snapshot.phase !== "idle") return;
  const id = ++session;
  setSnapshot({ error: null, level: 0 });
  if (await openInput(options, id)) setSnapshot({ monitoring: true });
}

export function stopMonitor() {
  if (snapshot.phase !== "idle" || !snapshot.monitoring) return;
  session++;
  closeInput();
  setSnapshot({ monitoring: false, level: 0 });
}

/** Live changes to the metronome while a take is running (tempo, accents, sound, …). */
export function updateRecorderMetronome(m: RecorderMetronome) {
  if (!metronomeRunning) return;
  updateMetronomeSettings(m.settings);
  updateMetronomeStructure(m.structure);
}

/** The take starts. `at`: the engine time of the beat it starts on (after a count-in). */
async function beginRecording(id: number, at: number | null) {
  countInTimer = null;
  if (id !== session || !open) return;
  const t0 = performance.now();
  let lead: number;
  try {
    lead = await invoke<number>("recorder_begin", { at });
  } catch {
    stopClick();
    stopSong();
    closeInput();
    setSnapshot({ phase: "idle", error: "The recording couldn't start. Try again." });
    return;
  }
  if (id !== session) return;
  recording = true;
  setSnapshot({ phase: "recording", startedAt: Date.now(), error: null });
  if (songEl) {
    const el = songEl;
    el.addEventListener(
      "playing",
      () => {
        // Song position heard at the decoded take's first sample: where it started, less how long
        // it took to start, less how long before `t0` that sample was captured (`lead`, from the
        // native input), less the song's own output delay. The song plays through the window's
        // media player, whose delay can't be read; the native output's is the closest stand-in.
        const delay = (performance.now() - t0) / 1000;
        songOffsetSec = Math.round((songStartSec - delay - lead - engineLatency()) * 1000) / 1000;
      },
      { once: true },
    );
    void el.play().catch(() => {});
  }
}

export async function startRecording(metronome: RecorderMetronome, options: RecorderInput & { song?: RecorderSong | null }) {
  if (snapshot.phase !== "idle") return;
  const id = ++session;
  setSnapshot({ error: null, phase: "countin", monitoring: false });
  songOffsetSec = undefined;
  if (options.song) {
    // Loaded (and parked at its start point) during the count-in, so it starts right away.
    const el = new Audio(options.song.url);
    el.preload = "auto";
    el.volume = Math.min(1, Math.max(0, options.song.volume));
    songStartSec = Math.max(0, options.song.startSec);
    el.currentTime = songStartSec;
    el.addEventListener("loadedmetadata", () => (el.currentTime = songStartSec), { once: true });
    songEl = el;
  }

  if (!(await openInput(options, id))) {
    if (id !== session) return;
    stopSong();
    setSnapshot({ phase: "idle", level: 0 });
    return;
  }

  if (metronome.enabled) {
    const { settings, structure } = metronome;
    updateMetronomeStructure(structure);
    updateMetronomeSettings(settings);
    startMetronome();
    metronomeRunning = true;
    // Whole bars of whatever plays first, at the real click rate.
    const first = structure.useStructure && structure.structure.form.length > 0 ? sectionAt(structure.structure, 0) : null;
    const beats = first?.beatsPerBar ?? settings.beatsPerBar;
    const beatUnit = first?.beatUnit ?? settings.beatUnit;
    const clickBpm = settings.tempoNoteValue ? convertTempo(settings.bpm, settings.tempoNoteValue, beatUnit) : settings.bpm;
    const countInSec = (Math.max(0, Math.round(metronome.countInBars)) * beats * 60) / clickBpm;
    if (countInSec > 0) {
      const firstBeat = (await latestFirstBeat()) ?? engineNow();
      if (id !== session) return;
      const startAt = firstBeat + countInSec;
      // Rust starts the take on the exact sample (it keeps the last few seconds of input), so
      // the timer only has to fire around then.
      countInTimer = setTimeout(() => void beginRecording(id, startAt), Math.max(0, (startAt - engineNow()) * 1000));
      return;
    }
  }
  void beginRecording(id, null);
}

/** Stops the take and returns it, or null if nothing was recorded (stopped during the count-in). */
export async function stopRecording(): Promise<FinishedTake | null> {
  if (snapshot.phase === "finishing") return null;
  session++;
  if (!recording) {
    if (countInTimer) clearTimeout(countInTimer);
    countInTimer = null;
    stopClick();
    stopSong();
    closeInput();
    setSnapshot({ phase: "idle", startedAt: null, level: 0 });
    return null;
  }
  recording = false;
  setSnapshot({ phase: "finishing" });
  stopClick();
  const hadSong = songEl !== null;
  stopSong();
  // The song never got going (blocked, or stopped first): start the line-up at its start point.
  const offset = hadSong ? (songOffsetSec ?? songStartSec) : undefined;
  try {
    const { duration_sec: durationSec } = await invoke<{ duration_sec: number; bytes: number }>("recorder_stop");
    open = false;
    openedWith = null;
    const bytes = await invoke<ArrayBuffer>("recorder_take");
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    setSnapshot({ phase: "idle", startedAt: null, level: 0 });
    if (!blob.size || durationSec <= 0) {
      setSnapshot({ error: "Nothing was recorded." });
      return null;
    }
    return { blob, durationSec, ...(offset !== undefined ? { songOffsetSec: offset } : {}) };
  } catch (error) {
    console.error("recorder: couldn't finish the take", error);
    closeInput();
    setSnapshot({ phase: "idle", startedAt: null, level: 0, error: "The recording couldn't be saved. Try again." });
    return null;
  }
}

export function clearRecorderError() {
  setSnapshot({ error: null });
}

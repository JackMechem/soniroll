import { convertTempo } from '@jam-practice/core/meterControls';
import { type Structure, sectionAt } from '@jam-practice/core/structure';
import { AudioModule, IOSOutputFormat, AudioQuality, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

import {
  type MetronomeBaseSettings,
  startMetronome,
  stopMetronome,
  updateMetronomeSettings,
  updateMetronomeStructure,
} from '@/lib/metronomeEngine';

/**
 * The Recorder tool's engine: one microphone take recorded straight to an M4A file (`expo-audio`'s
 * recorder — AAC, mono, 44.1kHz/128kbps, ~1MB a minute), optionally with the metronome clicking
 * along. A plain module like the other engines, so a take keeps recording if you navigate away
 * mid-take.
 *
 * **Auto gain** picks Android's mic mode: `camcorder` (the system's automatic gain, tuned for
 * recording sound at a normal level) or `unprocessed` (the raw mic — no processing, but quiet).
 * This uses `expo-audio` rather than `react-native-audio-api`'s recorder because that one is
 * patched to always open the mic `Unprocessed` (`patches/react-native-audio-api.patch` — the
 * tuner's pitch detection needs the raw signal), which made every take very quiet.
 *
 * With the metronome on and a count-in, the metronome starts first and the recording starts on
 * the downbeat after the count-in bars. The metronome is the app's shared one (`metronomeEngine`)
 * with the full Metronome-tool settings (meter, accents, subdivision, tempo note value,
 * structures, sound); its click comes through the speaker and will be picked up by the mic unless
 * you wear headphones.
 */

// The same constructor `expo-audio`'s own `useAudioRecorder` uses, outside a component.
const NativeAudioRecorder = (AudioModule as unknown as { AudioRecorder: typeof AudioModule['AudioRecorder'] }).AudioRecorder;
type NativeRecorder = InstanceType<typeof NativeAudioRecorder>;

export type RecorderMetronome = {
  enabled: boolean;
  settings: MetronomeBaseSettings;
  structure: { useStructure: boolean; structure: Structure };
  countInBars: number;
};

/** Live changes to the metronome while a take is running (tempo, accents, sound, …). */
export function updateRecorderMetronome(metronome: RecorderMetronome) {
  if (!metronomeRunning) return;
  updateMetronomeSettings(metronome.settings);
  updateMetronomeStructure(metronome.structure);
}

export type RecorderPhase = 'idle' | 'countin' | 'recording' | 'finishing';

export type RecorderSnapshot = {
  phase: RecorderPhase;
  /** Wall-clock start of the actual recording (after any count-in). */
  startedAt: number | null;
  /** Input level, roughly 0..1 (RMS scaled for display). */
  level: number;
  error: string | null;
};

/** A stopped take; `tuneId` is the tune it was started for (the Recorder opened from a tune). */
export type FinishedTake = { uri: string; durationSec: number; tuneId?: string };

/** The tune the take in progress is for, so stopping it from outside the Recorder keeps it. */
let takeTuneId: string | undefined;

let snapshot: RecorderSnapshot = { phase: 'idle', startedAt: null, level: 0, error: null };
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

let recorder: NativeRecorder | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;
let countInTimer: ReturnType<typeof setTimeout> | null = null;
let metronomeRunning = false;
let autoGain = true;

function recordingOptions(withAutoGain: boolean) {
  const common = { extension: '.m4a', sampleRate: 44100, numberOfChannels: 1, bitRate: 128000, isMeteringEnabled: true };
  if (Platform.OS === 'ios') {
    return {
      ...common,
      outputFormat: IOSOutputFormat.MPEG4AAC,
      audioQuality: AudioQuality.MAX,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    };
  }
  return { ...common, outputFormat: 'mpeg4', audioEncoder: 'aac', audioSource: withAutoGain ? 'camcorder' : 'unprocessed' };
}

function stopMeter() {
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
}

function stopClick() {
  if (metronomeRunning) stopMetronome();
  metronomeRunning = false;
}

async function beginRecording() {
  countInTimer = null;
  let rec: NativeRecorder | null = null;
  try {
    // iOS only: the audio session has to allow recording. On Android this call changed how the
    // playback player competes for audio focus — after a take, play() was paused within ~200ms.
    if (Platform.OS === 'ios') await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    rec = new NativeAudioRecorder(recordingOptions(autoGain) as never);
    await rec.prepareToRecordAsync();
    rec.record();
  } catch (e) {
    rec?.release();
    stopClick();
    setSnapshot({ phase: 'idle', startedAt: null, level: 0, error: e instanceof Error ? e.message : "Couldn't start recording." });
    return;
  }
  recorder = rec;
  setSnapshot({ phase: 'recording', startedAt: Date.now(), error: null });
  // Metering is in dBFS (about -60 quiet room … 0 clipping); shown as 0..1.
  meterTimer = setInterval(() => {
    const db = recorder?.getStatus().metering;
    if (typeof db === 'number') setSnapshot({ level: Math.max(0, Math.min(1, (db + 60) / 60)) });
  }, 100);
}

export async function startRecording(metronome: RecorderMetronome, options: { autoGain: boolean; tuneId?: string }) {
  if (snapshot.phase !== 'idle') return;
  autoGain = options.autoGain;
  takeTuneId = options.tuneId;
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) {
    setSnapshot({ error: 'Microphone permission is needed to record.' });
    return;
  }
  setSnapshot({ error: null, level: 0 });

  if (metronome.enabled) {
    const { settings, structure } = metronome;
    updateMetronomeStructure(structure);
    updateMetronomeSettings(settings);
    startMetronome();
    metronomeRunning = true;
    // The count-in is whole bars of whatever plays first (a structure's first section, else the
    // plain meter), at the actual click rate (tempo converted from its note value to the beat unit).
    const first = structure.useStructure && structure.structure.form.length > 0 ? sectionAt(structure.structure, 0) : null;
    const beats = first?.beatsPerBar ?? settings.beatsPerBar;
    const beatUnit = first?.beatUnit ?? settings.beatUnit;
    const clickBpm = settings.tempoNoteValue === null ? settings.bpm : convertTempo(settings.bpm, settings.tempoNoteValue, beatUnit);
    const countInMs = Math.max(0, Math.round(metronome.countInBars)) * beats * (60000 / clickBpm);
    if (countInMs > 0) {
      setSnapshot({ phase: 'countin' });
      // The click engine schedules its first beat ~60ms ahead; start the take on the downbeat.
      countInTimer = setTimeout(() => void beginRecording(), countInMs + 60);
      return;
    }
  }
  setSnapshot({ phase: 'countin' });
  await beginRecording();
}

/** Stops the take and returns its file, or null if nothing was recorded (stopped during the
    count-in, or the recorder failed). */
export async function stopRecording(): Promise<FinishedTake | null> {
  if (countInTimer) {
    clearTimeout(countInTimer);
    countInTimer = null;
    stopClick();
    setSnapshot({ phase: 'idle', startedAt: null, level: 0 });
    return null;
  }
  const rec = recorder;
  if (!rec) return null;
  recorder = null;
  stopMeter();
  setSnapshot({ phase: 'finishing' });
  stopClick();
  const durationSec = rec.getStatus().durationMillis / 1000;
  try {
    await rec.stop();
  } catch {
    // fall through — `uri` tells whether anything was written
  }
  const uri = rec.uri;
  rec.release();
  if (Platform.OS === 'ios') void setAudioModeAsync({ allowsRecording: false });
  setSnapshot({ phase: 'idle', startedAt: null, level: 0 });
  if (!uri) {
    setSnapshot({ error: 'Nothing was recorded.' });
    return null;
  }
  return { uri: uri.startsWith('file://') ? uri : `file://${uri}`, durationSec, ...(takeTuneId ? { tuneId: takeTuneId } : {}) };
}

/** Where a stopped take goes to be named and saved (the Recorder's Stop and the now-playing strip's). */
export function saveTakeRoute(take: FinishedTake) {
  return {
    pathname: '/recordings/save' as const,
    params: { uri: take.uri, duration: String(take.durationSec), ...(take.tuneId ? { tuneId: take.tuneId } : {}) },
  };
}

export function clearRecorderError() {
  setSnapshot({ error: null });
}

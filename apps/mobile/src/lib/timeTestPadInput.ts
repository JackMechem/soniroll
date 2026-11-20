import type { ClockMap } from '@jam-practice/core/timeTestClock';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { Platform } from 'react-native';
import { AudioManager, AudioRecorder } from 'react-native-audio-api';

import { getAudioContext } from '@/lib/audioContext';
import { ArrivalClock } from '@/lib/timeTestClock';

/**
 * The Time Test's microphone on the phone (the website's `lib/padInput.ts`): every sample, in
 * order, each chunk tagged with where it sits on the click's clock (the `AudioContext`'s time), so
 * strokes can be measured against the clicks.
 *
 * Built on `react-native-audio-api`'s `AudioRecorder` like the Tuner's `lib/audioInput.ts`, but raw:
 * no low-pass, no gain (a stroke's attack is exactly the high end the Tuner filters away). The
 * library is patched to open the mic `Unprocessed` (no automatic gain, no noise suppression), which
 * is what a stroke detector wants too. A chunk's time comes from when it reached JavaScript (see
 * `lib/timeTestClock.ts`); the take's final timeline is re-worked from all of them (`settledClock`).
 */

/** `frame` numbers samples in order (no gaps); `time` is where `frame` sits on the click's clock,
    before the round trip (NaN when it isn't known yet). */
export type PadChunk = { samples: Float32Array; frame: number; time: number };

export type PadInput = {
  sampleRate: number;
  /** A guess at the round trip in ms, for before the first calibration. */
  latencyGuessMs: number;
  /** The click-clock map for frames from `fromFrame` on, worked out from the chunks either side of
      each one (steadier than the times chunks were tagged with as they came in). */
  settledClock: (fromFrame: number) => ClockMap;
  stop: () => void;
};

/** ~21 ms of samples a chunk at 48 kHz: small, so each chunk's arrival dates it closely. */
const CHUNK_LENGTH = 1024;
/** The round trip (speaker → air → mic → JS) on a typical phone, before calibration measures it.
    The phone's audio engine doesn't report its latencies the way a browser does. */
const LATENCY_GUESS_MS = 50;

function preferredSampleRate(): number {
  try {
    const sr = AudioManager.getDevicePreferredSampleRate();
    if (Number.isFinite(sr) && sr >= 22050 && sr <= 192000) return sr;
  } catch {
    // not available: the usual phone rate
  }
  return 48000;
}

/** A friendly sentence for a mic that wouldn't open. */
export function micErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'PermissionError') {
    return "soniroll isn't allowed to use the mic. Allow it in your phone's settings for the app, then try again.";
  }
  return error instanceof Error && error.message ? error.message : "Couldn't open the mic. Try again.";
}

function permissionError(): Error {
  const e = new Error("soniroll isn't allowed to use the mic. Allow it in your phone's settings for the app, then try again.");
  e.name = 'PermissionError';
  return e;
}

export async function startPadInput(onChunk: (chunk: PadChunk) => void): Promise<PadInput> {
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) throw permissionError();

  if (Platform.OS === 'ios') {
    // iOS has to be told the app plays and records at once (the click out of the speaker, not the
    // earpiece). Unverified: nobody has run this on an iPhone yet.
    try {
      AudioManager.setAudioSessionOptions({ iosCategory: 'playAndRecord', iosOptions: ['defaultToSpeaker'] });
    } catch {
      // keep whatever the session was
    }
  }
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const requested = preferredSampleRate();
  const recorder = new AudioRecorder();
  let stopped = false;
  let frame = 0;
  let clock: ArrivalClock | null = null;

  recorder.onAudioReady({ sampleRate: requested, bufferLength: CHUNK_LENGTH, channelCount: 1 }, ({ buffer, numFrames }) => {
    // Read the clock first: everything after this only makes the chunk look later than it was.
    const arrival = ctx.currentTime;
    if (stopped) return;
    const sr = buffer.sampleRate;
    clock ??= new ArrivalClock(sr, CHUNK_LENGTH);
    // A copy: the library may reuse the buffer behind `getChannelData`.
    const samples = new Float32Array(numFrames);
    buffer.copyFromChannel(samples, 0);
    const time = clock.add(frame, numFrames, arrival);
    onChunk({ samples, frame, time });
    frame += numFrames;
  });

  const result = await recorder.start();
  if (result.status !== 'success') {
    recorder.clearOnAudioReady();
    throw new Error("The mic couldn't start. Close other apps using it, then try again.");
  }

  return {
    // The chunks carry their own rate; until the first arrives, the one asked for.
    get sampleRate() {
      return clock?.sr ?? requested;
    },
    latencyGuessMs: LATENCY_GUESS_MS,
    settledClock: (fromFrame) => (clock ?? new ArrivalClock(requested, CHUNK_LENGTH)).settled(fromFrame),
    stop: () => {
      if (stopped) return;
      stopped = true;
      recorder.clearOnAudioReady();
      void recorder.stop();
    },
  };
}

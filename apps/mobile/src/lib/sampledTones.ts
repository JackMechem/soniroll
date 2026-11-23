import { noteToFrequency } from '@jam-practice/core/noteRange';
import type { AudioBuffer, AudioContext } from 'react-native-audio-api';

import { getAudioContext } from '@/lib/audioContext';
import { RHODES_SAMPLES } from '@/lib/rhodesSamples';

/**
 * The native sibling of `apps/web/lib/sampledTones.ts` + `lib/tones.ts`'s ear-training tones —
 * the **same recorded samples** the website plays for "Piano" and "Rhodes": the Salamander Grand
 * Piano (Alexander Holm, CC-BY 3.0, hosted by the Tone.js project — A/C/D#/F# every octave),
 * fetched from the same URLs the first time a note needs them (`react-native-audio-api`'s
 * `decodeAudioData` downloads a remote URL itself), and jRhodes3d (Jeff Learman, CC BY 4.0 — a 1977
 * Rhodes Mark I Stage 73, every 4th white key F1–C7, layer 4), bundled from the website's
 * `public/samples/rhodes/` (`rhodesSamples.ts`) so it plays offline. Each is decoded once. A note
 * without its own recording gets the nearest one, pitch-shifted via `playbackRate` — exactly as on
 * web.
 *
 * One difference from web: web centres these stereo recordings by forcing the gain node down to
 * one channel (`channelCount = 1`); those properties are read-only here, so each decoded sample is
 * averaged down to a mono `AudioBuffer` once instead — the same L+R sum, done ahead of time.
 */
export type SampledInstrumentId = 'piano' | 'rhodes';

export const EAR_TRAINING_TONES: { id: SampledInstrumentId; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'rhodes', label: 'Rhodes' },
];
export const DEFAULT_EAR_TRAINING_TONE_ID: SampledInstrumentId = 'piano';

export function asToneId(value: string): SampledInstrumentId {
  return value === 'rhodes' ? 'rhodes' : DEFAULT_EAR_TRAINING_TONE_ID;
}

/** `key` names the sample in the cache; `src` is what `decodeAudioData` gets (a URL, or a bundled
    asset). */
type SampleNote = { freq: number; key: string; src: string | number };
/** `gain` evens out the sets' recorded levels (the Rhodes files are normalized ~18 dB hotter than
    the piano's) — the same trim as web. */
type SampleSet = { notes: SampleNote[]; gain: number };

const PIANO_URL = 'https://tonejs.github.io/audio/salamander/';

function sample(note: string, file: string): SampleNote {
  const freq = noteToFrequency(note);
  if (freq === null) throw new Error(`Invalid sample note name: ${note}`);
  const url = `${PIANO_URL}${file}.mp3`;
  return { freq, key: url, src: url };
}

/** jRhodes3d's sampled keys (MIDI). Every note plays layer 4 (medium-soft; jRhodes3d counts its
    layers down from 1, the hardest) — the only layer sampled on every key, so the timbre stays the
    same from bottom to top. */
const RHODES_MIDIS = [29, 35, 40, 45, 50, 55, 59, 62, 65, 71, 76, 81, 86, 91, 96];
function rhodesSample(midi: number): SampleNote {
  const name = `${midi}_4`;
  const asset = RHODES_SAMPLES[name];
  if (asset === undefined) throw new Error(`No Rhodes sample ${name}`);
  return { freq: 440 * Math.pow(2, (midi - 69) / 12), key: `rhodes:${name}`, src: asset };
}

const PIANO: [string, string][] = [
  ['A0', 'A0'],
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((o): [string, string][] => [
    [`C${o}`, `C${o}`],
    [`D#${o}`, `Ds${o}`],
    [`F#${o}`, `Fs${o}`],
    [`A${o}`, `A${o}`],
  ]),
  ['C8', 'C8'],
];

const SAMPLE_SETS: Record<SampledInstrumentId, SampleSet> = {
  piano: {
    notes: PIANO.map(([note, file]) => sample(note, file)),
    gain: 1,
  },
  rhodes: {
    notes: RHODES_MIDIS.map(rhodesSample),
    gain: 0.15,
  },
};

const bufferCache = new Map<string, Promise<AudioBuffer>>();

/** Averages a stereo recording down to one channel, so it plays centred (see the doc comment). */
function toMono(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels < 2) return buffer;
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const mixed = new Float32Array(buffer.length);
  for (let i = 0; i < mixed.length; i++) mixed[i] = (left[i] + right[i]) / 2;
  const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  mono.copyToChannel(mixed, 0);
  return mono;
}

function loadBuffer(ctx: AudioContext, s: SampleNote): Promise<AudioBuffer> {
  let promise = bufferCache.get(s.key);
  if (!promise) {
    promise = ctx.decodeAudioData(s.src).then((b) => toMono(ctx, b));
    bufferCache.set(s.key, promise);
    // A failed download (offline, ...) mustn't stay cached forever — a later play retries.
    promise.catch(() => bufferCache.delete(s.key));
  }
  return promise;
}

function nearestSample(set: SampleSet, freq: number): SampleNote {
  let best = set.notes[0];
  let bestDistance = Math.abs(Math.log2(freq / best.freq));
  for (const candidate of set.notes) {
    const distance = Math.abs(Math.log2(freq / candidate.freq));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function resolve(instrument: SampledInstrumentId, freq: number) {
  const set = SAMPLE_SETS[instrument];
  const s = nearestSample(set, freq);
  return { sample: s, sampleFreq: s.freq, gain: set.gain };
}

function context() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** react-native-audio-api's buffer source (not the DOM type of the same name). */
type SourceNode = ReturnType<AudioContext['createBufferSource']>;

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, rate: number, level: number, durationSeconds: number, startTime: number): SourceNode {
  const now = Math.max(startTime, ctx.currentTime);
  const end = now + durationSeconds;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = ctx.createGain();
  // A real recording has its own attack — just a short release so cutting it off doesn't click.
  const releaseStart = Math.max(now, end - 0.08);
  gain.gain.setValueAtTime(level, now);
  gain.gain.setValueAtTime(level, releaseStart);
  gain.gain.linearRampToValueAtTime(0, end);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(end);
  return source;
}

/** Plays one note (e.g. "C4") as soon as its sample is ready. A failed download is a silent note,
    not a fallback tone — same as web. */
export function playNote(note: string, durationSeconds: number, instrument: SampledInstrumentId) {
  const freq = noteToFrequency(note);
  if (freq === null) return;
  const ctx = context();
  const { sample: s, sampleFreq, gain } = resolve(instrument, freq);
  loadBuffer(ctx, s)
    .then((buffer) => playBuffer(ctx, buffer, freq / sampleFreq, gain, durationSeconds, ctx.currentTime))
    .catch(() => {});
}

const midiFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Downloads the sample a MIDI note plays from (once), so a run scheduled after it starts on time —
    the notation editor's Play (`components/notation/ScoreEditor.tsx`). */
export function prepareSampledMidi(instrument: SampledInstrumentId, midi: number): Promise<void> {
  const { sample: s } = resolve(instrument, midiFreq(midi));
  return loadBuffer(context(), s).then(() => undefined);
}

/** Plays a MIDI note at `when` on the audio clock (seconds), ringing `durationSeconds`. Silent if its
    sample can't be had (`prepareSampledMidi` first for exact timing). */
export function playSampledMidi(instrument: SampledInstrumentId, midi: number, durationSeconds: number, when: number) {
  const freq = midiFreq(midi);
  const ctx = context();
  const { sample: s, sampleFreq, gain } = resolve(instrument, freq);
  loadBuffer(ctx, s)
    .then((buffer) => playBuffer(ctx, buffer, freq / sampleFreq, gain, durationSeconds, when))
    .catch(() => {});
}

/** Plays several notes so they genuinely start together (a block chord, a harmonic interval): waits
    for *every* note's sample to be downloaded before starting any of them, then starts them all at
    one shared time — the same fix web's `playNotesTogether` documents for "one note plays slightly
    before the others on a first play". */
export async function playNotesTogether(notes: string[], durationSeconds: number, instrument: SampledInstrumentId) {
  const ctx = context();
  const voices = notes
    .map((n) => noteToFrequency(n))
    .filter((f): f is number => f !== null)
    .map((freq) => ({ freq, ...resolve(instrument, freq) }));
  const buffers = await Promise.all(voices.map((v) => loadBuffer(ctx, v.sample).catch(() => null)));
  const start = ctx.currentTime + 0.02;
  voices.forEach((v, i) => {
    const buffer = buffers[i];
    if (buffer) playBuffer(ctx, buffer, v.freq / v.sampleFreq, v.gain, durationSeconds, start);
  });
}

/** Plays a sequence of chords (each a list of notes, bass first) back to back, `stepSeconds` apart,
    each ringing `ringSeconds` — Guess the Progression's playback. Every sample is downloaded first
    and every chord is then scheduled on the audio clock (not a chain of JS timers), so the changes
    land exactly in time even on a first play. `arpeggioGapSeconds` rolls each chord's notes.
    Resolves once everything is scheduled, with `cancel()` to cut it all off (stop/replay/next). */
export async function playChordSequence(
  chords: string[][],
  options: { stepSeconds: number; ringSeconds: number; instrument: SampledInstrumentId; arpeggioGapSeconds?: number },
): Promise<{ cancel: () => void }> {
  const ctx = context();
  const voices = chords.map((notes) =>
    notes
      .map((n) => noteToFrequency(n))
      .filter((f): f is number => f !== null)
      .map((freq) => ({ freq, ...resolve(options.instrument, freq) })),
  );
  const buffers = await Promise.all(voices.map((chord) => Promise.all(chord.map((v) => loadBuffer(ctx, v.sample).catch(() => null)))));
  const start = ctx.currentTime + 0.05;
  const gap = options.arpeggioGapSeconds ?? 0;
  const sources: SourceNode[] = [];
  voices.forEach((chord, i) => {
    chord.forEach((v, j) => {
      const buffer = buffers[i][j];
      if (buffer) sources.push(playBuffer(ctx, buffer, v.freq / v.sampleFreq, v.gain, options.ringSeconds, start + i * options.stepSeconds + j * gap));
    });
  });
  return {
    cancel: () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // already finished
        }
      }
    },
  };
}

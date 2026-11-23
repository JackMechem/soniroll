import { noteToFrequency } from "@/lib/noteRange";

/**
 * Real recorded instrument samples for the "Piano" and "Rhodes" tones, replacing what used to be
 * from-scratch Web Audio synthesis (`lib/tones.ts`'s old `pianoTone`/`rhodesTone`). The piano is
 * fetched from the Tone.js project's CDN; the Rhodes is served by soniroll itself
 * (`public/samples/rhodes/`, the same files Rhythm Section's chords use). Each sample is fetched
 * the first time a given note is actually needed (the browser's own HTTP cache covers later
 * visits — no bespoke persistence layer needed here) and decoded once into an `AudioBuffer`, then
 * reused for every later play of that exact sample. A requested note that
 * doesn't have its own recording gets the *nearest* recorded one, pitch-shifted via
 * `playbackRate` up or down to the exact target frequency — continuous, not limited to semitone
 * steps, the same as the synthesized tones could render any frequency exactly.
 *
 * The piano is CC BY 3.0 and the Rhodes CC BY 4.0 — attribution lives on `/credits`, linked from
 * the site footer.
 */

type SampleNote = { note: string; freq: number; file: string };
/** `gain` evens out the sets' recorded levels (the Rhodes files are normalized ~18 dB hotter than
    the piano's). */
type SampleSet = { baseUrl: string; notes: SampleNote[]; gain: number };
export type SampledInstrumentId = "piano" | "rhodes";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** This app's own note-name spelling (sharps, e.g. "C#4") for a MIDI note number, so each sample
    can be run through the same `noteToFrequency` every other note name in this app already uses. */
function midiToAppName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${SHARP_NAMES[pc]}${octave}`;
}

function buildSampleNote(note: string, file: string): SampleNote {
  const freq = noteToFrequency(note);
  if (freq === null) throw new Error(`Invalid sample note name: ${note}`);
  return { note, freq, file: `${file}.mp3` };
}

// Salamander Grand Piano (Alexander Holm, CC-BY 3.0), rendered to mp3 and hosted by the Tone.js
// project. Sampled at A/C/D#/F# every octave from A0 to C8 (30 notes), so a played note is never
// more than a semitone and a half from its sample.
const PIANO_SAMPLES: [note: string, file: string][] = [
  ["A0", "A0"],
  ["C1", "C1"], ["D#1", "Ds1"], ["F#1", "Fs1"], ["A1", "A1"],
  ["C2", "C2"], ["D#2", "Ds2"], ["F#2", "Fs2"], ["A2", "A2"],
  ["C3", "C3"], ["D#3", "Ds3"], ["F#3", "Fs3"], ["A3", "A3"],
  ["C4", "C4"], ["D#4", "Ds4"], ["F#4", "Fs4"], ["A4", "A4"],
  ["C5", "C5"], ["D#5", "Ds5"], ["F#5", "Fs5"], ["A5", "A5"],
  ["C6", "C6"], ["D#6", "Ds6"], ["F#6", "Fs6"], ["A6", "A6"],
  ["C7", "C7"], ["D#7", "Ds7"], ["F#7", "Fs7"], ["A7", "A7"],
  ["C8", "C8"],
];

// jRhodes3d (Jeff Learman, CC BY 4.0): his 1977 Rhodes Mark I Stage 73, sampled every 4th white
// key from F1 to C7 (MIDI 29–96 — the instrument itself runs E1–E7), converted to trimmed mono
// mp3s served from `public/samples/rhodes/<midi>_<layer>.mp3`. There's no velocity here, so every
// note uses layer 4 — jRhodes3d counts its layers down from 1 (hardest) to 5 (softest), so 4 is a
// medium-soft touch: round, with a little bell and none of the bark, the same timbre from the
// bottom to the top (the only layer sampled on every key). Notes past either end are
// pitch-shifted from F1 or C7.
const RHODES_LAYER = 4;
const RHODES_MIDIS = [29, 35, 40, 45, 50, 55, 59, 62, 65, 71, 76, 81, 86, 91, 96];
const RHODES_SAMPLES: [note: string, file: string][] = RHODES_MIDIS.map((midi) => [
  midiToAppName(midi),
  `${midi}_${RHODES_LAYER}`,
]);

const SAMPLE_SETS: Record<SampledInstrumentId, SampleSet> = {
  piano: {
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    notes: PIANO_SAMPLES.map(([note, file]) => buildSampleNote(note, file)),
    gain: 1,
  },
  rhodes: {
    baseUrl: "/samples/rhodes/",
    notes: RHODES_SAMPLES.map(([note, file]) => buildSampleNote(note, file)),
    gain: 0.15,
  },
};

/** Decoded sample cache, keyed by full URL — shared across every call site in the app (all the
    trainers, Guess the Interval/Chord, Practice Timer's transition chime) and across every
    `AudioContext` this app ever creates (there's normally just the one, from
    `lib/metronome.ts`'s `getAudioContext`), so a sample already played once by any tool is instant
    everywhere else too, for the rest of the tab's lifetime. */
const bufferCache = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  let promise = bufferCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Sample fetch failed (${res.status}): ${url}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    bufferCache.set(url, promise);
    // A failed fetch/decode (offline, a CDN hiccup, ...) shouldn't stay cached as a permanently-
    // rejected promise blocking every future attempt at this note — drop it so a later call tries
    // fresh instead of failing forever for the rest of the session.
    promise.catch(() => bufferCache.delete(url));
  }
  return promise;
}

/** Nearest-in-pitch sample to `freq` (by semitone distance, i.e. log-frequency, not linear Hz). */
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

/** Makes sure `freq`'s nearest sample is fetched+decoded and sitting in `bufferCache` — without
    playing anything. This is what `lib/tones.ts`'s `playNotesTogether` awaits, for every note of a
    chord/interval, *before* calling `playSampledNote` on any of them: a fetch's completion time
    isn't something scheduling a future Web Audio start time can paper over (a sample that isn't
    downloaded yet simply cannot play before it exists, no matter what `when` you pass to
    `.start()`), so the only way several notes can actually start together on a first play — not
    just on a replay once everything's already cached — is to wait for every one of them to finish
    loading before starting any of them. */
export function prepareSampledNote(
  ctx: AudioContext,
  instrumentId: SampledInstrumentId,
  freq: number,
): Promise<void> {
  const set = SAMPLE_SETS[instrumentId];
  const sample = nearestSample(set, freq);
  const url = set.baseUrl + sample.file;
  return loadBuffer(ctx, url).then(
    () => undefined,
    () => undefined, // a failed fetch here isn't fatal — playSampledNote's own .catch handles it
  );
}

/** Plays `freq` using the nearest recorded sample from `instrumentId`'s set, pitch-shifted to the
    exact target frequency, starting at `startTime` (an `AudioContext.currentTime`-relative
    timestamp — for a single, standalone note this is just "now"; Web Audio's own `.start(when)`
    already clamps a `when` in the past to "immediately", so passing this straight through is
    correct with no extra clamping needed here). If the sample hasn't been fetched+decoded yet,
    this kicks that off itself and plays as soon as it resolves — the note starts late (however
    long the fetch/decode took) rather than being dropped, same as before `prepareSampledNote`
    existed; for the "several notes together" case, `playNotesTogether` prepares every note first
    so this always resolves near-instantly by the time it's actually called, which is what makes
    them start in sync. A genuinely failed fetch (offline, the CDN unreachable, ...) just means
    that one note is silent — no synthesized fallback, since silently swapping to a
    different-sounding tone mid-session would be more confusing than one missed note. */
export function playSampledNote(
  ctx: AudioContext,
  instrumentId: SampledInstrumentId,
  freq: number,
  durationSeconds: number,
  startTime: number,
) {
  const set = SAMPLE_SETS[instrumentId];
  const sample = nearestSample(set, freq);
  const url = set.baseUrl + sample.file;

  loadBuffer(ctx, url)
    .then((buffer) => {
      const now = Math.max(startTime, ctx.currentTime);
      const end = now + durationSeconds;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = freq / sample.freq;

      const gain = ctx.createGain();
      // The piano set is a stereo recording (a real mic'd piano, not synthesized), with its own
      // left/right balance baked into the recording itself — unlike every other tone here (a
      // single mono oscillator, inherently centered), so without this it'd play off-center. (The
      // Rhodes files are already mono; this changes nothing for them.) Forcing this node's input
      // down to a single, explicitly-interpreted channel sums L+R into a properly centered mono
      // signal (the Web Audio spec's standard stereo->mono downmix, "speakers" interpretation)
      // before it reaches `ctx.destination`, which then upmixes that mono signal back out to both
      // speakers equally.
      gain.channelCount = 1;
      gain.channelCountMode = "explicit";
      gain.channelInterpretation = "speakers";
      // A real recording already has its own natural attack baked in — no envelope needed there,
      // just a short release ramp at the end so cutting the note off doesn't click.
      const releaseStart = Math.max(now, end - 0.08);
      gain.gain.setValueAtTime(set.gain, now);
      gain.gain.setValueAtTime(set.gain, releaseStart);
      gain.gain.linearRampToValueAtTime(0, end);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      source.stop(end);
    })
    .catch(() => {
      // See the doc comment above — a missed note, not a fallback tone.
    });
}

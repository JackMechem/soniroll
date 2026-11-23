import { getAudioContext } from "@/lib/metronome";
import { roomImpulse } from "@/lib/uprightBass";

// The comping instruments for Bass Genius, with real dynamics (several velocity layers each, not
// one sample played louder or softer):
//   - Piano: the Salamander Grand Piano (Alexander Holm, CC-BY 3.0), the velocity-layered set the
//     Tone.js Piano project hosts — every minor third, layers 4 / 8 / 12 of 16.
//   - Rhodes: jRhodes3d (Jeff Learman, CC BY 4.0), a 1977 Rhodes Mark I Stage 73 — every 4th
//     white key, layers 2 / 3 / 4 of 5, converted to mono mp3 and served from
//     `public/samples/rhodes/` (`<midi>_<layer>.mp3`). In jRhodes3d layer 1 is the hardest hit
//     and 5 the softest, so 4 is the soft layer and 2 the barky one. (Taken out 2026-11-18 while
//     it was CC BY-NC; back 2026-11-23 once Jeff Learman relicensed it CC BY.)
// Only the comping register is loaded (about A2–C6). Nearest sample, pitch-shifted; through a gentle
// compressor and the same room as the bass.

export type CompInstrument = "piano" | "rhodes";

type Sample = { midi: number; layer: number; url: string };

const PIANO_NAMES = ["C", "Ds", "Fs", "A"];
const PIANO_PCS = [0, 3, 6, 9];
const PIANO_LAYERS = [4, 8, 12];
function pianoSamples(): Sample[] {
  const out: Sample[] = [];
  for (let midi = 45; midi <= 84; midi++) {
    const k = PIANO_PCS.indexOf(midi % 12);
    if (k < 0) continue;
    const name = `${PIANO_NAMES[k]}${Math.floor(midi / 12) - 1}`;
    for (const layer of PIANO_LAYERS) out.push({ midi, layer, url: `https://tambien.github.io/Piano/audio/${name}v${layer}.mp3` });
  }
  return out;
}

const RHODES_FILES: [number, number[]][] = [
  [45, [2, 3, 4]],
  [50, [2, 3, 4]],
  [55, [2, 3, 4]],
  [59, [2, 3, 4]],
  [62, [2, 3, 4]],
  [65, [2, 3, 4]],
  [71, [2, 4]],
  [76, [2, 4]],
  [81, [2, 4]],
  [86, [2, 4]],
];
function rhodesSamples(): Sample[] {
  return RHODES_FILES.flatMap(([midi, layers]) => layers.map((layer) => ({ midi, layer, url: `/samples/rhodes/${midi}_${layer}.mp3` })));
}

const SAMPLES: Record<CompInstrument, Sample[]> = { piano: pianoSamples(), rhodes: rhodesSamples() };
/** Which velocity (0–1) each layer stands for. (jRhodes3d counts its layers down: 4 is soft, 2 is
    hard. Before 2026-11-23 this had them the wrong way round.) */
const LAYER_VELOCITY: Record<CompInstrument, Record<number, number>> = {
  piano: { 4: 0.3, 8: 0.55, 12: 0.8 },
  rhodes: { 4: 0.3, 3: 0.55, 2: 0.8 },
};
/** Level trim so the two sit at the same loudness under the bass. */
const TRIM: Record<CompInstrument, number> = { piano: 0.55, rhodes: 0.85 };

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<CompInstrument, Promise<void>>();

export function compReady(instrument: CompInstrument): boolean {
  return SAMPLES[instrument].every((s) => buffers.has(s.url));
}

/** Downloads and decodes an instrument's samples (once). */
export function loadComp(instrument: CompInstrument, onProgress?: (fraction: number) => void): Promise<void> {
  const existing = loading.get(instrument);
  if (existing) return existing;
  const ctx = getAudioContext();
  const list = SAMPLES[instrument];
  let done = 0;
  const job = Promise.all(
    list.map(async (s) => {
      if (!buffers.has(s.url)) {
        const res = await fetch(s.url);
        if (!res.ok) throw new Error(`Couldn't download ${s.url}`);
        buffers.set(s.url, await ctx.decodeAudioData(await res.arrayBuffer()));
      }
      done++;
      onProgress?.(done / list.length);
    }),
  ).then(() => undefined);
  job.catch(() => loading.delete(instrument));
  loading.set(instrument, job);
  return job;
}

type Chain = { input: GainNode; master: GainNode; wet: GainNode };
let chain: Chain | null = null;
function getChain(): Chain {
  if (chain) return chain;
  const ctx = getAudioContext();
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 2;
  comp.attack.value = 0.02;
  comp.release.value = 0.25;
  const master = ctx.createGain();
  const wet = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = roomImpulse(ctx);
  input.connect(comp);
  comp.connect(master);
  comp.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);
  wet.gain.value = 0.22;
  master.gain.value = 0.6;
  chain = { input, master, wet };
  return chain;
}

export function setCompVolume(volume: number) {
  getChain().master.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.05);
}
/** Room sound around the chords, 0–1 (0.5 = the usual touch). */
export function setCompRoom(amount: number) {
  getChain().wet.gain.setTargetAtTime(amount * 0.44, getAudioContext().currentTime, 0.05);
}

/** Plays one note of a chord at `time` for `seconds` (then a natural-sounding release). */
export function playCompNote(instrument: CompInstrument, midi: number, time: number, seconds: number, velocity: number) {
  const ctx = getAudioContext();
  const list = SAMPLES[instrument];
  // Nearest pitch, then the layer nearest the velocity.
  let nearest = list[0];
  for (const s of list) if (Math.abs(s.midi - midi) < Math.abs(nearest.midi - midi)) nearest = s;
  const atPitch = list.filter((s) => s.midi === nearest.midi);
  const sample = atPitch.reduce((best, s) =>
    Math.abs(LAYER_VELOCITY[instrument][s.layer] - velocity) < Math.abs(LAYER_VELOCITY[instrument][best.layer] - velocity) ? s : best,
  );
  const buffer = buffers.get(sample.url);
  if (!buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = Math.pow(2, (midi - sample.midi) / 12);
  const g = ctx.createGain();
  g.channelCount = 1;
  g.channelCountMode = "explicit";
  // The layer gives the tone; velocity still shades the level.
  const level = TRIM[instrument] * (0.35 + 0.65 * velocity);
  const start = Math.max(time, ctx.currentTime);
  const release = instrument === "piano" ? 0.35 : 0.25; // a damper coming down / a key let go
  const end = start + Math.max(0.08, seconds);
  g.gain.setValueAtTime(level, start);
  g.gain.setValueAtTime(level, end);
  g.gain.setTargetAtTime(0, end, release / 3);
  src.connect(g);
  g.connect(getChain().input);
  src.start(start);
  src.stop(end + release * 2);
}

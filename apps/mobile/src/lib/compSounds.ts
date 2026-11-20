import type { AudioBuffer, GainNode } from 'react-native-audio-api';

import { getAudioContext } from '@/lib/audioContext';

/**
 * The Rhythm Section's comping piano — a port of the website's `apps/web/lib/compSounds.ts`: the
 * Salamander Grand Piano (CC BY 3.0) in the velocity-layered set the Tone.js Piano project hosts
 * (layers 4 / 8 / 12 of 16, every minor third, A2–C6), downloaded once like the website does. The
 * Rhodes was taken out on the website (licence), so it isn't here either. No compressor on the phone.
 */

export type CompInstrument = 'piano';

type Sample = { midi: number; layer: number; url: string };

const PIANO_NAMES = ['C', 'Ds', 'Fs', 'A'];
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

const SAMPLES: Record<CompInstrument, Sample[]> = { piano: pianoSamples() };
const LAYER_VELOCITY: Record<CompInstrument, Record<number, number>> = { piano: { 4: 0.3, 8: 0.55, 12: 0.8 } };
const TRIM: Record<CompInstrument, number> = { piano: 0.55 };

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
      if (!buffers.has(s.url)) buffers.set(s.url, await ctx.decodeAudioData(s.url));
      done++;
      onProgress?.(done / list.length);
    }),
  ).then(() => undefined);
  job.catch(() => loading.delete(instrument));
  loading.set(instrument, job);
  return job;
}

type Chain = { input: GainNode; master: GainNode };
let chain: Chain | null = null;
function getChain(): Chain {
  if (chain) return chain;
  const ctx = getAudioContext();
  const input = ctx.createGain();
  const master = ctx.createGain();
  input.connect(master);
  master.connect(ctx.destination);
  master.gain.value = 0.6;
  chain = { input, master };
  return chain;
}

export function setCompVolume(volume: number) {
  getChain().master.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.05);
}

/** Plays one note of a chord at `time` for `seconds` (then a damper-like release). */
export function playCompNote(instrument: CompInstrument, midi: number, time: number, seconds: number, velocity: number) {
  const ctx = getAudioContext();
  const list = SAMPLES[instrument];
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
  const level = TRIM[instrument] * (0.35 + 0.65 * velocity);
  const start = Math.max(time, ctx.currentTime);
  const release = 0.35;
  const end = start + Math.max(0.08, seconds);
  g.gain.setValueAtTime(level, start);
  g.gain.setValueAtTime(level, end);
  g.gain.setTargetAtTime(0, end, release / 3);
  src.connect(g);
  g.connect(getChain().input);
  src.start(start);
  src.stop(end + release * 2);
}

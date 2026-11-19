import type { AudioBuffer, GainNode } from 'react-native-audio-api';

import { getAudioContext } from '@/lib/audioContext';
import { roomImpulse } from '@/lib/roomImpulse';
import { UPRIGHT_BASS_SAMPLES } from '@/lib/uprightBassSamples';

/**
 * The Rhythm Section's upright bass — a port of the website's `apps/web/lib/uprightBass.ts`:
 * Karoryfer's "Meatbass" pizzicato (CC0), sampled every minor third from A0 to C4 with four velocity
 * layers and four round-robin takes, bundled (`uprightBassSamples.ts`). No compressor on the phone
 * (its audio engine has none).
 */

const KEYS: { name: string; midi: number }[] = [
  { name: 'a0', midi: 21 },
  { name: 'c1', midi: 24 },
  { name: 'eb1', midi: 27 },
  { name: 'gb1', midi: 30 },
  { name: 'a1', midi: 33 },
  { name: 'c2', midi: 36 },
  { name: 'eb2', midi: 39 },
  { name: 'gb2', midi: 42 },
  { name: 'a2', midi: 45 },
  { name: 'c3', midi: 48 },
  { name: 'eb3', midi: 51 },
  { name: 'gb3', midi: 54 },
  { name: 'a3', midi: 57 },
  { name: 'c4', midi: 60 },
];
const LAYERS = 4;
const TAKES = 4;
const TOTAL = KEYS.length * LAYERS * TAKES;

type Sample = { buffer: AudioBuffer; /** seconds of padding before the pluck */ offset: number };
/** samples[key][layer][take] */
let samples: Sample[][][] | null = null;
let loading: Promise<void> | null = null;
let loaded = 0;
const progressListeners = new Set<(fraction: number) => void>();

function onsetOf(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.1));
  for (let i = 0; i < limit; i++) if (Math.abs(data[i]) > 0.004) return Math.max(0, i - 24) / buffer.sampleRate;
  return 0;
}

export function uprightBassReady(): boolean {
  return samples !== null;
}

/** Decodes every sample (once). `onProgress` gets 0–1 as they're ready. */
export function loadUprightBass(onProgress?: (fraction: number) => void): Promise<void> {
  if (onProgress) {
    progressListeners.add(onProgress);
    onProgress(samples ? 1 : loaded / TOTAL);
  }
  if (samples) return Promise.resolve();
  if (loading) return loading.finally(() => onProgress && progressListeners.delete(onProgress));

  const ctx = getAudioContext();
  const result: Sample[][][] = KEYS.map(() => Array.from({ length: LAYERS }, () => [] as Sample[]));
  const jobs: { k: number; l: number; t: number }[] = [];
  KEYS.forEach((_, k) => {
    for (let l = 0; l < LAYERS; l++) for (let t = 0; t < TAKES; t++) jobs.push({ k, l, t });
  });

  async function decodeOne(job: { k: number; l: number; t: number }) {
    const name = `${KEYS[job.k].name}_v${job.l + 1}_rr${job.t + 1}`;
    const asset = UPRIGHT_BASS_SAMPLES[name];
    if (asset === undefined) throw new Error(`No bass sample ${name}`);
    const buffer = await ctx.decodeAudioData(asset);
    result[job.k][job.l][job.t] = { buffer, offset: onsetOf(buffer) };
    loaded += 1;
    for (const fn of progressListeners) fn(loaded / TOTAL);
  }

  loading = (async () => {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) await decodeOne(jobs[next++]);
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    samples = result;
  })();
  loading.catch(() => {
    loading = null;
    loaded = 0;
  });
  return loading.finally(() => onProgress && progressListeners.delete(onProgress));
}

type Chain = { input: GainNode; master: GainNode; wet: GainNode };
let chain: Chain | null = null;

function getChain(): Chain {
  const ctx = getAudioContext();
  if (chain) return chain;
  const input = ctx.createGain();
  const master = ctx.createGain();
  const wet = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = roomImpulse(ctx);
  input.connect(master);
  input.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);
  wet.gain.value = 0.16;
  master.gain.value = 0.9;
  chain = { input, master, wet };
  return chain;
}

export function setUprightBassVolume(volume: number) {
  getChain().master.gain.setTargetAtTime(volume * 1.1, getAudioContext().currentTime, 0.05);
}

/** Room sound around the bass: true/false, or an amount 0–1 (0.5 = the usual touch). */
export function setUprightBassRoom(amount: boolean | number) {
  const a = typeof amount === 'boolean' ? (amount ? 0.5 : 0) : amount;
  getChain().wet.gain.setTargetAtTime(a * 0.32, getAudioContext().currentTime, 0.05);
}

const lastTake = new Map<string, number>();

/** Plays one note at `time` for `seconds`, then mutes it like a bassist's fingers (a quick fade).
    `velocity` (0–1) picks the layer and shades the level; takes rotate. */
export function playUprightBassNote(midi: number, time: number, seconds: number, velocity: number, ghost = false) {
  if (!samples) return;
  const ctx = getAudioContext();
  let k = 0;
  for (let i = 1; i < KEYS.length; i++) if (Math.abs(KEYS[i].midi - midi) < Math.abs(KEYS[k].midi - midi)) k = i;
  const v = Math.max(0, Math.min(0.999, velocity));
  const layer = Math.min(LAYERS - 1, Math.floor(v * LAYERS));
  const id = `${k}:${layer}`;
  const prevTake = lastTake.get(id) ?? -1;
  let take = Math.floor(Math.random() * (TAKES - 1));
  if (take >= prevTake) take += 1;
  take %= TAKES;
  lastTake.set(id, take);
  const sample = samples[k][layer][take];
  if (!sample) return;

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.value = Math.pow(2, (midi - KEYS[k].midi) / 12);
  const gain = ctx.createGain();
  const within = v * LAYERS - layer;
  const level = (0.72 + 0.28 * within) * (ghost ? 0.55 : 1);
  const start = Math.max(time, ctx.currentTime);
  const release = ghost ? 0.05 : 0.07;
  const end = start + Math.max(0.06, seconds);
  gain.gain.setValueAtTime(level, start);
  gain.gain.setValueAtTime(level, end);
  gain.gain.setTargetAtTime(0, end, release / 3);
  src.connect(gain);
  gain.connect(getChain().input);
  src.start(start, sample.offset);
  src.stop(end + release * 2 + 0.05);
}

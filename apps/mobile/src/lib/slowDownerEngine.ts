import type { AudioBuffer, AudioBufferSourceNode, GainNode } from 'react-native-audio-api';

import { getAudioContext } from '@/lib/audioContext';

/**
 * The Slow Downer's playback engine — the native counterpart of web's hidden `<video>` element
 * (`playbackRate` + `preservesPitch`). The whole file is decoded into an `AudioBuffer` (by
 * `react-native-audio-api`, from its local path) and played through a buffer source:
 * `createBufferSource({ pitchCorrection: true })` changes speed without changing pitch (what
 * "Keep original pitch" switches), and the A–B loop uses the source's own `loop`/`loopStart`/
 * `loopEnd` so it wraps sample-accurately, with no gap.
 *
 * Where the playhead is gets worked out from the audio clock (no polling the native node): an
 * anchor — "at context time T the playhead was at P, moving at rate R" — re-taken whenever speed,
 * loop or position changes. A source node can only be started once, so play/seek/pitch changes
 * build a fresh one.
 */
export type LoopRegion = { start: number; end: number };

/** Waveform peaks: per bucket, the lowest and highest sample. */
export type Peaks = { min: Float32Array; max: Float32Array; bucketSeconds: number };

const PEAK_BUCKETS = 12000;

/** Temporary crash breadcrumbs (show in `adb logcat` as ReactNativeJS). */
export function trace(msg: string) {
  console.log(`[slowdowner] ${msg}`);
}

export class SlowDownerPlayer {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private anchor = { ctxTime: 0, position: 0 };
  private rate = 1;
  private pitch = true;
  private volume = 1;
  private loop: LoopRegion | null = null;
  playing = false;
  private onEnded: (() => void) | null = null;

  /** Called (from `tick`) when playback reaches the end of the file (not when paused or looping). */
  setOnEnded(fn: (() => void) | null) {
    this.onEnded = fn;
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  /** Decodes a local audio/video file. Returns its waveform peaks. */
  async load(uri: string): Promise<Peaks> {
    trace(`load ${uri}`);
    this.stopSource();
    this.playing = false;
    this.anchor = { ctxTime: 0, position: 0 };
    this.buffer = null;
    const buffer = await getAudioContext().decodeAudioData(uri);
    this.buffer = buffer;
    trace(`decoded ${buffer.duration.toFixed(1)}s ch=${buffer.numberOfChannels} len=${buffer.length}`);
    const peaks = peaksOf(buffer);
    trace('peaks done');
    return peaks;
  }

  unload() {
    this.stopSource();
    this.playing = false;
    this.buffer = null;
  }

  /** The playhead, in seconds of the original file. */
  position(): number {
    if (!this.playing) return this.anchor.position;
    const ctx = getAudioContext();
    let p = this.anchor.position + (ctx.currentTime - this.anchor.ctxTime) * this.rate;
    const loop = this.loop;
    if (loop && this.anchor.position < loop.end && p >= loop.end) {
      const len = loop.end - loop.start;
      if (len > 0) p = loop.start + ((p - loop.start) % len);
    }
    return Math.min(p, this.duration);
  }

  /** The playhead, and the end-of-file check: call it regularly while playing (the screen's ~25 Hz
      playhead timer does). The end is detected here, from the clock, rather than with the source's
      native `onEnded` event — routing those events back into JS from the many sources a seek/loop
      change replaces crashed the JS engine on a real device (SIGSEGV in Hermes), so this engine
      registers no native callbacks at all. */
  tick(): number {
    const p = this.position();
    const looping = this.loop && this.anchor.position < this.loop.end;
    if (this.playing && !looping && p >= this.duration - 0.005) {
      trace('ended');
      this.playing = false;
      this.anchor = { ctxTime: 0, position: this.duration };
      this.stopSource();
      this.onEnded?.();
    }
    return p;
  }

  play() {
    trace('play');
    if (!this.buffer) return;
    let from = this.anchor.position;
    const loop = this.loop;
    if (loop && (from < loop.start || from >= loop.end)) from = loop.start;
    if (from >= this.duration - 0.01) from = 0;
    this.startAt(from);
  }

  pause() {
    trace('pause');
    if (!this.playing) return;
    this.anchor = { ctxTime: 0, position: this.position() };
    this.playing = false;
    this.stopSource();
  }

  seek(t: number) {
    trace(`seek ${t.toFixed(2)}`);
    const clamped = Math.max(0, Math.min(this.duration, t));
    if (this.playing) this.startAt(clamped);
    else this.anchor = { ctxTime: 0, position: clamped };
  }

  setSpeed(rate: number) {
    if (rate === this.rate) return;
    if (this.playing) {
      const pos = this.position();
      this.rate = rate;
      this.anchor = { ctxTime: getAudioContext().currentTime, position: pos };
      if (this.source) this.source.playbackRate.value = rate;
    } else {
      this.rate = rate;
    }
  }

  setPreservePitch(on: boolean) {
    trace(`pitch ${on}`);
    if (on === this.pitch) return;
    this.pitch = on;
    if (this.playing) this.startAt(this.position());
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }

  setLoop(loop: LoopRegion | null) {
    trace(`setLoop ${JSON.stringify(loop)}`);
    const same = loop && this.loop ? loop.start === this.loop.start && loop.end === this.loop.end : loop === this.loop;
    if (same) return;
    const pos = this.position();
    this.loop = loop;
    if (this.playing) {
      // Jump into a new loop, otherwise carry on from where we are with the new loop points.
      this.startAt(loop && (pos < loop.start || pos >= loop.end) ? loop.start : pos);
    }
  }

  private startAt(position: number) {
    trace(`startAt ${position.toFixed(2)} rate=${this.rate} pitch=${this.pitch} loop=${JSON.stringify(this.loop)}`);
    const buffer = this.buffer;
    if (!buffer) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    this.stopSource();
    const source = ctx.createBufferSource({ pitchCorrection: this.pitch });
    source.buffer = buffer;
    source.playbackRate.value = this.rate;
    const loop = this.loop;
    if (loop && position < loop.end) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
    }
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    this.source = source;
    this.gain = gain;
    this.anchor = { ctxTime: ctx.currentTime, position };
    this.playing = true;
    source.start(ctx.currentTime, position);
  }

  private stopSource() {
    const source = this.source;
    if (source) trace('stopSource');
    this.source = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // already stopped
    }
    // Cutting the gain node off is what silences it at once; the stopped source is left alone.
    this.gain?.disconnect();
    this.gain = null;
  }
}

const WINDOWS_PER_BUCKET = 4;
const WINDOW = 128;

/**
 * Reduces a decoded buffer to waveform peaks (all channels mixed), reading it a few small windows
 * per bucket through `copyFromChannel` into one reusable array. Deliberately *not*
 * `getChannelData`: that hands JS a typed array over the whole channel and registers its full
 * size as external memory with the JS engine — hundreds of MB for a long song (a 16-minute file
 * is ~360 MB decoded), which is the other suspect in the on-device Hermes crash.
 */
function peaksOf(buffer: AudioBuffer): Peaks {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const buckets = Math.min(PEAK_BUCKETS, Math.max(1, Math.floor(length / WINDOW)));
  const size = length / buckets;
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const scratch = new Float32Array(WINDOW);
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const span = Math.max(1, Math.floor(size));
    let lo = 0;
    let hi = 0;
    for (let w = 0; w < WINDOWS_PER_BUCKET; w++) {
      const at = Math.min(length - 1, from + Math.floor((w * span) / WINDOWS_PER_BUCKET));
      const n = Math.min(WINDOW, length - at);
      for (let c = 0; c < channels; c++) {
        // Never ask for more than is left: copying past the end threw on short files (a few
        // seconds), so they never opened.
        // (A fresh array, not a view: the native side reads the whole underlying buffer.)
        const dest = n < WINDOW ? new Float32Array(n) : scratch;
        buffer.copyFromChannel(dest, c, at);
        for (let i = 0; i < n; i++) {
          const v = dest[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max, bucketSeconds: buffer.duration / buckets };
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

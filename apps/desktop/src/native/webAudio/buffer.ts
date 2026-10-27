import { decodeOnRust, needsUpload, newId, trackBuffer, uploadBuffer } from "./bridge";

/** An `AudioBuffer`. Its samples live here (so `getChannelData` works as usual: waveforms,
    onset detection, filling a reverb impulse) and Rust has a copy to play.

    Decoded files are decoded in Rust, which keeps its copy; the samples come back for
    JavaScript. A buffer made here (`createBuffer`) goes to Rust when something first uses it,
    and again if it's been written to since: `getChannelData` hands out the live array, so any
    call to it counts as a write. Decoded buffers are taken to be read-only (they're read for
    waveforms and onsets, never written), so reading one doesn't send it all back again;
    `copyToChannel` still does. */

export class NativeAudioBuffer {
  readonly id: number;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  #channels: Float32Array[];
  /** Rust has this content. */
  #onRust: boolean;
  /** Decoded: `getChannelData` is only ever read. */
  #readOnly: boolean;
  #written = false;

  constructor(
    options: AudioBufferOptions,
    decoded?: { id: number; channels: Float32Array[]; onRust: boolean },
  ) {
    const { numberOfChannels = 1, length, sampleRate } = options;
    if (!(numberOfChannels >= 1 && numberOfChannels <= 32)) {
      throw new DOMException(`${numberOfChannels} channels isn't supported.`, "NotSupportedError");
    }
    if (!(length >= 1)) throw new DOMException("A buffer needs at least one sample.", "NotSupportedError");
    if (!(sampleRate >= 3000 && sampleRate <= 768000)) {
      throw new DOMException(`A sample rate of ${sampleRate} isn't supported.`, "NotSupportedError");
    }
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.id = decoded?.id ?? newId();
    this.#channels = decoded?.channels ?? Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.#onRust = decoded?.onRust ?? false;
    this.#readOnly = !!decoded;
    trackBuffer(this, this.id);
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  #channel(channel: number): Float32Array {
    const data = this.#channels[channel];
    if (!data) throw new DOMException(`There's no channel ${channel}.`, "IndexSizeError");
    return data;
  }

  getChannelData(channel: number): Float32Array {
    const data = this.#channel(channel);
    if (!this.#readOnly) this.#written = true;
    return data;
  }

  copyFromChannel(destination: Float32Array, channel: number, start = 0): void {
    destination.set(this.#channel(channel).subarray(start, start + destination.length));
  }

  copyToChannel(source: Float32Array, channel: number, start = 0): void {
    this.#channel(channel).set(source.subarray(0, Math.max(0, this.length - start)), start);
    this.#written = true;
  }

  /** The id Rust knows this buffer by, sending the samples first if Rust doesn't have them. */
  ref(): number {
    if (!this.#onRust || this.#written) needsUpload(this);
    return this.id;
  }

  async upload(): Promise<void> {
    this.#written = false;
    const bytes = new Uint8Array(this.numberOfChannels * this.length * 4);
    this.#channels.forEach((data, c) => {
      bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), c * this.length * 4);
    });
    await uploadBuffer(this.id, bytes, this.numberOfChannels, this.length, this.sampleRate);
    this.#onRust = true;
  }
}

/** `decodeAudioData`. Rust decodes (symphonia: mp3, AAC/m4a, Ogg, FLAC, WAV, ...) at the app's
    sample rate. Anything it can't read goes through the window's own decoder instead (the same
    one the website uses in this browser), and is sent to Rust when it's first played. */
export async function decodeAudio(data: ArrayBuffer, sampleRate: number): Promise<NativeAudioBuffer> {
  const id = newId();
  try {
    const reply = await decodeOnRust(id, new Uint8Array(data));
    const [numberOfChannels, length] = new Uint32Array(reply, 0, 2);
    const rate = new Float32Array(reply, 8, 1)[0];
    const channels = Array.from(
      { length: numberOfChannels },
      (_, c) => new Float32Array(reply, 16 + c * length * 4, length),
    );
    return new NativeAudioBuffer({ numberOfChannels, length, sampleRate: rate }, { id, channels, onRust: true });
  } catch (rustError) {
    try {
      const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(data.slice(0));
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c).slice());
      return new NativeAudioBuffer(
        { numberOfChannels: decoded.numberOfChannels, length: decoded.length, sampleRate: decoded.sampleRate },
        { id, channels, onRust: false },
      );
    } catch {
      throw new DOMException(`Unable to decode audio data (${String(rustError)})`, "EncodingError");
    }
  }
}

/** A `PeriodicWave` is just its harmonics; they travel with `setPeriodicWave`. */
export class NativePeriodicWave {
  readonly real: number[];
  readonly imag: number[];
  readonly normalize: boolean;

  constructor(real: Iterable<number>, imag: Iterable<number>, normalize: boolean) {
    this.real = Array.from(real);
    this.imag = Array.from(imag);
    if (this.real.length !== this.imag.length || this.real.length < 2) {
      throw new DOMException("A periodic wave needs matching real and imag arrays of 2 or more.", "IndexSizeError");
    }
    this.normalize = normalize;
  }
}

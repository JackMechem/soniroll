import { engineLatency, engineNow, holdClock } from "../engine";
import { send } from "./bridge";
import { NativeAudioBuffer, NativePeriodicWave, decodeAudio } from "./buffer";
import {
  NativeAnalyserNode,
  NativeBiquadFilterNode,
  NativeBufferSourceNode,
  NativeChannelMergerNode,
  NativeChannelSplitterNode,
  NativeConstantSourceNode,
  NativeConvolverNode,
  NativeDelayNode,
  NativeDestination,
  NativeDynamicsCompressorNode,
  NativeGainNode,
  NativeOscillatorNode,
  NativeStereoPannerNode,
  NativeWaveShaperNode,
} from "./nodes";

/** The desktop app's `AudioContext`: the same API the website's sound code already uses, with the
    graph built in Rust and played through the native output. There's one, shared by everything
    (constructing another hands back the same one), the way the website shares one through
    `getAudioContext()`. */

// Rust puts this in the window before any script runs (`Bridge::init_script`); 48 kHz is only
// for running the page outside the app (headless checks of the Vite server).
const SAMPLE_RATE = (window as { __SONIROLL_AUDIO__?: { sampleRate: number } }).__SONIROLL_AUDIO__?.sampleRate ?? 48_000;

let shared: NativeAudioContext | null = null;

const notHere = (what: string) =>
  new DOMException(`${what} isn't available in the desktop app's native audio.`, "NotSupportedError");

export class NativeAudioContext extends EventTarget {
  readonly sampleRate = SAMPLE_RATE;
  readonly destination: NativeDestination = new NativeDestination(this);
  /** Rust renders straight into the device's buffer: no extra buffering of its own. */
  readonly baseLatency = 0;
  state: AudioContextState = "running";
  onstatechange: ((this: NativeAudioContext, event: Event) => unknown) | null = null;

  constructor() {
    super();
    if (shared) return shared;
    // The one context everything shares (see above).
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    shared = this;
  }

  get currentTime(): number {
    return engineNow();
  }

  get outputLatency(): number {
    return engineLatency();
  }

  getOutputTimestamp(): AudioTimestamp {
    return { contextTime: this.currentTime, performanceTime: performance.now() };
  }

  #setState(state: AudioContextState): void {
    if (this.state === state) return;
    this.state = state;
    const event = new Event("statechange");
    this.onstatechange?.call(this, event);
    this.dispatchEvent(event);
  }

  resume(): Promise<void> {
    if (this.state === "suspended") {
      this.#setState("running");
      send({ op: "resume" });
    }
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    if (this.state === "running") {
      holdClock();
      this.#setState("suspended");
      send({ op: "suspend" });
    }
    return Promise.resolve();
  }

  /** Everything shares this one context, so closing it would silence the whole app: it stays
      open (the website never closes it either). */
  close(): Promise<void> {
    return Promise.resolve();
  }

  createGain() {
    return new NativeGainNode(this);
  }
  createOscillator() {
    return new NativeOscillatorNode(this);
  }
  createBufferSource() {
    return new NativeBufferSourceNode(this);
  }
  createConstantSource() {
    return new NativeConstantSourceNode(this);
  }
  createDynamicsCompressor() {
    return new NativeDynamicsCompressorNode(this);
  }
  createConvolver() {
    return new NativeConvolverNode(this);
  }
  createAnalyser() {
    return new NativeAnalyserNode(this);
  }
  createChannelSplitter(numberOfOutputs = 6) {
    return new NativeChannelSplitterNode(this, numberOfOutputs);
  }
  createChannelMerger(numberOfInputs = 6) {
    return new NativeChannelMergerNode(this, numberOfInputs);
  }
  createBiquadFilter() {
    return new NativeBiquadFilterNode(this);
  }
  createDelay(maxDelayTime = 1) {
    return new NativeDelayNode(this, maxDelayTime);
  }
  createStereoPanner() {
    return new NativeStereoPannerNode(this);
  }
  createWaveShaper() {
    return new NativeWaveShaperNode(this);
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    return new NativeAudioBuffer({ numberOfChannels, length, sampleRate });
  }

  createPeriodicWave(real: Iterable<number>, imag: Iterable<number>, constraints?: PeriodicWaveConstraints) {
    return new NativePeriodicWave(real, imag, !constraints?.disableNormalization);
  }

  decodeAudioData(
    data: ArrayBuffer,
    success?: (buffer: NativeAudioBuffer) => void,
    error?: (error: DOMException) => void,
  ): Promise<NativeAudioBuffer> {
    const job = decodeAudio(data, this.sampleRate);
    job.then(success, error);
    return job;
  }

  // The microphone and recording have their own native paths (the tuner's input, the Recorder),
  // and the rest isn't used anywhere on the site. A clear error beats a silent graph.
  createMediaStreamSource(): never {
    throw notHere("createMediaStreamSource");
  }
  createMediaStreamDestination(): never {
    throw notHere("createMediaStreamDestination");
  }
  createMediaElementSource(): never {
    throw notHere("createMediaElementSource");
  }
  createScriptProcessor(): never {
    throw notHere("createScriptProcessor");
  }
  createPanner(): never {
    throw notHere("createPanner");
  }
  createIIRFilter(): never {
    throw notHere("createIIRFilter");
  }
}

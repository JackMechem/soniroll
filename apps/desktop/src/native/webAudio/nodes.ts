import { holdWhilePlaying, newId, readAnalyser, release, send, track, type Op, type Tracked } from "./bridge";
import type { NativeAudioBuffer, NativePeriodicWave } from "./buffer";
import { NativeAudioParam } from "./param";

/** The Web Audio nodes the website uses (and a few more that cost nothing to have). Each one
    sends what's done to it to Rust, and keeps its own state for the getters and for replaying it
    into a reopened output. The spec's usual exceptions are thrown here, before anything is sent,
    so the website's `try { osc.stop() } catch {}` habits behave as they do in a browser. */

/** The part of `NativeAudioContext` a node needs (kept narrow to avoid an import cycle). */
export type NodeContext = { readonly currentTime: number; readonly sampleRate: number };

type Connection = { to: NativeAudioNode; param?: string; output: number; input: number };

type Channels = { count: number; mode: ChannelCountMode; interpretation: ChannelInterpretation };

function checkTime(t: number, what = "time"): number {
  if (!Number.isFinite(t)) throw new TypeError(`The ${what} is non-finite.`);
  if (t < 0) throw new RangeError(`The ${what} ${t} must be zero or more.`);
  return t;
}

const invalidState = (message: string) => new DOMException(message, "InvalidStateError");

export class NativeAudioNode extends EventTarget implements Tracked {
  readonly id: number;
  gen = 0;
  readonly isSource: boolean = false;
  readonly context: NodeContext;
  readonly numberOfInputs: number;
  readonly numberOfOutputs: number;
  readonly #kind: string | null;
  readonly #arg: number | undefined;
  #channels: Channels;
  /** Where this node plays into. Holding them keeps them alive while this node is, the way a
      browser keeps a node alive while something plays into it. */
  #connections: Connection[] = [];
  /** Plain attributes, under the names Rust knows them by. */
  protected attrs = new Map<string, unknown>();
  protected params: NativeAudioParam[] = [];

  constructor(
    context: NodeContext,
    kind: string | null,
    shape: { inputs: number; outputs: number; arg?: number } & Channels,
  ) {
    super();
    this.context = context;
    this.#kind = kind;
    this.#arg = shape.arg;
    this.numberOfInputs = shape.inputs;
    this.numberOfOutputs = shape.outputs;
    this.#channels = { count: shape.count, mode: shape.mode, interpretation: shape.interpretation };
    // The destination is id 0 on both sides and always there.
    this.id = kind ? newId() : 0;
    if (kind) {
      send(this.#createOp());
      track(this);
    }
  }

  get started(): boolean {
    return false;
  }

  protected param(name: string, defaultValue: number, min?: number, max?: number): NativeAudioParam {
    const param = new NativeAudioParam(this, name, defaultValue, min, max);
    this.params.push(param);
    return param;
  }

  protected setAttr(key: string, value: unknown): void {
    this.attrs.set(key, value);
    send({ op: "set", id: this.id, key, value });
  }

  #createOp(): Op {
    return { op: "create", id: this.id, kind: this.#kind, arg: this.#arg };
  }

  connect<T extends NativeAudioNode>(destination: T, output?: number, input?: number): T;
  connect(destination: NativeAudioParam, output?: number): undefined;
  connect(destination: NativeAudioNode | NativeAudioParam, output = 0, input = 0): NativeAudioNode | undefined {
    if (output < 0 || output >= this.numberOfOutputs) {
      throw new DOMException(`Output ${output} doesn't exist.`, "IndexSizeError");
    }
    if (destination instanceof NativeAudioParam) {
      const to = destination.owner as NativeAudioNode;
      const param = destination.name;
      if (!this.#connections.some((c) => c.to === to && c.param === param && c.output === output)) {
        this.#connections.push({ to, param, output, input: 0 });
      }
      send({ op: "connect", from: this.id, to: to.id, output, param });
      return undefined;
    }
    if (!(destination instanceof NativeAudioNode)) {
      // e.g. a node from the window's own Web Audio: two separate graphs can't be joined.
      throw new DOMException("That node belongs to a different AudioContext.", "InvalidAccessError");
    }
    if (input < 0 || input >= destination.numberOfInputs) {
      throw new DOMException(`Input ${input} doesn't exist.`, "IndexSizeError");
    }
    const exists = (c: Connection) => c.to === destination && !c.param && c.output === output && c.input === input;
    if (!this.#connections.some(exists)) this.#connections.push({ to: destination, output, input });
    send({ op: "connect", from: this.id, to: destination.id, output, input });
    return destination;
  }

  disconnect(destinationOrOutput?: NativeAudioNode | NativeAudioParam | number, output?: number, input?: number): void {
    const op: Op = { op: "disconnect", from: this.id };
    let matches: (c: Connection) => boolean;
    if (destinationOrOutput === undefined) {
      matches = () => true;
    } else if (typeof destinationOrOutput === "number") {
      const out = destinationOrOutput;
      if (out < 0 || out >= this.numberOfOutputs) throw new DOMException(`Output ${out} doesn't exist.`, "IndexSizeError");
      op.output = out;
      matches = (c) => c.output === out;
    } else if (destinationOrOutput instanceof NativeAudioParam) {
      const to = destinationOrOutput.owner as NativeAudioNode;
      const param = destinationOrOutput.name;
      Object.assign(op, { to: to.id, param, output });
      matches = (c) => c.to === to && c.param === param && (output === undefined || c.output === output);
    } else {
      const to = destinationOrOutput;
      Object.assign(op, { to: to.id, output, input });
      matches = (c) =>
        c.to === to && !c.param && (output === undefined || c.output === output) && (input === undefined || c.input === input);
    }
    if (destinationOrOutput !== undefined && typeof destinationOrOutput !== "number" && !this.#connections.some(matches)) {
      throw new DOMException("Those nodes aren't connected.", "InvalidAccessError");
    }
    this.#connections = this.#connections.filter((c) => !matches(c));
    send(op);
  }

  get channelCount(): number {
    return this.#channels.count;
  }
  set channelCount(count: number) {
    if (!(Number.isInteger(count) && count >= 1 && count <= 32)) {
      throw new DOMException(`A channel count of ${count} isn't supported.`, "NotSupportedError");
    }
    this.#setChannels({ count });
  }
  get channelCountMode(): ChannelCountMode {
    return this.#channels.mode;
  }
  set channelCountMode(mode: ChannelCountMode) {
    if (mode === "max" || mode === "clamped-max" || mode === "explicit") this.#setChannels({ mode });
  }
  get channelInterpretation(): ChannelInterpretation {
    return this.#channels.interpretation;
  }
  set channelInterpretation(interpretation: ChannelInterpretation) {
    if (interpretation === "speakers" || interpretation === "discrete") this.#setChannels({ interpretation });
  }

  #setChannels(change: Partial<Channels>): void {
    this.#channels = { ...this.#channels, ...change };
    send(this.#channelsOp());
  }

  #channelsOp(): Op {
    const { count, mode, interpretation } = this.#channels;
    return { op: "channels", id: this.id, count, mode, interpretation };
  }

  /** Extra state a subclass replays (a buffer, a periodic wave, a curve). */
  protected replayExtra(): Op[] {
    return [];
  }

  replayCreate(now: number): Op[] {
    return [
      this.#createOp(),
      this.#channelsOp(),
      ...[...this.attrs].map(([key, value]): Op => ({ op: "set", id: this.id, key, value })),
      ...this.replayExtra(),
      ...this.params.flatMap((p) => p.replay(now)),
    ];
  }

  replayConnections(): Op[] {
    return this.#connections.map(
      (c): Op => ({ op: "connect", from: this.id, to: c.to.id, output: c.output, input: c.input, param: c.param }),
    );
  }

  ended(): void {}
}

const mono = { inputs: 0, outputs: 1, count: 2, mode: "max", interpretation: "speakers" } as const;
const effect = { inputs: 1, outputs: 1, count: 2, mode: "max", interpretation: "speakers" } as const;
const stereoEffect = { ...effect, mode: "clamped-max" } as const;

export class NativeDestination extends NativeAudioNode {
  readonly maxChannelCount = 2;
  constructor(context: NodeContext) {
    super(context, null, { inputs: 1, outputs: 0, count: 2, mode: "explicit", interpretation: "speakers" });
  }
}

export class NativeGainNode extends NativeAudioNode {
  readonly gain: NativeAudioParam;
  constructor(context: NodeContext) {
    super(context, "gain", effect);
    this.gain = this.param("gain", 1);
  }
}

/** Oscillators, sample players and constant sources: started once, stopped, then they end. */
export class NativeScheduledSource extends NativeAudioNode {
  override readonly isSource = true;
  #started = false;
  #ended = false;
  onended: ((this: NativeScheduledSource, event: Event) => unknown) | null = null;

  override get started(): boolean {
    return this.#started;
  }

  protected begin(op: Op): void {
    if (this.#started) throw invalidState("start() can only be called once.");
    this.#started = true;
    holdWhilePlaying(this);
    send(op);
  }

  start(when = 0): void {
    this.begin({ op: "start", id: this.id, when: checkTime(when) });
  }

  stop(when = 0): void {
    if (!this.#started) throw invalidState("stop() before start().");
    send({ op: "stop", id: this.id, when: checkTime(when) });
  }

  override ended(): void {
    if (this.#ended) return;
    this.#ended = true;
    release(this);
    const event = new Event("ended");
    this.onended?.call(this, event);
    this.dispatchEvent(event);
  }
}

const WAVES = ["sine", "square", "sawtooth", "triangle"];

export class NativeOscillatorNode extends NativeScheduledSource {
  readonly frequency: NativeAudioParam;
  readonly detune: NativeAudioParam;
  #wave: NativePeriodicWave | null = null;

  constructor(context: NodeContext) {
    super(context, "oscillator", mono);
    const nyquist = context.sampleRate / 2;
    this.frequency = this.param("frequency", 440, -nyquist, nyquist);
    this.detune = this.param("detune", 0);
  }

  get type(): OscillatorType {
    return this.#wave ? "custom" : ((this.attrs.get("type") as OscillatorType | undefined) ?? "sine");
  }
  set type(type: OscillatorType) {
    if (type === "custom") throw invalidState("Use setPeriodicWave() for a custom wave.");
    if (!WAVES.includes(type)) return;
    this.#wave = null;
    this.setAttr("type", type);
  }

  setPeriodicWave(wave: NativePeriodicWave): void {
    this.#wave = wave;
    this.attrs.delete("type");
    send(this.#waveOp(wave));
  }

  #waveOp(wave: NativePeriodicWave): Op {
    return { op: "wave", id: this.id, real: wave.real, imag: wave.imag, normalize: wave.normalize };
  }

  protected override replayExtra(): Op[] {
    return this.#wave ? [this.#waveOp(this.#wave)] : [];
  }
}

export class NativeBufferSourceNode extends NativeScheduledSource {
  readonly playbackRate: NativeAudioParam;
  readonly detune: NativeAudioParam;
  #buffer: NativeAudioBuffer | null = null;

  constructor(context: NodeContext) {
    super(context, "bufferSource", mono);
    this.playbackRate = this.param("playbackRate", 1);
    this.detune = this.param("detune", 0);
  }

  get buffer(): NativeAudioBuffer | null {
    return this.#buffer;
  }
  set buffer(buffer: NativeAudioBuffer | null) {
    if (buffer && this.#buffer) throw invalidState("The buffer can only be set once.");
    this.#buffer = buffer;
    if (buffer) send({ op: "buffer", id: this.id, buffer: buffer.ref() });
  }

  get loop(): boolean {
    return (this.attrs.get("loop") as boolean | undefined) ?? false;
  }
  set loop(on: boolean) {
    this.setAttr("loop", !!on);
  }
  get loopStart(): number {
    return (this.attrs.get("loopStart") as number | undefined) ?? 0;
  }
  set loopStart(seconds: number) {
    this.setAttr("loopStart", seconds);
  }
  get loopEnd(): number {
    return (this.attrs.get("loopEnd") as number | undefined) ?? 0;
  }
  set loopEnd(seconds: number) {
    this.setAttr("loopEnd", seconds);
  }

  override start(when = 0, offset?: number, duration?: number): void {
    if (offset !== undefined) checkTime(offset, "offset");
    if (duration !== undefined) checkTime(duration, "duration");
    this.begin({ op: "start", id: this.id, when: checkTime(when), offset, duration });
  }

  protected override replayExtra(): Op[] {
    return this.#buffer ? [{ op: "buffer", id: this.id, buffer: this.#buffer.ref() }] : [];
  }
}

export class NativeConstantSourceNode extends NativeScheduledSource {
  readonly offset: NativeAudioParam;
  constructor(context: NodeContext) {
    super(context, "constantSource", mono);
    this.offset = this.param("offset", 1);
  }
}

export class NativeDynamicsCompressorNode extends NativeAudioNode {
  readonly threshold: NativeAudioParam;
  readonly knee: NativeAudioParam;
  readonly ratio: NativeAudioParam;
  readonly attack: NativeAudioParam;
  readonly release: NativeAudioParam;
  constructor(context: NodeContext) {
    super(context, "compressor", stereoEffect);
    this.threshold = this.param("threshold", -24, -100, 0);
    this.knee = this.param("knee", 30, 0, 40);
    this.ratio = this.param("ratio", 12, 1, 20);
    this.attack = this.param("attack", 0.003, 0, 1);
    this.release = this.param("release", 0.25, 0, 1);
  }
  /** Not read back from Rust (nothing on the site shows it). */
  get reduction(): number {
    return 0;
  }
}

export class NativeConvolverNode extends NativeAudioNode {
  #buffer: NativeAudioBuffer | null = null;
  constructor(context: NodeContext) {
    super(context, "convolver", stereoEffect);
  }
  get normalize(): boolean {
    return (this.attrs.get("normalize") as boolean | undefined) ?? true;
  }
  set normalize(on: boolean) {
    this.setAttr("normalize", !!on);
  }
  get buffer(): NativeAudioBuffer | null {
    return this.#buffer;
  }
  set buffer(buffer: NativeAudioBuffer | null) {
    this.#buffer = buffer;
    if (buffer) send({ op: "buffer", id: this.id, buffer: buffer.ref() });
  }
  protected override replayExtra(): Op[] {
    return this.#buffer ? [{ op: "buffer", id: this.id, buffer: this.#buffer.ref() }] : [];
  }
}

type AnalyserKind = "floatTime" | "byteTime" | "floatFrequency" | "byteFrequency";

/** Reads are answered from the last reply, and each read asks Rust for a fresh one: a meter
    polled every frame is one frame behind, and the very first read is silence. */
export class NativeAnalyserNode extends NativeAudioNode {
  #latest = new Map<AnalyserKind, ArrayBuffer>();
  #asking = new Set<AnalyserKind>();

  constructor(context: NodeContext) {
    super(context, "analyser", { ...effect, count: 2 });
  }

  get fftSize(): number {
    return (this.attrs.get("fftSize") as number | undefined) ?? 2048;
  }
  set fftSize(size: number) {
    if (!(size >= 32 && size <= 32768 && (size & (size - 1)) === 0)) {
      throw new DOMException(`An FFT size of ${size} isn't a power of two from 32 to 32768.`, "IndexSizeError");
    }
    this.#latest.clear();
    this.setAttr("fftSize", size);
  }
  get frequencyBinCount(): number {
    return this.fftSize / 2;
  }
  get minDecibels(): number {
    return (this.attrs.get("minDecibels") as number | undefined) ?? -100;
  }
  set minDecibels(db: number) {
    this.setAttr("minDecibels", db);
  }
  get maxDecibels(): number {
    return (this.attrs.get("maxDecibels") as number | undefined) ?? -30;
  }
  set maxDecibels(db: number) {
    this.setAttr("maxDecibels", db);
  }
  get smoothingTimeConstant(): number {
    return (this.attrs.get("smoothingTimeConstant") as number | undefined) ?? 0.8;
  }
  set smoothingTimeConstant(value: number) {
    this.setAttr("smoothingTimeConstant", value);
  }

  #read(kind: AnalyserKind, into: Float32Array | Uint8Array): void {
    const latest = this.#latest.get(kind);
    if (latest) {
      const data = into instanceof Float32Array ? new Float32Array(latest) : new Uint8Array(latest);
      into.set(data.subarray(0, into.length));
    } else {
      into.fill(kind === "byteTime" ? 128 : kind === "floatFrequency" ? -Infinity : 0);
    }
    if (this.#asking.has(kind)) return;
    this.#asking.add(kind);
    void readAnalyser(this.id, kind)
      .then((data) => {
        if (data.byteLength) this.#latest.set(kind, data);
      })
      .finally(() => this.#asking.delete(kind));
  }

  getFloatTimeDomainData(array: Float32Array): void {
    this.#read("floatTime", array);
  }
  getByteTimeDomainData(array: Uint8Array): void {
    this.#read("byteTime", array);
  }
  getFloatFrequencyData(array: Float32Array): void {
    this.#read("floatFrequency", array);
  }
  getByteFrequencyData(array: Uint8Array): void {
    this.#read("byteFrequency", array);
  }
}

export class NativeChannelSplitterNode extends NativeAudioNode {
  constructor(context: NodeContext, outputs = 6) {
    super(context, "splitter", { inputs: 1, outputs, arg: outputs, count: outputs, mode: "explicit", interpretation: "discrete" });
  }
}

export class NativeChannelMergerNode extends NativeAudioNode {
  constructor(context: NodeContext, inputs = 6) {
    super(context, "merger", { inputs, outputs: 1, arg: inputs, count: 1, mode: "explicit", interpretation: "speakers" });
  }
}

export class NativeBiquadFilterNode extends NativeAudioNode {
  readonly frequency: NativeAudioParam;
  readonly detune: NativeAudioParam;
  readonly Q: NativeAudioParam;
  readonly gain: NativeAudioParam;
  constructor(context: NodeContext) {
    super(context, "biquad", effect);
    this.frequency = this.param("frequency", 350, 0, context.sampleRate / 2);
    this.detune = this.param("detune", 0);
    this.Q = this.param("Q", 1);
    this.gain = this.param("gain", 0);
  }
  get type(): BiquadFilterType {
    return (this.attrs.get("type") as BiquadFilterType | undefined) ?? "lowpass";
  }
  set type(type: BiquadFilterType) {
    this.setAttr("type", type);
  }
}

export class NativeDelayNode extends NativeAudioNode {
  readonly delayTime: NativeAudioParam;
  constructor(context: NodeContext, maxDelayTime = 1) {
    super(context, "delay", { ...effect, arg: maxDelayTime });
    this.delayTime = this.param("delayTime", 0, 0, maxDelayTime);
  }
}

export class NativeStereoPannerNode extends NativeAudioNode {
  readonly pan: NativeAudioParam;
  constructor(context: NodeContext) {
    super(context, "stereoPanner", stereoEffect);
    this.pan = this.param("pan", 0, -1, 1);
  }
}

export class NativeWaveShaperNode extends NativeAudioNode {
  #curve: Float32Array | null = null;
  constructor(context: NodeContext) {
    super(context, "waveShaper", effect);
  }
  get curve(): Float32Array | null {
    return this.#curve;
  }
  set curve(curve: Float32Array | null) {
    this.#curve = curve ? Float32Array.from(curve) : null;
    send(this.#curveOp());
  }
  #curveOp(): Op {
    return { op: "curve", id: this.id, curve: this.#curve ? Array.from(this.#curve) : null };
  }
  get oversample(): OverSampleType {
    return (this.attrs.get("oversample") as OverSampleType | undefined) ?? "none";
  }
  set oversample(value: OverSampleType) {
    this.setAttr("oversample", value);
  }
  protected override replayExtra(): Op[] {
    return this.#curve ? [this.#curveOp()] : [];
  }
}

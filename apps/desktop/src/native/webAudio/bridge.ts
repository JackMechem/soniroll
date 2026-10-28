import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { anchorClock } from "../engine";

/** The transport under the Web Audio stand-in (`context.ts`, `nodes.ts`): everything the website's
    sound code does to a graph becomes an op, the ops of one tick go to Rust in one call
    (`src-tauri/src/bridge.rs`), and calls reach Rust in the order they were made.

    Lifetimes work the way a browser's do. A playing source is kept alive until Rust says it ended
    (then its `onended` runs); a node keeps the nodes it plays into alive; anything JavaScript lets
    go of is garbage-collected here, and then freed on the Rust side too.

    When Rust opens a new output (another device or buffer size, or the device went away), its
    graph starts empty. Every graph call answers with the output's generation; when that changes,
    the live nodes are sent again (`replay`). Sources that were already playing are cut off, like
    pulling a cable. */

export type Op = { op: string; [key: string]: unknown };
type Batch = { time: number; generation: number; open: boolean };

/** What the bridge needs from a node. */
export interface Tracked {
  readonly id: number;
  /** The output generation Rust created this node in (0 = not sent yet). */
  gen: number;
  readonly isSource: boolean;
  /** For sources: started, so it can only end (not be replayed). */
  readonly started: boolean;
  replayCreate(now: number): Op[];
  replayConnections(): Op[];
  /** For sources: it finished (or was cut off). */
  ended(): void;
}

export interface Uploadable {
  upload(): Promise<void>;
}

// Ids for nodes and buffers alike, from a random start so nothing from before a page reload (an
// ended event in flight) can be mistaken for a new node.
let nextId = 1 + Math.floor(Math.random() * 2 ** 30);
export function newId(): number {
  return nextId++;
}

let generation = 0;
const live = new Map<number, WeakRef<Tracked>>();
const playing = new Map<number, Tracked>();
const nodeFinalizer = new FinalizationRegistry<number>((id) => {
  live.delete(id);
  send({ op: "free", id });
});
const bufferFinalizer = new FinalizationRegistry<number>((id) => send({ op: "freeBuffer", id }));

export function track(node: Tracked): void {
  live.set(node.id, new WeakRef(node));
  nodeFinalizer.register(node, node.id);
}

export function trackBuffer(buffer: object, id: number): void {
  bufferFinalizer.register(buffer, id);
}

export function holdWhilePlaying(node: Tracked): void {
  playing.set(node.id, node);
}

export function release(node: Tracked): void {
  playing.delete(node.id);
}

void listen<number[]>("wa-ended", ({ payload }) => {
  for (const id of payload) playing.get(id)?.ended();
});

// A new page: Rust forgets whatever the last one left behind. Everything else waits for this.
const ready: Promise<void> = invoke<Batch>("wa_init").then(
  (batch) => {
    generation = batch.generation;
    if (batch.open) anchorClock(batch.time);
  },
  (error) => console.error("audio bridge: no native audio", error),
);
let queue: Promise<unknown> = ready;

/** Runs bridge calls one after another, so they reach Rust in the order they were made. */
export function run<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch((error) => console.error("audio bridge:", error));
  return result;
}

let pending: Op[] = [];
let uploads = new Set<Uploadable>();

export function send(op: Op): void {
  if (pending.length === 0) queueMicrotask(flush);
  pending.push(op);
}

/** A buffer Rust doesn't have (or not its latest content): sent before the ops that use it. */
export function needsUpload(buffer: Uploadable): void {
  uploads.add(buffer);
}

async function uploadAll(): Promise<void> {
  const list = [...uploads];
  uploads = new Set();
  for (const buffer of list) await buffer.upload();
}

function flush(): void {
  const ops = pending;
  pending = [];
  const created = ops.filter((op) => op.op === "create").map((op) => op.id as number);
  const toUpload = uploads;
  uploads = new Set();
  void run(async () => {
    for (const buffer of toUpload) await buffer.upload();
    const batch = await invoke<Batch>("wa_ops", { ops });
    for (const id of created) {
      const node = live.get(id)?.deref();
      if (node) node.gen = batch.generation;
    }
    await settle(batch);
  });
}

/** After every call: re-anchor the clock, and replay the graph if the output was reopened. */
async function settle(batch: Batch): Promise<void> {
  if (batch.open) anchorClock(batch.time);
  if (batch.generation === generation) return;
  const reopened = generation !== 0;
  generation = batch.generation;
  if (reopened) await replay(batch.time);
}

async function replay(now: number): Promise<void> {
  const nodes = [...live.values()].map((ref) => ref.deref()).filter((n): n is Tracked => !!n && n.gen > 0);
  const old = (n: Tracked) => n.gen < generation;
  for (const node of nodes) if (node.isSource && node.started && old(node)) node.ended();
  const keep = nodes.filter((n) => !(n.isSource && n.started && old(n)));
  const ops = [
    ...keep.filter(old).flatMap((n) => n.replayCreate(now)),
    ...keep.flatMap((n) => n.replayConnections()),
  ];
  for (const node of keep) node.gen = generation;
  await uploadAll();
  const batch = await invoke<Batch>("wa_ops", { ops });
  if (batch.open) anchorClock(batch.time);
}

/** Opens the output (if it isn't) and waits for its clock: the metronome starts from there. */
export function ensureStarted(): Promise<void> {
  return run(async () => settle(await invoke<Batch>("wa_ops", { ops: [] })));
}

/** The Native audio chip's choice of output and buffer size. Reopens a running output. */
export function setOutput(deviceId: string, bufferFrames: number): Promise<void> {
  return run(async () => settle(await invoke<Batch>("audio_set_output", { deviceId, bufferFrames })));
}

/** An analyser's latest data (`floatTime`, `byteTime`, `floatFrequency`, `byteFrequency`). */
export function readAnalyser(id: number, kind: string): Promise<ArrayBuffer> {
  return run(() => invoke<ArrayBuffer>("wa_analyser", { id, kind }));
}

/** Decodes a file on the Rust side, which keeps the result to play; the reply is the decoded
    channels (16-byte header, then the samples) for `getChannelData`. Not queued behind the
    graph calls: a long file shouldn't hold up the metronome. */
export async function decodeOnRust(id: number, bytes: Uint8Array): Promise<ArrayBuffer> {
  await ready;
  return invoke<ArrayBuffer>("wa_decode", bytes, { headers: { "x-id": String(id) } });
}

export function uploadBuffer(id: number, bytes: Uint8Array, channels: number, length: number, sampleRate: number) {
  return invoke("wa_buffer", bytes, { headers: { "x-buffer": `${id},${channels},${length},${sampleRate}` } });
}

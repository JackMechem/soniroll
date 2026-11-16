/**
 * `setInterval` that keeps ticking when the tab is in the background. Browsers slow a hidden
 * tab's timers to once a second (or less), which starves an audio scheduler: by the time it runs,
 * the clicks it should have queued are already in the past and play silently. A dedicated
 * worker's timers aren't slowed like that, so the ticks come from one shared worker and are
 * passed back here. Falls back to a plain `setInterval` where workers aren't available.
 */

const WORKER = `
const timers = new Map();
onmessage = (e) => {
  const { id, ms } = e.data;
  if (ms === null) {
    clearInterval(timers.get(id));
    timers.delete(id);
  } else {
    timers.set(id, setInterval(() => postMessage(id), ms));
  }
};
`;

let worker: Worker | null | undefined;
let nextId = 1;
const callbacks = new Map<number, () => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = (e: MessageEvent<number>) => callbacks.get(e.data)?.();
  } catch {
    worker = null;
  }
  return worker;
}

/** Calls `fn` every `ms` milliseconds, in the background too. Returns a function that stops it. */
export function setSteadyInterval(fn: () => void, ms: number): () => void {
  const w = typeof window === "undefined" ? null : getWorker();
  if (!w) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
  const id = nextId++;
  callbacks.set(id, fn);
  w.postMessage({ id, ms });
  return () => {
    if (!callbacks.delete(id)) return;
    w.postMessage({ id, ms: null });
  };
}

/** How far ahead an audio scheduler should queue sounds: `visible` while the page is on screen,
    and at least a couple of seconds while it's hidden, in case even the worker's ticks arrive
    late there. */
export function lookahead(visible: number): number {
  return typeof document !== "undefined" && document.hidden ? Math.max(visible, 2) : visible;
}

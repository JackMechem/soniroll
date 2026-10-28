import { send, type Op } from "./bridge";

/** An `AudioParam` whose automation runs in Rust. The same timeline is kept here too, so reading
    `.value` gives what's playing right now (the website reads it to fade a held tone out from
    wherever it is), and so the param can be replayed into a reopened output. */

type Event =
  | { kind: "set" | "linear" | "exp"; time: number; value: number }
  | { kind: "target"; time: number; value: number; tc: number }
  | { kind: "curve"; time: number; values: number[]; duration: number };

type Owner = { readonly id: number; readonly context: { readonly currentTime: number } };

const FLOAT_MAX = 3.4028234663852886e38;
// Long-lived params (a volume that's moved a lot) keep only what still matters.
const COMPACT_AFTER = 32;

/** The timeline's value at `t`, starting from `start` before the first event: the spec's
    automation rules (ramps run from the previous event, targets and curves from the value they
    start at). */
export function valueAt(events: readonly Event[], start: number, t: number): number {
  let value = start;
  let from = 0;
  let active: Event | null = null;
  const current = (x: number): number => {
    if (active?.kind === "target") return active.value + (value - active.value) * Math.exp(-(x - active.time) / active.tc);
    if (active?.kind === "curve") {
      const { values, time, duration } = active;
      if (x >= time + duration) return values[values.length - 1];
      const pos = ((values.length - 1) * (x - time)) / duration;
      const i = Math.floor(pos);
      return values[i] + (values[Math.min(i + 1, values.length - 1)] - values[i]) * (pos - i);
    }
    return value;
  };
  for (const e of events) {
    if (e.kind === "linear" || e.kind === "exp") {
      if (t < e.time) {
        const v0 = current(from);
        const f = e.time > from ? Math.max(0, (t - from) / (e.time - from)) : 1;
        if (e.kind === "linear") return v0 + (e.value - v0) * f;
        // An exponential ramp can't cross or start from zero: it holds instead (the spec's rule).
        return v0 === 0 || v0 * e.value < 0 ? v0 : v0 * Math.pow(e.value / v0, f);
      }
      value = e.value;
      from = e.time;
      active = null;
      continue;
    }
    if (t < e.time) return current(t);
    value = current(e.time);
    from = e.time;
    if (e.kind === "set") {
      value = e.value;
      active = null;
    } else {
      active = e;
    }
  }
  return current(t);
}

function finite(value: number, what = "value"): number {
  if (!Number.isFinite(value)) throw new TypeError(`The provided ${what} is non-finite.`);
  return value;
}

function time(t: number): number {
  finite(t, "time");
  if (t < 0) throw new RangeError(`The time ${t} must be zero or more.`);
  return t;
}

export class NativeAudioParam {
  readonly owner: Owner;
  readonly name: string;
  readonly defaultValue: number;
  readonly minValue: number;
  readonly maxValue: number;
  automationRate: AutomationRate = "a-rate";
  #start: number;
  #events: Event[] = [];

  constructor(owner: Owner, name: string, defaultValue: number, minValue = -FLOAT_MAX, maxValue = FLOAT_MAX) {
    this.owner = owner;
    this.name = name;
    this.defaultValue = defaultValue;
    this.minValue = minValue;
    this.maxValue = maxValue;
    this.#start = defaultValue;
  }

  #now(): number {
    return this.owner.context.currentTime;
  }

  #at(t: number): number {
    return Math.min(this.maxValue, Math.max(this.minValue, valueAt(this.#events, this.#start, t)));
  }

  get value(): number {
    return this.#at(this.#now());
  }

  set value(value: number) {
    finite(value);
    // Like `setValueAtTime(value, currentTime)`, which is what the spec says it is.
    if (this.#events.length === 0) this.#start = value;
    else this.#insert({ kind: "set", time: this.#now(), value });
    this.#send({ fn: "value", value });
  }

  setValueAtTime(value: number, startTime: number): this {
    this.#insert({ kind: "set", time: time(startTime), value: finite(value) });
    return this.#send({ fn: "setValueAtTime", value, time: startTime });
  }

  linearRampToValueAtTime(value: number, endTime: number): this {
    this.#insert({ kind: "linear", time: time(endTime), value: finite(value) });
    return this.#send({ fn: "linearRampToValueAtTime", value, time: endTime });
  }

  exponentialRampToValueAtTime(value: number, endTime: number): this {
    if (finite(value) === 0) throw new RangeError("An exponential ramp can't go to 0.");
    this.#insert({ kind: "exp", time: time(endTime), value });
    return this.#send({ fn: "exponentialRampToValueAtTime", value, time: endTime });
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): this {
    if (finite(timeConstant, "time constant") < 0) throw new RangeError("The time constant must be zero or more.");
    if (timeConstant === 0) return this.setValueAtTime(target, startTime);
    this.#insert({ kind: "target", time: time(startTime), value: finite(target), tc: timeConstant });
    return this.#send({ fn: "setTargetAtTime", value: target, time: startTime, tc: timeConstant });
  }

  setValueCurveAtTime(values: Iterable<number>, startTime: number, duration: number): this {
    const list = Array.from(values, (v) => finite(v));
    if (list.length < 2) throw new DOMException("A value curve needs at least two values.", "InvalidStateError");
    if (!(finite(duration, "duration") > 0)) throw new RangeError("The duration must be more than 0.");
    this.#insert({ kind: "curve", time: time(startTime), values: list, duration });
    return this.#send({ fn: "setValueCurveAtTime", values: list, time: startTime, duration });
  }

  cancelScheduledValues(cancelTime: number): this {
    time(cancelTime);
    this.#events = this.#events.filter((e) => e.time < cancelTime);
    return this.#send({ fn: "cancelScheduledValues", time: cancelTime });
  }

  cancelAndHoldAtTime(cancelTime: number): this {
    const held = this.#at(time(cancelTime));
    const cut = this.#events.find((e) => e.time >= cancelTime);
    this.#events = this.#events.filter((e) => e.time < cancelTime);
    // A ramp that was under way still gets there, just to the held value at the cancel time.
    const kind = cut?.kind === "linear" || cut?.kind === "exp" ? cut.kind : "set";
    this.#events.push({ kind, time: cancelTime, value: held });
    return this.#send({ fn: "cancelAndHoldAtTime", time: cancelTime });
  }

  #insert(event: Event): void {
    // After any events at the same time, before later ones (the spec's order).
    const i = this.#events.findIndex((e) => e.time > event.time);
    if (i < 0) this.#events.push(event);
    else this.#events.splice(i, 0, event);
    if (this.#events.length > COMPACT_AFTER) this.#compact();
  }

  /** Drops events that are over: everything before the last one that has started, which then
      starts from the value the earlier ones left. */
  #compact(): void {
    const now = this.#now();
    let last = -1;
    this.#events.forEach((e, i) => {
      if (e.time <= now) last = i;
    });
    if (last <= 0) return;
    this.#start = valueAt(this.#events.slice(0, last), this.#start, this.#events[last].time);
    this.#events = this.#events.slice(last);
  }

  #send(call: Record<string, unknown>): this {
    send({ op: "param", id: this.owner.id, name: this.name, call });
    return this;
  }

  /** The param in a fresh output: where it is now, plus whatever is still to come. */
  replay(now: number): Op[] {
    const op = (call: Record<string, unknown>): Op => ({ op: "param", id: this.owner.id, name: this.name, call });
    const ops = [op({ fn: "setValueAtTime", value: this.#at(now), time: now })];
    const running = this.#events.filter((e) => e.time <= now).at(-1);
    if (running?.kind === "target") ops.push(op({ fn: "setTargetAtTime", value: running.value, time: now, tc: running.tc }));
    for (const e of this.#events) {
      if (e.time <= now) continue;
      if (e.kind === "set") ops.push(op({ fn: "setValueAtTime", value: e.value, time: e.time }));
      else if (e.kind === "linear") ops.push(op({ fn: "linearRampToValueAtTime", value: e.value, time: e.time }));
      else if (e.kind === "exp") ops.push(op({ fn: "exponentialRampToValueAtTime", value: e.value, time: e.time }));
      else if (e.kind === "target") ops.push(op({ fn: "setTargetAtTime", value: e.value, time: e.time, tc: e.tc }));
      else if (e.kind === "curve") ops.push(op({ fn: "setValueCurveAtTime", values: e.values, time: e.time, duration: e.duration }));
    }
    return ops;
  }
}

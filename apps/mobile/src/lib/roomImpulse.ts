import type { AudioBuffer, AudioContext } from 'react-native-audio-api';

/** A small dark room's impulse response for a convolver — the website's `roomImpulse`
    (`apps/web/lib/uprightBass.ts`): seeded noise, darkened, decaying over 1.3 s after a short gap.
    Written with `copyToChannel`, since writing into `getChannelData`'s array may not reach the
    native buffer. */
export function roomImpulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.3);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  const data = new Float32Array(length);
  let lp = 0;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    lp += (rand() - lp) * 0.18; // darken
    data[i] = t < 0.012 ? 0 : lp * Math.exp(-t * 4.2);
  }
  ir.copyToChannel(data, 0);
  ir.copyToChannel(data, 1);
  return ir;
}

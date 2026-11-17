import { makeRng, TOUCH_VELOCITY, type BassNote, type BassTouch, type Harmony, type PerformedBeat } from "./bassLine";
import { drumChorus, type DrumConfig, type DrumHit } from "./drums";
import { generateGroove, type DrumStyle, type GrooveBar, type GrooveHit, type GrooveOptions } from "./drumStyles";

// Rhythm Section: bass, drums and chords together (it replaced Bass Genius and the Drum
// Generator). The drum style decides how the whole band plays: the swing styles get Bass Genius's
// walking bass (`bassLine.ts` and the modelled players) and its jazz drummer (`drums.ts`); every
// other style gets the Drum Generator's groove (`drumStyles.ts`) and a simple bass part of its own
// that follows the chart's chords — written here. Pure (no audio): the web engine
// (`apps/web/lib/rhythmSectionEngine.ts`) schedules all of it on one clock.

/** How the bass plays for a style. "walking" is the jazz walking line (players, feel, swing). */
export type BassFamily =
  | "walking"
  | "boogie"
  | "bossa"
  | "samba"
  | "baiao"
  | "tumbao"
  | "half"
  | "march"
  | "merengue"
  | "cumbia"
  | "threeThreeTwo"
  | "tango"
  | "sixEight";

const FAMILY_BY_STYLE: Record<string, BassFamily> = {
  shuffle: "boogie",
  "bossa-nova": "bossa",
  bachata: "bossa",
  ijexa: "bossa",
  samba: "samba",
  "partido-alto": "samba",
  "samba-reggae": "samba",
  baiao: "baiao",
  xote: "baiao",
  mambo: "tumbao",
  "son-montuno": "tumbao",
  songo: "tumbao",
  guaguanco: "tumbao",
  "conga-comparsa": "tumbao",
  mozambique: "tumbao",
  "cha-cha": "half",
  danzon: "half",
  bolero: "half",
  frevo: "march",
  plena: "march",
  merengue: "merengue",
  cumbia: "cumbia",
  calypso: "threeThreeTwo",
  soca: "threeThreeTwo",
  milonga: "threeThreeTwo",
  tango: "tango",
  bembe: "sixEight",
  "afro-68": "sixEight",
};

/** The bass part a drum style gets. */
export function bassFamilyOf(style: DrumStyle): BassFamily {
  if (style.swing) return "walking";
  return FAMILY_BY_STYLE[style.id] ?? (style.meter.bottom === 8 ? "sixEight" : "half");
}

/** One line on what the bass plays, for the page. */
export const BASS_FAMILY_ABOUT: Record<BassFamily, string> = {
  walking: "A walking line",
  boogie: "A shuffle line: root, 3rd, 5th, 6th, 7th and back down",
  bossa: "Root and fifth, pushing into each new chord on the “and” of 4",
  samba: "In 2: the root, then the fifth below on the second beat",
  baiao: "The zabumba’s figure: root, fifth, octave",
  tumbao: "The tumbao: the “and” of 2 and beat 4, each a push into the next chord",
  half: "Root on 1, fifth on 3",
  march: "Root and fifth on every beat",
  merengue: "Root and fifth on every beat, pushing into each new chord",
  cumbia: "Root on 1, fifth on 3 and 4",
  threeThreeTwo: "Root, fifth, octave in a 3-3-2",
  tango: "Marcato: short notes on every beat, root and fifth",
  sixEight: "Root and fifth on the dotted quarters, pushing into each new chord",
};

type Deg = "R" | "3" | "5" | "5-" | "6" | "7" | "8";
/** One note of a bar's pattern: where (beats from the bar line), how long, which chord degree.
    `from`: the beat (from the bar line; 4 = the next bar's downbeat) whose chord it plays — an
    off-beat note takes the next beat's chord, so it pushes into a change. `ant`: only played when
    it pushes into a new chord. */
type Slot = { at: number; len: number; deg: Deg; from?: number; ant?: boolean };

/** The patterns, for a bar of four beats (12/8 counts four dotted quarters). */
const PATTERNS: Record<Exclude<BassFamily, "walking" | "boogie">, Slot[]> = {
  bossa: [
    { at: 0, len: 1.5, deg: "R" },
    { at: 1.5, len: 0.5, deg: "5" },
    { at: 2, len: 1.5, deg: "5" },
    { at: 3.5, len: 0.5, deg: "R", ant: true },
  ],
  samba: [
    { at: 0, len: 0.75, deg: "R" },
    { at: 0.75, len: 0.25, deg: "5-" },
    { at: 1, len: 1, deg: "5-" },
    { at: 2, len: 0.75, deg: "R" },
    { at: 2.75, len: 0.25, deg: "5-" },
    { at: 3, len: 1, deg: "5-" },
  ],
  baiao: [
    { at: 0, len: 0.75, deg: "R" },
    { at: 0.75, len: 0.25, deg: "5" },
    { at: 1, len: 1, deg: "8" },
    { at: 2, len: 0.75, deg: "R" },
    { at: 2.75, len: 0.25, deg: "5" },
    { at: 3, len: 1, deg: "8" },
  ],
  tumbao: [
    { at: 1.5, len: 1.5, deg: "5" },
    { at: 3, len: 2.5, deg: "R", from: 4 },
  ],
  half: [
    { at: 0, len: 2, deg: "R" },
    { at: 2, len: 2, deg: "5" },
  ],
  march: [
    { at: 0, len: 1, deg: "R" },
    { at: 1, len: 1, deg: "5" },
    { at: 2, len: 1, deg: "R" },
    { at: 3, len: 1, deg: "5" },
  ],
  merengue: [
    { at: 0, len: 1, deg: "R" },
    { at: 1, len: 1, deg: "5" },
    { at: 2, len: 1, deg: "R" },
    { at: 3, len: 0.5, deg: "5" },
    { at: 3.5, len: 0.5, deg: "R", ant: true },
  ],
  cumbia: [
    { at: 0, len: 1, deg: "R" },
    { at: 2, len: 1, deg: "5" },
    { at: 3, len: 1, deg: "5" },
  ],
  threeThreeTwo: [
    { at: 0, len: 1.5, deg: "R" },
    { at: 1.5, len: 1.5, deg: "5" },
    { at: 3, len: 1, deg: "8" },
  ],
  tango: [
    { at: 0, len: 0.5, deg: "R" },
    { at: 1, len: 0.5, deg: "5" },
    { at: 2, len: 0.5, deg: "R" },
    { at: 3, len: 0.5, deg: "5" },
  ],
  sixEight: [
    { at: 0, len: 1, deg: "R" },
    { at: 1, len: 1, deg: "5" },
    { at: 2, len: 1, deg: "R" },
    { at: 3, len: 2 / 3, deg: "5" },
    { at: 3 + 2 / 3, len: 1 / 3, deg: "R", ant: true },
  ],
};

/** The shuffle line, beat by beat from where a chord starts. */
const BOOGIE: Deg[] = ["R", "3", "5", "6", "7", "6", "5", "3"];

/** A bar's pattern. Bars that aren't four beats long (a 3/4 bar, a 2/4 bar) get the root on 1
    and the fifth halfway. */
function slotsFor(family: BassFamily, len: number): Slot[] {
  if (family === "boogie") return Array.from({ length: len }, (_, k) => ({ at: k, len: 1, deg: "R" as Deg }));
  if (family !== "walking" && len === 4) return PATTERNS[family];
  if (len <= 1) return [{ at: 0, len, deg: "R" }];
  const half = Math.ceil(len / 2);
  return [
    { at: 0, len: half, deg: "R" },
    { at: half, len: len - half, deg: "5" },
  ];
}

/** Lowest and highest notes of the style parts (E1 to G3, as the walking line). */
const LOW = 28;
const HIGH = 55;
/** Roots sit between E1 and G2. */
const ROOT_HIGH = 43;

/** What a style part carries from one chorus into the next. */
export type StyleBassState = {
  /** The last root played (keeps the register steady). */
  lastRoot: number | null;
  /** The chord the last note belonged to (a new chord starts on its root). */
  lastSymbol: string | null;
};
export const INITIAL_STYLE_BASS: StyleBassState = { lastRoot: null, lastSymbol: null };

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** The root (or slash bass) near the last one, kept between E1 and G2. */
function placeRoot(pc: number, last: number | null): number {
  const centre = last ?? 34;
  let best = LOW;
  let bestCost = Infinity;
  for (let m = LOW; m <= ROOT_HIGH; m++) {
    if (mod12(m) !== pc) continue;
    const cost = Math.abs(m - centre) + 0.3 * Math.abs(m - 35);
    if (cost < bestCost) {
      bestCost = cost;
      best = m;
    }
  }
  return best;
}

function pcOfDegree(h: Harmony, deg: Deg): number {
  switch (deg) {
    case "R":
    case "8":
      return h.bass;
    case "3":
      return h.tones[1] ?? mod12(h.root + 4);
    case "5":
    case "5-":
      return h.tones[2] ?? mod12(h.root + 7);
    case "6":
      return mod12(h.root + 9);
    case "7":
      return h.tones[3] ?? mod12(h.root + 10);
  }
}

/** A degree's note, placed from the chord's root note: above it (the octave for "8"), or below
    for "5-"; kept in range. */
function placeDegree(root: number, h: Harmony, deg: Deg): number {
  if (deg === "R") return root;
  if (deg === "8") return root + 12 <= HIGH ? root + 12 : root;
  const pc = pcOfDegree(h, deg);
  if (deg === "5-") {
    const below = root - (mod12(root - pc) || 12);
    return below >= LOW ? below : below + 12;
  }
  const above = root + mod12(pc - root);
  return above <= HIGH ? above : above - 12;
}

/** Each bar of a chorus: where it starts (index into the beats) and how many beats it has. */
export function barsOf(beats: PerformedBeat[]): { b: number; len: number }[] {
  const bars: { b: number; len: number }[] = [];
  beats.forEach((bt, i) => {
    if (bt.beatInBar === 0 || i === 0) bars.push({ b: i, len: bt.beatsInBar });
  });
  return bars;
}

/**
 * One chorus of a style's bass part (any family but "walking"), over `beats` as performed,
 * starting at performance beat `startBeat`. Each bar plays the style's pattern; a new chord always
 * starts on its root; an off-beat note before a chord change takes the new chord (the push, tied
 * over into it); N.C. rests. The last bar of the last chorus is a held low root.
 */
export function styleBassChorus(
  family: BassFamily,
  beats: PerformedBeat[],
  startBeat: number,
  opts: {
    touch: BassTouch;
    isLast: boolean;
    seed: number;
    /** The chord on the first beat after this chorus (the next time through), for a push over the
        end of the form; null at the very end. */
    nextHarmony: Harmony | null;
    state: StyleBassState;
  },
): { notes: BassNote[]; state: StyleBassState } {
  const rng = makeRng(opts.seed);
  const base = TOUCH_VELOCITY[opts.touch];
  const vel = (accent: number) => Math.max(0.05, Math.min(1, base + accent + (rng.next() - 0.5) * 0.08));
  const harmonyAt = (i: number): Harmony | null => (i < beats.length ? (beats[Math.floor(i)]?.harmony ?? null) : opts.nextHarmony);
  const bars = barsOf(beats);
  const notes: BassNote[] = [];
  let { lastRoot, lastSymbol } = opts.state;
  // A slot swallowed by a push tied over into it (chorus beat index).
  let skipAt: number | null = null;
  // The shuffle line counts beats from where each chord starts.
  let boogieStep = 0;

  bars.forEach((bar, bi) => {
    const h0 = beats[bar.b]?.harmony ?? null;
    if (opts.isLast && bi === bars.length - 1) {
      // The end: one long low root (or let a push into this chord ring on).
      if (!h0) return;
      const prev = notes[notes.length - 1];
      const at = startBeat + bar.b;
      if (prev && lastSymbol === h0.symbol && prev.beat + prev.length >= at - 1e-6) {
        prev.length = at + Math.max(bar.len, 2) - prev.beat;
        return;
      }
      const low = placeRoot(h0.bass, LOW);
      notes.push({ beat: at, length: Math.max(bar.len, 2), midi: low, velocity: vel(0.04) });
      lastRoot = low;
      lastSymbol = h0.symbol;
      return;
    }

    const slots = slotsFor(family, bar.len);
    // Nothing on the downbeat of the very first bar (a tumbao): start with the root there.
    if (notes.length === 0 && lastSymbol === null && slots[0] && slots[0].at > 0 && h0) {
      lastRoot = placeRoot(h0.bass, lastRoot);
      lastSymbol = h0.symbol;
      notes.push({ beat: startBeat + bar.b, length: slots[0].at, midi: lastRoot, velocity: vel(0.06) });
    }
    slots.forEach((s) => {
      const at = bar.b + s.at;
      if (skipAt !== null && Math.abs(skipAt - at) < 1e-6) {
        skipAt = null;
        return;
      }
      const onBeat = Math.abs(s.at - Math.round(s.at)) < 1e-6;
      const fromIdx = bar.b + (s.from ?? (onBeat ? s.at : Math.ceil(s.at)));
      const now = harmonyAt(Math.floor(at + 1e-6));
      const h = harmonyAt(fromIdx);
      if (!h) {
        lastSymbol = null;
        return;
      }
      const pushes = fromIdx > at + 1e-6 && (!now || now.symbol !== h.symbol);
      if (s.ant && !pushes) return;
      const fresh = pushes || lastSymbol !== h.symbol;
      if (fresh) boogieStep = 0;
      let deg: Deg = fresh ? "R" : s.deg;
      if (family === "boogie") deg = fresh ? "R" : BOOGIE[boogieStep % BOOGIE.length];
      boogieStep++;
      if (deg === "R" || lastRoot === null || lastSymbol !== h.symbol) lastRoot = placeRoot(h.bass, lastRoot);
      const midi = placeDegree(lastRoot, h, deg);
      let length = s.len;
      // A push ties over into the note it anticipates (that note isn't struck again).
      if (pushes) {
        const inBar = fromIdx - bar.b;
        const next =
          inBar < bar.len - 1e-6
            ? slots.find((o) => Math.abs(o.at - inBar) < 1e-6)
            : bars[bi + 1]
              ? slotsFor(family, bars[bi + 1].len).find((o) => Math.abs(o.at) < 1e-6)
              : undefined;
        if (next) {
          length = fromIdx - at + next.len;
          skipAt = fromIdx;
        }
      }
      const accent = (s.at === 0 ? 0.06 : 0) + (pushes ? 0.04 : 0) + (s.len <= 0.34 ? -0.12 : 0) + (family === "tango" && s.at % 2 === 0 ? 0.08 : 0);
      notes.push({ beat: startBeat + at, length, midi, velocity: vel(accent) });
      lastSymbol = h.symbol;
    });
  });
  return { notes, state: { lastRoot, lastSymbol } };
}

/** A seed for one chorus of one part, from the performance's seed (so a preview and Play agree). */
export function chorusSeed(seed: number, chorus: number, salt: number): number {
  return (Math.imul((seed ^ salt) >>> 0, 0x85ebca6b) ^ Math.imul(chorus + 1, 0x9e3779b1)) >>> 0;
}

/** Bars to play with no chart (drums only): `count` bars of the style's meter, no harmony. `bar`
    is the performance bar. */
export function grooveBeats(style: DrumStyle, startBar: number, count: number, chorus: number): PerformedBeat[] {
  const out: PerformedBeat[] = [];
  for (let b = 0; b < count; b++)
    for (let k = 0; k < style.beats; k++) out.push({ bar: startBar + b, beatInBar: k, beatsInBar: style.beats, harmony: null, chorus });
  return out;
}

/** The drums for one chorus: `time` (just time) and `comp` (the swing drummer comping; the same
    as `time` for the other styles), as hits in performance beats, and as notation bars (`bar` =
    performance bar, steps on the style's grid). */
export type ChorusDrums = { time: DrumHit[]; comp: DrumHit[]; bars: { time: GrooveBar[]; comp: GrooveBar[] } };

/**
 * The drums over one chorus of `beats` (a chart's, or `grooveBeats`), starting at performance
 * beat `startBeat` and performance bar `startBar`. Swing styles: Bass Genius's drummer over the
 * real beats (any meter). Other styles: the groove, one bar of it per bar played (a shorter bar
 * plays the start of it; a longer one repeats it), so its clave, variations and fills count from
 * the first bar of the performance. The last bar of the last chorus is a crash and kick.
 */
export function chorusDrums(
  style: DrumStyle,
  beats: PerformedBeat[],
  startBeat: number,
  startBar: number,
  seed: number,
  opts: { chorus: number; isLast: boolean; sectionBars?: Set<number>; config: DrumConfig; groove: GrooveOptions },
): ChorusDrums {
  const bars = barsOf(beats);
  if (style.swing) {
    const config = { ...opts.config, ...(style.swing.config ?? {}) };
    const write = (comping: boolean) =>
      drumChorus(beats, startBeat, "sticks", seed, { chorus: opts.chorus, isLast: opts.isLast, comping, sectionBars: opts.sectionBars, config });
    const time = write(false);
    const comp = write(true);
    const toBars = (hits: DrumHit[]): GrooveBar[] => {
      const out: GrooveBar[] = bars.map((_, i) => ({ bar: startBar + i, hits: [], fill: false }));
      let bi = 0;
      for (const h of hits) {
        const rel = h.beat - startBeat;
        while (bi + 1 < bars.length && rel >= bars[bi + 1].b - 1e-6) bi++;
        while (bi > 0 && rel < bars[bi].b - 1e-6) bi--;
        const step = Math.round((rel - bars[bi].b) * style.stepsPerBeat) + (h.skip ? 1 : 0);
        out[bi].hits.push({ ...h, bar: startBar + bi, step });
      }
      return out;
    };
    return { time, comp, bars: { time: toBars(time), comp: toBars(comp) } };
  }

  const groove = generateGroove(style, startBar, bars.length, seed, opts.groove);
  const hits: DrumHit[] = [];
  const notation: GrooveBar[] = [];
  bars.forEach((bar, i) => {
    const g = groove[i];
    const at = startBeat + bar.b;
    const barHits: GrooveHit[] = [];
    if (opts.isLast && i === bars.length - 1) {
      barHits.push({ beat: at, voice: "crash", velocity: 0.7, bar: startBar + i, step: 0 }, { beat: at, voice: "kick", velocity: 0.7, bar: startBar + i, step: 0 });
    } else {
      const offset = g.bar * style.beats;
      for (let rep = 0; rep * style.beats < bar.len; rep++)
        for (const h of g.hits) {
          const rel = h.beat - offset + rep * style.beats;
          if (rel >= bar.len - 1e-6) continue;
          barHits.push({ ...h, beat: at + rel, bar: startBar + i, step: h.step + rep * style.beats * style.stepsPerBeat });
        }
    }
    hits.push(...barHits);
    notation.push({ bar: startBar + i, hits: barHits.filter((h) => h.step < style.beats * style.stepsPerBeat), fill: g.fill });
  });
  hits.sort((a, b) => a.beat - b.beat);
  return { time: hits, comp: hits, bars: { time: notation, comp: notation } };
}

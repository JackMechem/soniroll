// Syncopation: random reading exercises for the snare drum over a steady part in the feet (or
// the hi-hat), in 4/4. An exercise is 16 bars in four 4-bar lines. Each beat of the snare part is
// one figure picked from the rhythm families switched on (quarters, eighths, sixteenths, eighth-
// note triplets); quarter-note figures can also span two beats (half notes and half rests).
//
// Time is counted in ticks, 12 to a beat, so straight sixteenths (3) and triplet eighths (4) both
// land on whole numbers.

export const TICKS_PER_BEAT = 12;
export const BEATS_PER_BAR = 4;
export const BAR_TICKS = TICKS_PER_BEAT * BEATS_PER_BAR;
export const EXERCISE_BARS = 16;
export const PHRASE_BARS = 4;

export type RhythmFamily = "quarter" | "eighth" | "sixteenth" | "triplet";

export const RHYTHM_FAMILIES: { id: RhythmFamily; label: string; short: string }[] = [
  { id: "quarter", label: "Quarter notes", short: "Quarters" },
  { id: "eighth", label: "Eighth notes", short: "8ths" },
  { id: "sixteenth", label: "Sixteenth notes", short: "16ths" },
  { id: "triplet", label: "Eighth-note triplets", short: "Triplets" },
];

/** One note or rest of a figure: its length in ticks. */
export type FigureNote = { ticks: number; rest?: boolean };

export type Figure = {
  id: string;
  family: RhythmFamily;
  /** 1 beat, or 2 for half notes / half rests (which start on beat 1 or 3). */
  beats: 1 | 2;
  notes: FigureNote[];
  /** Relative chance within its family. */
  weight: number;
};

const n = (ticks: number): FigureNote => ({ ticks });
const r = (ticks: number): FigureNote => ({ ticks, rest: true });

export const FIGURES: Figure[] = [
  // Quarters (and halves)
  { id: "q", family: "quarter", beats: 1, notes: [n(12)], weight: 4 },
  { id: "qr", family: "quarter", beats: 1, notes: [r(12)], weight: 2 },
  { id: "h", family: "quarter", beats: 2, notes: [n(24)], weight: 0.6 },
  { id: "hr", family: "quarter", beats: 2, notes: [r(24)], weight: 0.6 },
  // Eighths
  { id: "8-8", family: "eighth", beats: 1, notes: [n(6), n(6)], weight: 3 },
  { id: "8r-8", family: "eighth", beats: 1, notes: [r(6), n(6)], weight: 2.5 },
  { id: "8-8r", family: "eighth", beats: 1, notes: [n(6), r(6)], weight: 0.8 },
  // Sixteenths
  { id: "16x4", family: "sixteenth", beats: 1, notes: [n(3), n(3), n(3), n(3)], weight: 2 },
  { id: "8-16-16", family: "sixteenth", beats: 1, notes: [n(6), n(3), n(3)], weight: 2 },
  { id: "16-16-8", family: "sixteenth", beats: 1, notes: [n(3), n(3), n(6)], weight: 2 },
  { id: "16-8-16", family: "sixteenth", beats: 1, notes: [n(3), n(6), n(3)], weight: 1.5 },
  { id: "8d-16", family: "sixteenth", beats: 1, notes: [n(9), n(3)], weight: 2 },
  { id: "16-8d", family: "sixteenth", beats: 1, notes: [n(3), n(9)], weight: 1 },
  { id: "16r-16x3", family: "sixteenth", beats: 1, notes: [r(3), n(3), n(3), n(3)], weight: 1.2 },
  { id: "8r-16-16", family: "sixteenth", beats: 1, notes: [r(6), n(3), n(3)], weight: 1.2 },
  { id: "16r-8-16", family: "sixteenth", beats: 1, notes: [r(3), n(6), n(3)], weight: 1 },
  { id: "16r-8d", family: "sixteenth", beats: 1, notes: [r(3), n(9)], weight: 0.8 },
  { id: "8dr-16", family: "sixteenth", beats: 1, notes: [r(9), n(3)], weight: 0.8 },
  // Triplets
  { id: "t3", family: "triplet", beats: 1, notes: [n(4), n(4), n(4)], weight: 3 },
  { id: "tq-t8", family: "triplet", beats: 1, notes: [n(8), n(4)], weight: 2 },
  { id: "t8-tq", family: "triplet", beats: 1, notes: [n(4), n(8)], weight: 1.2 },
  { id: "tr-t8-t8", family: "triplet", beats: 1, notes: [r(4), n(4), n(4)], weight: 1.5 },
  { id: "t8-tr-t8", family: "triplet", beats: 1, notes: [n(4), r(4), n(4)], weight: 1.5 },
  { id: "tqr-t8", family: "triplet", beats: 1, notes: [r(8), n(4)], weight: 1 },
];

export const figureById = (id: string) => FIGURES.find((f) => f.id === id);
const hasRest = (f: Figure) => f.notes.some((x) => x.rest);
const isTriplet = (f: Figure) => f.family === "triplet";

/** What the feet (or the hi-hat) keep going underneath. */
export type Ostinato = "kick" | "kickUnison" | "pedal24" | "pedal" | "kickPedal" | "hhEighths" | "hhQuarters" | "swing" | "none";

export const OSTINATOS: { id: Ostinato; label: string; feet?: boolean }[] = [
  { id: "kick", feet: true, label: "Bass drum on every beat" },
  { id: "kickUnison", feet: true, label: "Bass drum with the snare" },
  { id: "pedal24", feet: true, label: "Hi-hat foot on 2 and 4" },
  { id: "pedal", feet: true, label: "Hi-hat foot on every beat" },
  { id: "kickPedal", feet: true, label: "Bass drum on every beat, hi-hat foot on 2 and 4" },
  { id: "hhEighths", label: "Hi-hat on eighths" },
  { id: "hhQuarters", label: "Hi-hat on every beat" },
  { id: "swing", label: "Swing: ride, hi-hat foot on 2 and 4" },
  { id: "none", label: "Nothing" },
];

/** How each 4-bar line is built. */
export type PhraseMode = "new" | "two" | "one";

export const PHRASE_MODES: { id: PhraseMode; label: string }[] = [
  { id: "new", label: "A new bar every bar" },
  { id: "two", label: "Each line repeats a 2-bar pattern" },
  { id: "one", label: "Each line repeats one bar" },
];

/** A cymbal played with the hand — the hi-hat, or the swing ride — written on top, with the
    pattern below it. */
export const handHiHat = (o: Ostinato) => o === "hhEighths" || o === "hhQuarters" || o === "swing";

/** Swing: the jazz ride pattern (every beat, and the skip note after 2 and 4) with the hi-hat
    foot on 2 and 4, and everything played swung — an "and" lands on the last triplet of the beat
    (written as plain eighths, as swing usually is). */
export const swingFeel = (o: Ostinato) => o === "swing";

/** Where a written tick is played: swung, an eighth's "and" (6) moves to the last triplet (8). */
export function playedTick(tick: number, o: Ostinato): number {
  return swingFeel(o) && tick % TICKS_PER_BEAT === 6 ? tick + 2 : tick;
}

/** What's underneath with the pattern split between snare and bass drum: the feet's parts can't
    be (the bass drum is busy), so they fall back to the hi-hat on eighths. */
export function effectiveOstinato(o: Ostinato, split: boolean): Ostinato {
  return split && OSTINATOS.find((x) => x.id === o)?.feet ? "hhEighths" : o;
}

export type SyncopationOptions = {
  families: RhythmFamily[];
  rests: boolean;
  phrase: PhraseMode;
  /** Each note of the pattern goes to the snare or the bass drum at random (never both). */
  split?: boolean;
};

/** One bar of the pattern: the figures, beat by beat (a 2-beat figure covers its second beat), and
    with `split`, which notes (counting notes only, not rests) are on the bass drum. */
export type SyncopationBar = { figures: Figure[]; kicks?: boolean[] };

export type PatternVoice = "snare" | "kick";

export type SyncopationHit = { tick: number; voice: "snare" | "kick" | "pedal" | "hhClosed" | "ride"; accent?: boolean; pattern?: boolean };

// A small seeded random generator (mulberry32), so a seed always writes the same exercise.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(items: T[], random: () => number): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let x = random() * total;
  for (const it of items) {
    x -= it.weight;
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

/** The families in play (all four if none are switched on). */
export function activeFamilies(families: RhythmFamily[]): RhythmFamily[] {
  const set = RHYTHM_FAMILIES.map((f) => f.id).filter((id) => families.includes(id));
  return set.length ? set : RHYTHM_FAMILIES.map((f) => f.id);
}

function pool(opts: SyncopationOptions): Figure[] {
  const fams = activeFamilies(opts.families);
  return FIGURES.filter((f) => fams.includes(f.family) && (opts.rests || !hasRest(f)));
}

const noteCount = (bar: SyncopationBar) => bar.figures.reduce((s, f) => s + f.notes.filter((x) => !x.rest).length, 0);
const barKey = (bar: SyncopationBar) => bar.figures.map((f) => f.id).join(" ");

function randomBar(opts: SyncopationOptions, random: () => number): SyncopationBar {
  const figs = pool(opts);
  const fams = [...new Set(figs.map((f) => f.family))];
  // Pick a family first (each equally likely), then a figure in it, so a family with many figures
  // doesn't crowd out the others.
  const pickFigure = (allowHalf: boolean) => {
    const fam = fams[Math.floor(random() * fams.length)];
    const choices = figs.filter((f) => f.family === fam && (allowHalf || f.beats === 1));
    return choices.length ? pickWeighted(choices, random) : null;
  };
  for (let attempt = 0; attempt < 40; attempt++) {
    const figures: Figure[] = [];
    let beat = 0;
    while (beat < BEATS_PER_BAR) {
      const f = pickFigure(beat % 2 === 0) ?? figs.find((x) => x.beats === 1)!;
      figures.push(f);
      beat += f.beats;
    }
    const bar = { figures };
    // A bar needs something to play, and when more than one family's in play it shouldn't be
    // only quarters (that's no reading practice).
    const notes = noteCount(bar);
    if (notes < 2) continue;
    if (fams.length > 1 && figures.every((f) => f.family === "quarter") && attempt < 30) continue;
    // Not the same rest twice in a row (two quarter rests are a half rest, written that way).
    if (figures.some((f, i) => i > 0 && f.id === "qr" && figures[i - 1].id === "qr" && attempt < 30)) continue;
    return bar;
  }
  return { figures: Array.from({ length: BEATS_PER_BAR }, () => figureById("q")!) };
}

/** A 16-bar exercise (four 4-bar lines). */
export function generateExercise(seed: number, opts: SyncopationOptions): SyncopationBar[] {
  const random = rng(seed);
  const bars: SyncopationBar[] = [];
  let last = "";
  const fresh = () => {
    let bar = randomBar(opts, random);
    for (let i = 0; i < 6 && barKey(bar) === last; i++) bar = randomBar(opts, random);
    last = barKey(bar);
    return bar;
  };
  for (let line = 0; line < EXERCISE_BARS / PHRASE_BARS; line++) {
    if (opts.phrase === "one") {
      const bar = fresh();
      for (let i = 0; i < PHRASE_BARS; i++) bars.push(bar);
    } else if (opts.phrase === "two") {
      const a = fresh();
      const b = fresh();
      bars.push(a, b, a, b);
    } else {
      for (let i = 0; i < PHRASE_BARS; i++) bars.push(fresh());
    }
  }
  // Reading exercises end with a breath: the last bar's fourth beat is a rest.
  if (opts.phrase === "new" && opts.rests) {
    const lastBar = bars[bars.length - 1];
    const figures = [...lastBar.figures];
    let beat = 0;
    for (let i = 0; i < figures.length; i++) {
      if (beat === 3) figures[i] = figureById("qr")!;
      beat += figures[i].beats;
    }
    if (figures.reduce((s, f) => s + f.beats, 0) === BEATS_PER_BAR && noteCount({ figures }) > 0) bars[bars.length - 1] = { figures };
  }
  if (!opts.split) return bars;
  // Snare or bass drum for each note (a repeated bar keeps its own choice): either, but never
  // more than three in a row on one, and both in a bar that has at least two notes.
  const voiced = new Map<SyncopationBar, SyncopationBar>();
  return bars.map((bar) => {
    let v = voiced.get(bar);
    if (!v) {
      const count = noteCount(bar);
      let kicks: boolean[] = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        kicks = [];
        for (let i = 0; i < count; i++) {
          const run = i >= 3 && kicks[i - 1] === kicks[i - 2] && kicks[i - 2] === kicks[i - 3];
          kicks.push(run ? !kicks[i - 1] : random() < 0.5);
        }
        if (count < 2 || (kicks.includes(true) && kicks.includes(false))) break;
      }
      v = { ...bar, kicks };
      voiced.set(bar, v);
    }
    return v;
  });
}

/** The notes of one bar: each with its start tick in the bar and length (rests included). */
export type PatternNote = { tick: number; ticks: number; rest: boolean; triplet: boolean; beat: number; voice: PatternVoice };

export function barNotes(bar: SyncopationBar): PatternNote[] {
  const out: PatternNote[] = [];
  let tick = 0;
  let beat = 0;
  let played = 0;
  for (const f of bar.figures) {
    for (const x of f.notes) {
      const voice: PatternVoice = !x.rest && bar.kicks?.[played++] ? "kick" : "snare";
      out.push({ tick, ticks: x.ticks, rest: !!x.rest, triplet: isTriplet(f), beat, voice });
      tick += x.ticks;
    }
    beat += f.beats;
  }
  return out;
}

/** The hand hi-hat's strokes in a bar: on the beats, plus the "and" with eighths — on a triplet
    beat, the last triplet instead (so it lines up with the pattern). */
export function hiHatTicks(bar: SyncopationBar, ostinato: Ostinato): number[] {
  if (!handHiHat(ostinato)) return [];
  const triplet = new Set(barNotes(bar).filter((x) => x.triplet).map((x) => Math.floor(x.tick / TICKS_PER_BEAT)));
  const out: number[] = [];
  for (let b = 0; b < BEATS_PER_BAR; b++) {
    out.push(b * TICKS_PER_BEAT);
    if (ostinato === "hhEighths") out.push(b * TICKS_PER_BEAT + (triplet.has(b) ? 8 : 6));
    // The ride's skip note, on the "and" of 2 and 4 (played swung; see `playedTick`).
    if (ostinato === "swing" && b % 2 === 1) out.push(b * TICKS_PER_BEAT + (triplet.has(b) ? 8 : 6));
  }
  return out;
}

/** Every hit of a bar, the pattern and what's underneath, in ticks from the bar's start. */
export function barHits(bar: SyncopationBar, ostinato: Ostinato): SyncopationHit[] {
  const hits: SyncopationHit[] = [];
  const snare = barNotes(bar).filter((x) => !x.rest);
  for (const x of snare) hits.push({ tick: x.tick, voice: x.voice, pattern: true });
  const cymbal = ostinato === "swing" ? "ride" : "hhClosed";
  // Swing's ride leans on 2 and 4; the hi-hat on every beat.
  for (const t of hiHatTicks(bar, ostinato))
    hits.push({ tick: t, voice: cymbal, accent: ostinato === "swing" ? t % TICKS_PER_BEAT === 0 && Math.floor(t / TICKS_PER_BEAT) % 2 === 1 : t % TICKS_PER_BEAT === 0 });
  for (let b = 0; b < BEATS_PER_BAR; b++) {
    const t = b * TICKS_PER_BEAT;
    if (ostinato === "kick" || ostinato === "kickPedal") hits.push({ tick: t, voice: "kick", accent: b === 0 });
    if (ostinato === "pedal") hits.push({ tick: t, voice: "pedal" });
    if ((ostinato === "pedal24" || ostinato === "kickPedal" || ostinato === "swing") && b % 2 === 1) hits.push({ tick: t, voice: "pedal" });
  }
  if (ostinato === "kickUnison") for (const x of snare) hits.push({ tick: x.tick, voice: "kick" });
  return hits.sort((a, b) => a.tick - b.tick);
}

/** The rhythms an exercise uses, for a caption ("Quarters · 8ths · Triplets"). */
export function familiesUsed(bars: SyncopationBar[]): RhythmFamily[] {
  const used = new Set(bars.flatMap((b) => b.figures.map((f) => f.family)));
  return RHYTHM_FAMILIES.map((f) => f.id).filter((id) => used.has(id));
}

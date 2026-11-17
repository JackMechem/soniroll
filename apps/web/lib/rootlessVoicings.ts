/**
 * The theory behind Find the Root: rootless voicings, and which root turns each one into which
 * chord. Pure data and functions (no imports), so it can be checked with a plain Node script.
 *
 * A round is a chord type (say minor 9) on a root (C): the tool plays the chord's notes without
 * the root (E♭ G B♭ D, which is an E♭Δ7 on its own) and asks which note makes it a minor 9. The
 * answer is the root. Notes are spelled by degree from the root (a ♭3 of C is E♭, never D♯), so
 * the voicing's own chord name and the notes shown always agree.
 */

/** One chord degree: its distance above the root in semitones, and in letter names (a 3rd is 2
    letters up, a 9th is 1). The letter step is what decides E♭ vs D♯. */
type Degree = { semis: number; steps: number };

export const DEGREES = {
  b9: { semis: 1, steps: 1 },
  "9": { semis: 2, steps: 1 },
  "#9": { semis: 3, steps: 1 },
  b3: { semis: 3, steps: 2 },
  "3": { semis: 4, steps: 2 },
  "11": { semis: 5, steps: 3 },
  b5: { semis: 6, steps: 4 },
  "5": { semis: 7, steps: 4 },
  b13: { semis: 8, steps: 5 },
  "13": { semis: 9, steps: 5 },
  b7: { semis: 10, steps: 6 },
  "7": { semis: 11, steps: 6 },
} satisfies Record<string, Degree>;

export type DegreeName = keyof typeof DEGREES;

/** How a degree is written for people: ♭3, 9, ♯9, 13. */
export function degreeLabel(d: DegreeName): string {
  return d.replace("b", "♭").replace("#", "♯");
}

export type RootlessCategory = "Triad on top" | "Four-note chord on top" | "Left-hand only";

export const ROOTLESS_CATEGORIES: RootlessCategory[] = [
  "Triad on top",
  "Four-note chord on top",
  "Left-hand only",
];

export type RootlessType = {
  id: string;
  category: RootlessCategory;
  /** The chord you're asked to make, e.g. "Minor 9". */
  name: string;
  /** How the question finishes: "Make it a minor 9". */
  ask: string;
  /** Its symbol in the iReal/Chord Charts grammar ("-9", "^9", "h7"); shown through
      `prettyQuality`. */
  suffix: string;
  /** The notes played: the chord's degrees, never the root. */
  degrees: DegreeName[];
  /** The chord those notes make on their own: which degree is its root, and its symbol. Null when
      they don't make a simple chord (the left-hand 13 and alt voicings). */
  voicing: { root: DegreeName; suffix: string } | null;
  /** The left-hand "A" voicing starts on this degree (the 3rd, or the 4th for a sus chord); "B"
      starts on the 7th. Both are packed as close as they go above it. */
  aFrom: DegreeName;
  bFrom: DegreeName;
};

export const ROOTLESS_TYPES: RootlessType[] = [
  // A triad a third (or a 7th) above the root.
  {
    id: "min7",
    category: "Triad on top",
    name: "Minor 7",
    ask: "a minor 7",
    suffix: "-7",
    degrees: ["b3", "5", "b7"],
    voicing: { root: "b3", suffix: "" },
    aFrom: "b3",
    bFrom: "b7",
  },
  {
    id: "maj7",
    category: "Triad on top",
    name: "Major 7",
    ask: "a major 7",
    suffix: "^7",
    degrees: ["3", "5", "7"],
    voicing: { root: "3", suffix: "-" },
    aFrom: "3",
    bFrom: "7",
  },
  {
    id: "dom7",
    category: "Triad on top",
    name: "Dominant 7",
    ask: "a dominant 7",
    suffix: "7",
    degrees: ["3", "5", "b7"],
    voicing: { root: "3", suffix: "o" },
    aFrom: "3",
    bFrom: "b7",
  },
  {
    id: "min7b5",
    category: "Triad on top",
    name: "Half-diminished",
    ask: "half-diminished",
    suffix: "h7",
    degrees: ["b3", "b5", "b7"],
    voicing: { root: "b3", suffix: "-" },
    aFrom: "b3",
    bFrom: "b7",
  },

  // A seventh chord a third (or a 5th) above the root.
  {
    id: "min9",
    category: "Four-note chord on top",
    name: "Minor 9",
    ask: "a minor 9",
    suffix: "-9",
    degrees: ["b3", "5", "b7", "9"],
    voicing: { root: "b3", suffix: "^7" },
    aFrom: "b3",
    bFrom: "b7",
  },
  {
    id: "maj9",
    category: "Four-note chord on top",
    name: "Major 9",
    ask: "a major 9",
    suffix: "^9",
    degrees: ["3", "5", "7", "9"],
    voicing: { root: "3", suffix: "-7" },
    aFrom: "3",
    bFrom: "7",
  },
  {
    id: "dom9",
    category: "Four-note chord on top",
    name: "Dominant 9",
    ask: "a dominant 9",
    suffix: "9",
    degrees: ["3", "5", "b7", "9"],
    voicing: { root: "3", suffix: "h7" },
    aFrom: "3",
    bFrom: "b7",
  },
  {
    id: "dom7b9",
    category: "Four-note chord on top",
    name: "7♭9",
    ask: "a 7♭9",
    suffix: "7b9",
    degrees: ["3", "5", "b7", "b9"],
    voicing: { root: "3", suffix: "o7" },
    aFrom: "3",
    bFrom: "b7",
  },
  {
    id: "dom9sus",
    category: "Four-note chord on top",
    name: "9sus4",
    ask: "a 9sus4",
    suffix: "9sus",
    degrees: ["5", "b7", "9", "11"],
    voicing: { root: "5", suffix: "-7" },
    aFrom: "11",
    bFrom: "b7",
  },
  {
    id: "min9b5",
    category: "Four-note chord on top",
    name: "Half-diminished 9",
    ask: "a half-diminished 9",
    suffix: "h9",
    degrees: ["b3", "b5", "b7", "9"],
    voicing: { root: "b3", suffix: "-^7" },
    aFrom: "b3",
    bFrom: "b7",
  },

  // The left-hand voicings that aren't a chord of their own.
  {
    id: "dom13",
    category: "Left-hand only",
    name: "Dominant 13",
    ask: "a dominant 13",
    suffix: "13",
    degrees: ["3", "13", "b7", "9"],
    voicing: null,
    aFrom: "3",
    bFrom: "b7",
  },
  {
    id: "alt",
    category: "Left-hand only",
    name: "Altered (7♯9♭13)",
    ask: "an altered dominant (7♯9♭13)",
    suffix: "7alt",
    degrees: ["3", "b13", "b7", "#9"],
    voicing: null,
    aFrom: "3",
    bFrom: "b7",
  },
];

/** The common ones, on until changed. */
export const DEFAULT_ROOTLESS_TYPE_IDS = ["min7", "maj7", "dom7", "min7b5", "min9", "maj9", "dom9"];

const TYPE_BY_ID = new Map(ROOTLESS_TYPES.map((t) => [t.id, t]));

export function rootlessTypeById(id: string): RootlessType | undefined {
  return TYPE_BY_ID.get(id);
}

const VOICING_WORDS: Record<string, string> = {
  "": "A major triad",
  "-": "A minor triad",
  o: "A diminished triad",
  "^7": "A major 7",
  "-7": "A minor 7",
  h7: "A half-diminished 7",
  o7: "A diminished 7",
  "-^7": "A minor-major 7",
};

/** What the voicing is, in words: "A major 7 on the ♭3", or its degrees when it has no name. */
export function describeVoicing(type: RootlessType): string {
  return type.voicing
    ? `${VOICING_WORDS[type.voicing.suffix]} on the ${degreeLabel(type.voicing.root)}`
    : `The ${type.degrees.map(degreeLabel).join(", ")}`;
}

// ---------------------------------------------------------------- spelling

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/** The 12 roots as a jazz player writes them: flats, except F♯. Plain text ("Eb"), run through
    `prettyNote` for display. */
export const ROOT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** "Eb" → "E♭". */
export function prettyNote(name: string): string {
  return name.replace(/#/g, "♯").replace(/b/g, "♭");
}

/** "Eb" → 3. */
export function noteNamePc(name: string): number {
  const base = LETTER_PC[LETTERS.indexOf(name[0])];
  return mod12(base + (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0));
}

/** The other way to write a black-key root (D♭ ↔ C♯). */
const ENHARMONIC: Record<string, string> = { Db: "C#", Eb: "D#", "F#": "Gb", Ab: "G#", Bb: "A#" };

/** Spellings that are right but read awkwardly. */
const AWKWARD = new Set(["E#", "B#", "Cb", "Fb"]);

function spellScored(root: string, degree: DegreeName): { name: string; cost: number } {
  const { semis, steps } = DEGREES[degree];
  const letterIdx = (LETTERS.indexOf(root[0]) + steps) % 7;
  const pc = mod12(noteNamePc(root) + semis);
  let acc = mod12(pc - LETTER_PC[letterIdx]);
  if (acc > 6) acc -= 12;
  const letter = LETTERS[letterIdx];
  if (acc === 0) return { name: letter, cost: 0 };
  if (acc === 1 || acc === -1) {
    const name = `${letter}${acc === 1 ? "#" : "b"}`;
    return { name, cost: AWKWARD.has(name) ? 1 : 0 };
  }
  // A double sharp or flat: written as the plain note instead.
  return { name: ROOT_NAMES[pc], cost: 2 };
}

/** The note `degree` above the root `root` ("Eb"), spelled by letter so a ♭3 is always a 3rd up.
    Where that would need a double sharp or flat it's the plain name instead (the ♯9 of E would
    be F double-sharp; it's written G). */
export function spellDegree(root: string, degree: DegreeName): string {
  return spellScored(root, degree).name;
}

/** How a chord type's root is written: the usual name (`ROOT_NAMES`), unless the other spelling
    of that black key reads more cleanly for this chord (E♭ half-diminished would need a B
    double-flat, so it's written D♯ø7, with D♯ F♯ A C♯). */
export function rootName(type: RootlessType, rootPc: number): string {
  const usual = ROOT_NAMES[rootPc];
  const other = ENHARMONIC[usual];
  if (!other) return usual;
  const cost = (root: string) => type.degrees.reduce((sum, d) => sum + spellScored(root, d).cost, 0);
  return cost(other) < cost(usual) ? other : usual;
}

// ---------------------------------------------------------------- rounds

export type VoicingShape = "stacked" | "inversions" | "ab";

export const VOICING_SHAPES: { value: VoicingShape; label: string }[] = [
  { value: "stacked", label: "The chord on top, root position" },
  { value: "inversions", label: "The chord on top, any inversion" },
  { value: "ab", label: "Left-hand A and B (from the 3rd or the 7th)" },
];

/** Degrees in the order they're played, low to high, starting on `from` and packed as close as
    they go (each next note is the nearest one above). */
export function closeOrder(type: RootlessType, from: DegreeName): DegreeName[] {
  const start = DEGREES[from].semis;
  return [...type.degrees].sort(
    (a, b) => mod12(DEGREES[a].semis - start) - mod12(DEGREES[b].semis - start),
  );
}

/** Which degree the voicing starts on for a shape. `pick` is a 0–1 random number. */
export function bottomDegree(type: RootlessType, shape: VoicingShape, pick: number): DegreeName {
  if (shape === "inversions") {
    return type.degrees[Math.min(type.degrees.length - 1, Math.floor(pick * type.degrees.length))];
  }
  if (shape === "ab") return pick < 0.5 ? type.aFrom : type.bFrom;
  return type.voicing?.root ?? type.aFrom;
}

export type RootlessRound = {
  type: RootlessType;
  rootPc: number;
  /** The voicing's degrees, low to high. */
  order: DegreeName[];
  /** MIDI notes of the voicing, low to high. */
  midis: number[];
  /** The root to play under it on the reveal, an octave or so below. */
  rootMidi: number;
  /** "A" or "B" when it's a left-hand voicing, for the reveal. */
  ab: "A" | "B" | null;
};

/** Where the voicing's lowest note sits. */
export type Register = { id: string; label: string; lowMidi: number };

export const REGISTERS: Register[] = [
  { id: "low", label: "Low (from about G2)", lowMidi: 43 },
  { id: "mid", label: "Middle (around middle C)", lowMidi: 50 },
  { id: "high", label: "High (from about G4)", lowMidi: 67 },
];

/** Builds a round: the voicing packed up from `bottom`, its lowest note in the 12 semitones from
    `lowMidi`. */
export function buildRound(
  type: RootlessType,
  rootPc: number,
  bottom: DegreeName,
  lowMidi: number,
  shape: VoicingShape,
): RootlessRound {
  const order = closeOrder(type, bottom);
  const firstPc = mod12(rootPc + DEGREES[order[0]].semis);
  const midis = [lowMidi + mod12(firstPc - lowMidi)];
  for (const d of order.slice(1)) {
    const prev = midis[midis.length - 1];
    const pc = mod12(rootPc + DEGREES[d].semis);
    midis.push(prev + (mod12(pc - prev) || 12));
  }
  // The root below the voicing, dropped an octave more when that keeps it out of the mud.
  let rootMidi = midis[0] - (mod12(midis[0] - rootPc) || 12);
  if (rootMidi - 12 >= 36) rootMidi -= 12;
  const ab = shape === "ab" ? (bottom === type.bFrom ? "B" : "A") : null;
  return { type, rootPc, order, midis, rootMidi, ab };
}

/** A random round from the pool of types and roots (an empty roots list means all 12). */
export function randomRound(
  types: RootlessType[],
  roots: number[],
  shape: VoicingShape,
  lowMidi: number,
  rand: () => number = Math.random,
): RootlessRound {
  const type = types[Math.floor(rand() * types.length)];
  const pool = roots.length ? roots : Array.from({ length: 12 }, (_, i) => i);
  const rootPc = pool[Math.floor(rand() * pool.length)];
  return buildRound(type, rootPc, bottomDegree(type, shape, rand()), lowMidi, shape);
}

/** The pitch classes a type's voicing has on a root. */
export function voicingPcs(type: RootlessType, rootPc: number): number[] {
  return type.degrees.map((d) => mod12(rootPc + DEGREES[d].semis)).sort((a, b) => a - b);
}

/** Every root that turns these notes into this chord type. Usually just the one, but a
    diminished 7th is symmetrical, so the 7♭9 voicing (E G B♭ D♭) is C7♭9, E♭7♭9, F♯7♭9 and A7♭9
    all at once — any of them counts. */
export function correctRoots(type: RootlessType, rootPc: number): number[] {
  const key = voicingPcs(type, rootPc).join(",");
  return Array.from({ length: 12 }, (_, pc) => pc).filter(
    (pc) => voicingPcs(type, pc).join(",") === key,
  );
}

/** A note name with an octave ("Eb4"), for playback. */
export function midiName(midi: number): string {
  return `${ROOT_NAMES[mod12(midi)]}${Math.floor(midi / 12) - 1}`;
}

/** The chord you're asked for, as text ("C-9"); show it with `prettyNote` + `prettyQuality`. */
export function targetSymbol(round: RootlessRound): { root: string; suffix: string } {
  return { root: rootName(round.type, round.rootPc), suffix: round.type.suffix };
}

/** The voicing's own chord ("Eb" + "^7"), or null when it isn't a simple chord. */
export function voicingSymbol(round: RootlessRound): { root: string; suffix: string } | null {
  const v = round.type.voicing;
  return v ? { root: spellDegree(rootName(round.type, round.rootPc), v.root), suffix: v.suffix } : null;
}

/** The voicing's notes low to high, spelled from the root ("Eb", "G", "Bb", "D"). A voicing
    with no chord name of its own has nothing to stay consistent with, so a C♭ or E♯ there is
    written the plain way (B, F). */
export function voicingNoteNames(round: RootlessRound): string[] {
  const root = rootName(round.type, round.rootPc);
  return round.order.map((d) => {
    const name = spellDegree(root, d);
    return !round.type.voicing && AWKWARD.has(name) ? ROOT_NAMES[noteNamePc(name)] : name;
  });
}

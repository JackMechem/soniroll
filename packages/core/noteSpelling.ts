/** Shared by Note Trainer and Scale Trainer: how an accidental note gets displayed. */

export type AccidentalStyle = "sharp" | "flat" | "random" | "both";

export const ACCIDENTAL_STYLES: { value: AccidentalStyle; label: string }[] = [
  { value: "sharp", label: "Sharps (C#)" },
  { value: "flat", label: "Flats (D♭)" },
  { value: "random", label: "Random, either" },
  { value: "both", label: "Both (C#/D♭)" },
];

const SHARP_TO_FLAT: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
};

/** A stable pseudo-random bit for a seed, so a note's spelling doesn't flicker while it's still
    on screen (a real Math.random() call would re-roll on every re-render). */
export function seededBool(seed: number): boolean {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x) < 0.5;
}

/** Folds the note's own text into the seed so two different notes shown at once (the current
    note and the next-note preview) don't always get the same coin flip. */
export function accidentalSeed(note: string, seq: number): number {
  let h = seq;
  for (let i = 0; i < note.length; i++) h = h * 31 + note.charCodeAt(i);
  return h;
}

/** Respells a note (e.g. "C#4") per the accidental style; naturals are untouched either way. */
export function spellNote(
  note: string,
  style: AccidentalStyle,
  seq: number,
  stripOctave: boolean,
): string {
  const match = /^([A-G]#?)(\d+)$/.exec(note);
  if (!match) return note;
  const [, base, octave] = match;
  const withOctave = (name: string) =>
    stripOctave ? name : `${name}${octave}`;
  const flat = SHARP_TO_FLAT[base];
  if (!flat) return withOctave(base);
  switch (style) {
    case "flat":
      return withOctave(flat);
    case "both":
      return `${withOctave(base)}/${withOctave(flat)}`;
    case "random":
      return withOctave(seededBool(accidentalSeed(note, seq)) ? flat : base);
    case "sharp":
    default:
      return withOctave(base);
  }
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
/** How many letter names an interval spans, by its size in semitones (a tritone can be a 4th or
    a 5th: both are tried). */
const LETTER_STEPS: Record<number, number[]> = { 0: [0], 1: [1], 2: [1], 3: [2], 4: [2], 5: [3], 6: [3, 4], 7: [4], 8: [5], 9: [5], 10: [6], 11: [6], 12: [7] };

type Spelled = { letter: number; acc: number; midi: number };

function midiOf(note: string): number | null {
  const match = /^([A-G])(#?)(\d+)$/.exec(note);
  if (!match) return null;
  const [, letter, sharp, octave] = match;
  return (Number(octave) + 1) * 12 + LETTER_PC[LETTERS.indexOf(letter)] + (sharp ? 1 : 0);
}

/** `midi` spelled on a letter (0 = C … 6 = B), with the accidental that takes it there. */
function onLetter(midi: number, letter: number): Spelled {
  const pc = ((midi % 12) + 12) % 12;
  let acc = pc - LETTER_PC[((letter % 7) + 7) % 7];
  if (acc > 6) acc -= 12;
  if (acc < -6) acc += 12;
  return { letter: ((letter % 7) + 7) % 7, acc, midi };
}

function written(s: Spelled, stripOctave: boolean): string {
  const name = LETTERS[s.letter] + (s.acc > 0 ? "#".repeat(s.acc) : "b".repeat(-s.acc));
  if (stripOctave) return name;
  // The octave goes with the letter (B#3 sounds as C4).
  const octave = Math.floor((s.midi - s.acc - LETTER_PC[s.letter]) / 12) - 1;
  return `${name}${octave}`;
}

/**
 * The two notes of an interval (`[start, target]`, as `midiToNote` writes them), spelled as that
 * interval: the target is the right number of letters away, so a major 7th up from B♭ reads
 * B♭2 → A3 rather than A#2 → A3 (a diminished octave). The start note follows `style` when either
 * spelling works; otherwise it takes the one that keeps the target off a double sharp or flat.
 * "Both" spells each note both ways, as `spellNote` does.
 */
export function spellInterval(
  notes: [string, string] | string[],
  style: AccidentalStyle,
  seq: number,
  stripOctave = false,
): [string, string] {
  const [a, b] = notes;
  const start = midiOf(a ?? "");
  const target = midiOf(b ?? "");
  if (style === "both" || start === null || target === null) {
    return [spellNote(a ?? "", style, seq, stripOctave), spellNote(b ?? "", style, seq, stripOctave)];
  }
  const size = Math.abs(target - start);
  const dir = target >= start ? 1 : -1;
  const steps = LETTER_STEPS[size];
  if (!steps) return [spellNote(a, style, seq, stripOctave), spellNote(b, style, seq, stripOctave)];
  // The start note's spellings, the style's choice first.
  const pc = ((start % 12) + 12) % 12;
  const natural = LETTER_PC.indexOf(pc);
  const sharp = onLetter(start, LETTER_PC.indexOf(pc - 1));
  const flat = onLetter(start, LETTER_PC.indexOf(pc + 1 === 12 ? 0 : pc + 1));
  const preferFlat = style === "flat" || (style === "random" && seededBool(accidentalSeed(a, seq)));
  const starts = natural >= 0 ? [onLetter(start, natural)] : preferFlat ? [flat, sharp] : [sharp, flat];
  let best: [Spelled, Spelled] | null = null;
  for (const s of starts) {
    for (const n of steps) {
      const t = onLetter(target, s.letter + n * dir);
      if (!best || Math.abs(t.acc) < Math.abs(best[1].acc)) best = [s, t];
    }
  }
  return [written(best![0], stripOctave), written(best![1], stripOctave)];
}

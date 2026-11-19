/**
 * Scale Trainer's note names: a scale is spelled from its key, one letter per degree, so F melodic
 * minor reads F G A♭ B♭ C D E (never G♯ A♯) whatever the sharps/flats setting says. The setting
 * still picks the root's name, unless the other name of that black key spells the scale more
 * cleanly (D♯ major would need E♯, F𝄪, B♯ and C𝄪, so it's written E♭ major).
 *
 * Pure (only `rootlessVoicings`' speller), so a Node script can check it.
 */
import { noteNamePc, spellAbove } from "./rootlessVoicings";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Letters above the root for each semitone, for scales without seven notes (pentatonics, blues,
    whole tone, the diminished scales): ♭2, 2, ♭3, 3, 4, ♭5, 5, ♭6, 6, ♭7, 7. The second reads the
    tritone and minor 6th as ♯4 and ♯5 instead (the whole-tone scale on F is F G A B C♯ D♯, not
    F G A C♭ D♭ E♭); whichever spells the scale more cleanly is used. */
const STEPS_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const STEPS_SHARP = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6];

/** Spellings that are right but read awkwardly; plain names in scales without one letter each. */
const PLAIN: Record<string, string> = { "E#": "F", "B#": "C", Cb: "B", Fb: "E" };

function spellFrom(root: string, intervals: number[], steps: number[]) {
  const spelled = intervals.map((semis, i) => spellAbove(root, semis % 12, steps[i]));
  return { names: spelled.map((s) => s.name), cost: spelled.reduce((sum, s) => sum + s.cost, 0) };
}

/** The scale spelled from `root`: one letter per degree for a seven-note scale (E♯ in F♯ major
    stays E♯), else the cleaner of the two degree readings, with E♯/B♯/C♭/F♭ written plainly. */
function spellKey(root: string, intervals: number[]) {
  if (intervals.length === 7) return spellFrom(root, intervals, intervals.map((_, i) => i));
  const flat = spellFrom(root, intervals, intervals.map((s) => STEPS_FLAT[s % 12]));
  const sharp = spellFrom(root, intervals, intervals.map((s) => STEPS_SHARP[s % 12]));
  const best = sharp.cost < flat.cost ? sharp : flat;
  return { names: best.names.map((n, i) => (i > 0 && PLAIN[n]) || n), cost: best.cost };
}

/**
 * The scale's notes (root first, no octave, plain `#`/`b`), spelled from the key. `preferredRoot`
 * is the root as the sharps/flats setting writes it ("C#", "Db"). Returns null when there's no
 * key spelling to give (the chromatic scale, or a root written both ways, "C#/Db"): callers then
 * spell each note on its own as before.
 */
export function spellScale(preferredRoot: string, intervals: number[]): string[] | null {
  if (!/^[A-G][#b]?$/.test(preferredRoot)) return null;
  if (intervals.length === 12) return null;
  const pc = noteNamePc(preferredRoot);
  const usual = spellKey(preferredRoot, intervals);
  // A black-key root can be written the other way; take it when that reads more cleanly.
  if (SHARP_NAMES[pc] !== FLAT_NAMES[pc]) {
    const other = preferredRoot === SHARP_NAMES[pc] ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
    const alt = spellKey(other, intervals);
    if (alt.cost < usual.cost) return alt.names;
  }
  return usual.names;
}

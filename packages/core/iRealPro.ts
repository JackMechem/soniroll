import IrealReader from "ireal-reader";

// Reads iReal Pro playlist links (the `irealb://...` links shared on the iReal Pro forums) into
// chord charts this app can render. `ireal-reader` (npm, MIT) handles the hard, undocumented
// part — splitting a playlist into songs and un-scrambling each song's chord data back into
// iReal's plain-text chart notation (see its README for the token grammar it exposes via
// `song.music.raw`, e.g. `*A` for a section letter, `T44` for a time signature, `{`/`}` for
// repeat barlines, `N1`/`N2` for endings, `XyQ` as layout padding, and a chord token regex).
// That library's own `measures` output *expands* repeats/endings into one flat played-through
// list, which is right for playback but wrong for *display* — a chart should show the repeat
// sign and "1./2." brackets once, the way the original chart is written. So instead of using its
// `measures`, `tokenizeChart` below walks that same `raw` string itself, using the same token
// grammar, to build a chart model that keeps the notation as written.

/** One chord in a bar, or a placeholder for "no chord" / "keep time, nothing written". */
export type ChordSlot =
  | {
      kind: "chord";
      /** Root letter A-G. */
      letter: string;
      accidental?: "b" | "#";
      /** Everything after the root/accidental — "-7", "^7", "h7", "o7", "7alt", "sus", etc. */
      quality: string;
      bass?: { letter: string; accidental?: "b" | "#" };
      /** Written small (iReal's `s`…`l`) — usually a quick passing chord squeezed into a bar. */
      small?: boolean;
    }
  | { kind: "nc" }
  | { kind: "slash" };

/** A chord without a position in the bar — what an alternate change (`(C#-7)` in an iReal chart,
    printed small above the regular changes) is. */
export type ChordShape = Extract<ChordSlot, { kind: "chord" }>;

export type BarContent =
  | { kind: "chords"; slots: ChordSlot[] }
  /** A "%" repeat-the-previous-bar measure. `double` is iReal's "repeat the previous *two* bars"
      sign, drawn across the barline at this bar's end; the bar after it is left empty. */
  | { kind: "repeat"; double?: boolean };

export type Bar = {
  content: BarContent;
  /** Section letter (or "i"/"O" for intro/outro etc.) starting at this bar, boxed in the UI. */
  section?: string;
  /** Draw a repeat-open barline (thick line + dots) before this bar. */
  startRepeat?: boolean;
  /** Draw a repeat-close barline (dots + thick line) after this bar. */
  endRepeat?: boolean;
  /** Which numbered ending ("1", "2", ...) this bar belongs to, if any. */
  endingLabel?: string;
  /** This bar is the first one under its ending bracket (so the bracket + number get drawn). */
  endingStart?: boolean;
  /** Force a line break before this bar. */
  newRow?: boolean;
  segno?: boolean;
  coda?: boolean;
  /** A printed direction after this bar — "Fine", "D.C. al Coda", etc. */
  directive?: string;
  /** Width in iReal's 16-cells-per-line grid (a normal bar is 4). Absent for bars made in the
      chart builder, which are always 4 cells, 4 to a line. */
  cells?: number;
  /** Blank cells left before this bar in its line — e.g. a 2nd ending printed under the 1st. */
  offsetCells?: number;
  /** A time signature change starting at this bar. */
  timeSignature?: { top: number; bottom: number };
  /** The barline drawn at this bar's end, when it isn't a plain single (or repeat) barline. */
  endBarline?: "double" | "final";
  /** A double barline drawn at this bar's start (iReal's `[`). */
  startDouble?: boolean;
  /** Alternate changes printed small above this bar's chords. */
  alternates?: ChordShape[];
};

export type IRealSong = {
  title: string;
  composer: string;
  style: string;
  key: string;
  timeSignature: { top: number; bottom: number };
  bars: Bar[];
};

export type IRealPlaylist = { name: string; songs: IRealSong[] };

const CHORD_RE = /^[A-GW][-+^0-9hob#suadlt]*(\/[A-G][b#]?)?/;

/** iReal's plain-text quality suffix ("^7", "h7", "o7", ...) to the glyphs it's actually printed
    with — Δ for major 7, ø for half-diminished, ° for diminished, plus sharp/flat. Shared by
    Chord Charts (`ChordChart.tsx`'s `ChordLabel`) and Guess the Chord (`lib/chords.ts`, whose
    chord bank deliberately reuses this exact suffix grammar), so a chord looks the same wherever
    it's drawn in this app. */
export function prettyQuality(quality: string): string {
  return quality
    .replace(/\^/g, "Δ")
    .replace(/h/g, "ø")
    .replace(/o/g, "°")
    .replace(/#/g, "♯")
    .replace(/b/g, "♭");
}

function splitMain(main: string): {
  letter: string;
  accidental?: "b" | "#";
  quality: string;
} {
  const letter = main[0];
  let rest = main.slice(1);
  let accidental: "b" | "#" | undefined;
  if (rest[0] === "b" || rest[0] === "#") {
    accidental = rest[0];
    rest = rest.slice(1);
  }
  return { letter, accidental, quality: rest };
}

function parseTimeSignature(digits: string): { top: number; bottom: number } {
  // Almost always two single digits ("44", "34", "68"); a 3-digit reading (like "128" for
  // 12/8) is rarer and this just guesses a 2/1 split for it.
  if (digits.length <= 2) {
    return {
      top: Number(digits.slice(0, 1)) || 4,
      bottom: Number(digits.slice(1)) || 4,
    };
  }
  return {
    top: Number(digits.slice(0, 2)) || 12,
    bottom: Number(digits.slice(2)) || 8,
  };
}

function parseRawChord(token: string, lastMainChord: string | undefined): ChordShape {
  const slashIndex = token.indexOf("/");
  let main = slashIndex === -1 ? token : token.slice(0, slashIndex);
  if (main[0] === "W" && lastMainChord) main = lastMainChord + main.slice(1);
  const bass =
    slashIndex === -1
      ? undefined
      : (() => {
          const b = token.slice(slashIndex + 1);
          return { letter: b[0], accidental: b[1] === "b" || b[1] === "#" ? (b[1] as "b" | "#") : undefined };
        })();
  const { letter, accidental, quality } = splitMain(main);
  return { kind: "chord", letter, accidental, quality, bass };
}

/**
 * Walks a song's un-scrambled `raw` chart string into a list of bars, keeping everything as
 * written (not expanded): repeat signs, numbered endings, sections, codas/segnos, printed
 * directions, time signature changes, small and alternate chords, double/final barlines.
 *
 * iReal lays every line out as **16 cells**: each chord, `x`/`r`/`p`/`n` mark and space takes one
 * cell (`XyQ` is three, `LZ` is a space then a barline, `Kcl` is a barline then a cell of `x`), and
 * a bar is as wide as the cells it spans — which is how a line can hold 8 narrow bars, or a 2nd
 * ending can start halfway across under the 1st. Each bar records its `cells`; a run of empty
 * cells that isn't a bar of its own (right after a closing barline — `}`, `]`, `Z` — or at the
 * start of the chart) becomes the next bar's `offsetCells`, blank space in its line.
 *
 * Earlier versions stopped at the first `Z` (final barline), silently dropping everything after it
 * — codas, and whole sections after a "Fine".
 */
export function tokenizeChart(raw: string): {
  bars: Bar[];
  timeSignature: { top: number; bottom: number } | null;
} {
  const bars: Bar[] = [];
  let timeSignature: { top: number; bottom: number } | null = null;
  let lastMainChord: string | undefined;
  let small = false;

  // The bar being read.
  let slots: ChordSlot[] = [];
  let alternates: ChordShape[] = [];
  let kind: "chords" | "repeat" | "repeat2" = "chords";
  let hasContent = false;
  let cells = 0;

  // Things that apply to the bar being read (or, if it hasn't started, the next one).
  let pendingSection: string | undefined;
  let pendingRepeatStart = false;
  let pendingStartDouble = false;
  let pendingCoda = false;
  let pendingSegno = false;
  let pendingTime: { top: number; bottom: number } | undefined;
  let pendingDirective: string | undefined;
  let pendingOffset = 0;
  // Markers met after the current bar already has chords belong to the bar after it.
  let nextCoda = false;
  let nextSegno = false;
  let forceNextBar = false; // the second half of a 2-bar repeat is a real (empty) bar
  let forceBar = false;
  let currentEndingLabel: string | undefined;
  let endingJustStarted = false;
  let lastClose: "|" | "repeat" | "double" | "final" | null = null;

  function resetBar() {
    slots = [];
    alternates = [];
    kind = "chords";
    hasContent = false;
    cells = 0;
  }

  function closeBar(close: "|" | "repeat" | "double" | "final" | null) {
    if (hasContent || forceBar) {
      const bar: Bar = {
        content: kind === "repeat" ? { kind: "repeat" } : kind === "repeat2" ? { kind: "repeat", double: true } : { kind: "chords", slots },
        cells: Math.max(1, cells),
      };
      if (pendingOffset) bar.offsetCells = pendingOffset;
      if (alternates.length) bar.alternates = alternates;
      if (pendingSection !== undefined) bar.section = pendingSection;
      if (pendingRepeatStart) bar.startRepeat = true;
      if (pendingStartDouble) bar.startDouble = true;
      if (pendingCoda) bar.coda = true;
      if (pendingSegno) bar.segno = true;
      if (pendingTime) bar.timeSignature = pendingTime;
      if (pendingDirective) bar.directive = pendingDirective;
      if (currentEndingLabel !== undefined) {
        bar.endingLabel = currentEndingLabel;
        if (endingJustStarted) bar.endingStart = true;
      }
      if (close === "repeat") bar.endRepeat = true;
      if (close === "double" || close === "final") bar.endBarline = close;
      bars.push(bar);
      pendingSection = undefined;
      pendingRepeatStart = false;
      pendingStartDouble = false;
      pendingCoda = nextCoda;
      pendingSegno = nextSegno;
      nextCoda = false;
      nextSegno = false;
      pendingTime = undefined;
      pendingDirective = undefined;
      pendingOffset = 0;
      endingJustStarted = false;
      forceBar = forceNextBar;
      forceNextBar = false;
    } else if (cells > 0) {
      // Empty cells. Right after a closing barline (or at the very start) they're blank space in
      // the line; otherwise they're an empty measure.
      if (bars.length === 0 || lastClose === "repeat" || lastClose === "double" || lastClose === "final") {
        pendingOffset += cells;
      } else {
        forceBar = true;
        closeBar(close);
        return;
      }
    } else if (close && close !== "|" && bars.length > 0) {
      // A closing barline straight after another barline belongs to the bar before it.
      const last = bars[bars.length - 1];
      if (close === "repeat") last.endRepeat = true;
      else last.endBarline = close;
    }
    if (close) lastClose = close;
    resetBar();
  }

  function markCoda() {
    if (hasContent) nextCoda = true;
    else pendingCoda = true;
  }
  function markSegno() {
    if (hasContent) nextSegno = true;
    else pendingSegno = true;
  }

  let i = 0;
  while (i < raw.length) {
    const s = raw.slice(i);
    const c = s[0];

    if (s.startsWith("XyQ")) {
      cells += 3;
        i += 3;
      continue;
    }
    if (s.startsWith("Kcl")) {
      closeBar("|");
      kind = "repeat";
      hasContent = true;
      cells += 2;
      i += 3;
      continue;
    }
    if (s.startsWith("LZ")) {
      cells += 1;
      closeBar("|");
      i += 2;
      continue;
    }
    const section = /^\*(\w)/.exec(s);
    if (section) {
      if (hasContent) closeBar(null);
      pendingSection = section[1];
      currentEndingLabel = undefined;
      i += section[0].length;
      continue;
    }
    const directive = /^<([^>]*)>/.exec(s);
    if (directive) {
      const text = directive[1].replace(/^\*\d+/, "").trim();
      if (text) {
        if (hasContent || cells > 0 || bars.length === 0) pendingDirective = text;
        else bars[bars.length - 1].directive = text;
      }
      i += directive[0].length;
      continue;
    }
    const time = /^T(\d+)/.exec(s);
    if (time) {
      const ts = parseTimeSignature(time[1]);
      if (!timeSignature && bars.length === 0) timeSignature = ts;
      else pendingTime = ts;
      i += time[0].length;
      continue;
    }
    const ending = /^N(\d)/.exec(s);
    if (ending) {
      currentEndingLabel = ending[1];
      endingJustStarted = true;
      i += ending[0].length;
      continue;
    }
    const alt = /^\(([^)]*)\)/.exec(s);
    if (alt) {
      const m = CHORD_RE.exec(alt[1].trim());
      if (m) alternates.push(parseRawChord(m[0], lastMainChord));
      i += alt[0].length;
      continue;
    }
    switch (c) {
      case " ":
        cells += 1;
            i += 1;
        continue;
      case ",":
      case "Y":
      case "U":
      case "f":
        i += 1;
        continue;
      case "s":
        small = true;
        i += 1;
        continue;
      case "l":
        small = false;
        i += 1;
        continue;
      case "x":
        kind = "repeat";
        hasContent = true;
        cells += 1;
        i += 1;
        continue;
      case "r":
        kind = "repeat2";
        hasContent = true;
        cells += 1;
        forceNextBar = true;
        i += 1;
        continue;
      case "n":
        slots.push({ kind: "nc" });
        hasContent = true;
        cells += 1;
        i += 1;
        continue;
      case "p":
        slots.push({ kind: "slash" });
        hasContent = true;
        cells += 1;
        i += 1;
        continue;
      case "S":
        markSegno();
        i += 1;
        continue;
      case "Q":
        markCoda();
        i += 1;
        continue;
      case "{":
        closeBar(null);
        pendingRepeatStart = true;
        i += 1;
        continue;
      case "}":
        closeBar("repeat");
        i += 1;
        continue;
      case "[":
        closeBar(null);
        pendingStartDouble = true;
        i += 1;
        continue;
      case "]":
        closeBar("double");
        currentEndingLabel = undefined;
        i += 1;
        continue;
      case "|":
        closeBar("|");
        i += 1;
        continue;
      case "Z":
        closeBar("final");
        currentEndingLabel = undefined;
        i += 1;
        continue;
    }
    const chord = CHORD_RE.exec(s);
    if (chord) {
      const token = chord[0];
      const shape = parseRawChord(token, lastMainChord);
      if (shape.letter !== "W") lastMainChord = token.split("/")[0];
      if (small) shape.small = true;
      slots.push(shape);
      hasContent = true;
      kind = "chords";
      cells += 1;
      i += token.length;
      continue;
    }
    // Unrecognized character — skip it rather than getting stuck.
    i += 1;
  }
  closeBar(null);

  return { bars, timeSignature };
}

/** Uppercases a chord token's root/bass letters ("c^7/e" -> "C^7/E") without touching anything
    else — the quality suffix's own letters (h, o, s, u, a, d, l, t) are already lowercase by
    convention and must stay that way. A small convenience for hand-typed input (the chart
    builder, `ChordChartEditor.tsx`) that a pasted, already-correctly-cased chart never needed. */
function normalizeChordToken(token: string): string {
  return token.replace(/(^|\/)([a-g])/g, (_, pre: string, letter: string) => pre + letter.toUpperCase());
}

/** Rewrites the common ways people type a chord quality into iReal's own spelling, so a typed
    "Cmaj7", "Dm7", "Dm7b5", "CM7", "Bdim7", "Caug" or "C7(b9)" reads the same as "C^7", "D-7",
    "Dh7", "C^7", "Bo7", "C+" and "C7b9" (the chart builder used to drop them silently). The
    printed glyphs (Δ, ø, °, ♭, ♯) are accepted too. Only the quality after the root (and its
    accidental) is touched; "maj"/"M" on its own is a plain major triad. */
export function chordAliasToIreal(token: string): string {
  const t = token.replace(/6\/9/g, "69").replace(/♭/g, "b").replace(/♯/g, "#").replace(/[∆Δ]/g, "^").replace(/ø/g, "h").replace(/[°º]/g, "o");
  const m = /^([A-Ga-g][b#]?)([^/]*)(\/.*)?$/.exec(t);
  if (!m) return t;
  const [, root, rawQuality, bass = ""] = m;
  let q = rawQuality.replace(/[()]/g, "");
  const MINOR = "(?:min|mi|m|-)";
  const MAJOR = "(?:maj|Maj|MAJ|ma|Ma|M|\\^)";
  q = q
    .replace(new RegExp(`^${MINOR}${MAJOR}`), "-^") // mMaj7, m(maj7), -^7
    .replace(new RegExp(`^${MINOR}7b5`), "h7") // m7b5, -7b5
    .replace(/^dim/, "o")
    .replace(/^aug/, "+")
    .replace(/^(?:maj|Maj|MAJ|ma|Ma|M)(?=[0-9])/, "^") // maj7, M9, ma7#11
    .replace(/^(?:maj|Maj|MAJ|ma|Ma|M)$/, "") // a plain major triad
    .replace(/^(?:min|mi|m)(?!aj)/, "-");
  return root + q + bass;
}

/** Parses one typed chord token ("C^7", "Bb7alt", "c^7/e", "NC", ...) into a `ChordSlot`, or
    `null` if it isn't recognizable — the same plain iReal-style grammar `tokenizeChart` reads out
    of a pasted chart, `CHORD_RE` and all, just applied to one standalone token instead of a
    stream. Used by the from-scratch chart builder to turn what's typed into a bar's actual
    chords. Rejects a bare `"W"` (iReal's own "repeat the previous chord" marker) — `CHORD_RE`
    itself doesn't distinguish it from a real root letter, but there's no previous-chord context to
    resolve it against here the way `tokenizeChart`'s own stream parsing has. */
export function parseChordToken(token: string): ChordSlot | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (/^n\.?c\.?$/i.test(trimmed)) return { kind: "nc" };
  // A lone "/" is iReal's "keep playing the previous chord" beat placeholder — accepted so a
  // pasted chart's bars survive a round trip through the chart builder's text form.
  if (trimmed === "/") return { kind: "slash" };
  const normalized = normalizeChordToken(chordAliasToIreal(trimmed));
  const match = CHORD_RE.exec(normalized);
  if (!match || match[0].length !== normalized.length) return null;
  const slashIndex = normalized.indexOf("/");
  const main = slashIndex === -1 ? normalized : normalized.slice(0, slashIndex);
  if (main[0] === "W") return null;
  const bass =
    slashIndex === -1
      ? undefined
      : (() => {
          const b = normalized.slice(slashIndex + 1);
          return {
            letter: b[0],
            accidental: b[1] === "b" || b[1] === "#" ? (b[1] as "b" | "#") : undefined,
          };
        })();
  const { letter, accidental, quality } = splitMain(main);
  return { kind: "chord", letter, accidental, quality, bass };
}

/** Parses one bar's worth of typed chord text — space-separated tokens, each read by
    `parseChordToken` — into that bar's chord slots. An unrecognized token is silently dropped
    rather than failing the whole bar, so one typo doesn't lose every other chord already typed;
    the chart builder's own live preview is the feedback for "did this actually parse," not a
    separate validation message. */
/** The inverse of `parseBarSlots`: one bar's slots back to the space-separated text the chart
    builder edits ("C^7 F7", "Bb7#5/D", "NC", "/"). */
export function slotsToText(slots: ChordSlot[]): string {
  return slots
    .map((slot) => {
      if (slot.kind === "nc") return "NC";
      if (slot.kind === "slash") return "/";
      const bass = slot.bass ? `/${slot.bass.letter}${slot.bass.accidental ?? ""}` : "";
      return `${slot.letter}${slot.accidental ?? ""}${slot.quality}${bass}`;
    })
    .join(" ");
}

export function parseBarSlots(text: string): ChordSlot[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseChordToken)
    .filter((slot): slot is ChordSlot => slot !== null);
}

/** iReal Pro stores a composer credit "Lastname Firstname" (its charts sort by last name), e.g.
    "Rodgers Richard" or "Van Heusen Jimmy" — this app displays names the normal way round. Where
    a song has multiple composers joined by a hyphen with no first names given at all (e.g. a
    "Kalmar-Ruby-Hammerstein" credit), there's nothing to reorder, so that segment is left as-is;
    each hyphen-joined segment is reordered independently, so a mix of the two still works. */
export function formatComposer(raw: string): string {
  return raw
    .split("-")
    .map((part) => {
      const words = part.trim().split(/\s+/).filter(Boolean);
      if (words.length < 2) return part.trim();
      return `${words[words.length - 1]} ${words.slice(0, -1).join(" ")}`;
    })
    .join("-");
}

const NOTE_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_SPELLING = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_SPELLING = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// Which spelling each pitch class is respelled with after a transpose — flats everywhere except
// F#, the one "sharp" name jazz charts actually use in practice (e.g. "F#-7b5" in Blue Bossa)
// rather than the enharmonically-identical "Gb-7b5". A fixed table, not derived from whatever
// accidentals the original chart happened to use — matching a real lead book's own transposed
// spelling exactly would need genuine key-signature analysis, out of scope here; this is a
// reasonable, consistent approximation instead.
const PREFER_FLAT = [
  false, true, false, true, false, false, false, false, true, false, true, false,
];

function pitchClassOf(letter: string, accidental?: "b" | "#"): number {
  const base = NOTE_PITCH[letter] ?? 0;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (((base + shift) % 12) + 12) % 12;
}

function spellPitchClass(pc: number): { letter: string; accidental?: "b" | "#" } {
  const wrapped = ((pc % 12) + 12) % 12;
  const name = (PREFER_FLAT[wrapped] ? FLAT_SPELLING : SHARP_SPELLING)[wrapped];
  return name.length > 1
    ? { letter: name[0], accidental: name[1] as "b" | "#" }
    : { letter: name[0] };
}

function transposeNote(
  letter: string,
  accidental: "b" | "#" | undefined,
  semitones: number,
): { letter: string; accidental?: "b" | "#" } {
  return spellPitchClass(pitchClassOf(letter, accidental) + semitones);
}

function transposeSlot(slot: ChordSlot, semitones: number): ChordSlot {
  if (slot.kind !== "chord") return slot;
  const root = transposeNote(slot.letter, slot.accidental, semitones);
  const bass = slot.bass ? transposeNote(slot.bass.letter, slot.bass.accidental, semitones) : undefined;
  return { ...slot, letter: root.letter, accidental: root.accidental, bass };
}

function transposeBar(bar: Bar, semitones: number): Bar {
  if (bar.content.kind !== "chords") {
    return bar.alternates ? { ...bar, alternates: bar.alternates.map((a) => transposeSlot(a, semitones) as ChordShape) } : bar;
  }
  return {
    ...bar,
    content: { kind: "chords", slots: bar.content.slots.map((s) => transposeSlot(s, semitones)) },
    ...(bar.alternates ? { alternates: bar.alternates.map((a) => transposeSlot(a, semitones) as ChordShape) } : {}),
  };
}

function parseKeyLabel(key: string): { letter: string; accidental?: "b" | "#"; rest: string } | null {
  const m = /^([A-G])([b#]?)(.*)$/.exec(key.trim());
  if (!m) return null;
  return { letter: m[1], accidental: (m[2] || undefined) as "b" | "#" | undefined, rest: m[3] };
}

/** Transposes a whole parsed chart — every chord root/bass, plus the printed key label — by a
    number of semitones, purely for display: returns a new `IRealSong`, never mutates or persists
    the original. `ChordCharts.tsx`'s "Transpose" control applies this to whichever song is
    currently shown; it's a device-local display preference, the same category as "bars per row",
    not something written back into the library. Wraps at the octave, since a chord symbol carries
    no octave of its own — +13 behaves the same as +1. `semitones: 0` returns `song` itself
    unchanged (no new object), so call sites can skip this entirely when nothing's transposed. */
export function transposeSong(song: IRealSong, semitones: number): IRealSong {
  const n = ((semitones % 12) + 12) % 12;
  if (n === 0) return song;
  const parsedKey = parseKeyLabel(song.key);
  const key = parsedKey
    ? (() => {
        const spelled = spellPitchClass(pitchClassOf(parsedKey.letter, parsedKey.accidental) + n);
        return `${spelled.letter}${spelled.accidental ?? ""}${parsedKey.rest}`;
      })()
    : song.key;
  return { ...song, key, bars: song.bars.map((bar) => transposeBar(bar, n)) };
}

/** The 12 pitch classes' canonical display names, spelled the same flats-except-F# way
    `transposeSong` itself respells with — what a "Transpose to" key picker (`ChordCharts.tsx`)
    offers as its options. */
export const KEY_NAMES: string[] = Array.from({ length: 12 }, (_, pc) => {
  const { letter, accidental } = spellPitchClass(pc);
  return `${letter}${accidental ?? ""}`;
});

/** The tonic pitch class of a chart's printed key label ("C", "Bb-", "F#7", ...), or `0` (C) if
    the label doesn't parse as one. Lets a key picker work out how many semitones away a chosen
    target key is from wherever the chart's own key currently sits. */
export function keyPitchClass(key: string): number {
  const parsed = parseKeyLabel(key);
  return parsed ? pitchClassOf(parsed.letter, parsed.accidental) : 0;
}

/** Parses a pasted iReal Pro playlist link (or the HTML it was embedded in) into songs this app
    can render. Throws a short, user-facing message on anything that doesn't look right. */
export function parseIrealPlaylist(input: string): IRealPlaylist {
  const cleaned = input.replace(/\s+/g, "");
  if (!cleaned.includes("irealb://")) {
    throw new Error(
      'That doesn\'t look like an iReal Pro playlist link — it should contain "irealb://".',
    );
  }

  let parsed;
  try {
    parsed = IrealReader(cleaned);
  } catch {
    throw new Error(
      "Couldn't read that link. Make sure the whole thing was copied.",
    );
  }
  if (!parsed || !Array.isArray(parsed.songs) || parsed.songs.length === 0) {
    throw new Error("No songs found in that link.");
  }

  const songs: IRealSong[] = parsed.songs
    .filter((song) => song && song.title)
    .map((song) => {
      const { bars, timeSignature } = tokenizeChart(song.music?.raw ?? "");
      return {
        title: song.title,
        composer: song.composer ?? "",
        style: song.style ?? "",
        key: song.key ?? "",
        timeSignature: timeSignature ?? { top: 4, bottom: 4 },
        bars,
      };
    });

  if (songs.length === 0) throw new Error("No songs found in that link.");
  return { name: parsed.name ?? "Imported playlist", songs };
}

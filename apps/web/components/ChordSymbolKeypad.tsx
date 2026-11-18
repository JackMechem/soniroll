"use client";

import { prettyQuality } from "@/lib/iRealPro";

/** The symbols that aren't obvious or easy to type (especially on a phone keyboard), inserted as
    the plain iReal-style text (`^`/`h`/`o`/`#`/`b`/... — every parser in this app reads that
    directly, no need to insert the pretty glyph itself), with the glyph shown on the key as a
    preview of how it'll end up formatted. Shared by Guess the Chord's answer field and the chord
    chart builder's bar editor — both are "type iReal-style chord shorthand into a text field"
    UIs, so this is the one keypad, not two drifting copies of the same ten buttons. */
export const SYMBOL_KEYS: { insert: string; caption: string; title: string }[] = [
  { insert: "-", caption: "minor", title: "Minor" },
  { insert: "^", caption: "maj7", title: "Major 7" },
  { insert: "o", caption: "dim", title: "Diminished" },
  { insert: "h", caption: "half-dim", title: "Half-diminished" },
  { insert: "+", caption: "aug", title: "Augmented" },
  { insert: "#", caption: "sharp", title: "Sharp" },
  { insert: "b", caption: "flat", title: "Flat" },
  { insert: "/", caption: "bass", title: "Slash (bass note)" },
  { insert: "sus", caption: "sus", title: "Suspended" },
  { insert: "add", caption: "add", title: "Add" },
];

/** A little Sibelius-keypad-style palette of chord-symbol buttons, laid out as a tidy fixed grid
    (rather than lettings the keys reflow loosely) to read as one small, deliberate panel the way
    a real numeric/symbol keypad does. Purely presentational — tapping a key calls `onInsert` with
    that key's plain text; inserting it at the right cursor position of whatever field is actually
    focused is the caller's own job, since that differs by caller (a single answer field for Guess
    the Chord, whichever bar is currently being typed into for the chart builder). Each key's own
    `onMouseDown` prevents the browser's default focus-shifting-to-the-button behavior, so tapping
    a key never visibly steals focus from the field it's inserting into. */
export default function ChordSymbolKeypad({
  onInsert,
  omit,
}: {
  onInsert: (text: string) => void;
  /** Keys (by their inserted text) to leave out, when the caller already has its own. */
  omit?: string[];
}) {
  return (
    <div
      role="group"
      aria-label="Chord symbol keypad"
      className="grid grid-cols-5 gap-1"
    >
      {SYMBOL_KEYS.filter((key) => !omit?.includes(key.insert)).map((key) => (
        <button
          key={key.insert}
          type="button"
          title={key.title}
          aria-label={key.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(key.insert)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-foreground/[0.05] px-2 py-1.5 hover:bg-surface-hover pointer-coarse:min-h-10"
        >
          <span className="text-base font-semibold leading-none">{prettyQuality(key.insert)}</span>
          <span className="text-[0.6rem] leading-none text-muted">{key.caption}</span>
        </button>
      ))}
    </div>
  );
}

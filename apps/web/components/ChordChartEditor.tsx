"use client";

import { useEffect, useRef, useState } from "react";
import {
  BADGE_SIZE,
  BAR_HEIGHT,
  BarContent,
  chordFont,
  chordSymbolFont,
  COL_WIDTH,
  PageFit,
  QUALITY_SIZE,
  Row,
} from "@/components/ChordChart";
import { layoutRows, type PlacedBar } from "@jam-practice/core/chartLayout";
import ChordSymbolKeypad from "@/components/ChordSymbolKeypad";
import NumberField from "@/components/NumberField";
import Select from "@/components/Select";
import { PageHeader } from "@/components/library/shared";
import { useLeaveGuard } from "@/components/library/useLeaveGuard";
import { PlusIcon, TrashIcon } from "@/components/tools";
import { encodeChartString } from "@/lib/chartString";
import { parseBarSlots, slotsToText, type Bar, type ChordSlot, type IRealSong } from "@/lib/iRealPro";

const STARTING_BARS = 4;
const BARS_PER_ROW = 4;

/** A thick bar plus two dots — the Bar-N toolbar's Start/End repeat toggle icon, built from plain
    CSS rather than a font glyph. Two SMuFL codepoints were tried here first: `repeatLeft`/
    `repeatRight` (the actual full engraved barline) turned out to be drawn ~2.5x a normal glyph's
    height — meant to span most of a 5-line staff, not sit in a small UI icon — so they overflowed
    the button regardless of padding; `leftRepeatSmall`/`rightRepeatSmall` (SMuFL's own compact,
    "within a bar" variants, correctly proportioned by their own bounding box) fit the button fine
    but, reported directly with a screenshot, didn't actually read as a recognizable repeat sign at
    this size — apparently correct metrics don't guarantee a legible result, and this sandbox has
    no way to render either one to check before shipping it. A hand-built icon sidesteps font
    rendering entirely: `bg-current` on both pieces means it automatically follows the button's own
    current text color (muted while off, `accent-foreground` once on) the same way the SMuFL
    glyphs did, and the bar+dots shape directly mirrors the real chart's own repeat-barline
    convention (`ChordChart.tsx`'s `RepeatDots` plus its thick border) instead of approximating it
    through an unfamiliar engraving glyph. */
function RepeatGlyph({ side }: { side: "left" | "right" }) {
  const bar = <span aria-hidden className="h-4 w-[3px] shrink-0 rounded-sm bg-current" />;
  const dots = (
    <span aria-hidden className="flex shrink-0 flex-col gap-[3px]">
      <span className="h-[3px] w-[3px] rounded-full bg-current" />
      <span className="h-[3px] w-[3px] rounded-full bg-current" />
    </span>
  );
  return (
    <span className="flex items-center gap-1">
      {side === "left" ? (
        <>
          {bar}
          {dots}
        </>
      ) : (
        <>
          {dots}
          {bar}
        </>
      )}
    </span>
  );
}

type EditableBar = {
  text: string;
  /** Whether this bar starts a section at all — separate from `section` itself (the typed label)
      so clicking "Add section" can force the row break *immediately*, before any text has been
      typed, which is what actually makes "type the section name right where it'll appear" work:
      the bar needs to already be the first bar of its own row (see `toRealBar`'s own `newRow`)
      before the inline editor meant to sit in that position has anywhere correct to sit. */
  hasSection: boolean;
  section: string;
  startRepeat: boolean;
  endRepeat: boolean;
  coda: boolean;
  /** The "%" mark — repeats the previous bar's chord instead of whatever's typed here. */
  isRepeatBar: boolean;
  /** Everything else an existing (usually imported) chart's bar carries that this builder has no
      control for — cell layout, endings, segno, directions, time changes, alternates, barline
      styles, the 2-bar repeat — carried through untouched so editing a chart never loses it. */
  extra?: Omit<Bar, "content" | "section" | "newRow" | "startRepeat" | "endRepeat" | "coda">;
  doubleRepeat?: boolean;
  /** An imported bar's chords as parsed, kept while `text` is untouched (the text form can't
      carry small chords), so an unedited bar saves back exactly as it was. */
  original?: { text: string; slots: ChordSlot[] };
};

function blankBar(): EditableBar {
  return {
    text: "",
    hasSection: false,
    section: "",
    startRepeat: false,
    endRepeat: false,
    coda: false,
    isRepeatBar: false,
  };
}

/** The inverse of `toRealBar` — loads an existing chart's bar for editing. */
function fromRealBar(bar: Bar): EditableBar {
  const { content, section, startRepeat, endRepeat, coda, ...extra } = bar;
  delete extra.newRow; // re-derived on save
  const text = content.kind === "chords" ? slotsToText(content.slots) : "";
  return {
    text,
    hasSection: section !== undefined,
    section: section ?? "",
    startRepeat: !!startRepeat,
    endRepeat: !!endRepeat,
    coda: !!coda,
    isRepeatBar: content.kind === "repeat",
    extra,
    doubleRepeat: content.kind === "repeat" && !!content.double,
    ...(content.kind === "chords" ? { original: { text, slots: content.slots } } : {}),
  };
}

/** The exact same `Bar` shape every pasted iReal chart already produces — this is what finally
    gives the from-scratch builder access to the same section/repeat/coda fields `ChordChart.tsx`
    could always *render*, just with nothing in this app able to *write* them until now. A bar
    with `hasSection` forces `newRow` (the same thing a real `*A`/`*B` section token does when
    parsing an iReal chart — see `lib/iRealPro.ts`'s own `tokenizeChart`), so adding one always
    starts a fresh row here too, the same as it would in a real chart — even before any section
    text has actually been typed, which is what lets the inline section editor (below) always find
    itself in the right spot the instant it's added. */
function toRealBar(eb: EditableBar): Bar {
  const bar: Bar = {
    ...eb.extra,
    content: eb.isRepeatBar
      ? { kind: "repeat", ...(eb.doubleRepeat ? { double: true } : {}) }
      : { kind: "chords", slots: eb.original && eb.original.text === eb.text ? eb.original.slots : parseBarSlots(eb.text) },
  };
  if (eb.hasSection) {
    bar.section = eb.section.trim();
    // A builder-made bar starts a new line at a section; an imported bar's line comes from its cells.
    if (bar.cells === undefined) bar.newRow = true;
  }
  if (eb.startRepeat) bar.startRepeat = true;
  if (eb.endRepeat) bar.endRepeat = true;
  if (eb.coda) bar.coda = true;
  return bar;
}

/** A from-scratch chord chart builder, taking up the whole Chord Charts page while it's open
    (`ChordCharts.tsx` swaps its normal library+chart view out for this entirely, rather than
    showing it as a popup over them) rather than a small modal. Typing happens directly on the
    chart itself: the bar grid below is built from `ChordChart.tsx`'s own `Row`/`BarCell` — the
    *exact* components the real chart renders with, reused wholesale via three small additions
    those take just for this (`renderBarContent`, `renderSection`, `trailing` — see their own
    comments in `ChordChart.tsx`) rather than a second approximation of them — so sections, repeat
    barlines, codas, and the fixed 4-bars-per-row layout all look and behave *exactly* like a real
    rendered chart, because they're drawn by the same code that draws one. The one bar currently
    being typed into shows a plain-text `<input>` (raw shorthand, not auto-converted into pretty
    symbols mid-keystroke, same reasoning as every other typed-text field in this app); every
    other bar renders through the real `BarContent`, wrapped in a button only so clicking it
    activates that bar. A section label works the same way: "Add section" (in the Bar N toolbar,
    below) marks the active bar as a section start immediately (so it becomes the first bar of its
    own row right away), and an `<input>` appears *in the badge's own spot on the chart* — not a
    separate form field — for typing the actual name right where it'll be read. Start/end repeat,
    coda, and the "%" repeat-bar mark live in that same toolbar alongside Section, together with
    the chord-symbol keypad in one combined panel below the grid (not two separate ones) — there's
    no room for five extra per-cell toggles inside a single `COL_WIDTH`-wide bar, so none of this
    is on the cells themselves. A song built here can be saved straight into the library (the same
    `importSongs` "Import a playlist" itself calls, in a playlist named after the chart's own
    title) or exported as a `soniroll://` chart link (`lib/chartString.ts`) to share or re-import
    elsewhere. */
const NO_PLAYLIST = "\u0000none";

/** A bar with nothing in it at all: no chords, no "%", no marks, nothing carried from an import. */
function isBlankBar(eb: EditableBar) {
  return (
    !eb.text.trim() &&
    !eb.isRepeatBar &&
    !eb.hasSection &&
    !eb.startRepeat &&
    !eb.endRepeat &&
    !eb.coda &&
    !(eb.extra && Object.keys(eb.extra).length > 0)
  );
}

/** The chart the editor's fields describe. Empty bars at the end are left off (Enter after the
    last bar adds one, ready to type into), keeping at least one bar. */
function songOf(f: { title: string; composer: string; style: string; key: string; top: number; bottom: number; bars: EditableBar[] }): IRealSong {
  return {
    title: f.title.trim(),
    composer: f.composer.trim(),
    style: f.style.trim(),
    key: f.key.trim(),
    timeSignature: { top: f.top, bottom: f.bottom },
    bars: trimTrailingBlank(f.bars).map(toRealBar),
  };
}

function trimTrailingBlank(bars: EditableBar[]) {
  let end = bars.length;
  while (end > 1 && isBlankBar(bars[end - 1])) end--;
  return end === bars.length ? bars : bars.slice(0, end);
}

export default function ChordChartEditor({
  initial,
  prefill,
  playlists = [],
  defaultPlaylist,
  onSave,
  onClose,
}: {
  /** Edit this existing chart (saved back in place) instead of building a new one. */
  initial?: IRealSong;
  /** A new chart's starting title, key and time (written from a tune's page). */
  prefill?: { title?: string; key?: string; timeSignature?: { top: number; bottom: number } };
  /** Existing playlist names — a new chart can go in one, a new one named here, or none (All
      charts only). */
  playlists?: string[];
  defaultPlaylist?: string;
  /** `playlistName` null = no playlist. */
  onSave: (song: IRealSong, playlistName: string | null) => Promise<unknown>;
  onClose: () => void;
}) {
  const editing = !!initial;
  const [start] = useState(() => ({
    title: initial?.title ?? prefill?.title ?? "",
    composer: initial?.composer ?? "",
    style: initial?.style ?? "",
    key: initial?.key ?? prefill?.key ?? "",
    top: initial?.timeSignature.top ?? prefill?.timeSignature?.top ?? 4,
    bottom: initial?.timeSignature.bottom ?? prefill?.timeSignature?.bottom ?? 4,
    bars: initial && initial.bars.length > 0 ? initial.bars.map(fromRealBar) : Array.from({ length: STARTING_BARS }, blankBar),
  }));
  const [title, setTitle] = useState(start.title);
  const [composer, setComposer] = useState(start.composer);
  const [style, setStyle] = useState(start.style);
  const [key, setKey] = useState(start.key);
  const [top, setTop] = useState(start.top);
  const [bottom, setBottom] = useState(start.bottom);
  const [bars, setBars] = useState<EditableBar[]>(start.bars);
  // What the chart looked like when the editor opened — anything else is unsaved work.
  const [baseline] = useState(() => JSON.stringify(songOf(start)));
  // "" = a new playlist, named in `newPlaylist`; NO_PLAYLIST = All charts only.
  const [playlist, setPlaylist] = useState(defaultPlaylist ?? NO_PLAYLIST);
  const [newPlaylist, setNewPlaylist] = useState("");

  // Which bar is currently "open" for typing — see the same field's own comment in the previous
  // version of this file (still accurate): always a valid index, never `null`, persists once set.
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndexRef = useRef<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saving or exporting without a title: the message sits under the Title field, which gets
  // focus and a red ring (rather than a line by the Save button, far from the field).
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const song: IRealSong = songOf({ title, composer, style, key, top, bottom, bars });
  const dirty = JSON.stringify(song) !== baseline;
  // Close, Escape, browser Back and links elsewhere ask first when something changed.
  const guard = useLeaveGuard(dirty, editing ? "Your changes to this chart haven't been saved." : "This chart hasn't been saved yet.", onClose);
  const closeRef = useRef(() => {});
  useEffect(() => {
    closeRef.current = () => guard.requestLeave(onClose);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const i = focusIndexRef.current;
    if (i === null) return;
    focusIndexRef.current = null;
    inputRefs.current[i]?.focus();
  }, [activeIndex, bars.length]);

  function updateBar(index: number, patch: Partial<EditableBar>) {
    setBars((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function activateBar(index: number) {
    focusIndexRef.current = index;
    setActiveIndex(index);
  }

  function addBar() {
    const newIndex = bars.length;
    focusIndexRef.current = newIndex;
    setActiveIndex(newIndex);
    setBars((prev) => [...prev, blankBar()]);
  }

  function removeBar(index: number) {
    if (bars.length <= 1) return;
    const next = bars.filter((_, i) => i !== index);
    setBars(next);
    setActiveIndex((i) => (index < i ? Math.min(i - 1, next.length - 1) : Math.min(i, next.length - 1)));
  }

  function handleBarKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (index === bars.length - 1) addBar();
      else activateBar(index + 1);
    } else if (e.key === "Escape") {
      // Deliberately doesn't bubble up to this view's own Escape-closes-the-builder handler —
      // it only blurs the current bar, since losing an entire typed-out chart because Escape was
      // meant to back out of one bar's edit would be a bad trade.
      e.stopPropagation();
      e.currentTarget.blur();
    }
  }

  /** Inserts a keypad key's text at the active bar's current cursor position — identical logic to
      Guess the Chord's own `insertSymbol`, just targeting whichever bar is currently active. */
  function insertSymbol(text: string) {
    const el = inputRefs.current[activeIndex];
    const current = bars[activeIndex]?.text ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + text + current.slice(end);
    updateBar(activeIndex, { text: next });
    const pos = start + text.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function flagMissingTitle(message: string) {
    setError(null);
    setTitleError(message);
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function handleSave() {
    if (!song.title) {
      flagMissingTitle("Give this chord chart a title.");
      return;
    }
    const playlistName = editing || playlist === NO_PLAYLIST ? null : playlist || newPlaylist.trim();
    if (!editing && playlist === "" && !playlistName) {
      setError("Name the new folder, or pick another option.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(song, playlistName);
      guard.leave(onClose);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that chord chart.");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    if (!song.title) {
      flagMissingTitle("Give this chord chart a title first.");
      return;
    }
    setError(null);
    setCopied(false);
    setExported(encodeChartString({ name: song.title, songs: [song] }));
  }

  async function handleCopy() {
    if (!exported) return;
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
    } catch {
      // Clipboard permission denied or unavailable — the text is still visible and selectable
      // by hand in the textarea below, so this isn't a dead end, just a smaller convenience lost.
    }
  }

  const realBars = bars.map(toRealBar);
  const rows = layoutRows(realBars, BARS_PER_ROW);
  const rowsWithOffsets = rows.reduce<{ placed: PlacedBar[]; start: number }[]>((acc, placed) => {
    const prev = acc[acc.length - 1];
    const start = prev ? prev.start + prev.placed.length : 0;
    return [...acc, { placed, start }];
  }, []);
  const lastRow = rowsWithOffsets[rowsWithOffsets.length - 1];
  const lastPlaced = lastRow?.placed[lastRow.placed.length - 1];
  // Cells used on the last line (16 per line, a builder bar is 4) — the "Add bar" button takes
  // the next 4 if there's room.
  const lastRowCells = lastPlaced ? lastPlaced.start + lastPlaced.cells : 0;
  const addButtonFitsInGrid = lastRow !== undefined && lastRowCells <= 12;

  const activeBar = bars[activeIndex];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <PageHeader title={editing ? `Edit "${initial?.title}"` : "Create a chord chart"} back={() => guard.requestLeave(onClose)} />

      <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface p-4 sm:grid-cols-2">
        {!editing && (
          <div className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-muted">Folder</span>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={playlist}
                onChange={setPlaylist}
                options={[
                  { value: NO_PLAYLIST, label: "No folder (All charts only)" },
                  ...playlists.map((name) => ({ value: name, label: name })),
                  { value: "", label: "New folder…" },
                ]}
                className="min-w-0 max-w-full"
              />
              {playlist === "" && (
                <input
                  value={newPlaylist}
                  onChange={(e) => setNewPlaylist(e.target.value)}
                  placeholder="New folder name"
                  className="min-w-0 flex-1 h-9 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
                />
              )}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Title</span>
          <input
            ref={titleRef}
            autoFocus={!editing}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) setTitleError(null);
            }}
            placeholder="Tune name"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "chart-title-error" : undefined}
            className={`h-9 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 sm:text-sm ${
              titleError ? "ring-2 ring-danger/60 focus:ring-danger/60" : "focus:ring-accent/40"
            }`}
          />
          {titleError && (
            <span id="chart-title-error" className="text-xs text-danger">
              {titleError}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Composer</span>
          <input
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Optional"
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Style</span>
          <input
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Optional — e.g. Medium Swing"
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
          />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Key &amp; time signature</span>
          {/* The time signature's two number fields take digits only (a letter typed there would
              just sit in red). */}
          <div
            className="flex items-center gap-2"
            onBeforeInput={(e) => {
              if ((e.target as HTMLInputElement).inputMode === "numeric" && /\D/.test(e.data ?? "")) e.preventDefault();
            }}
          >
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Key — e.g. Bb"
              className="min-w-0 flex-1 h-9 rounded-md bg-foreground/[0.05] px-3 text-base outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            />
            <NumberField
              label="Beats per bar"
              value={top}
              min={1}
              max={32}
              onChange={setTop}
              className="h-9 w-14 rounded-md bg-foreground/[0.05] px-2 text-center text-base tabular-nums outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            />
            <span className="text-muted">/</span>
            <NumberField
              label="Beat unit"
              value={bottom}
              min={1}
              max={32}
              onChange={setBottom}
              className="h-9 w-14 rounded-md bg-foreground/[0.05] px-2 text-center text-base tabular-nums outline-none focus:ring-2 focus:ring-accent/40 sm:text-sm"
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">
        <span className="pointer-coarse:hidden">Click</span>
        <span className="hidden pointer-coarse:inline">Tap</span> a bar to type its chords — <code>C^7</code>, <code>F-7</code>, <code>Bb7#5/D</code>,{" "}
        <code>NC</code> for no chord, or two chords separated by a space. Press Enter to move to
        the next bar. Use the row below to give the active bar a section, a repeat barline, or a
        coda.
      </p>

      <PageFit fitHeight={false}>
        {rowsWithOffsets.map(({ placed, start }, rowIdx) => {
          const isLastRow = rowIdx === rowsWithOffsets.length - 1;
          return (
            <Row
              key={rowIdx}
              placed={placed}
              isFirstRow={rowIdx === 0}
              isLastRow={isLastRow}
              timeSignature={rowIdx === 0 ? { top, bottom } : undefined}
              renderBarContent={(bar, i) => {
                const globalIndex = start + i;
                if (globalIndex === activeIndex) {
                  return (
                    <input
                      ref={(el) => {
                        inputRefs.current[globalIndex] = el;
                      }}
                      value={bars[globalIndex].text}
                      onChange={(e) => updateBar(globalIndex, { text: e.target.value })}
                      onKeyDown={(e) => handleBarKeyDown(globalIndex, e)}
                      placeholder={bars[globalIndex].isRepeatBar ? "% (ignored while on)" : "Type a chord"}
                      // A plain, faint hint, so an empty bar never reads as one with a chord in it.
                      className={`w-full min-w-0 bg-transparent text-center outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted/60 ${
                        bars[globalIndex].isRepeatBar ? "opacity-40" : ""
                      } ${chordFont.className}`}
                      style={{ fontSize: QUALITY_SIZE }}
                    />
                  );
                }
                return (
                  <button
                    type="button"
                    onClick={() => activateBar(globalIndex)}
                    className="flex h-full w-full min-w-0 items-center justify-center"
                  >
                    <BarContent bar={bar} />
                  </button>
                );
              }}
              renderSection={(_bar, i) => {
                const globalIndex = start + i;
                if (globalIndex !== activeIndex || !bars[globalIndex].hasSection) return undefined;
                return (
                  <input
                    autoFocus
                    value={bars[globalIndex].section}
                    onChange={(e) => updateBar(globalIndex, { section: e.target.value })}
                    onBlur={() => {
                      if (!bars[globalIndex].section.trim()) updateBar(globalIndex, { hasSection: false });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        // Same reasoning as the chord input's own Escape handling — doesn't
                        // bubble up to the builder's Escape-closes-everything handler, it just
                        // confirms (or, if left blank, cancels) this one section label.
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Intro"
                    aria-label={`Bar ${globalIndex + 1} section`}
                    className="absolute left-0.5 top-0.5 h-[1.6em] min-w-[1.6em] max-w-[8rem] rounded bg-accent px-1 text-left font-semibold leading-none text-accent-foreground outline-none placeholder:text-accent-foreground/60"
                    // The HTML `size` attribute this used before is only a rough, per-browser
                    // approximation (historically based on the width of several "0" characters
                    // plus its own baked-in slack) — not nearly tight enough, which is exactly
                    // what left visibly extra background to the right of a short label like a
                    // single-letter "A". `ch` units size against the current font's own "0"
                    // character width directly, so this tracks the actual typed length far more
                    // precisely; `+ 1rem` covers the `px-1` padding on each side plus a little
                    // slack for bold glyphs that render wider than a plain "0" does.
                    style={{
                      fontSize: BADGE_SIZE,
                      width: `calc(${Math.max(bars[globalIndex].section.length, 1)}ch + 1rem)`,
                    }}
                  />
                );
              }}
              trailing={
                isLastRow && addButtonFitsInGrid ? (
                  <AddBarButton column={lastRowCells + 1} onClick={addBar} />
                ) : undefined
              }
            />
          );
        })}
      </PageFit>
      {!addButtonFitsInGrid && (
        <button
          type="button"
          onClick={addBar}
          className="flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
        >
          <PlusIcon className="h-4 w-4" />
          Add bar
        </button>
      )}

      {activeBar && (
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted">Bar {activeIndex + 1}</span>
            {activeBar.hasSection ? (
              <BarToggle
                label="Remove section"
                active
                onClick={() => updateBar(activeIndex, { hasSection: false, section: "" })}
              />
            ) : (
              <BarToggle
                label="Add section"
                active={false}
                onClick={() => updateBar(activeIndex, { hasSection: true })}
              />
            )}
            <span aria-hidden className="h-5 w-px shrink-0 bg-foreground/10" />
            <BarToggle
              label="Start repeat"
              active={activeBar.startRepeat}
              onClick={() => updateBar(activeIndex, { startRepeat: !activeBar.startRepeat })}
              glyph={<RepeatGlyph side="left" />}
            />
            <BarToggle
              label="End repeat"
              active={activeBar.endRepeat}
              onClick={() => updateBar(activeIndex, { endRepeat: !activeBar.endRepeat })}
              glyph={<RepeatGlyph side="right" />}
            />
            <BarToggle
              label="Coda"
              active={activeBar.coda}
              onClick={() => updateBar(activeIndex, { coda: !activeBar.coda })}
              glyph=""
            />
            <BarToggle
              label="Repeat bar (%)"
              active={activeBar.isRepeatBar}
              onClick={() => updateBar(activeIndex, { isRepeatBar: !activeBar.isRepeatBar })}
              glyph=""
            />
            <button
              type="button"
              onClick={() => removeBar(activeIndex)}
              disabled={bars.length <= 1}
              aria-label={`Remove bar ${activeIndex + 1}`}
              className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-30"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Remove bar
            </button>
          </div>
          <ChordSymbolKeypad onInsert={insertSymbol} />
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {exported && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted">Chart link</span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-md bg-foreground/[0.05] px-3 py-1 text-xs font-medium hover:bg-surface-hover"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            readOnly
            value={exported}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-y rounded-md bg-background p-2 text-left font-mono text-xs outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-foreground/10 pt-4">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex h-9 items-center rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover"
        >
          Export as chart link
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Save to library"}
        </button>
      </div>
      {guard.dialog}
    </div>
  );
}

/** Sits in the grid column right after the last bar of the last row — only rendered when that row
    has room left in it (`ChordChartEditor`'s own `addButtonFitsInGrid`); a full last row instead
    gets a plain "Add bar" button below the whole grid. */
function AddBarButton({ column, onClick }: { column: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add bar"
      title="Add bar"
      className="flex items-center justify-center text-muted hover:text-foreground"
      style={{ gridColumn: `${column} / span 4`, height: BAR_HEIGHT, width: COL_WIDTH }}
    >
      <PlusIcon className="h-5 w-5" />
    </button>
  );
}

/** One toggle in the active bar's options row. With a `glyph` (Start/End repeat, Coda, the "%"
    mark), it's styled to match `ChordSymbolKeypad`'s own keys exactly, per a direct follow-up
    naming that specifically — same stacked glyph-over-caption shape, not the single-line pill an
    earlier round used for these four (which itself was a fix for an even earlier mismatch: giving
    *only* these four the keypad's taller shape while "Add/Remove section" stayed a single-line
    pill read as visually inconsistent — now resolved the other way, toward the keypad's look
    specifically, per this explicit request rather than toward uniformity for its own sake).
    Without a `glyph` ("Add/Remove section," which has no symbol of its own to preview), it stays
    the plain single-line pill, since "styled like the keypad" was never asked of that one. */
function BarToggle({
  label,
  active,
  onClick,
  glyph,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** A SMuFL codepoint (rendered through `chordSymbolFont`, same as the real chart's own symbols —
      Coda and the "%" mark both pass one of these) or a fully custom node (Start/End repeat's own
      `RepeatGlyph`, a hand-built CSS icon rather than a font glyph — see that component's own
      comment for why). Either way, switches the button to the stacked glyph-over-caption shape
      `ChordSymbolKeypad`'s own keys use. */
  glyph?: string | React.ReactNode;
}) {
  if (glyph) {
    // Styled to match `ChordSymbolKeypad`'s own keys exactly — same layout, padding, and caption
    // sizing. One deliberate deviation: the keypad's keys are plain one-shot "insert" actions with
    // no state of their own, so their caption is always `text-muted`; these four are actual on/off
    // toggles, and `text-muted`'s own grey reads poorly against the accent-colored background an
    // active toggle gets (checked the real color values, not guessed) — so the caption only stays
    // `text-muted` while off, and inherits the button's own `text-accent-foreground` once on
    // instead.
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={label}
        className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 transition-colors ${
          active ? "border-transparent bg-accent text-accent-foreground" : "border-foreground/15 hover:bg-surface-hover"
        }`}
      >
        <span className="flex h-4 items-center justify-center">
          {typeof glyph === "string" ? (
            <span className={`text-base font-semibold leading-none ${chordSymbolFont.className}`}>{glyph}</span>
          ) : (
            glyph
          )}
        </span>
        <span className={`text-xs leading-none ${active ? "" : "text-muted"}`}>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-transparent bg-accent text-accent-foreground"
          : "border-foreground/15 text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

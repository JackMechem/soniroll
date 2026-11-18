"use client";

import { useLayoutEffect, useRef, useState } from "react";
import localFont from "next/font/local";
import {
  formatComposer,
  prettyQuality,
  type Bar,
  type ChordSlot,
  type IRealSong,
} from "@/lib/iRealPro";
import { CELLS_PER_ROW, layoutRows, type PlacedBar } from "@jam-practice/core/chartLayout";

// The reference for this chart's look started as Finale's "Jazz Text" — a thin, plain jazz-chart
// serif bundled with Finale (MakeMusic's notation software), not something available for web use —
// approximated for a while with EB Garamond, then briefly with lilyjazz-text (the hand-written
// text face from the LilyJAZZ font family), before landing here: Petaluma, the SMuFL-compliant
// notation font family Steinberg built for Dorico. Two of its three faces are used together —
// `PetalumaScript` (a genuinely hand-inked-looking text face — root letters, digits, and most of
// the quality suffix) for everything `lilyjazz-text` was doing, plus `Petaluma` itself (the
// engraving/symbol face) for exactly two characters neither `PetalumaScript` nor any plain-text
// font actually has a real glyph for: a proper major-seventh triangle and a proper diminished
// circle. Unlike Δ/° set in an ordinary font (lilyjazz-text's own gap, and EB Garamond's before
// it), SMuFL fonts ship dedicated "chord symbol" glyphs purpose-built for exactly this — real
// engraved jazz-chord marks, not Greek/math characters standing in for them — at their own
// Private-Use-Area codepoints (`csymMajorSeventh` U+E873, `csymDiminished` U+E870; see
// `QualityText` below). `PetalumaScript` already covers ♯/♭/ø directly at their normal Unicode
// codepoints (confirmed by checking its actual cmap, not assumed), so `prettyQuality`'s existing
// Δ/ø/°/♯/♭ substitution is untouched and still shared with Guess the Chord — only Δ and ° get
// intercepted and re-rendered through the second face here, and only in this file. Licensed under
// the SIL Open Font License 1.1, copyright Steinberg Media Technologies GmbH
// (`components/fonts/petaluma/OFL.txt`), which permits exactly this bundling as long as the
// license text travels with it and the reserved name "Petaluma" isn't reused for a modified
// version; see `/credits` for the on-site attribution. Self-hosted via `next/font/local`
// (colocated next to this component, not under `public/`, per Next's own recommended colocation
// pattern) rather than `next/font/google`, since neither face is a Google Fonts entry. Both are
// single static OTF faces, so neither needs a `weight`/`style` declared. Loaded here, not the
// site-wide font list in app/fonts.ts, since it's specific to this one chart display.
//
// `PetalumaScript` reads as noticeably lighter-weight than lilyjazz-text on paper (thinner stroke
// contrast is part of its own design, not a CSS adjustment) — the family ships only this one
// weight of it, though, so there's no lighter cut to switch to if it still reads too heavy once
// actually seen rendered; a non-variable OTF's stroke weight can't be thinned further through CSS
// `font-weight` the way a variable font's could.
export const chordFont = localFont({ src: "./fonts/petaluma/PetalumaScript.otf" });
// Only ever used for the two SMuFL chord-symbol glyphs `QualityText` substitutes in — never applied
// to a whole chord label the way `chordFont` is.
export const chordSymbolFont = localFont({ src: "./fonts/petaluma/Petaluma.otf" });

// The two `prettyQuality` substitution glyphs `PetalumaScript` doesn't have real glyphs for,
// mapped to `Petaluma`'s own SMuFL "chord symbols" glyphs instead of falling back to whatever
// other font happens to be installed. ♯/♭/ø aren't here because `PetalumaScript` already covers
// those three directly — only Δ (major 7) and ° (diminished) need the second face.
export const SMUFL_CHORD_GLYPH: Record<string, string> = {
  "Δ": "", // csymMajorSeventh
  "°": "", // csymDiminished
};

/** `prettyQuality(quality)`, with `Δ`/`°` re-rendered through `chordSymbolFont`'s real SMuFL
    glyphs instead of left in `chordFont` (which has no glyph for either, and would otherwise fall
    back to the browser's own default font, the same way `lib/chords.ts`'s reuse of
    `prettyQuality` for Guess the Chord already does and is expected to — that call site isn't set
    in either Petaluma face, so it's untouched). Splits the string into individual characters
    rather than one `replace()` pass so each can carry its own font — the common case (no
    substitution needed at all) is still just the plain characters with no extra markup. */
function QualityText({ quality }: { quality: string }) {
  return (
    <>
      {[...prettyQuality(quality)].map((ch, i) => {
        const glyph = SMUFL_CHORD_GLYPH[ch];
        return glyph ? (
          <span key={i} className={chordSymbolFont.className}>
            {glyph}
          </span>
        ) : (
          ch
        );
      })}
    </>
  );
}

// Natural (unscaled) sizes. Unlike the previous container-query (`cqw`) scheme — which only ever
// solved *horizontal* fit, so a long chart (many rows) still just ran taller than its container
// and had to scroll — everything below renders at one fixed size, and the whole chart is then
// measured and uniformly scaled to fit inside a single page-shaped box (`PageFit`), however many
// rows it takes. That's what actually answers "the whole chart, regardless of length, should fit
// without scrolling."
export const COL_WIDTH = "7.5rem";
export const BAR_HEIGHT = "5.25rem";
const ROOT_SIZE = "2.25rem";
const ROOT_ACCIDENTAL_SIZE = "1.1rem";
export const QUALITY_SIZE = "1.4rem";
const BASS_SIZE = "1.1rem";
const REPEAT_SIZE = "1.75rem";
const SYMBOL_SIZE = "1.1rem";
const SMALL_LABEL_SIZE = "0.8rem";
export const BADGE_SIZE = "0.75rem";
const TIME_SIG_SIZE = "1.75rem";

// A short chart is allowed to scale *up* past its natural size to better fill the page (a 4-bar
// tune at 1:1 would otherwise sit tiny in a sea of blank space) — capped well short of comically
// large.
const MAX_SCALE = 1.6;

/** Renders one song's chord chart. Two different fit strategies, depending on context:

    - Normal (in-page): the chart always renders at *full container width* — never narrower —
      and grows however tall it needs to (`PageFit`'s `fitHeight={false}` mode). This replaced an
      earlier version that locked the page to a fixed `aspect-[8.5/11]` box: for a long chart
      (many rows), that fixed ratio made *height* the binding constraint on how much the whole
      thing could be scaled up, which then shrank the *width* right along with it — a long chart
      on a narrow phone ended up rendered at a fraction of the screen's actual width, with wasted
      margin on both sides, exactly the bug a direct follow-up reported ("long charts do this on
      mobile... the width should match the width of the screen"). Decoupling the two fixes it:
      width is always 100%, and the page simply grows taller for a longer chart (normal page
      scroll below it, if any, same as any other tall page content — not the chart *itself*
      needing an internal scrollbar, which is what was actually promised earlier).
    - `fullscreen` (`ChordCharts.tsx`'s "maximize" toggle, `PageFit`'s `fitHeight={true}` mode):
      here there genuinely is a fixed box (the full-screen overlay) with no "page below" to grow
      into, so this mode keeps fitting *both* dimensions at once, exactly as before — the chart
      still always fits with no scrolling, just inside whatever the screen's actual shape is
      rather than a paper ratio. */
export default function ChordChart({
  song,
  barsPerRow = 4,
  fullscreen = false,
  hideHeader = false,
  activeBar = null,
  scroll = false,
}: {
  song: IRealSong;
  /** Narrower than the chart: keep it full size and scroll sideways instead of shrinking it. */
  scroll?: boolean;
  barsPerRow?: number;
  fullscreen?: boolean;
  /** Index into `song.bars` of the bar being played right now (Bass Genius) — highlighted. */
  activeBar?: number | null;
  /** Skip the title/style/composer block — for a page that already shows them (a tune's page). */
  hideHeader?: boolean;
}) {
  const rows = layoutRows(song.bars, barsPerRow);
  const active = activeBar !== null ? (song.bars[activeBar] ?? null) : null;

  return (
    <div
      className={`flex flex-col gap-4 text-left ${
        fullscreen ? "h-full w-full" : "mx-auto w-full max-w-2xl"
      }`}
    >
      {!hideHeader && (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-background pb-3">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            {song.title}
          </h2>
          <p className="text-sm text-muted sm:text-base">
            {song.style}
            {song.style && " · "}
            {song.key} · {song.timeSignature.top}/{song.timeSignature.bottom}
          </p>
          {/* Maximized, the composer moves down here (left-aligned, under the title) instead of
              flush right — the fullscreen "minimize" button sits top-right, and a long composer
              name flush right collided with it. */}
          {fullscreen && song.composer && (
            <p className="text-sm text-muted sm:text-base">
              {formatComposer(song.composer)}
            </p>
          )}
        </div>
        {!fullscreen && song.composer && (
          <p className="shrink-0 text-sm text-muted sm:text-base">
            {formatComposer(song.composer)}
          </p>
        )}
      </div>
      )}

      {song.bars.length === 0 ? (
        <p className="text-sm text-muted">No chords found in this chart.</p>
      ) : fullscreen ? (
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-background">
          <PageFit fitHeight>
            {rows.map((row, i) => (
              <Row
                key={i}
                placed={row}
                isFirstRow={i === 0}
                isLastRow={i === rows.length - 1}
                timeSignature={i === 0 ? song.timeSignature : undefined}
                activeBar={active}
              />
            ))}
          </PageFit>
        </div>
      ) : (
        <PageFit fitHeight={false} scroll={scroll}>
          {rows.map((row, i) => (
            <Row
              key={i}
              placed={row}
              isFirstRow={i === 0}
              isLastRow={i === rows.length - 1}
              timeSignature={i === 0 ? song.timeSignature : undefined}
              activeBar={active}
            />
          ))}
        </PageFit>
      )}
    </div>
  );
}

/** Measures its children at their natural (unscaled) size and applies one uniform
    `transform: scale()` so the whole thing — not just one row or one bar — always fits. The same
    "measure, then scale to fit" idea `FitChordRow` below uses for one bar's chord row, applied to
    the entire chart. Two modes (see `ChordChart`'s own comment for why both exist):

    - `fitHeight={true}`: fits *both* width and height inside a fixed box (an ancestor with a real
      size, e.g. the full-screen overlay) — the original behavior, content centered within
      whatever space is left over in the non-binding dimension.
    - `fitHeight={false}`: fits *width only* (always scales to exactly fill the available width,
      up to `MAX_SCALE`) and reports the resulting *height* back onto its own box, so the chart is
      never narrower than its container just because it happens to be tall. Horizontally centered
      (`left-1/2` + `translateX(-50%)`, the same technique `fitHeight={true}` already uses for its
      own centering, just without the vertical half) rather than left-anchored, so hitting the
      `MAX_SCALE` cap in a container wide enough to need it — the common case for
      `ChordChartEditor.tsx`'s own, wider page, rare for the real chart's own `max-w-2xl`-capped
      container — doesn't leave the result sitting flush left with empty space stranded on the
      right.

    Exported for `ChordChartEditor.tsx`'s own bar grid (`fitHeight={false}`, the same mode the
    normal in-page chart view uses) — its bars are fixed-size regardless of which one is currently
    an `<input>`, so the scale factor stays stable while typing; a `transform: scale()` doesn't
    interfere with clicking into or typing in a scaled `<input>` (the browser maps click
    coordinates through the transform correctly on its own). */
export function PageFit({
  children,
  fitHeight,
  scroll = false,
}: {
  children: React.ReactNode;
  fitHeight: boolean;
  scroll?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const recompute = () => {
      const availW = box.clientWidth;
      const natW = content.scrollWidth;
      const natH = content.scrollHeight;
      if (availW <= 0 || natW <= 0 || natH <= 0) return;
      if (fitHeight) {
        const availH = box.clientHeight;
        if (availH <= 0) return;
        setScale(Math.min(MAX_SCALE, availW / natW, availH / natH));
      } else {
        // Scroll mode: never smaller than natural size — wider than the box scrolls sideways.
        const s = scroll ? Math.max(1, Math.min(MAX_SCALE, availW / natW)) : Math.min(MAX_SCALE, availW / natW);
        setScale(s);
        setContentHeight(natH * s);
        setOverflowing(natW * s > availW + 1);
      }
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, [fitHeight, scroll]);

  if (fitHeight) {
    return (
      <div ref={boxRef} className="absolute inset-x-1 inset-y-4 sm:inset-6">
        <div
          ref={contentRef}
          className="absolute left-1/2 top-1/2 inline-flex flex-col items-start gap-4"
          style={{ transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (overflowing) {
    // Wider than the box (scroll mode on a narrow screen): full size, swiped sideways.
    return (
      <div ref={boxRef} className="relative w-full overflow-x-auto overscroll-x-contain rounded-xl bg-background">
        <div ref={contentRef} className="inline-flex flex-col items-start gap-3 p-3" style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-xl bg-background"
      style={{ height: contentHeight ?? undefined }}
    >
      <div
        ref={contentRef}
        className="absolute left-1/2 top-0 inline-flex flex-col items-start gap-3 p-3"
        style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}

/** One cell of iReal's 16-cells-per-line grid; a normal bar is 4 cells (= `COL_WIDTH`). */
const CELL_REM = 1.875;
const CELL_WIDTH = `${CELL_REM}rem`;

/** Which bars share a line — `layoutRows` (`@jam-practice/core/chartLayout`) without the positions.
    Imported charts are laid out on iReal's 16-cell grid (a line can hold 8 narrow bars, a 2nd
    ending can start partway across); builder-made bars are `barsPerRow` to a line as before. */
export function groupRows(bars: Bar[], barsPerRow: number): Bar[][] {
  return layoutRows(bars, barsPerRow).map((row) => row.map((p) => p.bar));
}

/** Runs of bars under the same numbered-ending bracket, within one line, in cell units. */
function endingSpans(placed: PlacedBar[]): { label: string; start: number; span: number }[] {
  const spans: { label: string; start: number; span: number }[] = [];
  let i = 0;
  while (i < placed.length) {
    const label = placed[i].bar.endingLabel;
    if (!label) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < placed.length && placed[j].bar.endingLabel === label && (j === i || !placed[j].bar.endingStart)) j += 1;
    const last = placed[j - 1];
    spans.push({ label, start: placed[i].start, span: last.start + last.cells - placed[i].start });
    i = j;
  }
  return spans;
}

/** One line of the chart on a 16-column cell grid — each bar starts at its cell and spans its
    width (see `layoutRows`). Also used by `ChordChartEditor.tsx`: `renderBarContent` overrides
    what's inside one bar (its "being typed into" input), `renderSection` the section badge, and
    `trailing` is one more grid item after the line's bars (its "Add bar" button — give it a
    `gridColumn` in cell units). */
export function Row({
  placed,
  isFirstRow,
  isLastRow,
  timeSignature,
  renderBarContent,
  renderSection,
  trailing,
  activeBar = null,
}: {
  placed: PlacedBar[];
  /** The bar (by identity) to highlight as playing. */
  activeBar?: Bar | null;
  isFirstRow: boolean;
  isLastRow: boolean;
  /** The chart's own time signature, printed at its very first bar. */
  timeSignature?: { top: number; bottom: number };
  renderBarContent?: (bar: Bar, indexInRow: number) => React.ReactNode;
  /** Same idea as `renderBarContent`, for a bar's section badge. `undefined` keeps the badge. */
  renderSection?: (bar: Bar, indexInRow: number) => React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const spans = endingSpans(placed);
  const hasEndings = spans.length > 0;

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${CELLS_PER_ROW}, ${CELL_WIDTH})`,
        gridTemplateRows: hasEndings ? "1.5rem auto" : "auto",
      }}
    >
      {spans.map((s) => (
        <div
          key={s.start}
          className="relative mb-1 border-l-2 border-t-2 border-foreground/70 pl-1 font-semibold text-muted"
          style={{ gridColumn: `${s.start + 1} / span ${s.span}`, gridRow: 1, fontSize: SMALL_LABEL_SIZE }}
        >
          {s.label}.
        </div>
      ))}
      {placed.map((p, i) => {
        const prevEnd = i === 0 ? 0 : placed[i - 1].start + placed[i - 1].cells;
        return (
          <BarCell
            key={i}
            bar={p.bar}
            start={p.start}
            cells={p.cells}
            timeSignature={p.bar.timeSignature ?? (isFirstRow && i === 0 ? timeSignature : undefined)}
            row={hasEndings ? 2 : 1}
            hasLeftEdge={i === 0 || p.start > prevEnd}
            isFirstOfChart={isFirstRow && i === 0}
            isLastOfChart={isLastRow && i === placed.length - 1}
            content={renderBarContent?.(p.bar, i)}
            sectionContent={renderSection?.(p.bar, i)}
            active={activeBar !== null && p.bar === activeBar}
          />
        );
      })}
      {trailing}
    </div>
  );
}

function BarCell({
  bar,
  start,
  cells,
  timeSignature,
  row,
  hasLeftEdge,
  isFirstOfChart,
  isLastOfChart,
  content,
  sectionContent,
  active = false,
}: {
  bar: Bar;
  active?: boolean;
  start: number;
  cells: number;
  timeSignature?: { top: number; bottom: number };
  row: number;
  hasLeftEdge: boolean;
  isFirstOfChart: boolean;
  isLastOfChart: boolean;
  content?: React.ReactNode;
  /** Overrides the section badge itself — `ChordChartEditor.tsx`'s inline section-name input.
      `undefined` falls back to the normal badge; anything else (including `null`) replaces it. */
  sectionContent?: React.ReactNode;
}) {
  // iReal always draws the chart's very opening barline thick, whatever else is there.
  const thickLeft = bar.startRepeat || isFirstOfChart;
  const leftStyle = thickLeft
    ? "border-l-4 border-foreground"
    : bar.startDouble
      ? "border-l border-foreground"
      : hasLeftEdge
        ? "border-l border-muted/40"
        : "";
  const thickRight = bar.endRepeat || bar.endBarline === "final" || isLastOfChart;
  const rightStyle = thickRight
    ? "border-r-4 border-foreground"
    : bar.endBarline === "double"
      ? "border-r border-foreground"
      : "border-r border-muted/40";

  return (
    <div
      className={`relative flex items-center justify-center gap-1 px-0.5 ${leftStyle} ${rightStyle}`}
      style={{ gridColumn: `${start + 1} / span ${cells}`, gridRow: row, height: BAR_HEIGHT, width: `${cells * CELL_REM}rem` }}
    >
      {active && <span aria-hidden className="pointer-events-none absolute inset-y-1 inset-x-1 rounded-md bg-accent/20 ring-2 ring-accent/60" />}
      {bar.startDouble && !thickLeft && <span aria-hidden className="absolute bottom-0 left-0.5 top-0 w-px bg-foreground" />}
      {bar.endBarline === "double" && !thickRight && <span aria-hidden className="absolute bottom-0 right-0.5 top-0 w-px bg-foreground" />}
      {bar.endBarline === "final" && !bar.endRepeat && <span aria-hidden className="absolute bottom-0 right-1 top-0 w-px bg-foreground" />}
      {bar.startRepeat && <RepeatDots side="left" />}
      {bar.endRepeat && <RepeatDots side="right" />}
      {sectionContent !== undefined
        ? sectionContent
        : bar.section && (
            <span
              className="absolute left-0.5 top-0.5 flex h-[1.6em] min-w-[1.6em] items-center justify-center whitespace-nowrap rounded bg-accent px-1 font-bold leading-none text-accent-foreground"
              style={{ fontSize: BADGE_SIZE }}
            >
              {bar.section}
            </span>
          )}
      {(bar.segno || bar.coda) && (
        <span
          className={`absolute top-0.5 text-accent ${chordSymbolFont.className} ${bar.section ? "left-7" : "left-0.5"}`}
          style={{ fontSize: SYMBOL_SIZE }}
          aria-hidden
        >
          {bar.segno ? "" /* segno */ : ""}
          {bar.coda ? "" /* coda */ : ""}
        </span>
      )}
      {bar.alternates && bar.alternates.length > 0 && (
        // Alternate changes (iReal's parenthesized chords), printed small above the bar's chords.
        <span className="absolute left-0 right-0 top-0 flex justify-center gap-1.5 opacity-70" aria-label="Alternate changes">
          {bar.alternates.map((a, i) => (
            <ChordLabel key={i} slot={a} scale={0.55} />
          ))}
        </span>
      )}
      {bar.content.kind === "repeat" && bar.content.double && (
        // "Repeat the previous two bars" — drawn on the barline between the two bars.
        <span
          aria-hidden
          className={`absolute z-10 translate-x-1/2 text-muted ${chordSymbolFont.className}`}
          style={{ right: 0, fontSize: REPEAT_SIZE }}
        >
          {"" /* repeat2Bars */}
        </span>
      )}
      {timeSignature && (
        <TimeSignatureGlyph
          timeSignature={timeSignature}
          // A section badge, segno or coda sits in the top-left corner: drop the time signature
          // below it rather than printing the two on top of each other.
          belowMark={sectionContent != null || !!bar.section || !!bar.segno || !!bar.coda}
          afterRepeat={!!bar.startRepeat}
        />
      )}
      {content ?? <BarContent bar={bar} />}
      {bar.directive && (
        <span className="absolute -bottom-5 right-0 whitespace-nowrap italic text-muted" style={{ fontSize: SMALL_LABEL_SIZE }}>
          {bar.directive}
        </span>
      )}
    </div>
  );
}

/** The stacked top/bottom time signature (e.g. "4" over "4") drawn just before the chart's very
    first chord, the way iReal Pro always shows it, sitting as an ordinary flex sibling of the
    chord label inside that one bar cell — it costs that bar some of its own room for the chord
    symbol rather than adding an extra column. */
function TimeSignatureGlyph({
  timeSignature,
  belowMark = false,
  afterRepeat = false,
}: {
  timeSignature: { top: number; bottom: number };
  /** The bar has a mark in its top-left corner — sit lower, clear of it. */
  belowMark?: boolean;
  /** The bar opens a repeat — leave room for its dots. */
  afterRepeat?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 flex-col items-center justify-center leading-[0.85] text-foreground ${chordFont.className}`}
      style={{ fontSize: TIME_SIG_SIZE, paddingTop: belowMark ? "0.75em" : undefined, marginLeft: afterRepeat ? "0.6rem" : undefined }}
    >
      <span>{timeSignature.top}</span>
      <span>{timeSignature.bottom}</span>
    </span>
  );
}

function RepeatDots({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={`absolute top-1/2 flex -translate-y-1/2 flex-col gap-1 ${
        side === "left" ? "left-1.5" : "right-1.5"
      }`}
    >
      <span className="h-1 w-1 rounded-full bg-foreground" />
      <span className="h-1 w-1 rounded-full bg-foreground" />
    </span>
  );
}

/** Exported for `ChordChartEditor.tsx`, which wraps this in its own clickable button (to activate
    a bar for editing) around every bar that isn't the one currently being typed into — reusing
    this directly rather than a second "blank cell / % / chord labels" render path to keep in
    sync. */
export function BarContent({ bar }: { bar: Bar }) {
  if (bar.content.kind === "repeat") {
    if (bar.content.double) return null; // drawn on the barline by BarCell
    return (
      <span
        className={`text-muted ${chordSymbolFont.className}`}
        style={{ fontSize: REPEAT_SIZE }}
        aria-hidden
      >
        {"" /* repeat1Bar */}
      </span>
    );
  }
  const { slots } = bar.content;
  if (slots.length === 0) {
    return <span className="text-muted">&nbsp;</span>;
  }
  return (
    <FitChordRow>
      {slots.map((slot, i) => (
        <ChordLabel key={i} slot={slot} />
      ))}
    </FitChordRow>
  );
}

/** Keeps a bar's chords on one line no matter how many there are: never wraps, and instead
    shrinks the whole row evenly (`transform: scale()`) by just enough that it fits inside the bar
    with a little room either side, so a bar holding two or more chords prints them smaller rather
    than running them into the barlines. Renders at natural size (no transform) until it actually
    doesn't fit. (It used to squeeze only the width, `scaleX()`, which crushed the letters and still
    left them touching the lines.) Orthogonal to `PageFit` above (which scales the *whole chart*). */
function FitChordRow({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const content = contentRef.current;
    if (!wrap || !content) return;
    const recompute = () => {
      // scrollWidth/clientWidth reflect layout size, not any transform already applied, so this
      // stays accurate (and doesn't feed back on itself) however much the row is currently scaled.
      const style = getComputedStyle(wrap);
      const available = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const natural = content.scrollWidth;
      setScale(available > 0 && natural > 0 ? Math.min(1, available / natural) : 1);
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(wrap);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="flex w-full min-w-0 justify-center overflow-hidden px-1.5">
      <div
        ref={contentRef}
        className="flex shrink-0 items-center gap-x-2 whitespace-nowrap"
        style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: "center" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

const ACCIDENTAL_GLYPH: Record<"b" | "#", string> = { b: "♭", "#": "♯" };

// Every part of a chord symbol below (root, its accidental, the quality/extension, the slash
// bass) is sized with an explicit fixed font-size, not a relative `em` value. `quality` and
// `bass` sit as *siblings* of the root `<span>`, not children of it, so an `em` on them would
// resolve against whatever font-size this label happens to inherit — not against the root's own
// (much larger) size — which is exactly why they used to stay illegibly small no matter how big
// that `em` value got. Explicit, independently-set sizes sidestep that entirely.
/** `rem` sizes scaled — small chords (iReal's `s`) print at about two thirds size, alternates
    smaller still. */
function sized(size: string, k: number) {
  return k === 1 ? size : `calc(${size} * ${k})`;
}

function ChordLabel({ slot, scale = 1 }: { slot: ChordSlot; scale?: number }) {
  const k = scale * (slot.kind === "chord" && slot.small ? 0.68 : 1);
  if (slot.kind === "nc") {
    return (
      <span
        className={`font-medium text-muted ${chordFont.className}`}
        style={{ fontSize: sized(QUALITY_SIZE, k) }}
      >
        N.C.
      </span>
    );
  }
  if (slot.kind === "slash") {
    return (
      <span
        className={`text-muted ${chordFont.className}`}
        style={{ fontSize: sized(QUALITY_SIZE, k) }}
        aria-hidden
      >
        /
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-baseline leading-none ${chordFont.className}`}
    >
      <span
        className="font-medium text-foreground"
        style={{ fontSize: sized(ROOT_SIZE, k) }}
      >
        {slot.letter}
        {slot.accidental && (
          <sup style={{ fontSize: sized(ROOT_ACCIDENTAL_SIZE, k) }}>
            {ACCIDENTAL_GLYPH[slot.accidental]}
          </sup>
        )}
      </span>
      {slot.quality && (
        // Deliberately a plain baseline-aligned span, not `<sup>` — iReal Pro tucks the quality
        // in at the root letter's own baseline (smaller, but not floated up above it the way a
        // true superscript would), which is what the parent's `items-baseline` already gives a
        // plain sibling span for free.
        <span
          className="ml-1 font-medium text-foreground"
          style={{ fontSize: sized(QUALITY_SIZE, k) }}
        >
          <QualityText quality={slot.quality} />
        </span>
      )}
      {slot.bass && (
        <span className="ml-1.5 text-muted" style={{ fontSize: sized(BASS_SIZE, k) }}>
          /{slot.bass.letter}
          {slot.bass.accidental && ACCIDENTAL_GLYPH[slot.bass.accidental]}
        </span>
      )}
    </span>
  );
}

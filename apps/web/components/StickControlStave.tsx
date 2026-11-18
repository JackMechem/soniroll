"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	Annotation,
	AnnotationVerticalJustify,
	Barline,
	Beam,
	Formatter,
	Renderer,
	Stave,
	StaveNote,
	Tuplet,
	Voice,
} from "vexflow";
import { useMusicFontVersion } from "@/lib/musicFont";
import {
	CELL_BEAT_FRACTION,
	type CellSpeed,
	type GeneratedPattern,
	type NoteCell,
} from "@/lib/stickControl";

// Renders a drum sticking pattern as actual engraved notation (via VexFlow, this app's first use
// of a real sheet-music library — reused rather than hand-rolling a drum-notation renderer the
// way e.g. ChordChart.tsx hand-rolls chord notation, since the request specifically asked for
// "some kind of sheet music library"), each stroke's sticking letter printed below it as a plain
// "R"/"L" caption.
//
// Every bar used to get its own separate `Renderer`/card; fixed into one continuous system per a
// direct follow-up ("bars should not be in separate containers... right next to each other in one
// line with nothing separating them"). That worked well up to a handful of bars, but a pattern
// that needs many (an 11- or 13-stroke roll can need 11-13 bars to realign with the bar line —
// see `lib/stickControl.ts`'s own `minimalBarsFor`) then had to squeeze onto one ever-shrinking
// line, reported back directly as illegible. Fixed again, this time with real line-wrapping: bars
// are grouped into *rows* of at most `MAX_BARS_PER_ROW`, each row rendered as its own continuous
// multi-bar system (reusing the exact same "abutting Staves on one shared canvas" approach the
// single-line version already used) and stacked vertically — real sheet music's own "system
// break" convention, not a one-off. How many bars actually fit in a row is measured against the
// container's own real width (via `ResizeObserver`, the same technique `ChordChart.tsx`'s
// `PageFit` already uses elsewhere in this app) using each bar's own already-measured natural
// width, capped at `MAX_BARS_PER_ROW` — "adjusting to screen size" in the literal sense: a wide
// desktop window gets up to 4 bars per row, a narrow phone gets fewer, whatever actually fits
// without needing to shrink below a reasonable size.

const BAR_HEIGHT = 130;
const STAVE_Y = 10;
// The part of that height the SVG shows: the ink runs from a triplet's "3" (about y 14) down to
// the R/L letters (about y 114); the blank bands above and below cost a whole card's height of
// room, which kept the page from fitting a 900px-tall screen.
const VIEW_TOP = 10;
const VIEW_HEIGHT = 108;
// Extra room *before* the first note of a bar that doesn't already get it from a clef: a bare
// stave needs only a little, immediately after the previous bar's own closing barline.
const LEFT_PAD_PLAIN = 16;
const LEFT_PAD_CLEF = 70;
const RIGHT_PAD = 20;
// Extra safety margin added on top of the real, post-draw measured content width — see the draw
// effect's own comment on why a fixed pre-draw estimate alone isn't quite enough.
const RIGHT_SAFETY_PX = 4;
const MAX_BARS_PER_ROW = 4;
// Before the container's real width has ever been measured (the very first paint), assume a
// generous desktop-ish width rather than 0 — avoids a flash of "1 bar per row" that would
// immediately reflow wider the instant `ResizeObserver` reports in.
const DEFAULT_CONTAINER_WIDTH = 900;
// A little darker than the theme's own full-strength `--foreground` (per a direct follow-up:
// "make the notes a little darker on both light and dark themes") — `color-mix` so this tracks
// whichever theme/custom colors are active rather than a fixed hex, the same technique
// `lib/theme.ts`'s own `overlayValue` already uses elsewhere in this app. Mixing toward black
// specifically (not the theme's own background, which is *lighter* than foreground in a light
// theme) keeps the direction of "darker" consistent across both themes rather than flipping sign
// in light mode.
const NOTATION_COLOR = "color-mix(in srgb, var(--foreground) 80%, black)";

// A normal (8th note) or fast (16th note) cell needs no tuplet bracket — VexFlow's own duration
// string alone says how long it is. A triplet cell is written with the *next faster* duration
// symbol ("8", same as normal — three of them fill the time two normally would) and only reads as
// a triplet once three of them are wrapped in a `Tuplet` (3-in-the-time-of-2) below; the duration
// string by itself doesn't carry that.
const DURATION_BY_SPEED: Record<CellSpeed, string> = {
	normal: "8",
	fast: "16",
	triplet: "8",
};

type BarRect = { x: number; width: number };

function buildNote(hand: string, dur: string) {
	const note = new StaveNote({
		keys: ["b/4"],
		duration: dur,
		clef: "percussion",
	});
	const annotation = new Annotation(hand);
	annotation.setVerticalJustification(AnnotationVerticalJustify.BOTTOM);
	note.addModifier(annotation, 0);
	return note;
}

/** One beat's worth of notes, plus whether they need a `Tuplet` bracket (a triplet beat always
    does, uniformly — a bar's straight and roll segments each occupy whole beats of their own, so
    one beat's cells are never a mix of triplet and non-triplet speeds). */
type BeamGroup = { notes: StaveNote[]; isTriplet: boolean };

/** Groups `cells` into one beam per *beat*, tracked by accumulated real beat-fraction
    (`CELL_BEAT_FRACTION`) rather than a fixed cell count — a beat of normal (8th-note) cells is 2
    of them, a beat of fast (16th-note) cells is 4, and a beat of triplet (8th-note-triplet) cells
    is 3, so a fixed-count grouping would split a roll or triplet segment's beats in the wrong
    place. */
function buildBeamGroups(cells: NoteCell[]): BeamGroup[] {
	const groups: BeamGroup[] = [];
	let current: StaveNote[] = [];
	let currentIsTriplet = false;
	let timeInBeat = 0;
	cells.forEach((cell) => {
		current.push(buildNote(cell.hand, DURATION_BY_SPEED[cell.speed]));
		if (cell.speed === "triplet") currentIsTriplet = true;
		timeInBeat += CELL_BEAT_FRACTION[cell.speed];
		if (timeInBeat >= 1 - 1e-6) {
			groups.push({ notes: current, isTriplet: currentIsTriplet });
			current = [];
			currentIsTriplet = false;
			timeInBeat = 0;
		}
	});
	if (current.length > 0)
		groups.push({ notes: current, isTriplet: currentIsTriplet });
	return groups;
}

/** One row's worth of a multi-bar system, rendered into its own shared `Renderer`/SVG — bars
    positioned side by side with no gap, same as the single-line version this was built from. */
function StickControlRow({
	rowBars,
	beatsPerBar,
	activeIndexInRow,
	isFirstRow,
	isLastRow,
}: {
	rowBars: NoteCell[][];
	beatsPerBar: number;
	activeIndexInRow: number | null;
	/** Whether this row is the very first/last row of the *whole* (possibly multi-row) pattern —
	    the clef and the repeat barlines only ever belong on the true first bar of the first row and
	    the true last bar of the last row, never on every row's own local first/last bar (reported
	    directly, with a screenshot showing a stray clef + repeat-begin at the start of every row,
	    and a repeat-end at the end of every row instead of just the final one). */
	isFirstRow: boolean;
	isLastRow: boolean;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [barRects, setBarRects] = useState<BarRect[]>([]);
	const [totalWidth, setTotalWidth] = useState(0);
	const fontVersion = useMusicFontVersion();

	useEffect(() => {
		const el = containerRef.current;
		if (!el || !fontVersion) return;
		el.innerHTML = "";

		// Pass 1: build each bar's own notes/voice and measure its own natural minimum width.
		const barData = rowBars.map((cells, i) => {
			const beamGroups = buildBeamGroups(cells);
			const staveNotes = beamGroups.flatMap((g) => g.notes);
			const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
			voice.setStrict(false);
			voice.addTickables(staveNotes);
			const formatter = new Formatter().joinVoices([voice]);
			const minWidth = formatter.preCalculateMinTotalWidth([voice]);
			// Only the true first bar of the whole pattern gets a clef (and the room it needs) —
			// every other row's own first bar starts with a plain barline, same as any interior bar.
			const showClef = isFirstRow && i === 0;
			const leftPad = showClef ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN;
			const isLast = i === rowBars.length - 1;
			const width = Math.ceil(minWidth) + leftPad + (isLast ? RIGHT_PAD : 0);
			return { beamGroups, voice, formatter, minWidth, width, showClef };
		});

		const fullWidth = barData.reduce((sum, b) => sum + b.width, 0);

		const renderer = new Renderer(el, Renderer.Backends.SVG);
		renderer.resize(fullWidth, BAR_HEIGHT);
		const context = renderer.getContext();
		// Pass 2: lay every bar's own `Stave` side by side, each starting exactly where the previous
		// one's own width ends.
		const allBeams: Beam[] = [];
		const allTuplets: Tuplet[] = [];
		const rects: BarRect[] = [];
		let x = 0;
		for (let i = 0; i < barData.length; i++) {
			const { voice, formatter, minWidth, width, beamGroups, showClef } = barData[i];
			const stave = new Stave(x, STAVE_Y, width);
			if (showClef) {
				stave.setBegBarType(Barline.type.REPEAT_BEGIN);
				stave.addClef("percussion");
			}
			if (isLastRow && i === barData.length - 1) {
				stave.setEndBarType(Barline.type.REPEAT_END);
			}
			stave.setContext(context).draw();

			formatter.format([voice], minWidth);

			// Beams (and tuplets) have to exist *before* the voice is drawn — see this file's own doc
			// comment history; only the drawing of the beams/tuplets themselves happens after.
			for (const group of beamGroups) {
				if (group.notes.length < 2) continue;
				allBeams.push(new Beam(group.notes));
				if (group.isTriplet) allTuplets.push(new Tuplet(group.notes));
			}

			voice.draw(context, stave);
			rects.push({ x, width });
			x += width;
		}
		allBeams.forEach((b) => b.setContext(context).draw());
		allTuplets.forEach((t) => t.setContext(context).draw());

		const svg = el.querySelector("svg");
		// `fullWidth` (VexFlow's own pre-calculated width, used to size the renderer's canvas above)
		// can undershoot the actual drawn content by a pixel or so — a real, consistently reproduced
		// ~1px gap between `Formatter.preCalculateMinTotalWidth`'s estimate and the true rendered
		// geometry (confirmed directly via `getBBox()` against the real deployment, not assumed),
		// small enough to be invisible most of the time but just enough to clip away a row's own
		// plain end barline specifically — drawn flush at the stave's own right edge, with no margin
		// of its own to absorb it — reported directly with a screenshot: every row except the whole
		// pattern's true last one showed no end barline at all, exactly where a plain barline and
		// this shortfall coincided. Rather than chase the precise VexFlow-internal rounding cause,
		// measure the real drawn content's own bounding box *after* everything (notes, beams,
		// tuplets, barlines) is already on the canvas, and size the final viewBox to that — self-
		// correcting regardless of why the pre-draw estimate was off, with a small fixed safety
		// margin (`RIGHT_SAFETY_PX`) on top for genuine robustness rather than shaving it to the
		// exact pixel.
		const contentBBox = svg?.getBBox();
		const finalWidth = contentBBox
			? Math.max(fullWidth, Math.ceil(contentBBox.x + contentBBox.width) + RIGHT_SAFETY_PX)
			: fullWidth;
		if (svg) {
			svg.setAttribute("viewBox", `0 ${VIEW_TOP} ${finalWidth} ${VIEW_HEIGHT}`);
			svg.removeAttribute("width");
			svg.removeAttribute("height");
			svg.style.width = "100%";
			svg.style.height = "auto";
			svg.style.display = "block";
			// VexFlow's own SVG context hardcodes `fill="black" stroke="black"` on the root <svg> —
			// every notehead/stem/beam/barline/annotation below it leaves its own fill/stroke unset and
			// just inherits that, which reads fine against a light theme's own white page but is close
			// to invisible against a dark theme's own dark background (reported directly, with a
			// screenshot). `currentColor` resolves through the same CSS inheritance to the wrapping
			// `containerRef` div below, which sets its own `color` to a slightly dimmed version of the
			// theme's own foreground — not the full-strength color text uses — per a direct follow-up
			// ("make the notes a little darker on both light and dark themes") once pure `--foreground`
			// read as too stark/glary once actually seen. One override here recolors every one of those
			// descendants at once, correctly following whichever theme is currently active.
			svg.setAttribute("fill", "currentColor");
			svg.setAttribute("stroke", "currentColor");
		}

		setBarRects(rects);
		setTotalWidth(finalWidth);
		// `rowBars` only ever changes reference when the pattern itself is regenerated or the row
		// layout changes — a tick-driven re-render for `activeIndexInRow` alone leaves it
		// referentially stable, so this effect correctly skips redrawing the SVG for those.
	}, [rowBars, beatsPerBar, isFirstRow, isLastRow, fontVersion]);

	return (
		<div
			className="relative mx-auto w-full"
			style={totalWidth ? { maxWidth: totalWidth } : undefined}
		>
			{/* The R/L stickings in the UI font, semibold (VexFlow's default text font is a serif). */}
			<div
				ref={containerRef}
				style={{ color: NOTATION_COLOR }}
				className="[&_.vf-annotation_text]:font-semibold [&_.vf-annotation_text]:[font-family:var(--app-font,var(--font-sans)),sans-serif]"
			/>
			{totalWidth > 0 &&
				barRects.map((rect, i) => (
					<div
						key={i}
						aria-hidden
						className={`pointer-events-none absolute inset-y-0 rounded-md transition-colors ${
							activeIndexInRow === i
								? "bg-accent/10 ring-2 ring-inset ring-accent"
								: ""
						}`}
						style={{
							left: `${(rect.x / totalWidth) * 100}%`,
							width: `${(rect.width / totalWidth) * 100}%`,
						}}
					/>
				))}
		</div>
	);
}

export default function StickControlStave({
	pattern,
	activeBarIndex,
	background = "surface",
}: {
	pattern: GeneratedPattern;
	activeBarIndex: number | null;
	/** "background" renders a slightly darker card than the default "surface" — used for the
      upcoming-pattern preview below the current one, so it reads as a step removed from what's
      actually playing without needing a second visual treatment invented just for this. Both
      tokens are deliberately already-darker-background-than-surface in both themes (see
      `app/globals.css`), not a one-off opacity hack. */
	background?: "surface" | "background";
}) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(DEFAULT_CONTAINER_WIDTH);
	// Bar widths are measured with the music font, so re-measure once it has loaded.
	const fontVersion = useMusicFontVersion();

	useLayoutEffect(() => {
		const el = wrapperRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width) setContainerWidth(Math.round(width));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const { beatsPerBar, bars } = pattern;

	// How many bars fit in one row, measured against the container's real width using each bar's
	// own natural (unscaled) width — capped at `MAX_BARS_PER_ROW` regardless of how much room is
	// available, and never below 1 even if a single bar alone would need to shrink to fit. Memoized
	// since `bars`/`beatsPerBar` only change when the pattern is actually regenerated — without
	// this, a tick-driven re-render for `activeBarIndex` alone (every playback tick) would rebuild
	// every bar's `Voice`/`Formatter` just to re-derive the same answer.
	const { rows, barsPerRow } = useMemo(() => {
		if (!fontVersion) return { rows: [bars], barsPerRow: bars.length };
		function naturalBarWidth(cells: NoteCell[]): number {
			const beamGroups = buildBeamGroups(cells);
			const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
			voice.setStrict(false);
			voice.addTickables(beamGroups.flatMap((g) => g.notes));
			return new Formatter()
				.joinVoices([voice])
				.preCalculateMinTotalWidth([voice]);
		}

		let perRow = Math.min(MAX_BARS_PER_ROW, bars.length);
		while (perRow > 1) {
			const widths = bars
				.slice(0, perRow)
				.map(
					(cells, i) =>
						Math.ceil(naturalBarWidth(cells)) +
						(i === 0 ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN),
				);
			const rowWidth = widths.reduce((a, b) => a + b, 0) + RIGHT_PAD;
			if (rowWidth <= containerWidth) break;
			perRow--;
		}

		const grouped: NoteCell[][][] = [];
		for (let i = 0; i < bars.length; i += perRow) {
			grouped.push(bars.slice(i, i + perRow));
		}
		return { rows: grouped, barsPerRow: perRow };
	}, [bars, beatsPerBar, containerWidth, fontVersion]);

	return (
		<div
			ref={wrapperRef}
			className={`flex w-full flex-col gap-3 rounded-lg border p-2 ${
				background === "background" ? "border-dashed border-foreground/15" : "border-foreground/10 bg-surface"
			}`}
		>
			{rows.map((rowBars, rowIndex) => {
				const rowStart = rowIndex * barsPerRow;
				const activeIndexInRow =
					activeBarIndex !== null &&
					activeBarIndex >= rowStart &&
					activeBarIndex < rowStart + rowBars.length
						? activeBarIndex - rowStart
						: null;
				return (
					<StickControlRow
						key={rowIndex}
						rowBars={rowBars}
						beatsPerBar={beatsPerBar}
						activeIndexInRow={activeIndexInRow}
						isFirstRow={rowIndex === 0}
						isLastRow={rowIndex === rows.length - 1}
					/>
				);
			})}
		</div>
	);
}

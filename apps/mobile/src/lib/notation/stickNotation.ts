import {
  CELL_BEAT_FRACTION,
  type CellSpeed,
  type GeneratedPattern,
  type NoteCell,
} from '@jam-practice/core/stickControl';
import {
  Annotation,
  AnnotationVerticalJustify,
  Barline,
  Beam,
  Formatter,
  Stave,
  StaveNote,
  Tuplet,
  Voice,
} from 'vexflow/core';

import {
  type DrawItem,
  type FakeNode,
  createNativeContext,
  flattenTree,
  installVexFlowNative,
  layoutText,
  Font,
} from './vexflowNative';

/**
 * A line-for-line port of the VexFlow half of `apps/web/components/StickControlStave.tsx` — same
 * constants, same note/annotation/beam/tuplet construction, same per-row "abutting Staves" system,
 * same clef/repeat-barline placement, same row-wrapping rule — so the phone's notation is the
 * website's notation. Only the output differs: a drawing tree (`FakeNode`) for `NotationSvg` to
 * render instead of DOM SVG. See that web file's own comments for the reasoning behind each
 * choice; they're not repeated here.
 */

export const BAR_HEIGHT = 130;
const STAVE_Y = 10;
const LEFT_PAD_PLAIN = 16;
const LEFT_PAD_CLEF = 70;
const RIGHT_PAD = 20;
const RIGHT_SAFETY_PX = 4;
const MAX_BARS_PER_ROW = 4;

const DURATION_BY_SPEED: Record<CellSpeed, string> = {
  normal: '8',
  fast: '16',
  triplet: '8',
};

export type BarRect = { x: number; width: number };

/** The sticking letters' size, in points: VexFlow's default is 10 (13⅓ units); the phone draws
    them at 12 (16 units) so they stay readable (14 px and up) at the scale a phone-width bar is
    drawn. The website keeps the default. */
export const STICKING_FONT_PT = 12;

function buildNote(hand: string, dur: string) {
  const note = new StaveNote({ keys: ['b/4'], duration: dur, clef: 'percussion' });
  const annotation = new Annotation(hand);
  annotation.setFontSize(STICKING_FONT_PT);
  annotation.setVerticalJustification(AnnotationVerticalJustify.BOTTOM);
  note.addModifier(annotation, 0);
  return note;
}

type BeamGroup = { notes: StaveNote[]; isTriplet: boolean };

function buildBeamGroups(cells: NoteCell[]): BeamGroup[] {
  const groups: BeamGroup[] = [];
  let current: StaveNote[] = [];
  let currentIsTriplet = false;
  let timeInBeat = 0;
  cells.forEach((cell) => {
    current.push(buildNote(cell.hand, DURATION_BY_SPEED[cell.speed]));
    if (cell.speed === 'triplet') currentIsTriplet = true;
    timeInBeat += CELL_BEAT_FRACTION[cell.speed];
    if (timeInBeat >= 1 - 1e-6) {
      groups.push({ notes: current, isTriplet: currentIsTriplet });
      current = [];
      currentIsTriplet = false;
      timeInBeat = 0;
    }
  });
  if (current.length > 0) groups.push({ notes: current, isTriplet: currentIsTriplet });
  return groups;
}

export type RenderedRow = {
  root: FakeNode;
  width: number;
  height: number;
  /** Top/bottom of what's actually drawn (VexFlow's 130-unit row is mostly blank above and below
      the staff); a mobile renderer crops to this so the staff can be drawn bigger. */
  contentTop: number;
  contentBottom: number;
  barRects: BarRect[];
};

/** One row of the system, drawn exactly like web's `StickControlRow` draw effect. */
export function drawRow(
  rowBars: NoteCell[][],
  beatsPerBar: number,
  isFirstRow: boolean,
  isLastRow: boolean,
  /** Mobile only: stretch the row to this many units by giving each bar's notes a proportional
      share of the extra room — VexFlow's own justification, like an engraved system filling the
      page width. Web never passes this. */
  justifyTo?: number,
): RenderedRow {
  installVexFlowNative();

  const barData = rowBars.map((cells, i) => {
    const beamGroups = buildBeamGroups(cells);
    const staveNotes = beamGroups.flatMap((g) => g.notes);
    const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
    voice.setStrict(false);
    voice.addTickables(staveNotes);
    const formatter = new Formatter().joinVoices([voice]);
    const minWidth = formatter.preCalculateMinTotalWidth([voice]);
    const showClef = isFirstRow && i === 0;
    const leftPad = showClef ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN;
    const isLast = i === rowBars.length - 1;
    const width = Math.ceil(minWidth) + leftPad + (isLast ? RIGHT_PAD : 0);
    return { beamGroups, voice, formatter, minWidth, width, showClef };
  });

  const naturalWidth = barData.reduce((sum, b) => sum + b.width, 0);
  if (justifyTo && justifyTo > naturalWidth) {
    const extra = justifyTo - naturalWidth;
    const totalNotes = barData.reduce((sum, b) => sum + b.minWidth, 0);
    for (const bar of barData) {
      const share = (extra * bar.minWidth) / totalNotes;
      bar.width += share;
      bar.minWidth += share;
    }
  }
  const fullWidth = barData.reduce((sum, b) => sum + b.width, 0);

  const { context, root } = createNativeContext();
  context.resize(fullWidth, BAR_HEIGHT);

  const allBeams: Beam[] = [];
  const allTuplets: Tuplet[] = [];
  const rects: BarRect[] = [];
  let x = 0;
  for (let i = 0; i < barData.length; i++) {
    const { voice, formatter, minWidth, width, beamGroups, showClef } = barData[i];
    const stave = new Stave(x, STAVE_Y, width);
    if (showClef) {
      stave.setBegBarType(Barline.type.REPEAT_BEGIN);
      stave.addClef('percussion');
    }
    if (isLastRow && i === barData.length - 1) {
      stave.setEndBarType(Barline.type.REPEAT_END);
    }
    stave.setContext(context).draw();

    formatter.format([voice], minWidth);

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

  // Web sizes the final viewBox to the drawn content's real `getBBox()` (plus a small margin)
  // rather than the pre-draw estimate, which undershoots by ~1px; `contentBounds` computes the
  // same right edge from the drawing tree.
  const bounds = contentBounds(root);
  const finalWidth = Math.max(fullWidth, Math.ceil(bounds.maxX) + RIGHT_SAFETY_PX);
  return {
    root,
    width: finalWidth,
    height: BAR_HEIGHT,
    contentTop: Math.max(0, Math.floor(bounds.minY) - 2),
    contentBottom: Math.min(BAR_HEIGHT, Math.ceil(bounds.maxY) + 2),
    barRects: rects,
  };
}

/** How many bars fit per row at `containerWidth` — web's own `useMemo` rule, verbatim. */
export function layoutRows(pattern: GeneratedPattern, containerWidth: number) {
  installVexFlowNative();
  const { beatsPerBar, bars } = pattern;

  function naturalBarWidth(cells: NoteCell[]): number {
    const beamGroups = buildBeamGroups(cells);
    const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
    voice.setStrict(false);
    voice.addTickables(beamGroups.flatMap((g) => g.notes));
    return new Formatter().joinVoices([voice]).preCalculateMinTotalWidth([voice]);
  }

  let perRow = Math.min(MAX_BARS_PER_ROW, bars.length);
  while (perRow > 1) {
    const widths = bars
      .slice(0, perRow)
      .map((cells, i) => Math.ceil(naturalBarWidth(cells)) + (i === 0 ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN));
    const rowWidth = widths.reduce((a, b) => a + b, 0) + RIGHT_PAD;
    if (rowWidth <= containerWidth) break;
    perRow--;
  }

  const rows: NoteCell[][][] = [];
  for (let i = 0; i < bars.length; i += perRow) rows.push(bars.slice(i, i + perRow));
  return { rows, barsPerRow: perRow };
}

type Bounds = { maxX: number; minY: number; maxY: number };

/** The extent of everything drawn — the same box `getBBox()` reports on web (geometry only, no
    stroke width). Web uses its right edge; mobile also crops to its top/bottom. */
function contentBounds(root: FakeNode): Bounds {
  const b: Bounds = { maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const addY = (y: number) => {
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  };
  function walk(node: FakeNode, inherited: Record<string, string>) {
    const attrs = { ...inherited, ...node.attrs };
    if (node.nodeName === 'rect') {
      const x = Number(attrs.x ?? 0);
      const y = Number(attrs.y ?? 0);
      b.maxX = Math.max(b.maxX, x + Number(attrs.width ?? 0));
      addY(y);
      addY(y + Number(attrs.height ?? 0));
    } else if (node.nodeName === 'path' && attrs.d) {
      pathBounds(attrs.d, b, addY);
    } else if (node.nodeName === 'text' && node.textContent) {
      const px = Font.convertSizeToPixelValue(attrs['font-size'] ?? '10pt');
      const { metrics } = layoutText(node.textContent, attrs['font-family'] ?? '', px);
      const y = Number(attrs.y ?? 0);
      b.maxX = Math.max(b.maxX, Number(attrs.x ?? 0) + metrics.actualBoundingBoxRight);
      addY(y - metrics.actualBoundingBoxAscent);
      addY(y + metrics.actualBoundingBoxDescent);
    }
    for (const child of node.children) walk(child, attrs);
  }
  walk(root, {});
  return b;
}

function pathBounds(d: string, b: Bounds, addY: (y: number) => void) {
  const commands = d.match(/[MLCQAZ][^MLCQAZ]*/gi) ?? [];
  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const nums = (cmd.slice(1).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    if (type === 'A') {
      // rx ry rotation large sweep x y — bound by the endpoint plus the radius.
      for (let i = 0; i + 6 < nums.length; i += 7) {
        b.maxX = Math.max(b.maxX, nums[i + 5] + nums[i]);
        addY(nums[i + 6] - nums[i + 1]);
        addY(nums[i + 6] + nums[i + 1]);
      }
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        b.maxX = Math.max(b.maxX, nums[i]);
        addY(nums[i + 1]);
      }
    }
  }
}

// --- Mobile layout helpers -------------------------------------------------------------------

const widthCache = new WeakMap<GeneratedPattern, number[]>();

/** Each bar's own natural note width (`ceil(preCalculateMinTotalWidth)`), measured once per
    pattern — enough to predict any row layout's width without drawing it. */
function barNoteWidths(pattern: GeneratedPattern): number[] {
  let widths = widthCache.get(pattern);
  if (!widths) {
    installVexFlowNative();
    widths = pattern.bars.map((cells) => {
      const voice = new Voice({ numBeats: pattern.beatsPerBar, beatValue: 4 });
      voice.setStrict(false);
      voice.addTickables(buildBeamGroups(cells).flatMap((g) => g.notes));
      return Math.ceil(new Formatter().joinVoices([voice]).preCalculateMinTotalWidth([voice]));
    });
    widthCache.set(pattern, widths);
  }
  return widths;
}

/** Natural (unscaled) width and height of `pattern` laid out `perRow` bars to a row — the same
    sums `drawRow` makes, plus the few px of `RIGHT_SAFETY_PX` slack it adds after drawing. */
export function measureLayout(pattern: GeneratedPattern, perRow: number) {
  const widths = barNoteWidths(pattern);
  let maxRowWidth = 0;
  let rows = 0;
  for (let start = 0; start < widths.length; start += perRow) {
    const row = widths.slice(start, start + perRow);
    const w = row.reduce((sum, bw, i) => sum + bw + (start === 0 && i === 0 ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN), 0);
    maxRowWidth = Math.max(maxRowWidth, w + RIGHT_PAD + RIGHT_SAFETY_PX);
    rows++;
  }
  return { maxRowWidth, rows };
}

/** Rough cropped height of one row (staff + captions + tuplet numbers) — only used to pick
    bars-per-row before anything is drawn; the real cropped heights drive the final size. */
export const ROW_HEIGHT_ESTIMATE = 92;

export type NotationRow = {
  items: DrawItem[];
  width: number;
  /** The cropped vertical slice to show (viewBox y/height). */
  top: number;
  height: number;
  barRects: BarRect[];
  firstBar: number;
};

const rowCache = new WeakMap<GeneratedPattern, Map<number, NotationRow[]>>();

/** The pattern drawn `perRow` bars to a row, cached per pattern object — when "Next" is promoted
    to the current pattern, its already-drawn rows are reused rather than redrawn. */
export function renderPatternRows(pattern: GeneratedPattern, perRow: number): NotationRow[] {
  let byPerRow = rowCache.get(pattern);
  if (!byPerRow) {
    byPerRow = new Map();
    rowCache.set(pattern, byPerRow);
  }
  let rows = byPerRow.get(perRow);
  if (!rows) {
    const groups: NoteCell[][][] = [];
    for (let i = 0; i < pattern.bars.length; i += perRow) groups.push(pattern.bars.slice(i, i + perRow));
    // Every row justified to the widest one, so all of them span the full width at one scale.
    const justifyTo = measureLayout(pattern, perRow).maxRowWidth - RIGHT_SAFETY_PX;
    rows = groups.map((rowBars, i) => {
      const row = drawRow(rowBars, pattern.beatsPerBar, i === 0, i === groups.length - 1, justifyTo);
      return {
        items: flattenTree(row.root),
        width: row.width,
        top: row.contentTop,
        height: row.contentBottom - row.contentTop,
        barRects: row.barRects,
        firstBar: i * perRow,
      };
    });
    byPerRow.set(perRow, rows);
  }
  return rows;
}

export const MAX_ROW_BARS = MAX_BARS_PER_ROW;

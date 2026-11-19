import {
  KEY_NAMES,
  keyAlters,
  measureCapacity,
  noteTicks,
  staffOf,
  TICKS_PER_QUARTER,
  type TNote,
  type Transcription,
} from '@jam-practice/core/bassTranscription';
import { Accidental, Beam, Dot, Formatter, Fraction, Stave, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/core';

import { createNativeContext, flattenTree, installVexFlowNative, tagGroups, type DrawItem } from './vexflowNative';

/**
 * A score as engraved notation — the layout half of the website's read-only notation view
 * (`apps/web/components/notation/Score.tsx`), drawn with the same VexFlow calls through
 * `vexflowNative.ts`, a row at a time: treble or bass clef and the key signature at the start of
 * each row, the time signature at the start, measures wrapped into rows, beams per beat (per dotted
 * quarter in 6/8 and the like), triplet brackets, ties (across rows too), dots, ghost (x) notes and
 * accidentals against the key (with naturals within a measure). Unfinished measures are padded
 * with grey rests that aren't part of the score. Bass parts are written an octave above where they
 * sound.
 *
 * What the web draws as SVG text on top — the chord symbols, in the chord charts' Petaluma — comes
 * back as positions for the renderer (`components/notation/Score.tsx`) to draw as text. Each real
 * note's drawing is tagged `measure:note`, so the renderer can light the playing or selected note
 * by drawing it again in the accent; measures and notes come back with their boxes for taps and for
 * tinting a range of bars.
 *
 * On a phone a measure gets at least `minMeasure` units: two to a row at phone width, drawn a little
 * wider than the screen and scaled down (`scale`), rather than one bar a row (a long scroll).
 */

const ROW_HEIGHT = 150;
const STAVE_Y = 40;
/** Narrowest a measure is shown before fewer go on a row… */
const MIN_SHOWN = 150;
/** …and narrowest it's laid out (narrower rows are drawn wider and scaled down). */
const MIN_LAID_OUT = 175;

const VALUE_DURATION: Record<TNote['value'], string> = { w: 'w', h: 'h', q: 'q', '8': '8', '16': '16' };
const ACC: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' };

export type ScoreMeasureBox = { measure: number; x: number; w: number; noteStart: number; noteEnd: number };
export type ScoreNoteBox = { measure: number; note: number; x: number; y: number; w: number; h: number };
export type ScoreChordMark = { measure: number; beat: number; x: number; symbol: string };

export type ScoreRow = {
  items: DrawItem[];
  /** Laid out this wide (units); shown at `scale` of that. */
  drawWidth: number;
  height: number;
  scale: number;
  measures: ScoreMeasureBox[];
  notes: ScoreNoteBox[];
  chords: ScoreChordMark[];
  /** The staff's top line and the space between lines (for tinting bars). */
  staffTop: number;
  spacing: number;
};

export const SCORE_STAVE_Y = STAVE_Y;

/** Rests that fill `ticks`, from `start` ticks into the measure (aligned to beats where it can). */
function paddingRests(start: number, ticks: number): string[] {
  const out: string[] = [];
  let at = start;
  let left = ticks;
  const sizes: [number, string][] = [
    [192, 'w'],
    [96, 'h'],
    [48, 'q'],
    [24, '8'],
    [12, '16'],
  ];
  while (left >= 12) {
    const fit = sizes.find(([t]) => t <= left && at % t === 0) ?? sizes.find(([t]) => t <= left)!;
    out.push(fit[1]);
    at += fit[0];
    left -= fit[0];
  }
  return out;
}

/** The score laid out for a box `width` wide. `firstBar` is the number printed on the first
    measure (a snippet out of a longer score). */
export function renderScoreRows(transcription: Transcription, width: number, opts: { firstBar?: number } = {}): ScoreRow[] {
  if (width < 50 || !transcription.measures.length) return [];
  installVexFlowNative(); // before any notes are made: they measure their glyphs
  const firstBar = opts.firstBar ?? 1;
  const cap = measureCapacity(transcription);
  const staff = staffOf(transcription);
  const alters = keyAlters(transcription.key);
  const keyName = transcription.key ? KEY_NAMES[transcription.key]?.major : null;
  const ts = transcription.timeSignature;
  const beatGroup = ts.bottom === 8 && ts.top % 3 === 0 ? new Fraction(3, 8) : new Fraction(1, 4);
  // Clef and key on every row; the time signature only on the first.
  const keyWidth = Math.abs(transcription.key ?? 0) * 10;
  const perRow = Math.max(1, Math.min(4, Math.floor(width / MIN_SHOWN)));
  const measures = transcription.measures;
  const out: ScoreRow[] = [];

  // Ties that cross into the next row: the next row starts with the tie's end.
  let pendingTie = false;

  for (let rowStart = 0, ri = 0; rowStart < measures.length; rowStart += perRow, ri++) {
    const row = measures.slice(rowStart, rowStart + perRow).map((_, k) => rowStart + k);
    const openingExtra = 44 + keyWidth + (ri === 0 ? 36 : 0);
    const drawWidth = Math.max(width, Math.ceil(perRow * MIN_LAID_OUT + openingExtra + 2));
    const scale = width / drawWidth;
    const measureWidth = (drawWidth - 2 - openingExtra) / perRow;
    const { context, root } = createNativeContext();
    context.resize(drawWidth, ROW_HEIGHT);
    const boxes: ScoreMeasureBox[] = [];
    const chords: ScoreChordMark[] = [];
    const rowNotes: { note: StaveNote; src: TNote; measure: number; index: number }[] = [];
    const beams: Beam[] = [];
    const tuplets: Tuplet[] = [];
    const ties: StaveTie[] = [];
    let staffTop = STAVE_Y + 40;
    let spacing = 10;
    let x = 1;

    row.forEach((mi, k) => {
      const m = measures[mi];
      const first = k === 0;
      const w = measureWidth + (first ? openingExtra : 0);
      const stave = new Stave(x, STAVE_Y, w);
      staffTop = stave.getYForLine(0);
      spacing = stave.getSpacingBetweenLines();
      if (first) stave.addClef(staff.clef);
      if (first && keyName) stave.addKeySignature(keyName);
      if (first && ri === 0) stave.addTimeSignature(`${ts.top}/${ts.bottom}`);
      if (mi === measures.length - 1) stave.setEndBarType(3); // final barline
      stave.setContext(context).draw();

      // Measure number on each row's first measure.
      if (first) {
        context.save();
        context.setFont('Academico', 10, 'normal');
        context.setFillStyle('muted');
        context.fillText(String(mi + firstBar), x + 2, STAVE_Y + 8);
        context.restore();
      }

      // Notes, with accidentals as needed within the measure.
      const shown = new Map<string, number>();
      const notes: StaveNote[] = [];
      const sources: (TNote | null)[] = [];
      let used = 0;
      m.notes.forEach((n) => {
        let sn: StaveNote;
        if (n.pitch) {
          const written = n.pitch.octave + staff.writtenShift;
          const key = `${n.pitch.step.toLowerCase()}/${written}`;
          sn = new StaveNote({ keys: [key], duration: VALUE_DURATION[n.value] + (n.dots ? 'd' : ''), clef: staff.clef, type: n.ghost ? 'x' : 'n', autoStem: true });
          const id = `${n.pitch.step}${written}`;
          const prev = shown.get(id) ?? alters[n.pitch.step];
          if (n.pitch.alter !== prev && !n.ghost) sn.addModifier(new Accidental(ACC[n.pitch.alter]), 0);
          shown.set(id, n.pitch.alter);
        } else {
          sn = new StaveNote({ keys: [staff.restKey], duration: VALUE_DURATION[n.value] + (n.dots ? 'd' : '') + 'r', clef: staff.clef });
        }
        if (n.dots) Dot.buildAndAttach([sn], { all: true });
        notes.push(sn);
        sources.push(n);
        used += noteTicks(n);
      });
      // Grey padding rests for what's left.
      for (const d of paddingRests(used, Math.max(0, cap - used))) {
        const rest = new StaveNote({ keys: [staff.restKey], duration: d + 'r', clef: staff.clef });
        rest.setStyle({ fillStyle: 'muted', strokeStyle: 'muted' });
        rest.setGroupStyle({ fillStyle: 'muted', strokeStyle: 'muted' });
        notes.push(rest);
        sources.push(null);
      }

      // Triplets: runs of three triplet notes of the same value.
      let i = 0;
      while (i < sources.length) {
        const s = sources[i];
        if (s?.triplet) {
          let j = i;
          while (j < sources.length && sources[j]?.triplet && sources[j]?.value === s.value && j - i < 3) j++;
          if (j - i === 3) tuplets.push(new Tuplet(notes.slice(i, j), { numNotes: 3, notesOccupied: 2 }));
          i = j;
        } else i++;
      }

      const voice = new Voice({ numBeats: ts.top, beatValue: ts.bottom });
      voice.setStrict(false);
      voice.addTickables(notes);
      beams.push(...Beam.generateBeams(notes.filter((_, idx) => sources[idx] !== null), { groups: [beatGroup] }));
      new Formatter().joinVoices([voice]).format([voice], Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 10));
      notes.forEach((sn, idx) => {
        const src = sources[idx];
        if (src) rowNotes.push({ note: sn, src, measure: mi, index: idx });
      });
      voice.draw(context, stave);

      // Chord symbols above, at their beat (preferring the x of a note starting on that beat).
      const startX = stave.getNoteStartX();
      const endX = stave.getNoteEndX();
      const beatX = (beat: number) => {
        let at = 0;
        for (let idx = 0; idx < notes.length; idx++) {
          if (Math.abs(at - beat * TICKS_PER_QUARTER) < 1) return notes[idx].getAbsoluteX();
          const src = sources[idx];
          at += src ? noteTicks(src) : 0;
          if (!src) break;
        }
        return startX + ((endX - startX) * beat) / ts.top;
      };
      for (const c of m.chords) chords.push({ x: beatX(c.beat) - 4, symbol: c.symbol, measure: mi, beat: c.beat });
      boxes.push({ measure: mi, x, w, noteStart: startX, noteEnd: endX });
      x += w;
    });

    // Ties between consecutive notes on this row (and partial ones across rows).
    for (let n = 0; n < rowNotes.length; n++) {
      const cur = rowNotes[n];
      if (n === 0 && pendingTie) {
        ties.push(new StaveTie({ lastNote: cur.note, lastIndexes: [0] }));
        pendingTie = false;
      }
      if (!cur.src.tie || !cur.src.pitch) continue;
      const next = rowNotes[n + 1];
      if (next && next.src.pitch) ties.push(new StaveTie({ firstNote: cur.note, lastNote: next.note, firstIndexes: [0], lastIndexes: [0] }));
      else if (!next) {
        ties.push(new StaveTie({ firstNote: cur.note, firstIndexes: [0] }));
        pendingTie = true;
      }
    }
    beams.forEach((b) => b.setContext(context).draw());
    tuplets.forEach((t) => t.setContext(context).draw());
    ties.forEach((t) => t.setContext(context).draw());

    const ids = new Map<string, string>();
    const noteBoxes: ScoreNoteBox[] = [];
    for (const rn of rowNotes) {
      ids.set(rn.note.getAttribute('id'), `${rn.measure}:${rn.index}`);
      const bb = rn.note.getBoundingBox();
      if (bb) noteBoxes.push({ measure: rn.measure, note: rn.index, x: bb.getX() - 3, y: bb.getY() - 3, w: bb.getW() + 6, h: bb.getH() + 6 });
    }
    tagGroups(root, ids);
    out.push({ items: flattenTree(root), drawWidth, height: ROW_HEIGHT, scale, measures: boxes, notes: noteBoxes, chords, staffTop, spacing });
  }
  return out;
}

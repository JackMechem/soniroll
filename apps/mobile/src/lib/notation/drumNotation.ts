import type { DrumVoice } from '@jam-practice/core/drums';
import type { DrumStyle, GrooveBar } from '@jam-practice/core/drumStyles';
import { Annotation, Beam, Formatter, Parenthesis, Stave, StaveNote, Tuplet, Voice } from 'vexflow/core';

import type { BarRect } from './stickNotation';
import { createNativeContext, flattenTree, installVexFlowNative, tagGroups, type DrawItem } from './vexflowNative';

/**
 * Rhythm Section's groove on a percussion staff — a port of the website's
 * `apps/web/components/drumgen/DrumScore.tsx`, drawn with the same VexFlow code through
 * `vexflowNative.ts`, a row at a time. As drum charts are written: hands (cymbals, snare, toms,
 * bells) stems up, feet (bass drum, hi-hat pedal) stems down; x noteheads for cymbals, a circled x
 * for cross-stick, a diamond for the ride's bell, triangles for cowbell and woodblock; accents on
 * the strong hits, ghost notes in brackets, an "o" over an open hi-hat. Swing in straight eighths,
 * 12/8 in eighths grouped in threes, the shuffle in triplets.
 *
 * Each note's drawing is tagged `bar:step:up|down` (bar = index into `bars`), so the note being
 * heard can be drawn again in the accent over the score without laying it out again. Bar widths in
 * a row follow how much each bar holds; if a note still lands past its bar line the row is drawn
 * wider and scaled down to fit, and failing that with fewer bars a row (like the website, which
 * starts from fewer bars a row; a phone keeps two a row where it can, so the eight bars aren't a
 * very long scroll). Colours: VexFlow's black becomes `'ink'`, rests `'muted'`.
 */

const KEYS: Record<DrumVoice, string> = {
  kick: 'f/4',
  pedal: 'd/4/x2',
  tomLow: 'a/4',
  snare: 'c/5',
  crossStick: 'c/5/x3',
  rimshot: 'c/5/ci',
  tomHigh: 'e/5',
  hhClosed: 'g/5/x2',
  hhOpen: 'g/5/x2',
  ride: 'f/5/x2',
  bell: 'f/5/d2',
  crash: 'a/5/x2',
  cowbell: 'b/5/t2',
  block: 'g/4/t2',
  stir: 'c/5/x2',
  tap: 'c/5',
};
const FEET = new Set<DrumVoice>(['kick', 'pedal']);

/** Narrowest a bar is laid out before bars per row drop (the website's 230 is for a desktop). */
const ROW_MIN_BAR = 160;
const ROW_H = 150;
const STAVE_Y = 34;
const LEAD = 46;

export type DrumRow = {
  items: DrawItem[];
  /** Laid out this wide and tall… */
  drawWidth: number;
  drawHeight: number;
  /** …and shown this big (scaled down when a busy bar needed more room). */
  width: number;
  height: number;
  /** Index (into `bars`) of the row's first bar, and each bar's place in the row (laid-out units). */
  firstBar: number;
  barRects: BarRect[];
};

type Slot = { step: number; len: number; voices: { voice: DrumVoice; velocity: number }[] };

/** Note values for a run of `len` grid steps. */
function durationFor(len: number, style: DrumStyle): string {
  const per = style.stepsPerBeat;
  if (per === 4) return ['16', '8', '8d', 'q'][len - 1] ?? 'q';
  if (per === 2) return len >= 2 ? 'q' : '8';
  if (style.triplets) return len >= 3 ? 'q' : len === 2 ? 'q' : '8';
  return ['8', 'q', 'qd'][len - 1] ?? 'qd'; // 12/8
}

/** One beat of one voice group as notes and rests. */
function beatSlots(hits: Map<number, { voice: DrumVoice; velocity: number }[]>, from: number, per: number): Slot[] {
  const onsets = [...hits.keys()].filter((s) => s >= from && s < from + per).sort((a, b) => a - b);
  const out: Slot[] = [];
  if (!onsets.length) return [{ step: from, len: per, voices: [] }];
  if (onsets[0] > from) out.push({ step: from, len: onsets[0] - from, voices: [] });
  onsets.forEach((s, i) => out.push({ step: s, len: (onsets[i + 1] ?? from + per) - s, voices: hits.get(s)! }));
  return out;
}

/** Every bar's notes, ready to lay out (fresh VexFlow objects each time: they're formatted once). */
function build(bars: GrooveBar[], style: DrumStyle) {
  const per = style.stepsPerBeat;
  return bars.map((bar, i) => {
    const groups: { dir: 1 | -1; hits: Map<number, { voice: DrumVoice; velocity: number }[]> }[] = [
      { dir: 1, hits: new Map() },
      { dir: -1, hits: new Map() },
    ];
    for (const h of bar.hits) {
      const g = groups[FEET.has(h.voice) ? 1 : 0];
      const at = g.hits.get(h.step) ?? [];
      if (!at.some((a) => KEYS[a.voice] === KEYS[h.voice])) at.push({ voice: h.voice, velocity: h.velocity });
      g.hits.set(h.step, at);
    }
    const voices: Voice[] = [];
    const beams: Beam[] = [];
    const tuplets: Tuplet[] = [];
    const tags: { note: StaveNote; tag: string }[] = [];
    for (const g of groups) {
      const notes: StaveNote[] = [];
      for (let b = 0; b < style.beats; b++) {
        const slots = beatSlots(g.hits, b * per, per);
        const beatNotes: StaveNote[] = [];
        for (const s of slots) {
          const duration = durationFor(s.len, style);
          if (!s.voices.length) {
            const rest = new StaveNote({ keys: [g.dir === 1 ? 'b/4' : 'e/4'], duration: `${duration}r`, stemDirection: g.dir });
            rest.setStyle({ fillStyle: 'muted', strokeStyle: 'muted' });
            beatNotes.push(rest);
            continue;
          }
          const keys = [...new Set(s.voices.map((v) => KEYS[v.voice]))];
          const note = new StaveNote({ keys, duration, stemDirection: g.dir });
          // Accents and the open hi-hat's "o" over the hands' notes (charts don't accent the feet).
          const marks =
            g.dir === 1
              ? [s.voices.some((v) => v.velocity >= 0.85) ? '>' : '', s.voices.some((v) => v.voice === 'hhOpen') ? 'o' : ''].filter(Boolean).join(' ')
              : '';
          if (marks) note.addModifier(new Annotation(marks).setFont('Academico', 11, 'bold').setVerticalJustification(Annotation.VerticalJustify.TOP));
          if (keys.length === 1 && s.voices.every((v) => v.velocity < 0.3)) Parenthesis.buildAndAttach([note]);
          tags.push({ note, tag: `${i}:${s.step}:${g.dir === 1 ? 'up' : 'down'}` });
          beatNotes.push(note);
        }
        // Triplets: a beat that isn't a single note is a triplet.
        if (style.triplets && beatNotes.length > 1) tuplets.push(new Tuplet(beatNotes, { numNotes: 3, notesOccupied: 2 }));
        const flagged = beatNotes.filter((n) => !n.isRest() && ['8', '16'].includes(n.getDuration()));
        if (beatNotes.length > 1 && beatNotes.every((n) => !n.isRest()) && flagged.length >= 2) beams.push(new Beam(beatNotes));
        notes.push(...beatNotes);
      }
      const voice = new Voice({ numBeats: style.meter.top, beatValue: style.meter.bottom }).setStrict(false);
      voice.addTickables(notes);
      voices.push(voice);
    }
    const formatter = new Formatter().joinVoices(voices);
    // How much this bar has in it, for sharing out a row's width.
    return { voices, beams, tuplets, tags, formatter, weight: formatter.preCalculateMinTotalWidth(voices) };
  });
}

type Built = ReturnType<typeof build>;

/** Draws every row `perRow` bars to a row, laid out `drawWidth` wide; `ok` is false if a note ran
    over its bar line. `built` is used up (VexFlow formats its notes once). */
function drawRows(built: Built, style: DrumStyle, firstBar: number, perRow: number, drawWidth: number) {
  const usable = drawWidth - 4 - LEAD;
  const mean = built.reduce((a, b) => a + b.weight, 0) / Math.max(1, built.length);
  const rows: Omit<DrumRow, 'width' | 'height'>[] = [];
  let ok = true;
  for (let start = 0; start < built.length; start += perRow) {
    const line = built.slice(start, start + perRow);
    const total = line.reduce((a, o) => a + o.weight, 0) + (perRow - line.length) * mean;
    const widths = line.map((b) => (usable * b.weight) / Math.max(1, total));
    const { context, root } = createNativeContext();
    context.resize(drawWidth, ROW_H);
    const barRects: BarRect[] = [];
    const ids = new Map<string, string>();
    line.forEach(({ voices, beams, tuplets, tags, formatter }, col) => {
      const i = start + col;
      const x = 2 + (col === 0 ? 0 : LEAD + widths.slice(0, col).reduce((a, w) => a + w, 0));
      const stave = new Stave(x, STAVE_Y, widths[col] + (col === 0 ? LEAD : 0));
      if (col === 0) stave.addClef('percussion');
      if (i === 0) stave.addTimeSignature(`${style.meter.top}/${style.meter.bottom}`);
      stave.setContext(context).draw();
      context.setFont('Academico', 10, 'normal');
      context.fillText(String(firstBar + i), x + 2, STAVE_Y + 8);
      formatter.format(voices, Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 10));
      for (const v of voices) v.draw(context, stave);
      for (const b of beams) b.setContext(context).draw();
      for (const t of tuplets) t.setContext(context).draw();
      const end = x + stave.getWidth();
      for (const { note, tag } of tags) {
        ids.set(note.getAttribute('id'), tag);
        // Did it land inside its bar?
        if (note.getNoteHeadEndX() > end + 2) ok = false;
      }
      barRects.push({ x, width: stave.getWidth() });
    });
    tagGroups(root, ids);
    rows.push({ items: flattenTree(root), drawWidth, drawHeight: ROW_H, firstBar: start, barRects });
  }
  return { rows, ok };
}

/** The width to lay `perRow` bars a row out at so every bar has room, judged from how much each
    holds: a bar's notes fit in a stave about 0.7 of their minimum formatted width, 0.83 for
    nearly all (measured over every style and seed); plus the time signature in the first bar. The
    odd bar that needs more is caught by the check after drawing. */
function neededWidth(built: Built, perRow: number): number {
  const mean = built.reduce((a, b) => a + b.weight, 0) / Math.max(1, built.length);
  let need = 0;
  for (let start = 0; start < built.length; start += perRow) {
    const line = built.slice(start, start + perRow);
    const total = line.reduce((a, o) => a + o.weight, 0) + (perRow - line.length) * mean;
    const ratio = Math.max(...line.map((b, col) => 0.82 + (4 + (start + col === 0 ? 28 : 0)) / Math.max(1, b.weight)));
    need = Math.max(need, total * ratio + 4 + LEAD);
  }
  return Math.ceil(need);
}

/** The groove drawn to fit `width`, a row at a time. `firstBar` is the number printed on bar 1.
    Laid out once from each bar's measured needs (a fill gets more room; a row that would be
    squeezed is drawn wider and scaled down, to about 70% before going to fewer bars a row), and
    drawn wider again in the rare case a note still lands past its bar line. Kept to one or two
    passes: this runs on the JS thread while the band plays. */
export function renderDrumRows(style: DrumStyle, bars: GrooveBar[], width: number, firstBar = 1): DrumRow[] {
  if (!bars.length || width < 50) return [];
  installVexFlowNative(); // before any notes are made: they measure their glyphs
  let built = build(bars, style);
  let perRow = Math.max(1, Math.min(4, Math.floor(width / ROW_MIN_BAR)));
  let drawWidth = Math.max(width, neededWidth(built, perRow));
  while (perRow > 1 && drawWidth > width * 1.42) {
    perRow--;
    drawWidth = Math.max(width, neededWidth(built, perRow));
  }
  let out = drawRows(built, style, firstBar, perRow, drawWidth);
  for (let tries = 0; !out.ok && tries < 4; tries++) {
    drawWidth = Math.round(drawWidth * 1.12);
    built = build(bars, style);
    out = drawRows(built, style, firstBar, perRow, drawWidth);
  }
  const scale = width / drawWidth;
  return out.rows.map((r) => ({ ...r, width, height: Math.round(r.drawHeight * scale) }));
}

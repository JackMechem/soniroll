import {
  barHits,
  barNotes,
  BEATS_PER_BAR,
  handHiHat,
  hiHatTicks,
  PHRASE_BARS,
  TICKS_PER_BEAT,
  type Ostinato,
  type SyncopationBar,
} from '@jam-practice/core/syncopation';
import { Barline, Beam, Dot, Formatter, Stave, StaveNote, Tuplet, Voice } from 'vexflow/core';

import type { BarRect } from './stickNotation';
import { createNativeContext, flattenTree, type DrawItem } from './vexflowNative';

/**
 * Syncopation's exercise on a percussion staff — a port of the website's
 * `apps/web/components/syncopation/SyncopationScore.tsx`, drawn with the same VexFlow code through
 * `vexflowNative.ts`, a row at a time. The pattern stems up and the feet stems down (bass drum in
 * the bottom space, hi-hat foot as an x below the staff) — or, with the hi-hat played by hand, the
 * hi-hat stems up and the pattern below. Bars per row depend on the width, as on the web; a double
 * bar ends each 4-bar line.
 *
 * Colours: VexFlow's black becomes `'ink'` (the renderer's notation colour) and rests are painted
 * `'muted'` for the renderer to swap for the theme's muted colour.
 */

const SNARE = 'c/5';
const KICK = 'f/4';
const PEDAL = 'd/4/x2';
const HIHAT = 'g/5/x2';
const RIDE = 'f/5/x2';
const ROW_MIN_BAR = 165;

export type SyncopationRow = {
  items: DrawItem[];
  width: number;
  height: number;
  /** Each bar's place in the row, for lighting the bar that's playing. */
  barRects: BarRect[];
  firstBar: number;
};

type Written = { tick: number; ticks: number; rest: boolean; triplet: boolean; beat: number; keys: string[] };

const DURATIONS: Record<number, string> = { 3: '16', 6: '8', 9: '8d', 12: 'q', 24: 'h' };
const TRIPLET_DURATIONS: Record<number, string> = { 4: '8', 8: 'q' };

function makeNote(w: Written, dir: 1 | -1, restKey: string, showRests: boolean): StaveNote {
  const duration = (w.triplet ? TRIPLET_DURATIONS[w.ticks] : DURATIONS[w.ticks]) ?? 'q';
  const note = new StaveNote({
    keys: w.rest ? [restKey] : w.keys,
    duration: w.rest ? `${duration}r` : duration,
    stemDirection: dir,
  });
  if (duration.endsWith('d')) Dot.buildAndAttach([note], { all: true });
  // The feet's rests take their space but aren't drawn (drum parts leave the gaps empty).
  if (w.rest) note.setStyle(showRests ? { fillStyle: 'muted', strokeStyle: 'muted' } : { fillStyle: 'none', strokeStyle: 'none' });
  return note;
}

function feetPart(bar: SyncopationBar, ostinato: Ostinato): Written[] | null {
  if (ostinato === 'none' || handHiHat(ostinato)) return null;
  if (ostinato === 'kickUnison') return barNotes(bar).map((x) => ({ ...x, keys: [KICK] }));
  const hits = barHits(bar, ostinato).filter((h) => !h.pattern);
  return Array.from({ length: BEATS_PER_BAR }, (_, b) => {
    const keys = [...new Set(hits.filter((h) => h.tick === b * TICKS_PER_BEAT).map((h) => (h.voice === 'kick' ? KICK : PEDAL)))];
    return { tick: b * TICKS_PER_BEAT, ticks: TICKS_PER_BEAT, rest: keys.length === 0, triplet: false, beat: b, keys };
  });
}

function hiHatPart(bar: SyncopationBar, ostinato: Ostinato): Written[] {
  const ticks = hiHatTicks(bar, ostinato);
  const out: Written[] = [];
  for (let b = 0; b < BEATS_PER_BAR; b++) {
    const at = ticks.filter((t) => Math.floor(t / TICKS_PER_BEAT) === b);
    const triplet = at.some((t) => t % 4 === 0 && t % TICKS_PER_BEAT !== 0);
    at.forEach((t, k) =>
      out.push({ tick: t, ticks: (at[k + 1] ?? (b + 1) * TICKS_PER_BEAT) - t, rest: false, triplet, beat: b, keys: [ostinato === 'swing' ? RIDE : HIHAT] }),
    );
  }
  return out;
}

function buildVoice(part: Written[], dir: 1 | -1, restKey: string, showRests: boolean) {
  const notes: StaveNote[] = [];
  const beams: Beam[] = [];
  const tuplets: Tuplet[] = [];
  const byBeat = new Map<number, { w: Written; note: StaveNote }[]>();
  for (const w of part) {
    const note = makeNote(w, dir, restKey, showRests);
    notes.push(note);
    const list = byBeat.get(w.beat) ?? [];
    list.push({ w, note });
    byBeat.set(w.beat, list);
  }
  for (const group of byBeat.values()) {
    if (group[0].w.triplet) tuplets.push(new Tuplet(group.map((g) => g.note), { numNotes: 3, notesOccupied: 2, location: dir === 1 ? 1 : -1 }));
    const first = group.findIndex((g) => !g.w.rest);
    let last = -1;
    group.forEach((g, i) => {
      if (!g.w.rest) last = i;
    });
    if (first < 0 || last - first < 1) continue;
    const run = group.slice(first, last + 1);
    const flagged = (g: { w: Written }) => (g.w.triplet ? g.w.ticks === 4 : g.w.ticks < TICKS_PER_BEAT);
    if (run.every(flagged)) beams.push(new Beam(run.map((g) => g.note)));
  }
  const voice = new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 }).setStrict(false);
  voice.addTickables(notes);
  return { voice, beams, tuplets };
}

/** How many bars go on a row at this width: four (one line of the exercise), else two, else one. */
export function syncopationBarsPerRow(width: number) {
  return width >= ROW_MIN_BAR * 4 ? 4 : width >= ROW_MIN_BAR * 2 ? 2 : 1;
}

/** The exercise drawn `width` units wide, a row at a time. */
export function renderSyncopationRows(bars: SyncopationBar[], ostinato: Ostinato, width: number): SyncopationRow[] {
  const perRow = syncopationBarsPerRow(width);
  const hh = handHiHat(ostinato);
  const rowH = hh ? 150 : 118;
  const lead = 44;
  const usable = width - 4 - lead;
  const weight = (bar: SyncopationBar) => 10 + barNotes(bar).length;
  const rows: SyncopationRow[] = [];

  for (let start = 0; start < bars.length; start += perRow) {
    const line = bars.slice(start, start + perRow);
    const { context, root } = createNativeContext();
    context.resize(width, rowH);
    const total = line.reduce((s, b) => s + weight(b), 0) + (perRow - line.length) * 18;
    const barRects: BarRect[] = [];
    line.forEach((bar, col) => {
      const i = start + col;
      const barW = (usable * weight(bar)) / total;
      const before = line.slice(0, col).reduce((s, b) => s + (usable * weight(b)) / total, 0);
      const x = 2 + (col === 0 ? 0 : lead + before);
      const y = hh ? 34 : 26;
      const stave = new Stave(x, y, barW + (col === 0 ? lead : 0));
      if (col === 0) stave.addClef('percussion');
      if (i === 0) stave.addTimeSignature('4/4');
      if (i === bars.length - 1) stave.setEndBarType(Barline.type.END);
      else if ((i + 1) % PHRASE_BARS === 0) stave.setEndBarType(Barline.type.DOUBLE);
      stave.setContext(context).draw();
      if (col === 0) {
        context.setFont('Academico', 10, 'normal');
        context.fillText(String(i + 1), x + 2, y + 6);
      }

      const pattern = barNotes(bar).map((n) => ({ ...n, keys: [n.voice === 'kick' ? KICK : SNARE] }));
      let up;
      let down;
      if (hh) {
        up = buildVoice(hiHatPart(bar, ostinato), 1, 'b/4', false);
        down = buildVoice(pattern, -1, 'd/4', true);
      } else {
        const feet = feetPart(bar, ostinato);
        up = buildVoice(pattern, 1, feet ? 'e/5' : 'b/4', true);
        down = feet ? buildVoice(feet, -1, 'e/4', false) : null;
      }
      const voices = down ? [up.voice, down.voice] : [up.voice];
      new Formatter().joinVoices(voices).format(voices, Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 8));
      for (const v of voices) v.draw(context, stave);
      for (const b of [...up.beams, ...(down?.beams ?? [])]) b.setContext(context).draw();
      for (const t of [...up.tuplets, ...(down?.tuplets ?? [])]) t.setContext(context).draw();
      barRects.push({ x, width: barW + (col === 0 ? lead : 0) });
    });
    rows.push({ items: flattenTree(root), width, height: rowH, barRects, firstBar: start });
  }
  return rows;
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Barline, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Tuplet, Voice } from "vexflow";
import { useMusicFontVersion } from "@/lib/musicFont";
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
} from "@/lib/syncopation";

// The exercise on a percussion staff: the pattern stems up, the feet stems down (bass drum in
// the bottom space, hi-hat foot as an x below the staff) — or, with the hi-hat played by hand, the
// hi-hat stems up (x above the staff) and the pattern (snare and/or bass drum) below it. Four bars to a line where there's room,
// a double bar at the end of each 4-bar line. Each note's SVG group carries
// `data-at="bar:tick:up|down"` so the playing note can be lit without redrawing.

const SNARE = "c/5";
const KICK = "f/4";
const PEDAL = "d/4/x2";
const HIHAT = "g/5/x2";
/** The ride cymbal: an x on the top line. */
const RIDE = "f/5/x2";
const ROW_MIN_BAR = 165;

type Written = { tick: number; ticks: number; rest: boolean; triplet: boolean; beat: number; keys: string[] };

const DURATIONS: Record<number, string> = { 3: "16", 6: "8", 9: "8d", 12: "q", 24: "h" };
const TRIPLET_DURATIONS: Record<number, string> = { 4: "8", 8: "q" };

function makeNote(w: Written, dir: 1 | -1, restKey: string, showRests: boolean): StaveNote {
  const duration = (w.triplet ? TRIPLET_DURATIONS[w.ticks] : DURATIONS[w.ticks]) ?? "q";
  const note = new StaveNote({
    keys: w.rest ? [restKey] : w.keys,
    duration: w.rest ? `${duration}r` : duration,
    stemDirection: dir,
  });
  if (duration.endsWith("d")) Dot.buildAndAttach([note], { all: true });
  // The feet's rests take their space but aren't drawn (drum parts leave the gaps empty).
  if (w.rest) note.setStyle(showRests ? { fillStyle: "var(--muted)", strokeStyle: "var(--muted)" } : { fillStyle: "transparent", strokeStyle: "transparent" });
  return note;
}

/** The feet's part as written notes: quarters on the beats (rests where there's nothing), or the
    snare's own rhythm when the bass drum plays in unison. */
function feetPart(bar: SyncopationBar, ostinato: Ostinato): Written[] | null {
  if (ostinato === "none" || handHiHat(ostinato)) return null;
  if (ostinato === "kickUnison") return barNotes(bar).map((x) => ({ ...x, keys: [KICK] }));
  const hits = barHits(bar, ostinato).filter((h) => !h.pattern);
  return Array.from({ length: BEATS_PER_BAR }, (_, b) => {
    const keys = [...new Set(hits.filter((h) => h.tick === b * TICKS_PER_BEAT).map((h) => (h.voice === "kick" ? KICK : PEDAL)))];
    return { tick: b * TICKS_PER_BEAT, ticks: TICKS_PER_BEAT, rest: keys.length === 0, triplet: false, beat: b, keys };
  });
}

/** The hand hi-hat as written notes, beat by beat (on a triplet beat, quarter + eighth under a 3). */
function hiHatPart(bar: SyncopationBar, ostinato: Ostinato): Written[] {
  const ticks = hiHatTicks(bar, ostinato);
  const out: Written[] = [];
  for (let b = 0; b < BEATS_PER_BAR; b++) {
    const at = ticks.filter((t) => Math.floor(t / TICKS_PER_BEAT) === b);
    const triplet = at.some((t) => t % 4 === 0 && t % TICKS_PER_BEAT !== 0);
    at.forEach((t, k) => out.push({ tick: t, ticks: (at[k + 1] ?? (b + 1) * TICKS_PER_BEAT) - t, rest: false, triplet, beat: b, keys: [ostinato === "swing" ? RIDE : HIHAT] }));
  }
  return out;
}

/** Builds one voice: notes, the beams within each beat, triplet brackets. */
function buildVoice(part: Written[], dir: 1 | -1, restKey: string, showRests: boolean, bar: number, tags: { note: StaveNote; tag: string }[]) {
  const notes: StaveNote[] = [];
  const beams: Beam[] = [];
  const tuplets: Tuplet[] = [];
  const byBeat = new Map<number, { w: Written; note: StaveNote }[]>();
  for (const w of part) {
    const note = makeNote(w, dir, restKey, showRests);
    notes.push(note);
    if (!w.rest) tags.push({ note, tag: `${bar}:${w.tick}:${dir === 1 ? "up" : "down"}` });
    const list = byBeat.get(w.beat) ?? [];
    list.push({ w, note });
    byBeat.set(w.beat, list);
  }
  for (const group of byBeat.values()) {
    if (group[0].w.triplet) tuplets.push(new Tuplet(group.map((g) => g.note), { numNotes: 3, notesOccupied: 2, location: dir === 1 ? 1 : -1 }));
    // Beam from the first note to the last (a triplet's rest in the middle sits under the beam).
    const first = group.findIndex((g) => !g.w.rest);
    let last = -1;
    group.forEach((g, i) => !g.w.rest && (last = i));
    if (first < 0 || last - first < 1) continue;
    const run = group.slice(first, last + 1);
    const flagged = (g: { w: Written }) => (g.w.triplet ? g.w.ticks === 4 : g.w.ticks < TICKS_PER_BEAT);
    if (run.every(flagged)) beams.push(new Beam(run.map((g) => g.note)));
  }
  const voice = new Voice({ numBeats: BEATS_PER_BAR, beatValue: 4 }).setStrict(false);
  voice.addTickables(notes);
  return { voice, beams, tuplets };
}

export default function SyncopationScore({ bars, ostinato }: { bars: SyncopationBar[]; ostinato: Ostinato }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const fontVersion = useMusicFontVersion();

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || width < 50 || !fontVersion) return;
    el.style.minHeight = `${el.offsetHeight}px`;
    el.innerHTML = "";
    // Four bars (one line of the exercise) to a row, else two, else one.
    const perRow = width >= ROW_MIN_BAR * 4 ? 4 : width >= ROW_MIN_BAR * 2 ? 2 : 1;
    const rows = Math.ceil(bars.length / perRow);
    // With the hi-hat on top (stems up above the staff) and the pattern's stems and triplet
    // brackets below it, a line needs more room.
    const hh = handHiHat(ostinato);
    const rowH = hh ? 150 : 118;
    const lead = 44;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, rows * rowH + (hh ? 30 : 16));
    const ctx = renderer.getContext();
    const tags: { note: StaveNote; tag: string }[] = [];

    // Within a line, busier bars get more room (a bar of sixteenths needs more than a bar of quarters).
    const weight = (bar: SyncopationBar) => 10 + barNotes(bar).length;
    const usable = width - 4 - lead;
    bars.forEach((bar, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const line = bars.slice(row * perRow, row * perRow + perRow);
      const total = line.reduce((s, b) => s + weight(b), 0) + (perRow - line.length) * 18;
      const barW = (usable * weight(bar)) / total;
      const before = line.slice(0, col).reduce((s, b) => s + (usable * weight(b)) / total, 0);
      const x = 2 + (col === 0 ? 0 : lead + before);
      const y = row * rowH + (hh ? 34 : 26);
      const stave = new Stave(x, y, barW + (col === 0 ? lead : 0));
      if (col === 0) stave.addClef("percussion");
      if (i === 0) stave.addTimeSignature("4/4");
      if (i === bars.length - 1) stave.setEndBarType(Barline.type.END);
      else if ((i + 1) % PHRASE_BARS === 0) stave.setEndBarType(Barline.type.DOUBLE);
      stave.setContext(ctx).draw();
      if (col === 0) {
        ctx.setFont("Inter, sans-serif", 10, "normal");
        ctx.fillText(String(i + 1), x + 2, y + 6);
      }

      const pattern = barNotes(bar).map((x) => ({ ...x, keys: [x.voice === "kick" ? KICK : SNARE] }));
      let up, down;
      if (handHiHat(ostinato)) {
        up = buildVoice(hiHatPart(bar, ostinato), 1, "b/4", false, i, tags);
        down = buildVoice(pattern, -1, "d/4", true, i, tags);
      } else {
        up = buildVoice(pattern, 1, "b/4", true, i, tags);
        const feet = feetPart(bar, ostinato);
        down = feet ? buildVoice(feet, -1, "e/4", false, i, tags) : null;
      }
      const voices = down ? [up.voice, down.voice] : [up.voice];
      new Formatter().joinVoices(voices).format(voices, Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 8));
      for (const v of voices) v.draw(ctx, stave);
      for (const b of [...up.beams, ...(down?.beams ?? [])]) b.setContext(ctx).draw();
      for (const t of [...up.tuplets, ...(down?.tuplets ?? [])]) t.setContext(ctx).draw();
    });
    for (const { note, tag } of tags) note.getSVGElement()?.setAttribute("data-at", tag);
    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "currentColor");
    }
    el.style.minHeight = "";
  }, [bars, ostinato, width, fontVersion]);

  return <div ref={box} className="syncopation-score w-full text-foreground" />;
}

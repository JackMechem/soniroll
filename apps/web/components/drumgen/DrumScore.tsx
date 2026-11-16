"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Annotation, Beam, Formatter, Parenthesis, Renderer, Stave, StaveNote, Tuplet, Voice } from "vexflow";
import type { DrumVoice } from "@/lib/drums";
import type { DrumStyle, GrooveBar } from "@/lib/drumStyles";

// The groove written out on a percussion staff, the way drum charts are written: hands (cymbals,
// snare, toms, bells) stems up, feet (bass drum, hi-hat pedal) stems down; x noteheads for
// cymbals, a circled x for cross-stick, a diamond for the ride's bell, triangles for cowbell and
// woodblock; accents on the strong hits, ghost notes in brackets, an "o" over an open hi-hat.
// Swing is written in straight eighths (as it's read); 12/8 in eighths grouped in threes; the
// shuffle in triplets. Each note's SVG group carries `data-at="bar:step:up|down"` so the playing
// note can be lit without redrawing.

const KEYS: Record<DrumVoice, string> = {
  kick: "f/4",
  pedal: "d/4/x2",
  tomLow: "a/4",
  snare: "c/5",
  crossStick: "c/5/x3",
  rimshot: "c/5/ci",
  tomHigh: "e/5",
  hhClosed: "g/5/x2",
  hhOpen: "g/5/x2",
  ride: "f/5/x2",
  bell: "f/5/d2",
  crash: "a/5/x2",
  cowbell: "b/5/t2",
  block: "g/4/t2",
  stir: "c/5/x2",
  tap: "c/5",
};
const FEET = new Set<DrumVoice>(["kick", "pedal"]);

export const DRUM_LEGEND: { voice: DrumVoice; label: string }[] = [
  { voice: "crash", label: "Crash" },
  { voice: "hhClosed", label: "Hi-hat" },
  { voice: "ride", label: "Ride" },
  { voice: "bell", label: "Ride bell" },
  { voice: "cowbell", label: "Cowbell" },
  { voice: "tomHigh", label: "High tom" },
  { voice: "snare", label: "Snare" },
  { voice: "crossStick", label: "Cross-stick" },
  { voice: "tomLow", label: "Floor tom" },
  { voice: "block", label: "Woodblock" },
  { voice: "kick", label: "Bass drum" },
  { voice: "pedal", label: "Hi-hat foot" },
];

const ROW_MIN_BAR = 230;

type Slot = { step: number; len: number; voices: { voice: DrumVoice; velocity: number }[] };

/** Note values for a run of `len` grid steps. */
function durationFor(len: number, style: DrumStyle): string {
  const per = style.stepsPerBeat;
  if (per === 4) return ["16", "8", "8d", "q"][len - 1] ?? "q";
  if (per === 2) return len >= 2 ? "q" : "8";
  if (style.triplets) return len >= 3 ? "q" : len === 2 ? "q" : "8";
  return ["8", "q", "qd"][len - 1] ?? "qd"; // 12/8
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

export default function DrumScore({ style, bars, firstBar = 1 }: { style: DrumStyle; bars: GrooveBar[]; firstBar?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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
    if (!el || width < 50) return;
    // Hold the height while redrawing so the page doesn't jump.
    el.style.minHeight = `${el.offsetHeight}px`;
    el.innerHTML = "";
    const per = style.stepsPerBeat;
    const muted = "var(--muted)";

    /** Every bar's notes, ready to lay out. */
    const build = () =>
      bars.map((bar, i) => {
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
                const rest = new StaveNote({ keys: [g.dir === 1 ? "b/4" : "e/4"], duration: `${duration}r`, stemDirection: g.dir });
                rest.setStyle({ fillStyle: muted, strokeStyle: muted });
                beatNotes.push(rest);
                continue;
              }
              const keys = [...new Set(s.voices.map((v) => KEYS[v.voice]))];
              const note = new StaveNote({ keys, duration, stemDirection: g.dir });
              // Accents and the open hi-hat's "o" go above the hands' notes.
              // (Drum charts don't usually accent the feet.)
              const marks = g.dir === 1 ? [s.voices.some((v) => v.velocity >= 0.85) ? ">" : "", s.voices.some((v) => v.voice === "hhOpen") ? "o" : ""].filter(Boolean).join(" ") : "";
              if (marks) note.addModifier(new Annotation(marks).setFont("Inter, sans-serif", 11, "bold").setVerticalJustification(Annotation.VerticalJustify.TOP));
              if (keys.length === 1 && s.voices.every((v) => v.velocity < 0.3)) Parenthesis.buildAndAttach([note]);
              tags.push({ note, tag: `${i}:${s.step}:${g.dir === 1 ? "up" : "down"}` });
              beatNotes.push(note);
            }
            // Triplets: a beat that isn't a single note is a triplet.
            if (style.triplets && beatNotes.length > 1) tuplets.push(new Tuplet(beatNotes, { numNotes: 3, notesOccupied: 2 }));
            const flagged = beatNotes.filter((n) => !n.isRest() && ["8", "16"].includes(n.getDuration()));
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

    const usable = width - 4 - 46;
    const rowH = 150;
    /** Draws the bars `perRow` to a row; false if a note ran over its bar line. Within a row, each
        bar's width follows how much is in it, so a busy bar (a fill) gets more room. */
    const draw = (perRow: number): boolean => {
      el.innerHTML = "";
      const built = build();
      const mean = built.reduce((a, b) => a + b.weight, 0) / Math.max(1, built.length);
      const widths = built.map((b, i) => {
        const row = Math.floor(i / perRow);
        const inRow = built.slice(row * perRow, row * perRow + perRow);
        const total = inRow.reduce((a, o) => a + o.weight, 0) + (perRow - inRow.length) * mean;
        return (usable * b.weight) / Math.max(1, total);
      });
      const rows = Math.ceil(bars.length / perRow);
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(width, rows * rowH + 10);
      const ctx = renderer.getContext();
      const ends: number[] = [];
      built.forEach(({ voices, beams, tuplets, tags, formatter }, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const x = 2 + (col === 0 ? 0 : 46 + widths.slice(row * perRow, i).reduce((a, w) => a + w, 0));
        const stave = new Stave(x, row * rowH + 34, widths[i] + (col === 0 ? 46 : 0));
        if (col === 0) stave.addClef("percussion");
        if (i === 0) stave.addTimeSignature(`${style.meter.top}/${style.meter.bottom}`);
        stave.setContext(ctx).draw();
        ctx.setFont("Inter, sans-serif", 10, "normal");
        ctx.fillText(String(firstBar + i), x + 2, row * rowH + 42);
        formatter.format(voices, Math.max(60, stave.getNoteEndX() - stave.getNoteStartX() - 10));
        for (const v of voices) v.draw(ctx, stave);
        for (const b of beams) b.setContext(ctx).draw();
        for (const t of tuplets) t.setContext(ctx).draw();
        for (const { note, tag } of tags) note.getSVGElement()?.setAttribute("data-at", tag);
        ends.push(x + stave.getWidth());
      });
      // Did every note land inside its bar?
      const left = el.getBoundingClientRect().left;
      return [...el.querySelectorAll("[data-at]")].every((n) => {
        const bar = Number(n.getAttribute("data-at")!.split(":")[0]);
        const head = n.querySelector(".vf-notehead") ?? n;
        return head.getBoundingClientRect().right - left <= ends[bar] + 2;
      });
    };
    // As many bars a row as the width allows — fewer if a bar wouldn't fit (squeezed, a bar of
    // 16ths with a fill ran over its bar line).
    let perRow = Math.max(1, Math.min(4, Math.floor(width / ROW_MIN_BAR)));
    while (!draw(perRow) && perRow > 1) perRow--;
    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "currentColor");
    }
    el.style.minHeight = "";
  }, [bars, style, width, firstBar]);

  return <div ref={box} className="drum-score w-full text-foreground" />;
}

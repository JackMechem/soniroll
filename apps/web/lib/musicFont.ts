"use client";

// VexFlow draws noteheads, flags and rests as glyphs of its music font (Bravura, text in
// Academico) and measures them while laying the music out. Its entry module starts loading those
// fonts when it's imported, but doesn't wait: a score drawn before they arrive is laid out with a
// fallback font's sizes (stems apart from their noteheads, notes on top of each other, fewer bars
// a row) and stays that way until something redraws it. Every VexFlow renderer reads
// `useMusicFontVersion()`: 0 means "don't draw yet", and it goes up once the fonts are in (or
// after a few seconds without them, so a failed load still shows something), so a renderer that
// has it in its effect's dependencies draws once the fonts are ready, and again if they arrive late.
import "vexflow"; // registers the FontFaces before we ask for them
import { useSyncExternalStore } from "react";

let version = 0;
let started = false;
let loaded = false;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof document === "undefined") return;
  started = true;
  const fonts = document.fonts;
  if (!fonts) {
    loaded = true;
    bump();
    return;
  }
  const done = () => {
    if (loaded) return;
    loaded = true;
    bump();
  };
  // `fonts.ready` too, for the page's own text fonts (Inter labels, the chord-symbol faces).
  Promise.all([fonts.load('30px "Bravura"'), fonts.load('12px "Academico"')])
    .then(() => fonts.ready)
    .then(done, done);
  setTimeout(() => {
    if (version === 0) bump();
  }, 3000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/** 0 until VexFlow's music font has loaded (don't draw yet); then a number that changes whenever
    the score should be redrawn for fonts. Put it in the drawing effect's dependencies. */
export function useMusicFontVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

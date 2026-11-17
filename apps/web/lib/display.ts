/** Device-only display settings (Account → Settings → Appearance, like the theme): text size and
    motion. `DISPLAY_INIT_SCRIPT` paints them before the page shows, so nothing jumps; this file has
    no React in it so the root layout can inline that script. */
export const DISPLAY_KEY = "jam-practice-display";
export const TEXT_SIZES = [
  { value: "small", label: "Small", pct: 93.75 },
  { value: "normal", label: "Normal", pct: 100 },
  { value: "large", label: "Large", pct: 112.5 },
  { value: "larger", label: "Larger", pct: 125 },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["value"];
export const DISPLAY_DEFAULTS = {
  textSize: "normal" as TextSize,
  /** Turn off animations, even when the device doesn't ask for less motion. */
  lessMotion: false,
  /** The look from before the 2026-11 refresh: rounder corners, icon tiles in the sidebar, bolder
      page titles (the `classic-look` class; see globals.css). */
  classicLook: false,
};

/** Puts the display settings on <html>: the root font size (everything is sized in rem) and the
    `less-motion` and `classic-look` classes (see globals.css). */
export function applyDisplay(d: typeof DISPLAY_DEFAULTS) {
  const root = document.documentElement;
  const pct = TEXT_SIZES.find((t) => t.value === d.textSize)?.pct ?? 100;
  root.style.fontSize = pct === 100 ? "" : `${pct}%`;
  root.classList.toggle("less-motion", d.lessMotion);
  root.classList.toggle("classic-look", d.classicLook === true);
}

const SIZE_PCT = JSON.stringify(Object.fromEntries(TEXT_SIZES.map((t) => [t.value, t.pct])));
export const DISPLAY_INIT_SCRIPT = `(function(){try{var o=JSON.parse(localStorage.getItem('${DISPLAY_KEY}')||'null');if(!o)return;var d=document.documentElement;var p=${SIZE_PCT}[o.textSize];if(p&&p!==100)d.style.fontSize=p+'%';if(o.lessMotion===true)d.classList.add('less-motion');if(o.classicLook===true)d.classList.add('classic-look');}catch(e){}})();`;

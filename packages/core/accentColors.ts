import type { Category } from "./navLinks";

/**
 * Colours derived from a theme's accent: the tool-category colours and the key colours. The website
 * makes them in CSS (`apps/web/app/globals.css`, `oklch(from var(--accent) l max(c, 0.09) calc(h +
 * N))`); the phone app can't, so this does the same sum in plain TypeScript: the accent turned
 * around the colour wheel in OKLCH at the same lightness, with a floor on the chroma so near-grey
 * accents still give distinct colours, then clipped into sRGB channel by channel — what Chromium
 * does when it paints these (checked against it: the same hex for every step of several accents).
 */

/** Hue steps for `--cat-0`…`--cat-6`, spaced so neighbouring sections differ. */
const CATEGORY_STEPS = [0, 154, 308, 103, 257, 51, 206];
/** Hue steps for `--key-0`…`--key-11`: keys a fifth apart sit next to each other. */
const KEY_STEPS = [0, 210, 60, 270, 120, 330, 180, 30, 240, 90, 300, 150];

/** Which `--cat-N` each category uses (the web's `CATEGORY_COLORS` reads this too). */
export const CATEGORY_INDEX: Record<Category, number> = {
  Community: 0,
  "Play along": 1,
  "Time & rhythm": 2,
  "Ear training": 3,
  "On your instrument": 4,
  Drums: 5,
  "Practice tools": 6,
};

/** The colour for a tool category, from the theme's accent (`#rrggbb`). */
export function categoryColor(accent: string, category: Category): string {
  return rotateAccent(accent, CATEGORY_STEPS[CATEGORY_INDEX[category]] ?? 0);
}

/** The colour for key `index` (0–11, as the web's `--key-N`), from the theme's accent. */
export function keyColor(accent: string, index: number): string {
  return rotateAccent(accent, KEY_STEPS[((index % 12) + 12) % 12]);
}

/** The accent turned `degrees` round the OKLCH hue circle, chroma at least 0.09. */
export function rotateAccent(accent: string, degrees: number): string {
  const rgb = parseHex(accent);
  if (!rgb) return accent;
  const [l, c, h] = rgbToOklch(rgb);
  return oklchToHex(l, Math.max(c, 0.09), h + degrees);
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` → sRGB channels 0–1 (alpha ignored). */
function parseHex(hex: string): [number, number, number] | null {
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) s = s.replace(/./g, (ch) => ch + ch);
  if (s.length !== 6 && s.length !== 8) return null;
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB → OKLCH (Björn Ottosson's OKLab matrices). Hue in degrees. */
function rgbToOklch([r8, g8, b8]: [number, number, number]): [number, number, number] {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  // A grey has no real hue: Chromium's own conversion leaves a hue of about 23.7° on every grey,
  // so use that to match the website.
  return [L, C, C < 1e-4 ? 23.7 : (Math.atan2(B, A) * 180) / Math.PI];
}

/** OKLCH → linear sRGB (may be out of gamut). */
function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const rad = (H * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → `#rrggbb`, each channel clipped into sRGB. */
function oklchToHex(L: number, C: number, H: number): string {
  const hex = oklchToLinear(L, C, H)
    .map((c) => Math.round(fromLinear(Math.min(1, Math.max(0, c))) * 255))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

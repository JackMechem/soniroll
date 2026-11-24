/**
 * Where the selection's floating toolbar goes: by the selection, but never over what's printed or
 * drawn next to it (the line above a word you're retyping, say). A drawn page is reduced once to a
 * coarse grid of which cells have print on them, so trying a few spots stays cheap while scrolling.
 */

type Grid = { cols: number; rows: number; ink: Uint8Array };
const CELL = 6; // canvas pixels per cell
const grids = new WeakMap<HTMLCanvasElement, { w: number; h: number; grid: Grid | null }>();

/** Which cells of a drawn page have print on them (darker than its paper), cached per drawing. */
function inkGrid(c: HTMLCanvasElement): Grid | null {
  const hit = grids.get(c);
  if (hit && hit.w === c.width && hit.h === c.height) return hit.grid;
  let grid: Grid | null = null;
  try {
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx && c.width && c.height) {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const cols = Math.ceil(c.width / CELL);
      const rows = Math.ceil(c.height / CELL);
      const darkest = new Uint8Array(cols * rows).fill(255);
      for (let y = 0; y < c.height; y += 2)
        for (let x = 0; x < c.width; x += 2) {
          const i = (y * c.width + x) * 4;
          const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
          const k = Math.floor(y / CELL) * cols + Math.floor(x / CELL);
          if (l < darkest[k]) darkest[k] = l;
        }
      // The paper: the usual lightness of a cell's darkest pixel (most cells are blank).
      const sorted = [...darkest].sort((a, b) => a - b);
      const paper = sorted[Math.floor(sorted.length * 0.6)];
      const ink = new Uint8Array(cols * rows);
      for (let k = 0; k < ink.length; k++) ink[k] = darkest[k] < paper - 45 ? 1 : 0;
      grid = { cols, rows, ink };
    }
  } catch {
    grid = null;
  }
  grids.set(c, { w: c.width, h: c.height, grid });
  return grid;
}

type Rect = { left: number; top: number; right: number; bottom: number };

/** Whether a screen rectangle covers print on the page (`pageEl`'s canvas) or any of `boxes`. */
export function covers(pageEl: HTMLElement, rect: Rect, boxes: Rect[]) {
  if (boxes.some((b) => b.left < rect.right && rect.left < b.right && b.top < rect.bottom && rect.top < b.bottom)) return true;
  const c = pageEl.querySelector("canvas");
  if (!c) return false;
  const grid = inkGrid(c);
  if (!grid) return false;
  const r = pageEl.getBoundingClientRect();
  const kx = c.width / r.width / CELL;
  const ky = c.height / r.height / CELL;
  const c0 = Math.max(0, Math.floor((rect.left - r.left) * kx));
  const c1 = Math.min(grid.cols - 1, Math.floor((rect.right - r.left) * kx));
  const r0 = Math.max(0, Math.floor((rect.top - r.top) * ky));
  const r1 = Math.min(grid.rows - 1, Math.floor((rect.bottom - r.top) * ky));
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) if (grid.ink[y * grid.cols + x]) return true;
  return false;
}

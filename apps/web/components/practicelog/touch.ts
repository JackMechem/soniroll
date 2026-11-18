/** Bigger tap targets on touch screens, without changing the layout: an invisible ::after around
    the element takes the tap. `pointer-coarse:` only, so a mouse keeps the tight targets. */

/** A task's check box: 24 px drawn, a 44 px hit area. Add to a box that's `h-5 w-5` (or `h-6`). */
export const TOUCH_CHECK =
  "relative pointer-coarse:h-6 pointer-coarse:w-6 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5";

/** A small inline text button (a link in a line of muted text): at least 32 px tall to tap. */
export const TOUCH_TEXT = "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2";

/** A small icon button beside a task (time it, log time, options): 40 × 40 on touch. */
export const TOUCH_ICON = "flex items-center justify-center pointer-coarse:h-10 pointer-coarse:w-10";

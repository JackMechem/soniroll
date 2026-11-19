/**
 * The soniroll logo: the daily goal ring from the Shed Log, nearly closed, with a tick where it's
 * heading and a note in the middle, next to the "soniroll" wordmark (Poppins ExtraBold, as
 * outlines so it looks the same everywhere). Drawn from the theme's colours, so it matches whatever
 * theme is selected: the ring in `accent`, the faint track, note and letters in `foreground`, and
 * the tick cut out in `background`. Plain server-safe SVG.
 *
 * `data-ring` / `data-badge` are what `lib/logoAnimation.ts` animates on page changes.
 */

import { BADGE, LOGO_ASPECT, NOTE, RING_ARC, VIEW_BOX, WORD_PATH } from "@jam-practice/core/logo";

export { BADGE, NOTE, RING_ARC, VIEW_BOX, WORD_PATH };
const ASPECT = LOGO_ASPECT;

/** The mark (ring, badge, note) in a 200×200 box, coloured by the theme. */
function Mark() {
  return (
    <>
      <circle cx="100" cy="100" r="72" fill="none" className="stroke-foreground" strokeWidth="22" opacity="0.12" />
      <path data-ring="" d={RING_ARC} pathLength={1} fill="none" className="stroke-accent" strokeWidth="22" strokeLinecap="round" />
      <g data-badge="" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <circle cx={BADGE.cx} cy={BADGE.cy} r={BADGE.r} className="fill-foreground" />
        <path d={BADGE.tick} fill="none" className="stroke-background" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <ellipse
        cx={NOTE.head.cx}
        cy={NOTE.head.cy}
        rx={NOTE.head.rx}
        ry={NOTE.head.ry}
        transform={`rotate(${NOTE.head.rotate} ${NOTE.head.cx} ${NOTE.head.cy})`}
        className="fill-foreground"
      />
      <path d={NOTE.stem} fill="none" className="stroke-foreground" strokeWidth="8" strokeLinecap="round" />
    </>
  );
}

/** The full logo — mark and wordmark. `height` (px) sets the size; the width follows. */
export default function Logo({ height = 32, className = "", title = "soniroll" }: { height?: number; className?: string; title?: string }) {
  return (
    <svg width={height * ASPECT} height={height} viewBox={VIEW_BOX} role="img" aria-label={title} className={className}>
      <Mark />
      <path d={WORD_PATH} className="fill-foreground" />
    </svg>
  );
}

/** Just the mark — the goal ring — for small spaces (the collapsed sidebar, the maintenance screen). */
export function LogoMark({ size = 28, className = "", title = "soniroll" }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={title} className={className}>
      <Mark />
    </svg>
  );
}

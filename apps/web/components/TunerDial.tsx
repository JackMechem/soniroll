"use client";

const NOTES = [
  { pc: 0, main: "C", alt: null },
  { pc: 1, main: "C#", alt: "Db" },
  { pc: 2, main: "D", alt: null },
  { pc: 3, main: "D#", alt: "Eb" },
  { pc: 4, main: "E", alt: null },
  { pc: 5, main: "F", alt: null },
  { pc: 6, main: "F#", alt: "Gb" },
  { pc: 7, main: "G", alt: null },
  { pc: 8, main: "G#", alt: "Ab" },
  { pc: 9, main: "A", alt: null },
  { pc: 10, main: "A#", alt: "Bb" },
  { pc: 11, main: "B", alt: null },
];

const SIZE = 400;
const CENTER = SIZE / 2;
const OUTER = 194;
const INNER = 128;
const MID = (OUTER + INNER) / 2;
const GAP_DEGREES = 1.6;

function polar(radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  // Rounded so the server and browser (whose trig can differ in the last digits) render identical markup.
  const round = (n: number) => Math.round(n * 100) / 100;
  return [round(CENTER + radius * Math.cos(radians)), round(CENTER + radius * Math.sin(radians))];
}

function segmentPath(centerDegrees: number) {
  const start = centerDegrees - 15 + GAP_DEGREES;
  const end = centerDegrees + 15 - GAP_DEGREES;
  const [ox1, oy1] = polar(OUTER, start);
  const [ox2, oy2] = polar(OUTER, end);
  const [ix1, iy1] = polar(INNER, start);
  const [ix2, iy2] = polar(INNER, end);
  return `M ${ox1} ${oy1} A ${OUTER} ${OUTER} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${INNER} ${INNER} 0 0 0 ${ix1} ${iy1} Z`;
}

/** A ring of the 12 notes (C at the top) with the tuner readout in the middle. */
/** "C#" → "C♯", "Db" → "D♭", for the labels on the dial. */
function glyphs(name: string) {
  return name.replace("#", "♯").replace(/^([A-G])b/, "$1♭");
}

export default function TunerDial({
  detectedPc,
  detectedColor,
  playingPc,
  onSelect,
  tight = false,
  children,
}: {
  /** Pitch class currently heard, lit up on the ring. */
  detectedPc: number | null;
  detectedColor: string;
  /** Pitch class of the tone being played, filled with the accent on the ring. */
  playingPc: number | null;
  onSelect: (pc: number) => void;
  /** Less padding inside the ring, to make room for the pitch graph. */
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px] [@media(min-width:1024px)_and_(max-height:960px)]:max-w-[330px]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-full w-full"
        role="group"
        aria-label="Notes"
      >
        {NOTES.map(({ pc, main, alt }) => {
          const degrees = pc * 30;
          const [tx, ty] = polar(MID, degrees);
          const isDetected = detectedPc === pc;
          const isPlaying = playingPc === pc;
          return (
            <g
              key={pc}
              role="button"
              tabIndex={0}
              aria-label={`Play ${alt ? `${main} / ${alt}` : main}`}
              aria-pressed={isPlaying}
              onClick={() => onSelect(pc)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSelect(pc);
                }
              }}
              className="group cursor-pointer outline-none"
            >
              <path
                d={segmentPath(degrees)}
                className={`transition-colors ${
                  isDetected
                    ? ""
                    : isPlaying
                      ? "fill-accent"
                      : alt
                        ? "fill-surface-hover group-hover:fill-muted/30"
                        : "fill-surface group-hover:fill-surface-hover"
                }`}
                // The playing note is filled rather than outlined: a stroke drew half outside the
                // wedge and poked past the ring.
                style={isDetected ? { fill: detectedColor } : undefined}
              />
              <path
                d={segmentPath(degrees)}
                className="fill-none stroke-accent opacity-0 group-focus-visible:opacity-100"
                strokeWidth={3}
              />
              <text
                x={tx}
                y={alt ? ty - 7 : ty}
                textAnchor="middle"
                dominantBaseline="central"
                className={`select-none text-[26px] font-semibold ${
                  isDetected ? "fill-background" : isPlaying ? "fill-accent-foreground" : "fill-foreground"
                }`}
              >
                {glyphs(main)}
              </text>
              {alt && (
                <text
                  x={tx}
                  y={ty + 17}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={`select-none text-[19px] font-medium ${
                    isDetected ? "fill-background" : "fill-foreground/75"
                  }`}
                >
                  {glyphs(alt)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* With the graph it's clipped to the circle, so the graph's ends meet the ring. */}
      <div className={`pointer-events-none absolute left-1/2 top-1/2 flex aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-between rounded-full text-center ${tight ? "overflow-hidden py-[5%]" : "py-[9%]"}`}>
        {children}
      </div>
    </div>
  );
}

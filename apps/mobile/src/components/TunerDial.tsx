import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Native port of `apps/web/components/TunerDial.tsx` — the exact same polar-coordinate SVG path
 * math (pure, portable 1:1 — `react-native-svg` understands the identical path-string syntax a
 * browser's own `<path d="...">` does), just through `react-native-svg`'s `Svg`/`G`/`Path`/`Text`
 * instead of plain DOM `<svg>` elements, and colors passed as explicit props (resolved by the
 * caller from `useAppTheme()`) rather than read via `className`/CSS custom properties — the same
 * "color must be inline/explicit, not className" rule every other themed native component in this
 * app already follows (see `ThemeProvider.tsx`'s own doc comment for why).
 */
const NOTES = [
  { pc: 0, main: 'C', alt: null },
  { pc: 1, main: 'C#', alt: 'Db' },
  { pc: 2, main: 'D', alt: null },
  { pc: 3, main: 'D#', alt: 'Eb' },
  { pc: 4, main: 'E', alt: null },
  { pc: 5, main: 'F', alt: null },
  { pc: 6, main: 'F#', alt: 'Gb' },
  { pc: 7, main: 'G', alt: null },
  { pc: 8, main: 'G#', alt: 'Ab' },
  { pc: 9, main: 'A', alt: null },
  { pc: 10, main: 'A#', alt: 'Bb' },
  { pc: 11, main: 'B', alt: null },
] as const;

const SIZE = 400;
const CENTER = SIZE / 2;
const OUTER = 194;
const INNER = 128;
const MID = (OUTER + INNER) / 2;
const GAP_DEGREES = 1.6;

function polar(radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(radians), CENTER + radius * Math.sin(radians)];
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

/** "C#" → "C♯", "Db" → "D♭", for the labels on the dial. */
function glyphs(name: string) {
  return name.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
}

/** A ring of the 12 notes (C at the top) with the tuner readout (the heard note, big) in the
    middle; tap a note to hear it. The heard note is lit in its tuning colour, the one playing
    filled with the accent. `size` is its width and height (the screen fits it to the space). */
export function TunerDial({
  detectedPc,
  detectedColor,
  playingPc,
  onSelect,
  size,
  children,
}: {
  size: number;
  /** Pitch class currently heard, lit up on the ring. */
  detectedPc: number | null;
  detectedColor: string;
  /** Pitch class of the tone being played, outlined on the ring. */
  playingPc: number | null;
  onSelect: (pc: number) => void;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: size, height: size }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {NOTES.map(({ pc, main, alt }) => {
          const degrees = pc * 30;
          const [tx, ty] = polar(MID, degrees);
          const isDetected = detectedPc === pc;
          const isPlaying = playingPc === pc;
          // The playing note is filled with the accent (like the website's), not outlined.
          const fill = isDetected ? detectedColor : isPlaying ? colors.accent : alt ? colors['surface-hover'] : colors.surface;
          const textColor = isDetected ? colors.background : isPlaying ? colors['accent-foreground'] : colors.foreground;
          const altColor = isDetected ? colors.background : isPlaying ? colors['accent-foreground'] : withAlpha(colors.foreground, 0.75);
          return (
            <G key={pc} onPress={() => onSelect(pc)} accessibilityRole="button" accessibilityLabel={`Play ${alt ? `${main} / ${alt}` : main}`}>
              <Path d={segmentPath(degrees)} fill={fill} />
              <SvgText
                x={tx}
                y={alt ? ty - 7 : ty}
                textAnchor="middle"
                alignmentBaseline="central"
                fontSize={26}
                fontWeight="600"
                fontFamily="Geist_600SemiBold"
                fill={textColor}
              >
                {glyphs(main)}
              </SvgText>
              {alt ? (
                <SvgText
                  x={tx}
                  y={ty + 17}
                  textAnchor="middle"
                  alignmentBaseline="central"
                  fontSize={19}
                  fontFamily="Geist_400Regular"
                  fill={altColor}
                >
                  {glyphs(alt)}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: '21%',
          top: '21%',
          width: '58%',
          height: '58%',
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * The flat/sharp meter under the dial — the tuner's main feedback, read like a real meter: a thick
 * track from −50 to +50 cents with a tick every 5 (taller at ±25 and ±50, tallest at 0), the
 * in-tune zone (±8 cents) as a clear band in `zoneColor` (lit while the reading is in it), the
 * numbers under it, and a thick needle in the reading's colour. `caption` is the line under it
 * (the verdict, or what to do when nothing's heard).
 */
export function TunerMeter({
  cents,
  color,
  zoneColor,
  caption,
  captionColor,
}: {
  cents: number | null;
  color: string;
  zoneColor: string;
  caption: string;
  captionColor: string;
}) {
  const { colors } = useAppTheme();
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5 - 50);
  const inZone = cents !== null && Math.abs(cents) <= 8;
  return (
    <View
      className="w-full gap-1"
      accessibilityRole="progressbar"
      accessibilityLabel="Tuning offset in cents"
      accessibilityValue={{ min: -50, max: 50, now: Math.round(cents ?? 0) }}
    >
      <View style={{ height: 40, marginHorizontal: 20 }}>
        {/* The track. */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 14, height: 12, borderRadius: 6, backgroundColor: withAlpha(colors.foreground, 0.08) }} />
        {/* The in-tune zone. */}
        <View
          style={{
            position: 'absolute',
            left: '42%',
            width: '16%',
            top: 2,
            bottom: 2,
            borderRadius: 8,
            backgroundColor: withAlpha(zoneColor, inZone ? 0.35 : 0.16),
            borderWidth: 1.5,
            borderColor: withAlpha(zoneColor, inZone ? 0.9 : 0.45),
          }}
        />
        {ticks.map((t) => {
          const h = t === 0 ? 30 : t % 25 === 0 ? 20 : 10;
          return (
            <View
              key={t}
              style={{
                position: 'absolute',
                left: `${50 + t}%`,
                top: 20 - h / 2,
                width: t === 0 ? 2 : 1,
                height: h,
                marginLeft: t === 0 ? -1 : -0.5,
                backgroundColor: withAlpha(colors.foreground, t === 0 ? 0.55 : 0.3),
              }}
            />
          );
        })}
        {cents !== null ? (
          <View
            style={{
              position: 'absolute',
              left: `${50 + cents}%`,
              top: 0,
              width: 10,
              height: 40,
              marginLeft: -5,
              borderRadius: 5,
              backgroundColor: color,
            }}
          />
        ) : null}
      </View>
      <View style={{ height: 15, marginHorizontal: 20 }}>
        {[-50, -25, 0, 25, 50].map((t) => (
          <Text
            key={t}
            className="font-ui text-center text-[11px] tabular-nums"
            style={{ position: 'absolute', left: `${50 + t}%`, width: 40, marginLeft: -20, color: colors.muted }}
          >
            {t === 0 ? '0' : t < 0 ? `−${-t}` : `+${t}`}
          </Text>
        ))}
      </View>
      <Text numberOfLines={1} className="font-ui-semibold mt-1 text-center text-base font-semibold" style={{ color: captionColor }}>
        {caption}
      </Text>
    </View>
  );
}

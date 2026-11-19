import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';

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

/** A ring of the 12 notes (C at the top) with the tuner readout in the middle. */
export function TunerDial({
  detectedPc,
  detectedColor,
  playingPc,
  onSelect,
  children,
}: {
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
    <View style={{ width: '100%', maxWidth: 340, aspectRatio: 1 }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {NOTES.map(({ pc, main, alt }) => {
          const degrees = pc * 30;
          const [tx, ty] = polar(MID, degrees);
          const isDetected = detectedPc === pc;
          const isPlaying = playingPc === pc;
          const fill = isDetected ? detectedColor : alt ? colors['surface-hover'] : colors.surface;
          const textColor = isDetected ? colors.background : colors.foreground;
          const altColor = isDetected ? colors.background : colors.muted;
          return (
            <G key={pc} onPress={() => onSelect(pc)}>
              <Path
                d={segmentPath(degrees)}
                fill={fill}
                stroke={isPlaying ? colors.accent : 'transparent'}
                strokeWidth={4}
              />
              <SvgText
                x={tx}
                y={alt ? ty - 4 : ty}
                textAnchor="middle"
                alignmentBaseline="central"
                fontSize={26}
                fontWeight="600"
                fontFamily="Geist_600SemiBold"
                fill={textColor}
              >
                {main}
              </SvgText>
              {alt ? (
                <SvgText
                  x={tx}
                  y={ty + 18}
                  textAnchor="middle"
                  alignmentBaseline="central"
                  fontSize={15}
                  fontFamily="Geist_400Regular"
                  fill={altColor}
                >
                  {alt}
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
          justifyContent: 'space-between',
          paddingVertical: '9%',
        }}
      >
        {children}
      </View>
    </View>
  );
}

import { BADGE, LOGO_ASPECT, NOTE, RING, RING_ARC, VIEW_BOX, WORD_PATH } from '@jam-practice/core/logo';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';

/** The ring's arc is 300° of a circle of radius 72 — its length, for drawing it partway (the
    launch animation sweeps it closed with `strokeDashoffset`). */
export const RING_ARC_LENGTH = (2 * Math.PI * RING.r * 300) / 360;

/** The mark — the goal ring with its badge and note — in a 200×200 box, from the theme's colours:
    the ring in `accent`, the track, note and badge in `foreground`, the tick in `background`. The
    same shapes as the website's logo (`@jam-practice/core/logo`). */
export function Mark() {
  const { colors } = useAppTheme();
  return (
    <>
      <Circle
        cx={RING.cx}
        cy={RING.cy}
        r={RING.r}
        fill="none"
        stroke={colors.foreground}
        strokeWidth={RING.width}
        opacity={RING.trackOpacity}
      />
      <Path d={RING_ARC} fill="none" stroke={colors.accent} strokeWidth={RING.width} strokeLinecap="round" />
      <G>
        <Circle cx={BADGE.cx} cy={BADGE.cy} r={BADGE.r} fill={colors.foreground} />
        <Path
          d={BADGE.tick}
          fill="none"
          stroke={colors.background}
          strokeWidth={BADGE.tickWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Ellipse
        cx={NOTE.head.cx}
        cy={NOTE.head.cy}
        rx={NOTE.head.rx}
        ry={NOTE.head.ry}
        transform={`rotate(${NOTE.head.rotate} ${NOTE.head.cx} ${NOTE.head.cy})`}
        fill={colors.foreground}
      />
      <Path d={NOTE.stem} fill="none" stroke={colors.foreground} strokeWidth={NOTE.stemWidth} strokeLinecap="round" />
    </>
  );
}

/** The full soniroll logo — the ring and the wordmark. `height` sets the size; the width follows. */
export function Logo({ height = 32 }: { height?: number }) {
  const { colors } = useAppTheme();
  return (
    <Svg width={height * LOGO_ASPECT} height={height} viewBox={VIEW_BOX} accessibilityLabel="soniroll">
      <Mark />
      <Path d={WORD_PATH} fill={colors.foreground} />
    </Svg>
  );
}

/** Just the ring, for small spaces and the launch screen. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="soniroll">
      <Mark />
    </Svg>
  );
}

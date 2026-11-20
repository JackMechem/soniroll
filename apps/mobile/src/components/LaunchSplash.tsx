import { BADGE, NOTE, RING, RING_ARC } from '@jam-practice/core/logo';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { RING_ARC_LENGTH } from '@/components/Logo';

/** The native splash's colours (`app.json`: the dark default theme's background, text and accent),
    fixed so the hand-off from the native splash is seamless whatever theme is picked. */
const SPLASH = { background: '#18232F', foreground: '#F2F2F5', accent: '#72A3DC' };
/** `app.json`'s `imageWidth`: the native splash draws the 200-unit mark this wide. */
const SIZE = 140;
const EASE = Easing.bezier(0.3, 0.7, 0.2, 1);
const SWEEP = 560;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * The launch screen's last moment. The native splash shows the empty goal ring with its note
 * (`assets/images/splash-icon.png`); this overlay starts out identical, then sweeps the ring closed
 * and pops the tick — the website's page-change animation (`apps/web/lib/logoAnimation.ts`) — and
 * fades into the app. Under reduced motion it just fades.
 */
export function LaunchSplash() {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(0);
  const badge = useSharedValue(0);
  const fade = useSharedValue(1);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    const done = () => setVisible(false);
    if (reduceMotion) {
      sweep.value = 1;
      badge.value = 1;
      fade.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) scheduleOnRN(done);
      });
      return;
    }
    sweep.value = withTiming(1, { duration: SWEEP, easing: EASE });
    badge.value = withDelay(
      SWEEP * 0.7,
      withSequence(withTiming(1.25, { duration: SWEEP * 0.33, easing: EASE }), withTiming(1, { duration: SWEEP * 0.22 })),
    );
    fade.value = withDelay(
      SWEEP * 1.3,
      withTiming(0, { duration: 260 }, (finished) => {
        if (finished) scheduleOnRN(done);
      }),
    );
  }, [started, reduceMotion, sweep, badge, fade]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_ARC_LENGTH * (1 - sweep.value) }));
  // Scaled about the badge's centre (a transform string, which works on web too).
  const badgeProps = useAnimatedProps(() => {
    const k = badge.value;
    return { transform: `translate(${BADGE.cx * (1 - k)} ${BADGE.cy * (1 - k)}) scale(${k})` };
  });
  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, overlayStyle]}
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setStarted(true));
      }}
    >
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 200 200">
          <Circle
            cx={RING.cx}
            cy={RING.cy}
            r={RING.r}
            fill="none"
            stroke={SPLASH.foreground}
            strokeWidth={RING.width}
            opacity={0.14}
          />
          <AnimatedPath
            d={RING_ARC}
            fill="none"
            stroke={SPLASH.accent}
            strokeWidth={RING.width}
            strokeLinecap="round"
            strokeDasharray={[RING_ARC_LENGTH, RING_ARC_LENGTH]}
            animatedProps={ringProps}
          />
          <AnimatedG animatedProps={badgeProps}>
            <Circle cx={BADGE.cx} cy={BADGE.cy} r={BADGE.r} fill={SPLASH.foreground} />
            <Path
              d={BADGE.tick}
              fill="none"
              stroke={SPLASH.background}
              strokeWidth={BADGE.tickWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </AnimatedG>
          <Ellipse
            cx={NOTE.head.cx}
            cy={NOTE.head.cy}
            rx={NOTE.head.rx}
            ry={NOTE.head.ry}
            transform={`rotate(${NOTE.head.rotate} ${NOTE.head.cx} ${NOTE.head.cy})`}
            fill={SPLASH.foreground}
          />
          <Path d={NOTE.stem} fill="none" stroke={SPLASH.foreground} strokeWidth={NOTE.stemWidth} strokeLinecap="round" />
        </Svg>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SPLASH.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});

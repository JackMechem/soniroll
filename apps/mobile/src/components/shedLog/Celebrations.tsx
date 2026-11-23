import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { todayKey } from '@jam-practice/core/practiceLog';
import { useEffect } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeInUp, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarHeight } from '@/components/FloatingTabBar';
import { FLAME } from '@/components/shedLog/parts';
import { openProgressShare } from '@/lib/progressShare';
import { dismissToast, useCelebrationState, type Toast } from '@/lib/shedLogCelebrations';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * What the Shed Log's celebrations look like (`lib/shedLogCelebrations.ts` decides when): a toast at
 * the bottom of the screen (one at a time), and confetti falling over everything for the big
 * moments — left out when the phone asks for reduced motion. Mounted once, app-wide, so a goal met
 * from the timer is celebrated wherever you are.
 */
export function Celebrations() {
  const { toasts, rain } = useCelebrationState();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  // At the bottom, above the tab bar (it covered the screen's title and buttons at the top).
  const tabBar = useTabBarHeight();
  return (
    <>
      {rain !== null && !reduce ? <Confetti key={rain} /> : null}
      <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + tabBar + 12, left: 12, right: 12, gap: 8 }}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </View>
    </>
  );
}

const ICONS: Record<Toast['kind'], React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  routine: 'check-circle',
  goal: 'bullseye-arrow',
  day: 'check-all',
  streak: 'fire',
  hours: 'trophy',
};

function ToastCard({ toast }: { toast: Toast }) {
  const { colors } = useAppTheme();
  const share = toast.share;
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOut.duration(200)}>
      <Pressable
        onPress={() => dismissToast(toast.id)}
        accessibilityRole="alert"
        className="flex-row items-center gap-3 rounded-2xl px-4 py-3"
        style={{ backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}
      >
        <MaterialCommunityIcons name={ICONS[toast.kind]} size={24} color={toast.kind === 'streak' ? FLAME : colors.accent} />
        <View className="flex-1">
          <Text className="font-ui-bold text-[15px] font-bold" style={{ color: colors.foreground }}>
            {toast.title}
          </Text>
          {toast.detail ? (
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              {toast.detail}
            </Text>
          ) : null}
        </View>
        {share ? (
          <Pressable
            onPress={() => {
              dismissToast(toast.id);
              openProgressShare(share === 'day' ? { kind: 'day', date: todayKey(), celebrate: toast.celebrate } : { kind: share });
            }}
            accessibilityRole="button"
            accessibilityLabel="Share"
            hitSlop={6}
            android_ripple={{ color: colors['accent-hover'] }}
            className="h-9 justify-center overflow-hidden rounded-lg px-3"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors['accent-foreground'] }}>
              Share
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// Party colours, not the theme's (the website's confetti is the same mix with the accent first).
const COLORS = ['#f59e0b', '#22c55e', '#ec4899', '#38bdf8', '#a78bfa'];
const PIECES = Array.from({ length: 48 }, (_, i) => {
  const r = (n: number) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
  return { x: r(1), w: 6 + r(2) * 6, h: 8 + r(3) * 10, delay: r(4) * 500, fall: 2000 + r(5) * 1600, drift: (r(6) - 0.5) * 0.3, spin: (r(7) - 0.5) * 1440, round: r(8) > 0.7, color: i % 6 };
});

function Confetti() {
  const { colors } = useAppTheme();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {PIECES.map((p, i) => (
        <Piece key={i} piece={p} color={p.color === 0 ? colors.accent : COLORS[p.color - 1]} />
      ))}
    </View>
  );
}

function Piece({ piece, color }: { piece: (typeof PIECES)[number]; color: string }) {
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(piece.delay, withTiming(1, { duration: piece.fall, easing: Easing.in(Easing.quad) }));
  }, [piece, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.85 ? 1 : (1 - t.value) / 0.15,
    transform: [{ translateY: -40 + t.value * (height + 80) }, { translateX: t.value * piece.drift * width }, { rotate: `${t.value * piece.spin}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: piece.x * width, width: piece.w, height: piece.round ? piece.w : piece.h, borderRadius: piece.round ? piece.w / 2 : 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

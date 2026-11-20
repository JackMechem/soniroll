import {
  LEARNING_LEVELS,
  PASS_SCORE,
  currentLevelIndex,
  isPassed,
  levelStars,
  summarizeTrack,
  type LearningTrack,
  type TrackProgress,
} from '@jam-practice/core/learningPath';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View } from 'react-native';

import { CheckIcon, LockIcon } from '@/components/icons';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

export const STAR_COLOR = '#fbbf24';

export function Stars({ count, size = 14 }: { count: number; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row" style={{ gap: 1 }} accessibilityLabel={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Text key={i} style={{ fontSize: size, lineHeight: size + 2, color: i < count ? STAR_COLOR : withAlpha(colors.foreground, 0.15) }}>
          ★
        </Text>
      ))}
    </View>
  );
}

/** Horizontal offset per level, so the path winds instead of being a straight column. */
const WIND = [0, 1, 1.6, 1, 0, -1, -1.6, -1];

/** One level on the trail (its connector and node), and the trail's height: about three levels. */
const LEVEL_HEIGHT = 84;
const TRAIL_HEIGHT = LEVEL_HEIGHT * 3 + 12;

/** The pulsing ring behind the level you're on. */
function Pulse({ color }: { color: string }) {
  const t = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 3,
        borderColor: color,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}

/**
 * A tool's learning path (native sibling of web's `components/learning/LearningPath.tsx`): a
 * header with overall progress and stars, then a winding trail of level nodes — done (filled, with
 * stars), the current one (pulsing), or locked. Tapping a reached level selects it; tapping the
 * selected one starts it. The trail is about three levels tall and scrolls inside itself.
 */
export function LearningPath({
  track,
  progress,
  selected,
  onSelect,
  onStart,
}: {
  track: LearningTrack;
  progress: TrackProgress;
  selected: number;
  onSelect: (index: number) => void;
  onStart: () => void;
}) {
  const { colors } = useAppTheme();
  const levels = LEARNING_LEVELS[track];
  const current = currentLevelIndex(track, progress);
  const summary = summarizeTrack(track, progress);
  const done = summary.passed === summary.total;
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  return (
    <View className="w-full gap-3" style={{ maxWidth: 384 }}>
      <View className="gap-2 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
        <View className="flex-row items-baseline justify-between">
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {done ? 'Path complete!' : `Level ${current + 1} of ${levels.length}`}
          </Text>
          <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color: STAR_COLOR }}>
            ★ {summary.stars}
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              {' '}/ {summary.maxStars}
            </Text>
          </Text>
        </View>
        <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
          <View className="h-full rounded-full" style={{ width: `${(summary.passed / summary.total) * 100}%`, backgroundColor: colors.accent }} />
        </View>
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {done
            ? 'Every level passed. Go back for three stars on each, or keep practicing in Practice mode.'
            : `Score ${Math.round(PASS_SCORE * 100)}% or better on a level to unlock the next one.`}
        </Text>
      </View>

      {/* The trail scrolls inside itself, about three levels tall (like the website's), so the page
          around it doesn't have to. */}
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        style={{ height: TRAIL_HEIGHT }}
        contentContainerStyle={{ alignItems: 'center', paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {levels.map((level, i) => {
          const passed = isPassed(progress, level.id);
          const unlocked = i <= current;
          const isCurrent = i === current;
          const isSelected = i === selected && unlocked;
          const stars = levelStars(progress, level.id);
          return (
            <View
              key={level.id}
              className="items-center"
              style={{ transform: [{ translateX: WIND[i % WIND.length] * 28 }] }}
              onLayout={(e) => {
                // Bring the level being worked on into view the first time the path lays out.
                if (!scrolled.current && i === Math.min(current, levels.length - 1)) {
                  scrolled.current = true;
                  const y = e.nativeEvent.layout.y;
                  requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - LEVEL_HEIGHT), animated: false }));
                }
              }}
            >
              {i > 0 ? <View className="mb-1 h-5 w-0.5 rounded-full" style={{ backgroundColor: unlocked ? withAlpha(colors.accent, 0.5) : withAlpha(colors.foreground, 0.1) }} /> : null}
              <View className="flex-row items-center gap-3">
                <Pressable
                  disabled={!unlocked}
                  onPress={() => (isSelected ? onStart() : onSelect(i))}
                  accessibilityLabel={`Level ${i + 1}: ${level.title}${passed ? ', passed' : unlocked ? '' : ', locked'}`}
                  className="items-center justify-center"
                  style={{ width: 60, height: 60 }}
                >
                  {isCurrent && !passed ? <Pulse color={colors.accent} /> : null}
                  <View
                    className="items-center justify-center rounded-full"
                    style={{
                      width: 52,
                      height: 52,
                      backgroundColor: passed ? colors.accent : colors.surface,
                      borderWidth: isCurrent && !passed ? 2 : 0,
                      borderColor: colors.accent,
                      ...(isSelected ? { outlineWidth: 3, outlineOffset: 3, outlineColor: withAlpha(colors.accent, 0.4), outlineStyle: 'solid' as const } : null),
                    }}
                  >
                    {passed ? (
                      <CheckIcon color={colors['accent-foreground']} size={22} />
                    ) : unlocked ? (
                      <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.accent }}>
                        {i + 1}
                      </Text>
                    ) : (
                      <LockIcon color={withAlpha(colors.muted, 0.6)} size={18} />
                    )}
                  </View>
                </Pressable>
                <View style={{ width: 150 }}>
                  <Text numberOfLines={2} className="font-ui-semibold text-sm font-semibold" style={{ color: unlocked ? colors.foreground : withAlpha(colors.muted, 0.6) }}>
                    {level.title}
                  </Text>
                  {passed ? (
                    <Stars count={stars} />
                  ) : isCurrent ? (
                    <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
                      {isSelected ? 'Up next' : 'Current level'}
                    </Text>
                  ) : (
                    <Text className="font-ui text-xs" style={{ color: withAlpha(colors.muted, 0.6) }}>
                      Level {i + 1}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

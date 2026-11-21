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

/** One level on the trail (its connector and node). */
const LEVEL_HEIGHT = 84;
/** The trail's shortest height (about two levels), and the soft fade at its top and bottom edges. */
const TRAIL_MIN_HEIGHT = LEVEL_HEIGHT * 2;
const FADE = 28;

/**
 * The short line from one level up to the one before it. It sits under this level's node (the
 * left-hand 60-wide column of the row, not the row's middle), moved halfway towards the previous
 * node and tilted to point at it, since the trail winds (`WIND`) from level to level.
 */
function Connector({ from, to, color }: { from: number; to: number; color: string }) {
  const dx = (from - to) * 28;
  const angle = (Math.atan2(dx, LEVEL_HEIGHT) * 180) / Math.PI;
  return (
    <View
      className="mb-1 h-5 w-0.5 rounded-full"
      style={{ alignSelf: 'flex-start', marginLeft: 29, backgroundColor: color, transform: [{ translateX: dx / 2 }, { rotate: `${angle}deg` }] }}
    />
  );
}

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
 * selected one starts it. It fills the space between the chips and the Start button from the top
 * (no empty band above the card), and the trail scrolls inside itself, fading out at its edges
 * rather than cutting a node in half.
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
  const fadeFrom = withAlpha(colors.background, 1);
  const fadeTo = withAlpha(colors.background, 0);
  const levels = LEARNING_LEVELS[track];
  const current = currentLevelIndex(track, progress);
  const summary = summarizeTrack(track, progress);
  const done = summary.passed === summary.total;
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  return (
    // On a `scroll={false}` tool screen: it gets the whole space under the chips, so it brings the
    // gutter the frame would have added.
    <View className="w-full flex-1 gap-3 px-4 pt-2.5" style={{ maxWidth: 384 + 32, alignSelf: 'center' }}>
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

      {/* The trail scrolls inside itself, in the room that's left, so the page around it doesn't
          have to. */}
      <View style={{ flex: 1, minHeight: TRAIL_MIN_HEIGHT }}>
        <ScrollView
          ref={scrollRef}
          nestedScrollEnabled
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center', paddingVertical: FADE / 2 }}
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
                {i > 0 ? <Connector from={WIND[(i - 1) % WIND.length]} to={WIND[i % WIND.length]} color={unlocked ? withAlpha(colors.accent, 0.5) : withAlpha(colors.foreground, 0.1)} /> : null}
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
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: FADE, experimental_backgroundImage: `linear-gradient(to bottom, ${fadeFrom}, ${fadeTo})` }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: FADE, experimental_backgroundImage: `linear-gradient(to top, ${fadeFrom}, ${fadeTo})` }}
        />
      </View>
    </View>
  );
}

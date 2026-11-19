import { PASS_SCORE } from '@jam-practice/core/learningPath';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { STAR_COLOR } from '@/components/learning/LearningPath';
import { playNote, type SampledInstrumentId } from '@/lib/sampledTones';
import type { LevelResult } from '@/lib/useLearnSession';
import { useAppTheme } from '@/theme/ThemeProvider';

const CONFETTI_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#38bdf8', '#a78bfa'];
const PRAISE = ['Nailed it!', 'Brilliant ears!', 'Level up!', 'Superb!', "You're on fire!"];

/** Fixed pseudo-random confetti, the same every time. */
function confettiPieces(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const r = (n: number) => ((((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1);
    return {
      left: r(1),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      width: 6 + r(2) * 6,
      height: 8 + r(3) * 10,
      delay: r(4) * 600,
      duration: 2200 + r(5) * 1800,
      drift: (r(6) - 0.5) * 120,
      spin: (r(7) - 0.5) * 1440,
      round: r(8) > 0.7,
    };
  });
}

function Confetti() {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => confettiPieces(44), []);
  const values = useState(() => pieces.map(() => new Animated.Value(0)))[0];
  useEffect(() => {
    Animated.parallel(
      values.map((v, i) =>
        Animated.timing(v, { toValue: 1, duration: pieces[i].duration, delay: pieces[i].delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [values, pieces]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: -30,
            left: p.left * width,
            width: p.width,
            height: p.height,
            borderRadius: p.round ? 999 : 2,
            backgroundColor: p.color,
            transform: [
              { translateY: values[i].interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) },
              { translateX: values[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: values[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** A star that springs in after `delay`. */
function PopStar({ lit, delay }: { lit: boolean; delay: number }) {
  const { colors } = useAppTheme();
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.sequence([Animated.delay(delay), Animated.spring(v, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true })]).start();
  }, [v, delay]);
  return (
    <Animated.Text
      style={{
        fontSize: 50,
        lineHeight: 56,
        color: lit ? STAR_COLOR : `${colors.foreground}26`,
        textShadowColor: lit ? 'rgba(251,191,36,0.6)' : 'transparent',
        textShadowRadius: lit ? 12 : 0,
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }],
      }}
    >
      ★
    </Animated.Text>
  );
}

/**
 * The end-of-level screen (native sibling of web's `LevelComplete`). A pass gets confetti, the
 * stars springing in one by one, a little fanfare in the tool's own sound and what just unlocked,
 * with Restart level / Next level; a miss gets an encouraging note with how many were needed.
 */
export function LevelComplete({
  result,
  instrument,
  onNext,
  onRetry,
  onClose,
}: {
  result: LevelResult;
  instrument: SampledInstrumentId;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { passed } = result;
  const close = result.score >= PASS_SCORE - 0.25;
  const needed = Math.ceil(PASS_SCORE * result.total);
  const rise = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
    if (!passed) return;
    // A rising major arpeggio — the "you did it" sound.
    const notes = ['C5', 'E5', 'G5', 'C6', ...(result.stars === 3 ? ['E6'] : [])];
    const timers = notes.map((n, i) => setTimeout(() => playNote(n, i === notes.length - 1 ? 1.6 : 0.5, instrument), 250 + i * 110));
    return () => timers.forEach(clearTimeout);
    // Plays once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scoreText = `${result.correct % 1 === 0 ? result.correct : result.correct.toFixed(1)} / ${result.total}`;
  const button = (label: string, onPress: () => void, primary: boolean) => (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center rounded-full py-3.5"
      style={{ backgroundColor: primary ? colors.accent : colors.background }}
    >
      <Text className="font-ui-bold text-base font-bold" style={{ color: primary ? colors['accent-foreground'] : colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 items-center justify-center p-5" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        {passed ? <Confetti /> : null}
        <Animated.View
          className="w-full items-center gap-4 rounded-3xl p-6"
          style={{
            maxWidth: 380,
            backgroundColor: colors.surface,
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          }}
        >
          <Text className="font-ui-bold text-center text-xs font-bold" style={{ color: colors.muted }}>
            Level {result.levelNumber} · {result.levelTitle}
          </Text>

          {passed ? (
            <>
              <View className="flex-row gap-2">
                {[0, 1, 2].map((i) => (
                  <PopStar key={i} lit={i < result.stars} delay={300 + i * 250} />
                ))}
              </View>
              <Text className="font-ui-extrabold text-center text-3xl font-extrabold" style={{ color: colors.accent }}>
                {result.pathDone && result.firstPass ? 'Path complete!' : PRAISE[Math.floor(result.levelNumber + result.correct) % PRAISE.length]}
              </Text>
              <Text className="font-ui text-base" style={{ color: colors.foreground }}>
                <Text className="font-ui-bold font-bold">{scoreText}</Text> {result.stars === 3 ? '— a perfect run.' : 'correct.'}
              </Text>
              {result.firstPass && result.unlocked ? (
                <View className="w-full items-center rounded-2xl px-4 py-3" style={{ backgroundColor: `${colors.accent}1f` }}>
                  <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
                    Unlocked
                  </Text>
                  <Text className="font-ui-bold text-center text-lg font-bold" style={{ color: colors.foreground }}>
                    Level {result.unlocked.number}: {result.unlocked.title}
                  </Text>
                </View>
              ) : null}
              {result.pathDone && result.firstPass ? (
                <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                  You&apos;ve passed every level. Seriously impressive ears.
                </Text>
              ) : null}
              {!result.firstPass && result.stars < 3 ? (
                <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                  Already passed — go for {result.stars + 1} stars next time.
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 48 }}>{close ? '🔥' : '💪'}</Text>
              <Text className="font-ui-bold text-2xl font-bold" style={{ color: colors.foreground }}>
                {close ? 'So close!' : 'Keep at it!'}
              </Text>
              <Text className="font-ui text-center text-base" style={{ color: colors.foreground }}>
                <Text className="font-ui-bold font-bold">{scoreText}</Text> — you need {needed} to pass.
              </Text>
              <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
                Every attempt trains your ear. Give it another go.
              </Text>
            </>
          )}

          <View className="w-full gap-2 pt-1">
            {passed ? (
              <View className="flex-row gap-2">
                {button('Restart level', onRetry, !result.unlocked)}
                {result.unlocked ? button('Next level', onNext, true) : null}
              </View>
            ) : (
              <View className="flex-row">{button('Try again', onRetry, true)}</View>
            )}
            <Pressable onPress={onClose} className="items-center py-2">
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
                Back to the path
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

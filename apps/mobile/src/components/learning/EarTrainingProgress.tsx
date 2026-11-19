import { LEARNING_TRACKS, type LearningTrack, type TrackSummary } from '@jam-practice/core/learningPath';
import { hrefToSlug } from '@jam-practice/core/navLinks';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { NAV_LINK_ICONS } from '@/components/icons';
import { STAR_COLOR } from '@/components/learning/LearningPath';
import { useAppTheme } from '@/theme/ThemeProvider';

/** The three ear-training learning paths at a glance — levels passed, stars and what's next — for
    Home and profiles (native sibling of web's `EarTrainingProgress`). `links` opens each tool. */
export function EarTrainingProgress({ summaries, links = false, card = 'surface' }: { summaries: Record<LearningTrack, TrackSummary>; links?: boolean; card?: 'surface' | 'background' }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <View className="gap-2.5">
      {LEARNING_TRACKS.map((track) => {
        const s = summaries[track.id];
        const Icon = NAV_LINK_ICONS[track.href];
        const done = s.passed === s.total;
        return (
          <Pressable
            key={track.id}
            disabled={!links}
            onPress={() => router.push(`/tool/${hrefToSlug(track.href)}` as never)}
            className="gap-2 rounded-2xl p-3"
            style={{ backgroundColor: colors[card] }}
          >
            <View className="flex-row items-center gap-2.5">
              {Icon ? (
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.accent}22` }}>
                  <Icon color={colors.accent} size={19} />
                </View>
              ) : null}
              <Text numberOfLines={1} className="font-ui-bold flex-1 text-sm font-bold" style={{ color: colors.foreground }}>
                {track.label}
              </Text>
              <Text className="font-ui-bold text-xs font-bold tabular-nums" style={{ color: STAR_COLOR }}>
                ★ {s.stars}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: card === 'surface' ? colors.background : colors.surface }}>
              <View className="h-full rounded-full" style={{ width: `${Math.max((s.passed / s.total) * 100, s.passed ? 6 : 0)}%`, backgroundColor: colors.accent }} />
            </View>
            <View className="flex-row justify-between gap-2">
              <Text numberOfLines={1} className="font-ui flex-1 text-xs" style={{ color: colors.muted }}>
                {done ? 'Every level passed 🎉' : s.passed ? `Next: ${s.current}` : `Starts with ${s.current}`}
              </Text>
              <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
                {s.passed}/{s.total} levels
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

import { LEARNING_TRACKS, type LearningTrack, type TrackSummary } from '@jam-practice/core/learningPath';
import { NAV_LINKS_DATA, hrefToSlug } from '@jam-practice/core/navLinks';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { NAV_LINK_ICONS } from '@/components/icons';
import { ToolIcon } from '@/components/ui';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** The three ear-training learning paths at a glance — levels passed, stars and what's next — for
    Home and profiles (native sibling of web's `EarTrainingProgress`). `links` opens each tool.
    `compact` (Home): one slim row per trainer — icon, name, "3/13 levels" and a thin bar — straight
    on Home's card, no fill of their own. Colours come from the theme only. */
export function EarTrainingProgress({
  summaries,
  links = false,
  card = 'surface',
  compact = false,
}: {
  summaries: Record<LearningTrack, TrackSummary>;
  links?: boolean;
  card?: 'surface' | 'background';
  compact?: boolean;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  if (compact) {
    return (
      <View className="gap-1">
        {LEARNING_TRACKS.map((track) => {
          const s = summaries[track.id];
          const tool = NAV_LINKS_DATA.find((l) => l.href === track.href);
          return (
            <Pressable
              key={track.id}
              disabled={!links}
              onPress={() => router.push(`/tool/${hrefToSlug(track.href)}` as never)}
              accessibilityRole={links ? 'button' : undefined}
              accessibilityLabel={`${track.label}: ${s.passed} of ${s.total} levels`}
              android_ripple={{ color: colors['surface-hover'] }}
              className="-mx-2 min-h-[52px] flex-row items-center gap-3 overflow-hidden rounded-lg px-2 py-2"
            >
              {tool ? <ToolIcon tool={tool} size={32} /> : null}
              <View className="flex-1 gap-1.5">
                <View className="flex-row items-center gap-2">
                  <Text numberOfLines={1} className="font-ui-semibold flex-1 text-[15px] font-semibold" style={{ color: colors.foreground }}>
                    {track.label}
                  </Text>
                  <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                    {s.passed}/{s.total} levels
                  </Text>
                </View>
                <View className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(colors.foreground, 0.1) }}>
                  <View className="h-full rounded-full" style={{ width: `${(s.passed / s.total) * 100}%`, backgroundColor: colors.accent }} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }
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
                <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
                  <Icon color={colors.accent} size={19} />
                </View>
              ) : null}
              <Text numberOfLines={1} className="font-ui-bold flex-1 text-sm font-bold" style={{ color: colors.foreground }}>
                {track.label}
              </Text>
              <Text className="font-ui-bold text-xs font-bold tabular-nums" style={{ color: colors.accent }}>
                ★ {s.stars}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: card === 'surface' ? colors.background : colors.surface }}>
              <View className="h-full rounded-full" style={{ width: `${Math.max((s.passed / s.total) * 100, s.passed ? 6 : 0)}%`, backgroundColor: colors.accent }} />
            </View>
            <View className="flex-row justify-between gap-2">
              <Text numberOfLines={1} className="font-ui flex-1 text-xs" style={{ color: colors.muted }}>
                {done ? 'Every level passed' : s.passed ? `Next: ${s.current}` : `Starts with ${s.current}`}
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

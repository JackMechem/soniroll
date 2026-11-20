import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { CheckIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

const POINTS = [
  'Routines with tasks, subtasks and times',
  'A day timer and a daily goal',
  'Streaks, with confetti for the wins',
  'Time in the tools adds up',
  'Synced to your account, on every device',
];

/** The Shed Log signed out (the website's `ShedLogGate`): what it is, and Sign in — it's for
    account holders. Sign in opens the Account screen (Create an account, on its Sign up side). */
export function ShedLogGate() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const bottom = useTabBarSpace();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: bottom, gap: 20 }} style={{ backgroundColor: colors.background }}>
      <Text className="font-ui-extrabold text-3xl font-extrabold leading-tight" style={{ color: colors.foreground }}>
        Your practice, every day, adding up.
      </Text>
      <Text className="font-ui text-[15px] leading-6" style={{ color: colors.muted }}>
        Plan routines that repeat, check off tasks, run them on a timer, and watch your streak, your daily goal and a year of green squares fill in.
      </Text>
      <View className="gap-2.5 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
        {POINTS.map((p) => (
          <View key={p} className="flex-row items-center gap-2.5">
            <View className="h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
              <CheckIcon color={colors.accent} size={14} />
            </View>
            <Text className="font-ui flex-1 text-[15px]" style={{ color: colors.foreground }}>
              {p}
            </Text>
          </View>
        ))}
      </View>
      <View className="gap-3">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          The Shed Log is free with an account.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button label="Sign in" pill onPress={() => router.push('/profile')} />
          <Button label="Create an account" kind="secondary" pill onPress={() => router.push({ pathname: '/profile', params: { flow: 'signUp' } })} />
        </View>
      </View>
    </ScrollView>
  );
}

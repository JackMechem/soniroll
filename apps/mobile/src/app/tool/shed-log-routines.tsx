import { useConvexAuth } from '@convex-dev/auth/react';
import { describeRepeat, formatMinutesShort, formatTime, parseTime, totalMinutes } from '@jam-practice/core/practiceLog';
import { sortByText } from '@jam-practice/core/sortText';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { useTabBarSpace } from '@/components/FloatingTabBar';
import { PlusIcon } from '@/components/icons';
import { Muted, RoutineIcon } from '@/components/shedLog/parts';
import { ShedLogGate } from '@/components/shedLog/ShedLogGate';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Button, Card, ListRow } from '@/components/ui';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Every routine (the website's `/shed-log/routines`): its icon, name, when it repeats and how
    long it is. Tapping one opens it; New routine makes one. */
function RoutinesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const log = usePracticeLog();
  const bottom = useTabBarSpace(96);
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedLogGate />;
  if (!log.ready) return <ScreenSpinner />;
  const routines = sortByText(log.data.routines, (r) => r.name || 'Untitled routine');
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Routines' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottom, gap: 16 }}>
        <Button label="New routine" Icon={PlusIcon} onPress={() => router.push('/tool/shed-log-routine-edit')} />
        <Card>
          {routines.length === 0 ? (
            <Muted>No routines yet. A routine is a list of things to practice that repeats on the days you pick.</Muted>
          ) : (
            routines.map((r) => {
              const start = parseTime(r.startTime);
              return (
                <ListRow
                  key={r.id}
                  icon={<RoutineIcon icon={r.icon} color={r.color} size={34} />}
                  title={r.name || 'Untitled routine'}
                  detail={[describeRepeat(r.repeat), start !== null ? formatTime(start) : null, formatMinutesShort(totalMinutes(r)), r.assigned ? `From ${r.assigned.teacher}` : null].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/tool/shed-log-routine', params: { id: r.id } })}
                />
              );
            })
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

export default withScreenLoader(RoutinesScreen);

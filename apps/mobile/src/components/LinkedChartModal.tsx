import type { PublicLinkedChart } from '@jam-practice/core/profileTunes';
import type { IRealSong } from '@jam-practice/core/iRealPro';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FullScreenModal } from '@/components/FullScreenModal';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChordChartView from '@/components/ChordChartView';
import { CloseIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A read-only full-screen viewer for a tune's *linked* chord chart, when that chart isn't
 * something the current viewer owns (or can navigate to by library id) — a chart embedded on
 * someone else's public profile or Community tune post (`PublicTune.linkedChart`, a fully
 * resolved snapshot, not a reference into the viewer's own library). For a tune in your *own*
 * list whose `chordChartId` points at your own library, `TuneListManager.tsx` instead navigates
 * straight to `/tool/chord-charts-view` — that screen owns transpose/delete, neither of which
 * make sense here, since this chart was never yours to edit in the first place.
 */
export function LinkedChartModal({ chart, onClose }: { chart: PublicLinkedChart | null; onClose: () => void }) {
  const { colors } = useAppTheme();
  if (!chart) return null;
  return (
    <FullScreenModal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
          <View className="flex-row items-center justify-between px-4 pt-2">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
              {chart.title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surface }}
            >
              <CloseIcon color={colors.muted} size={16} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
            <ChordChartView song={chart as IRealSong} barsPerRow={4} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </FullScreenModal>
  );
}

import type { Bar, IRealSong } from '@jam-practice/core/iRealPro';
import { layoutRows } from '@jam-practice/core/chartLayout';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { BarContent, PageFit, Row } from '@/components/ChordChartView';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The chord chart Rhythm Section is playing, with the bar being heard lit (the website's
 * `ChordChart` with `activeBar`). Built from the chart viewer's own rows (`ChordChartView`'s `Row`,
 * `PageFit`, `BarContent`), so it's the same chart, just with a tint on the playing bar. The
 * opening time signature only shows when it isn't 4/4: at this size it squeezed the first bar's
 * chords against the barline (a change of meter mid-chart still shows).
 */
function isCommonTime(ts: IRealSong['timeSignature']) {
  return !ts || (ts.top === 4 && ts.bottom === 4);
}

export function RhythmChart({ song, activeBar }: { song: IRealSong; activeBar: number | null }) {
  const { colors } = useAppTheme();
  const rows = useMemo(() => layoutRows(song.bars, 4), [song.bars]);
  const lit = activeBar !== null ? (song.bars[activeBar] ?? null) : null;
  if (song.bars.length === 0) {
    return (
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        No chords found in this chart.
      </Text>
    );
  }
  const content = (bar: Bar) =>
    bar === lit ? (
      <>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(colors.accent, 0.18) }} />
        <BarContent bar={bar} />
      </>
    ) : undefined;
  return (
    <PageFit>
      {rows.map((row, i) => (
        <Row
          key={i}
          placed={row}
          isFirstRow={i === 0}
          isLastRow={i === rows.length - 1}
          timeSignature={i === 0 && !isCommonTime(song.timeSignature) ? song.timeSignature : undefined}
          renderBarContent={lit ? content : undefined}
        />
      ))}
    </PageFit>
  );
}

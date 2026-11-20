import { DRUM_LEGEND, NOTEHEAD_HINT } from '@jam-practice/core/drumKit';
import type { DrumStyle, GrooveBar } from '@jam-practice/core/drumStyles';
import { memo, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg from 'react-native-svg';

import { itemsTagged, NotationItems } from '@/components/notation/NotationItems';
import { renderDrumRows, type DrumRow } from '@/lib/notation/drumNotation';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The groove on a percussion staff with the key under it — the website's `GrooveScore`
 * (`apps/web/components/rhythmsection/kit.tsx` + `drumgen/DrumScore.tsx`) for the phone. `lit` is
 * the notes being heard (`bar:step:up|down` tags, bar = index into `bars`), drawn again in the
 * accent over the score, as the website lights them.
 */
export function GrooveScore({ style, bars, firstBar, voices, lit }: { style: DrumStyle; bars: GrooveBar[]; firstBar: number; voices: Set<string>; lit: Set<string> }) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  const rows = useMemo(() => renderDrumRows(style, bars, width, firstBar), [style, bars, width, firstBar]);
  const legend = DRUM_LEGEND.filter((l) => voices.has(l.voice));
  return (
    <View className="gap-3">
      <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: 120 }}>
        {rows.map((row, i) => (
          <DrumRowView key={i} row={row} lit={lit} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1 px-1">
        {legend.map((l) => (
          <Text key={l.voice} className="font-ui text-xs" style={{ color: colors.muted }}>
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
              {NOTEHEAD_HINT[l.voice] ?? '●'}
            </Text>{' '}
            {l.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function DrumRowView({ row, lit }: { row: DrumRow; lit: Set<string> }) {
  const { colors } = useAppTheme();
  const litItems = useMemo(() => itemsTagged(row.items, lit), [row.items, lit]);
  return (
    <View style={{ width: row.width, height: row.height }}>
      <StaticRow row={row} ink={colors.foreground} muted={colors.muted} />
      {litItems.length > 0 ? (
        <Svg width={row.width} height={row.height} viewBox={`0 0 ${row.drawWidth} ${row.drawHeight}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <NotationItems items={litItems} ink={colors.accent} muted={colors.accent} color={colors.accent} />
        </Svg>
      ) : null}
    </View>
  );
}

const StaticRow = memo(function StaticRow({ row, ink, muted }: { row: DrumRow; ink: string; muted: string }) {
  return (
    <Svg width={row.width} height={row.height} viewBox={`0 0 ${row.drawWidth} ${row.drawHeight}`}>
      <NotationItems items={row.items} ink={ink} muted={muted} />
    </Svg>
  );
});

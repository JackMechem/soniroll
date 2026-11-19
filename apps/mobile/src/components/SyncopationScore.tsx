import type { Ostinato, SyncopationBar } from '@jam-practice/core/syncopation';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { renderSyncopationRows, type SyncopationRow } from '@/lib/notation/syncopationNotation';
import type { DrawItem } from '@/lib/notation/vexflowNative';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Syncopation's exercise, drawn to the width it's given (`renderSyncopationRows`) in the theme's
 * colours. While it plays, the bar being heard is lit in the accent (the website lights each note;
 * a bar is easier to follow on a small screen).
 */
export function SyncopationScore({ bars, ostinato, activeBar }: { bars: SyncopationBar[]; ostinato: Ostinato; activeBar: number | null }) {
  const { colors } = useAppTheme();
  const [width, setWidth] = useState(0);
  const rows = useMemo(() => (width > 50 ? renderSyncopationRows(bars, ostinato, width) : []), [bars, ostinato, width]);
  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: 118 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ width: row.width, height: row.height }}>
          {row.barRects.map((rect, b) =>
            activeBar === row.firstBar + b ? (
              <View
                key={b}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 8,
                  bottom: 8,
                  left: rect.x,
                  width: rect.width,
                  borderRadius: 6,
                  backgroundColor: withAlpha(colors.accent, 0.12),
                }}
              />
            ) : null,
          )}
          <RowSvg row={row} ink={colors.foreground} muted={colors.muted} />
        </View>
      ))}
    </View>
  );
}

const RowSvg = memo(function RowSvg({ row, ink, muted }: { row: SyncopationRow; ink: string; muted: string }) {
  return (
    <Svg width={row.width} height={row.height} viewBox={`0 0 ${row.width} ${row.height}`}>
      {row.items.map((item, i) => (
        <Item key={i} item={item} ink={ink} muted={muted} />
      ))}
    </Svg>
  );
});

function paint(value: string, ink: string, muted: string) {
  return value === 'ink' ? ink : value === 'muted' ? muted : value;
}

function Item({ item, ink, muted }: { item: DrawItem; ink: string; muted: string }) {
  const fill = paint(item.fill, ink, muted);
  const stroke = paint(item.stroke, ink, muted);
  if (item.kind === 'rect') {
    return (
      <Rect x={item.x} y={item.y} width={item.width} height={item.height} fill={fill} stroke={stroke} strokeWidth={stroke === 'none' ? 0 : item.strokeWidth} />
    );
  }
  return (
    <Path
      d={item.d}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke === 'none' ? 0 : item.strokeWidth}
      strokeDasharray={item.strokeDasharray}
      strokeLinecap={item.strokeLinecap}
      {...(item.glyph ? { transform: `translate(${item.glyph.x}, ${item.glyph.y}) scale(${item.glyph.scale})` } : null)}
    />
  );
}

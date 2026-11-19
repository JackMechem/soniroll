import type { Cursor, Transcription } from '@jam-practice/core/bassTranscription';
import { memo, useMemo, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg from 'react-native-svg';

import { ChordQualityText } from '@/components/ChordQualityText';
import { itemsTagged, NotationItems } from '@/components/notation/NotationItems';
import { renderScoreRows, SCORE_STAVE_Y, type ScoreRow } from '@/lib/notation/scoreNotation';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * A score drawn as engraved notation — the phone's version of the website's notation view
 * (`apps/web/components/notation/Score.tsx`), read-only for now (Score Writer's editing comes with
 * its port): the layout is `lib/notation/scoreNotation.ts` (VexFlow), drawn here in the theme's
 * colours with the chord symbols in the chord charts' Petaluma. Same props as the web's where they
 * apply: the selected note (`cursor`) and the note being heard (`playing`) are lit in the accent,
 * a `range` of bars is tinted, and tapping a note, a chord or a bar calls `onSelect`,
 * `onChordClick` or `onSelectMeasure`.
 */
export default function Score({
  transcription,
  cursor = null,
  playing = null,
  range = null,
  firstBar = 1,
  onSelect,
  onSelectMeasure,
  onChordClick,
}: {
  transcription: Transcription;
  cursor?: Cursor | null;
  /** The note being heard, if playing. */
  playing?: { measure: number; note: number } | null;
  /** Whole bars selected (inclusive), drawn tinted. */
  range?: { from: number; to: number } | null;
  /** The number printed on the first measure (for a snippet out of a longer score). */
  firstBar?: number;
  onSelect?: (cursor: Cursor) => void;
  onSelectMeasure?: (measure: number, extend: boolean) => void;
  onChordClick?: (measure: number, beat: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const rows = useMemo(() => renderScoreRows(transcription, width, { firstBar }), [transcription, width, firstBar]);
  const tappable = !!(onSelect || onSelectMeasure || onChordClick);
  const lit = useMemo(() => {
    const set = new Set<string>();
    if (cursor && cursor.note >= 0) set.add(`${cursor.measure}:${cursor.note}`);
    if (playing) set.add(`${playing.measure}:${playing.note}`);
    return set;
  }, [cursor, playing]);

  const onTap = (row: ScoreRow, e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX / row.scale;
    const y = e.nativeEvent.locationY / row.scale;
    const chord = row.chords.find((c) => x >= c.x - 4 && x <= c.x + 48 && y <= SCORE_STAVE_Y + 2);
    if (chord && onChordClick) return onChordClick(chord.measure, chord.beat);
    const note = row.notes.find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h);
    if (note && onSelect) return onSelect({ measure: note.measure, note: note.note });
    const m = row.measures.find((b) => x >= b.x && x <= b.x + b.w);
    if (!m) return;
    if (onSelectMeasure) onSelectMeasure(m.measure, false);
    else if (onSelect) onSelect({ measure: m.measure, note: transcription.measures[m.measure].notes.length - 1 });
  };

  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} accessibilityLabel="Notation" style={{ minHeight: 100 }}>
      {rows.map((row, i) => {
        const body = <ScoreRowView row={row} lit={lit} range={range} cursorMeasure={cursor && !range ? cursor.measure : null} />;
        return tappable ? (
          <Pressable key={i} onPress={(e) => onTap(row, e)}>
            {body}
          </Pressable>
        ) : (
          <View key={i}>{body}</View>
        );
      })}
    </View>
  );
}

function ScoreRowView({
  row,
  lit,
  range,
  cursorMeasure,
}: {
  row: ScoreRow;
  lit: Set<string>;
  range: { from: number; to: number } | null;
  cursorMeasure: number | null;
}) {
  const { colors } = useAppTheme();
  const w = row.drawWidth * row.scale;
  const h = row.height * row.scale;
  const litItems = useMemo(() => itemsTagged(row.items, lit), [row.items, lit]);
  const top = (row.staffTop - 18) * row.scale;
  const barH = (row.spacing * 4 + 36) * row.scale;
  return (
    <View pointerEvents="none" style={{ width: w, height: h }}>
      {row.measures.map((m) => {
        const inRange = !!range && m.measure >= range.from && m.measure <= range.to;
        const isCursor = cursorMeasure === m.measure;
        if (!inRange && !isCursor) return null;
        return (
          <View
            key={m.measure}
            style={{
              position: 'absolute',
              left: m.x * row.scale,
              width: m.w * row.scale,
              top,
              height: barH,
              borderRadius: 6,
              backgroundColor: withAlpha(colors.accent, inRange ? 0.16 : 0.07),
              borderWidth: inRange ? 1 : 0,
              borderColor: withAlpha(colors.accent, 0.5),
            }}
          />
        );
      })}
      <StaticRow row={row} ink={colors.foreground} muted={colors.muted} />
      {litItems.length > 0 ? (
        <Svg width={w} height={h} viewBox={`0 0 ${row.drawWidth} ${row.height}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          <NotationItems items={litItems} ink={colors.accent} muted={colors.accent} color={colors.accent} />
        </Svg>
      ) : null}
      {row.chords.map((c, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: c.x * row.scale, top: 0, height: (SCORE_STAVE_Y - 1) * row.scale, justifyContent: 'flex-end' }}
        >
          <ChordSymbol symbol={c.symbol} scale={row.scale} />
        </View>
      ))}
    </View>
  );
}

/** The row's notation, drawn once per layout (the lit notes go on a layer above). */
const StaticRow = memo(function StaticRow({ row, ink, muted }: { row: ScoreRow; ink: string; muted: string }) {
  return (
    <Svg width={row.drawWidth * row.scale} height={row.height * row.scale} viewBox={`0 0 ${row.drawWidth} ${row.height}`}>
      <NotationItems items={row.items} ink={ink} muted={muted} />
    </Svg>
  );
});

const CHORD_RE = /^([A-G])([b#]?)([^/]*)(?:\/([A-G])([b#]?))?$/;
const ACCIDENTAL: Record<string, string> = { b: '♭', '#': '♯' };

/** A chord symbol like the chord charts' (and the web score's): a big hand-inked root in Petaluma
    Script with its accidental, the quality smaller beside it, and a muted slash bass. */
export function ChordSymbol({ symbol, scale = 1 }: { symbol: string; scale?: number }) {
  const { colors } = useAppTheme();
  const m = CHORD_RE.exec(symbol);
  if (!m) {
    return <ChordQualityText quality={symbol} style={{ fontSize: 18 * scale, color: colors.foreground }} />;
  }
  const [, letter, acc, quality, bassLetter, bassAcc] = m;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: 27 * scale, color: colors.foreground }}>
        {letter}
        {acc ? <Text style={{ fontSize: 14 * scale }}>{ACCIDENTAL[acc]}</Text> : null}
      </Text>
      {quality ? (
        <View style={{ marginLeft: 2 * scale }}>
          <ChordQualityText quality={quality} style={{ fontSize: 17 * scale, color: colors.foreground }} />
        </View>
      ) : null}
      {bassLetter ? (
        <Text style={{ fontFamily: 'PetalumaScript', fontSize: 14 * scale, color: colors.muted, marginLeft: 3 * scale }}>
          /{bassLetter}
          {bassAcc ? ACCIDENTAL[bassAcc] : ''}
        </Text>
      ) : null}
    </View>
  );
}

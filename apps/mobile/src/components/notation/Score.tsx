import { keyAlters, midiOf, pitchName, staffOf, STEPS, type Cursor, type Pitch, type Transcription } from '@jam-practice/core/bassTranscription';
import { memo, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Ellipse, Line, Rect, Text as SvgText } from 'react-native-svg';

import { ChordQualityText } from '@/components/ChordQualityText';
import { itemsTagged, NotationItems } from '@/components/notation/NotationItems';
import { renderScoreRows, SCORE_STAVE_Y, type ScoreMeasureBox, type ScoreRow } from '@/lib/notation/scoreNotation';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** What the editor can ask the score: where (in the score's own box) a bar's line of music sits. */
export type ScoreHandle = { rowOf: (measure: number) => { y: number; height: number } | null };

/** A finger on the staff in Write: the note it would add there. Units are the row's own. */
type Hover = {
  row: number;
  x: number;
  y: number;
  ledgers: number[];
  pitch: Pitch;
  measure: number;
  /** Adding: insert after this note. */
  after: number;
  /** Over an existing note's column: overwrite that note instead. */
  replace: number | null;
};

type Spot =
  | { kind: 'chord'; measure: number; beat: number }
  | { kind: 'note'; measure: number; note: number }
  | { kind: 'measure'; measure: number }
  | { kind: 'staff'; hover: Hover };

/** How long a finger rests on the staff before sliding it changes the note (and stops scrolling). */
const HOLD_MS = 180;

/**
 * A score drawn as engraved notation — the phone's version of the website's notation view
 * (`apps/web/components/notation/Score.tsx`): the layout is `lib/notation/scoreNotation.ts`
 * (VexFlow), drawn here in the theme's colours with the chord symbols in the chord charts' Petaluma.
 * Same props as the web's where they apply: the selected note (`cursor`, with a caret after it) and
 * the note being heard (`playing`) are lit in the accent, a `range` of bars is tinted, and tapping a
 * note, a chord or a bar calls `onSelect`, `onChordClick` or `onSelectMeasure`; a long press on a bar
 * calls `onLongPressMeasure` (the phone's right-click).
 *
 * `mode="write"` is the editor's touch entry, like the website on a touch screen: a finger on the
 * staff shows the note it would add (with its name above the finger); held still a moment, sliding
 * up or down changes it (the page stops scrolling meanwhile — `onHold`); lifting adds it, or
 * re-pitches the note in that column. A quick swipe scrolls instead and adds nothing. Tapping a note
 * or chord still selects it.
 */
export default function Score({
  transcription,
  cursor = null,
  playing = null,
  range = null,
  firstBar = 1,
  mode,
  onSelect,
  onSelectMeasure,
  onChordClick,
  onLongPressMeasure,
  onAdd,
  onReplace,
  onHold,
  handleRef,
}: {
  transcription: Transcription;
  cursor?: Cursor | null;
  /** The note being heard, if playing. */
  playing?: { measure: number; note: number } | null;
  /** Whole bars selected (inclusive), drawn tinted. */
  range?: { from: number; to: number } | null;
  /** The number printed on the first measure (for a snippet out of a longer score). */
  firstBar?: number;
  /** The editor's mode: "select" taps only select; "write" adds notes by touch. */
  mode?: 'select' | 'write';
  onSelect?: (cursor: Cursor) => void;
  onSelectMeasure?: (measure: number, extend: boolean) => void;
  onChordClick?: (measure: number, beat: number) => void;
  onLongPressMeasure?: (measure: number) => void;
  /** Write: add `pitch` after note `after` (-1 = at the start) of `measure`. */
  onAdd?: (measure: number, after: number, pitch: Pitch) => void;
  /** Write: change note `note` of `measure` to `pitch`. */
  onReplace?: (measure: number, note: number, pitch: Pitch) => void;
  /** Write: a finger is held on the staff (the page shouldn't scroll) — or let go. */
  onHold?: (held: boolean) => void;
  handleRef?: Ref<ScoreHandle>;
}) {
  const [width, setWidth] = useState(0);
  // Laid out again only when the music changes (not, say, the title being typed).
  const { measures, clef, key, timeSignature } = transcription;
  const rows = useMemo(() => renderScoreRows({ measures, clef, key, timeSignature }, width, { firstBar }), [measures, clef, key, timeSignature, width, firstBar]);
  const tappable = !!(onSelect || onSelectMeasure || onChordClick);
  const lit = useMemo(() => {
    const set = new Set<string>();
    if (cursor && cursor.note >= 0) set.add(`${cursor.measure}:${cursor.note}`);
    if (playing) set.add(`${playing.measure}:${playing.note}`);
    return set;
  }, [cursor, playing]);
  const [hover, setHover] = useState<Hover | null>(null);
  // The finger on the staff in Write (handlers only): where its row is on the page, and whether it
  // has been held.
  const touch = useRef<{ row: number; originX: number; originY: number; spot: Spot | null; held: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);

  useImperativeHandle(
    handleRef,
    () => ({
      rowOf(measure) {
        let y = 0;
        for (const row of rows) {
          const height = row.height * row.scale;
          if (row.measures.some((m) => m.measure === measure)) return { y, height };
          y += height;
        }
        return null;
      },
    }),
    [rows],
  );

  /** What's at (x, y) in a row's own units: a chord, a note, a spot on the staff (and the note it'd
      add there), or just the bar. */
  const locate = (ri: number, x: number, y: number): Spot | null => {
    const row = rows[ri];
    if (!row) return null;
    const chord = row.chords.find((c) => x >= c.x - 4 && x <= c.x + 48 && y <= SCORE_STAVE_Y + 2);
    if (chord) return { kind: 'chord', measure: chord.measure, beat: chord.beat };
    const note = row.notes.find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h);
    if (note) return { kind: 'note', measure: note.measure, note: note.note };
    const m = row.measures.find((b) => x >= b.x && x <= b.x + b.w);
    if (!m) return null;
    const staffHover = mode === 'write' ? staffSpot(ri, row, m, x, y) : null;
    return staffHover ? { kind: 'staff', hover: staffHover } : { kind: 'measure', measure: m.measure };
  };

  const staffSpot = (ri: number, row: ScoreRow, m: ScoreMeasureBox, x: number, y: number): Hover | null => {
    const topY = row.staffTop;
    const spacing = row.spacing;
    const steps = Math.round(((y - topY) / spacing) * 2); // 0 = top line, each step a line or space
    if (steps < -9 || steps > 17) return null;
    const staff = staffOf(transcription);
    const index = staff.topLineIndex - steps;
    const step = STEPS[((index % 7) + 7) % 7];
    // A note placed by touch follows the key signature (F in G major is F♯).
    const pitch: Pitch = { step, alter: keyAlters(transcription.key)[step], octave: Math.floor(index / 7) - staff.writtenShift };
    const midi = midiOf(pitch);
    if (midi < staff.low || midi > staff.high) return null;
    // Which note's column the finger is in (halfway to each neighbour); past the last note of a bar
    // with room left is the place to add one. A full bar only ever overwrites.
    const xs = m.noteXs;
    let replace: number | null = null;
    for (let i = 0; i < xs.length; i++) {
      const left = i === 0 ? m.x : (xs[i - 1] + xs[i]) / 2 + 6;
      const right = i === xs.length - 1 ? (m.full ? m.x + m.w : xs[i] + 24) : (xs[i] + xs[i + 1]) / 2 + 6;
      if (x >= left && x < right) replace = i;
    }
    const ledgers: number[] = [];
    for (let s2 = -2; s2 >= steps; s2 -= 2) ledgers.push(topY + (s2 / 2) * spacing);
    for (let s2 = 10; s2 <= steps; s2 += 2) ledgers.push(topY + (s2 / 2) * spacing);
    return { row: ri, x: replace !== null ? xs[replace] + 6 : x, y: topY + (steps / 2) * spacing, ledgers, pitch, measure: m.measure, after: xs.length - 1, replace };
  };

  /** A tap's action (select mode, or a note/chord/bar tapped in write mode). */
  const act = (spot: Spot | null) => {
    if (!spot) return;
    if (spot.kind === 'chord') {
      if (onChordClick) onChordClick(spot.measure, spot.beat);
      else onSelectMeasure?.(spot.measure, false);
    } else if (spot.kind === 'note') onSelect?.({ measure: spot.measure, note: spot.note });
    else {
      const measure = spot.kind === 'staff' ? spot.hover.measure : spot.measure;
      if (onSelectMeasure) onSelectMeasure(measure, false);
      else onSelect?.({ measure, note: transcription.measures[measure].notes.length - 1 });
    }
  };

  const onTap = (ri: number, e: GestureResponderEvent) => {
    const row = rows[ri];
    act(locate(ri, e.nativeEvent.locationX / row.scale, e.nativeEvent.locationY / row.scale));
  };
  const onLong = (ri: number, e: GestureResponderEvent) => {
    const row = rows[ri];
    const spot = locate(ri, e.nativeEvent.locationX / row.scale, e.nativeEvent.locationY / row.scale);
    const measure = !spot ? null : spot.kind === 'staff' ? spot.hover.measure : spot.measure;
    if (measure !== null) onLongPressMeasure?.(measure);
  };

  // ── Write: a finger on the staff ──
  const pointAt = (e: GestureResponderEvent) => {
    const t = touch.current;
    const row = t ? rows[t.row] : null;
    if (!t || !row) return null;
    return locate(t.row, (e.nativeEvent.pageX - t.originX) / row.scale, (e.nativeEvent.pageY - t.originY) / row.scale);
  };
  const endTouch = () => {
    const t = touch.current;
    if (t?.timer) clearTimeout(t.timer);
    if (t?.held) onHold?.(false);
    touch.current = null;
    setHover(null);
  };
  const writeHandlers = (ri: number) => ({
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => {
      const row = rows[ri];
      const lx = e.nativeEvent.locationX;
      const ly = e.nativeEvent.locationY;
      const spot = locate(ri, lx / row.scale, ly / row.scale);
      const t = { row: ri, originX: e.nativeEvent.pageX - lx, originY: e.nativeEvent.pageY - ly, spot, held: false, timer: null as ReturnType<typeof setTimeout> | null };
      touch.current = t;
      if (spot?.kind === 'staff') {
        setHover(spot.hover);
        t.timer = setTimeout(() => {
          if (touch.current !== t) return;
          t.held = true;
          onHold?.(true);
        }, HOLD_MS);
      }
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const t = touch.current;
      if (!t || t.spot?.kind !== 'staff') return;
      const spot = pointAt(e);
      const next = spot?.kind === 'staff' ? spot.hover : null;
      setHover((h) => (sameHover(h, next) ? h : next));
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const t = touch.current;
      if (!t) return;
      const startedOnStaff = t.spot?.kind === 'staff';
      const spot = startedOnStaff ? pointAt(e) : t.spot;
      endTouch();
      if (startedOnStaff) {
        if (spot?.kind !== 'staff') return;
        if (spot.hover.replace !== null) onReplace?.(spot.hover.measure, spot.hover.replace, spot.hover.pitch);
        else onAdd?.(spot.hover.measure, spot.hover.after, spot.hover.pitch);
      } else act(spot);
    },
    // A quick swipe is the page scrolling: let it, and add nothing. Once held, keep the finger.
    onResponderTerminationRequest: () => !touch.current?.held,
    onResponderTerminate: endTouch,
  });

  const caret = cursor && !range ? cursor : null;

  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} accessibilityLabel="Notation" style={{ minHeight: 100 }}>
      {rows.map((row, i) => {
        const body = (
          <ScoreRowView
            row={row}
            lit={lit}
            range={range}
            cursorMeasure={cursor && !range ? cursor.measure : null}
            caret={caret}
            hover={hover && hover.row === i ? hover : null}
          />
        );
        if (mode === 'write') {
          return (
            <View key={i} {...writeHandlers(i)}>
              {body}
            </View>
          );
        }
        return tappable || onLongPressMeasure ? (
          <Pressable key={i} onPress={(e) => onTap(i, e)} onLongPress={onLongPressMeasure ? (e) => onLong(i, e) : undefined} delayLongPress={400}>
            {body}
          </Pressable>
        ) : (
          <View key={i}>{body}</View>
        );
      })}
    </View>
  );
}

const sameHover = (h: Hover | null, next: Hover | null) =>
  h === next || (!!h && !!next && h.row === next.row && h.y === next.y && Math.abs(h.x - next.x) < 2 && h.after === next.after && h.replace === next.replace);

function ScoreRowView({
  row,
  lit,
  range,
  cursorMeasure,
  caret,
  hover,
}: {
  row: ScoreRow;
  lit: Set<string>;
  range: { from: number; to: number } | null;
  cursorMeasure: number | null;
  caret: Cursor | null;
  hover: Hover | null;
}) {
  const { colors } = useAppTheme();
  const w = row.drawWidth * row.scale;
  const h = row.height * row.scale;
  const litItems = useMemo(() => itemsTagged(row.items, lit), [row.items, lit]);
  const top = (row.staffTop - 18) * row.scale;
  const barH = (row.spacing * 4 + 36) * row.scale;
  // The caret: after the selected note, or at the start of the bar when none is.
  let caretX: number | null = null;
  if (caret) {
    const box = row.measures.find((m) => m.measure === caret.measure);
    if (box) {
      const note = caret.note >= 0 ? row.notes.find((n) => n.measure === caret.measure && n.note === caret.note) : null;
      caretX = note ? note.x + note.w + 2 : box.noteStart - 6;
    }
  }
  // The note's name goes above the finger; near the top of the row, beside it instead.
  const label = !hover ? { x: 0, y: 0 } : hover.y - 50 >= 0 ? { x: hover.x, y: hover.y - 50 } : { x: hover.x - 40, y: Math.max(0, hover.y - 12) };
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
      {caretX !== null ? (
        <View
          style={{
            position: 'absolute',
            left: caretX * row.scale,
            top: (row.staffTop - 8) * row.scale,
            width: 2,
            height: (row.spacing * 4 + 16) * row.scale,
            borderRadius: 1,
            backgroundColor: colors.accent,
          }}
        />
      ) : null}
      {row.chords.map((c, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: c.x * row.scale, top: 0, height: (SCORE_STAVE_Y - 1) * row.scale, justifyContent: 'flex-end' }}
        >
          <ChordSymbol symbol={c.symbol} scale={row.scale} />
        </View>
      ))}
      {hover ? (
        <Svg width={w} height={h} viewBox={`0 0 ${row.drawWidth} ${row.height}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {hover.ledgers.map((ly) => (
            <Line key={ly} x1={hover.x - 11} x2={hover.x + 11} y1={ly} y2={ly} stroke={colors.accent} strokeOpacity={0.6} strokeWidth={1.2} />
          ))}
          <Ellipse cx={hover.x} cy={hover.y} rx={6.2} ry={4.6} transform={`rotate(-20 ${hover.x} ${hover.y})`} fill={colors.accent} fillOpacity={0.5} />
          {/* The note's name above the finger, on a chip so it reads over the staff. */}
          <Rect x={label.x - 20} y={label.y} width={40} height={24} rx={8} fill={colors.accent} />
          <SvgText x={label.x} y={label.y + 18} textAnchor="middle" fontSize={16} fontWeight="700" fill={colors['accent-foreground']}>
            {pitchName(hover.pitch)}
          </SvgText>
        </Svg>
      ) : null}
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

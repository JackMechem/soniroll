import type { Bar, ChordSlot, IRealSong } from '@jam-practice/core/iRealPro';
import { formatComposer } from '@jam-practice/core/iRealPro';
import { CELLS_PER_ROW, layoutRows, type PlacedBar } from '@jam-practice/core/chartLayout';
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { ChordQualityText } from '@/components/ChordQualityText';
import { useAppTheme } from '@/theme/ThemeProvider';

export { layoutRows, type PlacedBar };

/**
 * Native port of `apps/web/components/ChordChart.tsx` — the chart notation renderer. Ported
 * concept-for-concept, not a reskin: web's `PageFit` measures natural (unscaled) content size via
 * `ResizeObserver` and applies `transform: scale()` so a chart of any length fits its box without
 * ever needing to scroll internally; here, `onLayout` on an outer "box" View and an inner
 * absolutely-positioned "content" View gives the same two measurements (RN's `transform` is
 * visual-only, exactly like CSS transform, so it never feeds back into the measured layout size —
 * confirmed by reasoning through RN's own layout model, the same guarantee web's code already
 * relies on). `groupRows`, `Row`, `BarContent`, `COL_WIDTH`, `BAR_HEIGHT`, `QUALITY_SIZE`,
 * `BADGE_SIZE` are exported for `ChordChartEditor.tsx` (the mobile chart builder) to reuse
 * wholesale — "the editor IS the chart, not a second approximation of one," the same principle
 * `PROJECT.md`'s own Chord Charts history says web's builder was redesigned around.
 *
 * One deliberate scope-down from web, in the name of a working first native pass rather than a
 * pixel-perfect one: web's `PageFit` has two modes (`fitHeight={true}` for the full-screen
 * "maximize" overlay, `fitHeight={false}` for the normal in-page view). Mobile has no "maximize"
 * affordance at all yet (the main screen is already close to full width), so this file only ports
 * the `fitHeight={false}` behavior — grow/shrink to fill the available width (capped at
 * `MAX_SCALE`), with the resulting height following the content. A fullscreen mode can be added
 * later the same way web's second branch works, if a "maximize" button is ever added here too.
 *
 * Font-size/width constants below are the exact web values converted from `rem` to `px` at the
 * same 16px base (`COL_WIDTH` 7.5rem -> 120, `BAR_HEIGHT` 5.25rem -> 84, etc.) — not re-tuned —
 * since this is meant to be the same chart, not a different one.
 */

export const COL_WIDTH = 120;
export const BAR_HEIGHT = 84;
const ROOT_SIZE = 36;
const ROOT_ACCIDENTAL_SIZE = 18;
export const QUALITY_SIZE = 22;
const BASS_SIZE = 18;
const REPEAT_SIZE = 28;
const SYMBOL_SIZE = 18;
const SMALL_LABEL_SIZE = 13;
export const BADGE_SIZE = 12;
const TIME_SIG_SIZE = 28;

// A short chart is allowed to scale *up* past its natural size to better fill the available width
// (a 4-bar tune at 1:1 would otherwise sit small with a lot of empty space around it) — capped
// well short of comically large, same as web.
const MAX_SCALE = 1.6;

const ACCIDENTAL_GLYPH: Record<'b' | '#', string> = { b: '♭', '#': '♯' };

// SMuFL codepoints read directly out of the real bundled Petaluma.otf's cmap (the same
// verification method `ChordQualityText.tsx` and `apps/web/components/ChordChart.tsx` already
// used for every glyph in this chart) — repeat1Bar (U+E500), segno (U+E047), coda (U+E048).
const GLYPH_REPEAT_BAR = '';
const GLYPH_SEGNO = '';
const GLYPH_CODA = '';
// repeat2Bars (U+E501) — iReal's "repeat the previous two bars" sign.
const GLYPH_REPEAT_TWO = '\uE501';

export default function ChordChartView({
  song,
  barsPerRow = 4,
  headerActions,
  hideHeader,
}: {
  song: IRealSong;
  /** Skip the title/info block entirely — the full-page viewer (`app/tool/chord-charts-view.tsx`)
      shows all of that in the navigation header instead, to give the chart itself the space. */
  hideHeader?: boolean;
  barsPerRow?: number;
  /** Rendered above the composer, in the header's own top-right column — e.g. a transpose
      dropdown/delete button a caller wants sharing the title row instead of a separate row of its
      own above it (`app/tool/chord-charts-view.tsx`'s own reason for this prop). The only other
      real call site, `LinkedChartModal.tsx`, leaves this unset, so its header renders exactly as
      it always has. */
  headerActions?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const rows = layoutRows(song.bars, barsPerRow);

  return (
    <View style={{ gap: 16 }}>
      {hideHeader ? null : (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.background,
          paddingBottom: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            className="font-ui-bold"
            style={{ fontSize: 22, fontWeight: '700', color: colors.foreground }}
          >
            {song.title || 'Untitled'}
          </Text>
          <Text className="font-ui" style={{ fontSize: 13, color: colors.muted }}>
            {song.style}
            {song.style ? ' · ' : ''}
            {song.key} · {song.timeSignature.top}/{song.timeSignature.bottom}
          </Text>
        </View>
        {headerActions || song.composer ? (
          <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            {headerActions}
            {song.composer ? (
              <Text className="font-ui" style={{ fontSize: 13, color: colors.muted }}>
                {formatComposer(song.composer)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      )}

      {song.bars.length === 0 ? (
        <Text className="font-ui" style={{ fontSize: 13, color: colors.muted }}>
          No chords found in this chart.
        </Text>
      ) : (
        <PageFit>
          {rows.map((row, i) => (
            <Row
              key={i}
              placed={row}
              isFirstRow={i === 0}
              isLastRow={i === rows.length - 1}
              timeSignature={i === 0 ? song.timeSignature : undefined}
            />
          ))}
        </PageFit>
      )}
    </View>
  );
}

/** Measures its children's natural (unscaled) size and applies one uniform scale so the whole
    chart fits the available width, however many rows it takes — see this file's own doc comment
    for the pixel-math derivation (manually computed top offset, no reliance on a `transformOrigin`
    style prop, to stay safe across RN versions). Exported for `ChordChartEditor.tsx`'s own bar
    grid, same as web's `PageFit`. */
export function PageFit({ children }: { children: React.ReactNode }) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const scale = boxWidth > 0 && natural.w > 0 ? Math.min(MAX_SCALE, boxWidth / natural.w) : 1;
  // Manually emulates CSS `transform-origin: top center` without needing RN's own
  // `transformOrigin` style prop (whose support varies by RN version): scaling around the
  // element's own default center would move its top edge down when shrinking, so the vertical
  // position is pre-shifted by half the height delta the scale introduces, keeping the visual top
  // edge pinned at y=0 and the horizontal center pinned at the box's own center either way.
  const top = natural.h > 0 ? (natural.h / 2) * (scale - 1) : 0;
  const left = boxWidth / 2 - natural.w / 2;

  function onBoxLayout(e: LayoutChangeEvent) {
    setBoxWidth(e.nativeEvent.layout.width);
  }
  function onContentLayout(e: LayoutChangeEvent) {
    setNatural({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  }

  return (
    <View
      style={{ width: '100%', height: natural.h > 0 ? natural.h * scale : undefined, overflow: 'hidden' }}
      onLayout={onBoxLayout}
    >
      <View
        onLayout={onContentLayout}
        style={{
          position: 'absolute',
          left,
          top,
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 12,
          transform: [{ scale }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** One cell of iReal's 16-cells-per-line grid; a normal bar is 4 cells (= `COL_WIDTH`). */
export const CELL_WIDTH = COL_WIDTH / 4;

/** `layoutRows` without the positions — which bars share a line. */
export function groupRows(bars: Bar[], barsPerRow: number): Bar[][] {
  return layoutRows(bars, barsPerRow).map((row) => row.map((p) => p.bar));
}

function endingSpans(placed: PlacedBar[]): { label: string; left: number; width: number }[] {
  const spans: { label: string; left: number; width: number }[] = [];
  let i = 0;
  while (i < placed.length) {
    const label = placed[i].bar.endingLabel;
    if (!label) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < placed.length && placed[j].bar.endingLabel === label && (j === i || !placed[j].bar.endingStart)) j += 1;
    const last = placed[j - 1];
    spans.push({ label, left: placed[i].start * CELL_WIDTH, width: (last.start + last.cells - placed[i].start) * CELL_WIDTH });
    i = j;
  }
  return spans;
}

/** One line of the chart, bars placed on the 16-cell grid (see `layoutRows`). Also used by the
    chart builder (`app/tool/chord-charts-editor.tsx`): `renderBarContent` overrides what's drawn
    inside a bar (the builder's tappable/selected bars), `trailing` appends an item after the
    line's bars. */
export function Row({
  placed,
  isFirstRow,
  isLastRow,
  timeSignature,
  renderBarContent,
  trailing,
}: {
  placed: PlacedBar[];
  isFirstRow: boolean;
  isLastRow: boolean;
  /** The chart's own time signature, printed at its very first bar. */
  timeSignature?: { top: number; bottom: number };
  renderBarContent?: (bar: Bar, indexInRow: number) => React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const spans = endingSpans(placed);
  const last = placed[placed.length - 1];
  const used = last ? last.start + last.cells : 0;
  const trailingCells = trailing ? 4 : 0;
  const fillerCells = Math.max(0, CELLS_PER_ROW - used - trailingCells);

  return (
    <View>
      {spans.length > 0 ? (
        <View style={{ height: 20 }}>
          {spans.map((s) => (
            <View
              key={s.left}
              style={{
                position: 'absolute',
                left: s.left,
                width: s.width,
                borderTopWidth: 2,
                borderLeftWidth: 2,
                borderColor: `${colors.foreground}B3`,
                height: 16,
                top: 4,
                paddingLeft: 4,
              }}
            >
              <Text className="font-ui-semibold" style={{ fontSize: SMALL_LABEL_SIZE, fontWeight: '600', color: colors.muted }}>
                {s.label}.
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {placed.map((p, i) => {
          const prevEnd = i === 0 ? 0 : placed[i - 1].start + placed[i - 1].cells;
          const gap = p.start - prevEnd;
          return (
            <View key={i} style={{ flexDirection: 'row' }}>
              {gap > 0 ? <View style={{ width: gap * CELL_WIDTH, height: BAR_HEIGHT }} /> : null}
              <BarCell
                bar={p.bar}
                width={p.cells * CELL_WIDTH}
                timeSignature={p.bar.timeSignature ?? (isFirstRow && i === 0 ? timeSignature : undefined)}
                hasLeftEdge={i === 0 || gap > 0}
                isFirstOfChart={isFirstRow && i === 0}
                isLastOfChart={isLastRow && i === placed.length - 1}
                content={renderBarContent?.(p.bar, i)}
              />
            </View>
          );
        })}
        {trailing}
        {fillerCells > 0 ? <View style={{ width: fillerCells * CELL_WIDTH, height: BAR_HEIGHT }} /> : null}
      </View>
    </View>
  );
}

function BarCell({
  bar,
  width,
  timeSignature,
  hasLeftEdge,
  isFirstOfChart,
  isLastOfChart,
  content,
}: {
  bar: Bar;
  width: number;
  timeSignature?: { top: number; bottom: number };
  hasLeftEdge: boolean;
  isFirstOfChart: boolean;
  isLastOfChart: boolean;
  content?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const thin = `${colors.muted}66`;
  // iReal always draws the chart's very opening barline thick, whatever else is there.
  const thickLeft = bar.startRepeat || isFirstOfChart;
  const leftWidth = thickLeft ? 4 : bar.startDouble || hasLeftEdge ? 1 : 0;
  const leftColor = thickLeft || bar.startDouble ? colors.foreground : thin;
  const thickRight = bar.endRepeat || bar.endBarline === 'final' || isLastOfChart;
  const rightWidth = thickRight ? 4 : 1;
  const rightColor = thickRight || bar.endBarline === 'double' ? colors.foreground : thin;
  const symbolLeft = bar.section ? 26 : 2;

  return (
    <View
      style={{
        width,
        height: BAR_HEIGHT,
        borderLeftWidth: leftWidth,
        borderLeftColor: leftColor,
        borderRightWidth: rightWidth,
        borderRightColor: rightColor,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 4,
        paddingHorizontal: 2,
      }}
    >
      {bar.startDouble && !thickLeft ? <View style={{ position: 'absolute', left: 2, top: 0, bottom: 0, width: 1, backgroundColor: colors.foreground }} /> : null}
      {bar.endBarline === 'double' && !thickRight ? (
        <View style={{ position: 'absolute', right: 2, top: 0, bottom: 0, width: 1, backgroundColor: colors.foreground }} />
      ) : null}
      {bar.endBarline === 'final' && !bar.endRepeat ? (
        <View style={{ position: 'absolute', right: 4, top: 0, bottom: 0, width: 1, backgroundColor: colors.foreground }} />
      ) : null}
      {bar.startRepeat ? <RepeatDots side="left" /> : null}
      {bar.endRepeat ? <RepeatDots side="right" /> : null}
      {bar.section ? (
        <View
          style={{
            position: 'absolute',
            left: 2,
            top: 2,
            minWidth: BADGE_SIZE * 1.6,
            height: BADGE_SIZE * 1.6,
            paddingHorizontal: 4,
            borderRadius: 4,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'PetalumaScript', fontSize: BADGE_SIZE, fontWeight: '700', color: colors['accent-foreground'] }}>
            {bar.section}
          </Text>
        </View>
      ) : null}
      {bar.segno || bar.coda ? (
        <Text style={{ position: 'absolute', left: symbolLeft, top: 0, fontFamily: 'Petaluma', fontSize: SYMBOL_SIZE, color: colors.accent }}>
          {bar.segno ? GLYPH_SEGNO : ''}
          {bar.coda ? GLYPH_CODA : ''}
        </Text>
      ) : null}
      {bar.alternates?.length ? (
        <View style={{ position: 'absolute', top: 1, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {bar.alternates.map((a, i) => (
            <ChordLabel key={i} slot={a} scale={0.55} muted />
          ))}
        </View>
      ) : null}
      {bar.directive ? (
        <Text
          numberOfLines={1}
          style={{ position: 'absolute', right: 6, bottom: 1, fontFamily: 'PetalumaScript', fontSize: SMALL_LABEL_SIZE, color: colors.accent }}
        >
          {bar.directive}
        </Text>
      ) : null}
      {bar.content.kind === 'repeat' && bar.content.double ? (
        // iReal's "repeat the previous two bars" sign sits on the barline between the two bars.
        <Text style={{ position: 'absolute', right: -REPEAT_SIZE * 0.55, fontFamily: 'Petaluma', fontSize: REPEAT_SIZE, color: colors.muted, zIndex: 2 }}>
          {GLYPH_REPEAT_TWO}
        </Text>
      ) : null}
      {timeSignature ? <TimeSignatureGlyph timeSignature={timeSignature} offset={bar.startRepeat ? 12 : 7} /> : null}
      {content ?? <BarContent bar={bar} />}
    </View>
  );
}

/** `offset` keeps it clear of the opening barline (and repeat dots, when there are any). */
function TimeSignatureGlyph({ timeSignature, offset }: { timeSignature: { top: number; bottom: number }; offset: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', marginLeft: offset, marginRight: 2 }}>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: TIME_SIG_SIZE, lineHeight: TIME_SIG_SIZE * 0.9, color: colors.foreground }}>
        {timeSignature.top}
      </Text>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: TIME_SIG_SIZE, lineHeight: TIME_SIG_SIZE * 0.9, color: colors.foreground }}>
        {timeSignature.bottom}
      </Text>
    </View>
  );
}

function RepeatDots({ side }: { side: 'left' | 'right' }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: '50%',
        transform: [{ translateY: -8 }],
        gap: 3,
        ...(side === 'left' ? { left: 5 } : { right: 5 }),
      }}
    >
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.foreground }} />
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.foreground }} />
    </View>
  );
}

/** What's drawn inside a bar: its chords, a "%" repeat mark, or nothing. Also used by the chart
    builder for every bar it isn't currently typing into. */
export function BarContent({ bar }: { bar: Bar }) {
  const { colors } = useAppTheme();
  if (bar.content.kind === 'repeat') {
    if (bar.content.double) return null; // drawn on the barline by BarCell

    return (
      <Text style={{ fontFamily: 'Petaluma', fontSize: REPEAT_SIZE, color: colors.muted }}>
        {GLYPH_REPEAT_BAR}
      </Text>
    );
  }
  const { slots } = bar.content;
  if (slots.length === 0) return null;
  return (
    <FitChordRow>
      {slots.map((slot, i) => (
        <ChordLabel key={i} slot={slot} />
      ))}
    </FitChordRow>
  );
}

/** Keeps a bar's chords on one line no matter how many there are: measures its own natural
    (unscaled) width against the available width and, only once it doesn't fit, horizontally
    compresses via `transform: [{ scaleX }]` (visual-only, same as web's CSS `scaleX` — the text's
    height is untouched). Orthogonal to `PageFit` above (which scales the *whole chart*) — this
    handles one bar with more chords than its fixed `COL_WIDTH` comfortably holds at natural size.
    The `alignItems: 'center'` + unconstrained-width-child technique is what lets the inner `View`
    report its true intrinsic width via `onLayout` even though its parent is narrower — the native
    equivalent of web's `overflow-hidden` + absolutely-positioned content trick. */
function FitChordRow({ children }: { children: React.ReactNode }) {
  const [availW, setAvailW] = useState(0);
  const [natW, setNatW] = useState(0);
  const scale = availW > 0 && natW > 0 ? Math.min(1, availW / natW) : 1;

  return (
    <View
      style={{ width: '100%', overflow: 'hidden', alignItems: 'center' }}
      onLayout={(e) => setAvailW(e.nativeEvent.layout.width)}
    >
      <View
        onLayout={(e) => setNatW(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          transform: scale < 1 ? [{ scaleX: scale }] : undefined,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function ChordLabel({ slot, scale = 1, muted = false }: { slot: ChordSlot; scale?: number; muted?: boolean }) {
  const { colors } = useAppTheme();
  // Small chords (iReal's `s`) print at about two thirds size.
  const k = scale * (slot.kind === 'chord' && slot.small ? 0.68 : 1);
  const fg = muted ? colors.muted : colors.foreground;
  if (slot.kind === 'nc') {
    return (
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: QUALITY_SIZE * k, fontWeight: '500', color: colors.muted }}>
        N.C.
      </Text>
    );
  }
  if (slot.kind === 'slash') {
    return <Text style={{ fontFamily: 'PetalumaScript', fontSize: QUALITY_SIZE * k, color: colors.muted }}>/</Text>;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: ROOT_SIZE * k, fontWeight: '500', color: fg }}>
        {slot.letter}
        {slot.accidental ? <Text style={{ fontSize: ROOT_ACCIDENTAL_SIZE * k }}>{ACCIDENTAL_GLYPH[slot.accidental]}</Text> : null}
      </Text>
      {slot.quality ? (
        <View style={{ marginLeft: 4 * k }}>
          <ChordQualityText quality={slot.quality} style={{ fontSize: QUALITY_SIZE * k, fontWeight: '500', color: fg }} />
        </View>
      ) : null}
      {slot.bass ? (
        <Text style={{ marginLeft: 6 * k, fontSize: BASS_SIZE * k, fontFamily: 'PetalumaScript', color: colors.muted }}>
          /{slot.bass.letter}
          {slot.bass.accidental ? ACCIDENTAL_GLYPH[slot.bass.accidental] : ''}
        </Text>
      ) : null}
    </View>
  );
}

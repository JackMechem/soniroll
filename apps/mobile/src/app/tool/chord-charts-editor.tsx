import * as Clipboard from 'expo-clipboard';
import { encodeChartString } from '@jam-practice/core/chartString';
import { parseBarSlots, slotsToText, type Bar, type ChordSlot, type IRealSong } from '@jam-practice/core/iRealPro';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChartEditorKeyboard, type BarTool } from '@/components/ChartEditorKeyboard';
import { BAR_HEIGHT, BarContent, COL_WIDTH, layoutRows, PageFit, Row } from '@/components/ChordChartView';
import { ChevronLeftIcon, ChevronRightIcon, FolderIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { NumberStepper } from '@/components/NumberStepper';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

const STARTING_BARS = 8;
const BARS_PER_ROW = 4;
const ROW_GAP = 12; // PageFit's own gap between rows
const ENDING_ROW_EXTRA = 20; // Row's ending-bracket strip
const MAX_SCALE = 1.6; // PageFit's own cap

const SECTIONS = ['A', 'B', 'C', 'D', 'i', 'V'];
const ENDINGS = ['1', '2', '3'];
const DIRECTIVES = ['Fine', 'D.C. al Coda', 'D.C. al Fine', 'D.S. al Coda', 'D.S. al Fine'];

/** One bar as the editor holds it: the chord text as typed ("C^7 F7", "Bb7#5/D", "NC", "/") plus
    every marking a `Bar` can carry — so everything an imported chart's bar has is representable
    here, and editing a chart never loses anything. `endingStart` isn't stored; it's derived on
    save from where a run of same-numbered ending bars begins. */
type EditableBar = Omit<Bar, 'content' | 'endingStart'> & {
  text: string;
  isRepeatBar: boolean;
  /** iReal's "repeat the previous two bars" sign (kept as-is when an imported chart is edited). */
  doubleRepeat?: boolean;
  /** An imported bar's chords as parsed, kept while `text` is untouched — the text form can't
      carry everything (small chords), so an unedited bar saves back exactly as it was. */
  original?: { text: string; slots: ChordSlot[] };
};

function blankBar(): EditableBar {
  return { text: '', isRepeatBar: false };
}

function isBlank(eb: EditableBar) {
  return (
    !eb.text.trim() &&
    !eb.isRepeatBar &&
    !eb.section &&
    !eb.startRepeat &&
    !eb.endRepeat &&
    !eb.endingLabel &&
    !eb.coda &&
    !eb.segno &&
    !eb.directive
  );
}

function fromRealBar(bar: Bar): EditableBar {
  const { content, endingStart: _endingStart, ...rest } = bar;
  const text = content.kind === 'chords' ? slotsToText(content.slots) : '';
  return {
    ...rest,
    text,
    isRepeatBar: content.kind === 'repeat',
    ...(content.kind === 'repeat' && content.double ? { doubleRepeat: true } : {}),
    ...(content.kind === 'chords' ? { original: { text, slots: content.slots } } : {}),
  };
}

function toRealBars(bars: EditableBar[]): Bar[] {
  return bars.map((eb, i) => {
    const { text, isRepeatBar, doubleRepeat, original, ...rest } = eb;
    const bar: Bar = {
      ...rest,
      content: isRepeatBar
        ? { kind: 'repeat', ...(doubleRepeat ? { double: true } : {}) }
        : { kind: 'chords', slots: original && original.text === text ? original.slots : parseBarSlots(text) },
    };
    // A builder-made bar starts a new line at a section; an imported bar's line is set by its cells.
    if (bar.section && bar.cells === undefined) bar.newRow = true;
    if (bar.endingLabel && bars[i - 1]?.endingLabel !== bar.endingLabel) bar.endingStart = true;
    // Drop keys a toggle cleared (left as `undefined`) so saved data stays tidy.
    for (const k of Object.keys(bar) as (keyof Bar)[]) if (bar[k] === undefined) delete bar[k];
    return bar;
  });
}

function cycle(list: string[], current: string | undefined): string | undefined {
  const i = current === undefined ? -1 : list.indexOf(current);
  return i + 1 < list.length ? list[i + 1] : undefined;
}

/**
 * The chord chart builder, modeled on iReal Pro's editor: the chart fills the screen between the
 * header and a keyboard fixed to the bottom (the app's bottom nav is hidden on this route — see
 * `FloatingTabBar.tsx`). Tap a bar to select it; the strip above the keyboard shows what's typed
 * into it, with prev/next and insert/delete-bar buttons. The keyboard (`ChartEditorKeyboard`) has
 * roots, accidentals, extensions, quality symbols and a **space** key (two chords in one bar), plus
 * a row of bar tools — section (tap to cycle A/B/C/D/i/V/none), repeat barlines, numbered ending
 * (cycles 1./2./3./none), coda, segno, "%" repeat bar, D.C./D.S. direction (cycles) — and Next,
 * which adds a bar past the end.
 *
 * Title/composer/style/key/time signature/playlist sit in one compact line above the chart; tapping
 * it opens the details dialog. Two ways in: a new chart (details passed from
 * `chord-charts-new.tsx`) or "Edit chart" (`songId`, loaded and saved in place). Typing always
 * appends at the end of the bar's text (backspace removes the last character, hold it to clear the
 * bar) — no mid-text cursor, which keeps the fixed keyboard simple and predictable one-handed.
 */
function ChordChartEditorScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ songId?: string; playlist?: string; title?: string; composer?: string; style?: string; key?: string }>();
  const songId = params.songId ?? null;
  const { importSongs, updateSong, selectedSong, playlists } = useChordChartsLibrary(songId);
  // Shown in the details line: the chart's playlists (editing), or the one it'll go in (new — none
  // means All charts only).
  const playlist = songId
    ? playlists.filter((p) => p.songs.some((s) => s.id === songId)).map((p) => p.name).join(', ')
    : params.playlist?.trim() || '';

  const [title, setTitle] = useState(params.title ?? '');
  const [composer, setComposer] = useState(params.composer ?? '');
  const [style, setStyle] = useState(params.style ?? '');
  const [key, setKey] = useState(params.key ?? '');
  const [top, setTop] = useState(4);
  const [bottom, setBottom] = useState(4);
  const [bars, setBars] = useState<EditableBar[]>(() => Array.from({ length: STARTING_BARS }, blankBar));
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(!songId && !params.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing: fill from the chart once loaded (its bars are fetched lazily when signed in).
  // Render-time adjustment rather than an effect, so there's no flash of a blank grid.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (songId && selectedSong && loadedFor !== songId) {
    setLoadedFor(songId);
    setTitle(selectedSong.title);
    setComposer(selectedSong.composer);
    setStyle(selectedSong.style);
    setKey(selectedSong.key);
    setTop(selectedSong.timeSignature.top);
    setBottom(selectedSong.timeSignature.bottom);
    setBars(selectedSong.bars.length > 0 ? selectedSong.bars.map(fromRealBar) : [blankBar()]);
    setActiveIndex(0);
  }
  const loadingExisting = !!songId && loadedFor !== songId;

  const realBars = toRealBars(bars);
  const song: IRealSong = {
    title: title.trim(),
    composer: composer.trim(),
    style: style.trim(),
    key: key.trim(),
    timeSignature: { top, bottom },
    bars: realBars,
  };
  const active = bars[activeIndex] ?? blankBar();

  function patchActive(patch: Partial<EditableBar>) {
    setBars((prev) => prev.map((b, i) => (i === activeIndex ? { ...b, ...patch } : b)));
  }

  function insert(text: string) {
    // A space only separates chords — never lead with one or double it up.
    if (text === ' ' && (active.text === '' || active.text.endsWith(' '))) return;
    patchActive({ text: active.text + text, isRepeatBar: false, doubleRepeat: undefined });
  }

  function onTool(tool: BarTool) {
    switch (tool) {
      case 'section':
        return patchActive({ section: cycle(SECTIONS, active.section) });
      case 'startRepeat':
        return patchActive({ startRepeat: active.startRepeat ? undefined : true });
      case 'endRepeat':
        return patchActive({ endRepeat: active.endRepeat ? undefined : true });
      case 'ending':
        return patchActive({ endingLabel: cycle(ENDINGS, active.endingLabel) });
      case 'coda':
        return patchActive({ coda: active.coda ? undefined : true });
      case 'segno':
        return patchActive({ segno: active.segno ? undefined : true });
      case 'repeatBar':
        return patchActive({ isRepeatBar: !active.isRepeatBar, doubleRepeat: undefined });
      case 'directive':
        return patchActive({ directive: cycle(DIRECTIVES, active.directive) });
    }
  }

  function next() {
    if (activeIndex === bars.length - 1) setBars((prev) => [...prev, blankBar()]);
    setActiveIndex(activeIndex + 1);
  }

  function insertBarAfter() {
    setBars((prev) => [...prev.slice(0, activeIndex + 1), blankBar(), ...prev.slice(activeIndex + 1)]);
    setActiveIndex(activeIndex + 1);
  }

  function deleteActiveBar() {
    if (bars.length <= 1) {
      setBars([blankBar()]);
      return;
    }
    setBars((prev) => prev.filter((_, i) => i !== activeIndex));
    setActiveIndex(Math.min(activeIndex, bars.length - 2));
  }

  async function handleSave() {
    if (!song.title) {
      setError('Give this chord chart a title.');
      setDetailsOpen(true);
      return;
    }
    // Trailing blank bars are just unused room from the starting grid / Next.
    let end = bars.length;
    while (end > 1 && isBlank(bars[end - 1])) end--;
    const toSave = { ...song, bars: realBars.slice(0, end) };
    setError(null);
    setSaving(true);
    try {
      if (songId) {
        await updateSong(songId, toSave);
        router.back();
        return;
      }
      const { added } = await importSongs([toSave], playlist || null);
      if (added === 0) {
        setError('A chart with this title, composer and key is already in your library — change one of them to save it.');
        setDetailsOpen(true);
        return;
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that chord chart.");
    } finally {
      setSaving(false);
    }
  }

  // --- keep the selected bar's row in view as you move through the chart ---
  const scrollRef = useRef<ScrollView>(null);
  const [chartTop, setChartTop] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const scrollY = useRef(0);

  const placedRows = layoutRows(realBars, BARS_PER_ROW);
  const rows = placedRows.map((r) => r.map((p) => p.bar));
  const rowStarts: number[] = [];
  for (let i = 0, n = 0; i < rows.length; i++) {
    rowStarts.push(n);
    n += rows[i].length;
  }
  let activeRow = 0;
  rowStarts.forEach((start, i) => {
    if (activeIndex >= start) activeRow = i;
  });
  const rowHasEnding = rows.map((r) => r.some((b) => !!b.endingLabel));

  useEffect(() => {
    if (!chartWidth || !viewportH) return;
    const scale = Math.min(MAX_SCALE, chartWidth / (COL_WIDTH * BARS_PER_ROW));
    let y = 0;
    for (let i = 0; i < activeRow; i++) y += BAR_HEIGHT + (rowHasEnding[i] ? ENDING_ROW_EXTRA : 0) + ROW_GAP;
    const rowTop = chartTop + y * scale;
    const rowBottom = rowTop + (BAR_HEIGHT + ENDING_ROW_EXTRA) * scale;
    if (rowTop < scrollY.current) scrollRef.current?.scrollTo({ y: Math.max(0, rowTop - 8), animated: true });
    else if (rowBottom > scrollY.current + viewportH) scrollRef.current?.scrollTo({ y: rowBottom - viewportH + 8, animated: true });
    // Only when the selected row (or the layout) changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow, chartWidth, viewportH, chartTop]);

  const info = [composer.trim(), style.trim(), key.trim() && `Key of ${key.trim()}`, `${top}/${bottom}`, playlist]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: songId ? 'Edit chart' : 'New chart',
          headerRight: () => (
            <Pressable
              onPress={() => void handleSave()}
              disabled={saving || loadingExisting}
              className="rounded-full px-5 py-2"
              style={{ backgroundColor: colors.accent, opacity: saving || loadingExisting ? 0.5 : 1 }}
            >
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          ),
        }}
      />

      {loadingExisting ? (
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner showLabel label="Loading chart…" />
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 16 }}
            onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={32}
          >
            <Pressable onPress={() => setDetailsOpen(true)} className="flex-row items-center gap-2 px-2 pb-2 pt-1">
              <View className="flex-1">
                <Text numberOfLines={1} className="font-ui-bold text-base font-bold" style={{ color: title.trim() ? colors.foreground : colors.muted }}>
                  {title.trim() || 'Untitled — tap to add details'}
                </Text>
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {info}
                </Text>
              </View>
              <PencilIcon color={colors.muted} size={18} />
            </Pressable>
            {error ? (
              <Text className="font-ui px-2 pb-2 text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}

            <View
              onLayout={(e) => {
                setChartTop(e.nativeEvent.layout.y);
                setChartWidth(e.nativeEvent.layout.width);
              }}
            >
              <PageFit>
                {placedRows.map((placed, rowIdx) => (
                  <Row
                    key={rowIdx}
                    placed={placed}
                    isFirstRow={rowIdx === 0}
                    isLastRow={rowIdx === rows.length - 1}
                    timeSignature={rowIdx === 0 ? { top, bottom } : undefined}
                    renderBarContent={(bar, i) => {
                      const index = rowStarts[rowIdx] + i;
                      const selected = index === activeIndex;
                      return (
                        <Pressable
                          onPress={() => setActiveIndex(index)}
                          style={{
                            flex: 1,
                            alignSelf: 'stretch',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 6,
                            backgroundColor: selected ? `${colors.accent}33` : 'transparent',
                            borderWidth: selected ? 2 : 0,
                            borderColor: colors.accent,
                          }}
                        >
                          <BarContent bar={bar} />
                        </Pressable>
                      );
                    }}
                  />
                ))}
              </PageFit>
            </View>
          </ScrollView>

          {/* Fixed to the bottom: the selected bar's text + bar navigation, then the keyboard. */}
          <View style={{ backgroundColor: colors.surface, paddingBottom: insets.bottom, borderTopWidth: 1, borderTopColor: colors['surface-hover'] }}>
            <View className="flex-row items-center px-1.5 pt-1.5" style={{ gap: 5 }}>
              <StripButton onPress={() => setActiveIndex(Math.max(0, activeIndex - 1))} label="Previous bar" disabled={activeIndex === 0}>
                <ChevronLeftIcon color={colors.foreground} size={22} />
              </StripButton>
              <View className="flex-1 flex-row items-center rounded-lg px-3" style={{ height: 40, backgroundColor: colors.background }}>
                <Text className="font-ui text-xs" style={{ color: colors.muted, marginRight: 8 }}>
                  {activeIndex + 1}
                </Text>
                <Text numberOfLines={1} className="font-ui-semibold flex-1 text-base font-semibold" style={{ color: active.isRepeatBar ? colors.muted : colors.foreground }}>
                  {active.isRepeatBar ? '% repeat previous bar' : active.text}
                  {active.isRepeatBar ? null : <Text style={{ color: colors.accent }}>|</Text>}
                </Text>
              </View>
              <StripButton onPress={() => setActiveIndex(Math.min(bars.length - 1, activeIndex + 1))} label="Next bar" disabled={activeIndex >= bars.length - 1}>
                <ChevronRightIcon color={colors.foreground} size={22} />
              </StripButton>
              <StripButton onPress={insertBarAfter} label="Insert a bar after this one">
                <PlusIcon color={colors.foreground} size={20} />
              </StripButton>
              <StripButton onPress={deleteActiveBar} label="Delete this bar">
                <TrashIcon color={colors.danger} size={18} />
              </StripButton>
            </View>
            <ChartEditorKeyboard
              onInsert={insert}
              onBackspace={() => patchActive({ text: active.text.slice(0, -1) })}
              onClear={() => patchActive({ text: '' })}
              onTool={onTool}
              onNext={next}
              toolState={{
                section: active.section ?? null,
                startRepeat: active.startRepeat ? 'on' : null,
                endRepeat: active.endRepeat ? 'on' : null,
                ending: active.endingLabel ? `${active.endingLabel}.` : null,
                coda: active.coda ? 'on' : null,
                segno: active.segno ? 'on' : null,
                repeatBar: active.isRepeatBar ? 'on' : null,
                directive: active.directive ?? null,
              }}
            />
          </View>
        </>
      )}

      <DetailsDialog
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        playlist={playlist}
        fields={{ title, composer, style, key }}
        setters={{ title: setTitle, composer: setComposer, style: setStyle, key: setKey }}
        top={top}
        bottom={bottom}
        setTop={setTop}
        setBottom={setBottom}
        song={song}
      />
    </View>
  );
}

function StripButton({ children, onPress, label, disabled }: { children: React.ReactNode; onPress: () => void; label: string; disabled?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className="items-center justify-center rounded-lg"
      style={{ width: 40, height: 40, backgroundColor: colors.background, opacity: disabled ? 0.35 : 1 }}
    >
      {children}
    </Pressable>
  );
}

/** Title/composer/style/key/time signature, plus "export as chart link" — a dialog pinned near the
    top of the screen so the system keyboard comes up below it, not over it. */
function DetailsDialog({
  visible,
  onClose,
  playlist,
  fields,
  setters,
  top,
  bottom,
  setTop,
  setBottom,
  song,
}: {
  visible: boolean;
  onClose: () => void;
  playlist: string;
  fields: { title: string; composer: string; style: string; key: string };
  setters: { title: (v: string) => void; composer: (v: string) => void; style: (v: string) => void; key: (v: string) => void };
  top: number;
  bottom: number;
  setTop: (v: number) => void;
  setBottom: (v: number) => void;
  song: IRealSong;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const input = { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: `${colors.overlay}99`, paddingTop: insets.top + 16, paddingHorizontal: 12 }} onPress={onClose}>
        <Pressable onPress={() => {}} className="rounded-2xl" style={{ backgroundColor: colors.surface, maxHeight: '92%' }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 10 }}>
            <View className="flex-row items-center justify-between">
              <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
                Chart details
              </Text>
              {playlist ? (
                <View className="flex-row items-center gap-1">
                  <FolderIcon color={colors.muted} size={14} />
                  <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                    {playlist}
                  </Text>
                </View>
              ) : null}
            </View>
            <TextInput value={fields.title} onChangeText={setters.title} placeholder="Title" placeholderTextColor={colors.muted} className="font-ui text-base" style={input} />
            <TextInput value={fields.composer} onChangeText={setters.composer} placeholder="Composer (optional)" placeholderTextColor={colors.muted} className="font-ui text-base" style={input} />
            <View className="flex-row gap-2">
              <TextInput value={fields.style} onChangeText={setters.style} placeholder="Style, e.g. Medium Swing" placeholderTextColor={colors.muted} className="font-ui flex-1 text-base" style={input} />
              <TextInput value={fields.key} onChangeText={setters.key} placeholder="Key" placeholderTextColor={colors.muted} autoCorrect={false} className="font-ui text-base" style={{ ...input, width: 80 }} />
            </View>
            <View className="flex-row gap-4">
              <View className="flex-1">
                <NumberStepper label="Beats per bar" value={top} unit="" min={1} max={32} step={1} onChange={setTop} />
              </View>
              <View className="flex-1">
                <NumberStepper label="Beat unit" value={bottom} unit="" min={1} max={32} step={1} onChange={setBottom} />
              </View>
            </View>

            {exported ? (
              <View className="gap-2">
                <TextInput value={exported} editable={false} multiline style={{ fontSize: 11, color: colors.muted, backgroundColor: colors.background, borderRadius: 8, padding: 8, maxHeight: 90 }} />
                <Pressable
                  onPress={() => void Clipboard.setStringAsync(exported).then(() => setCopied(true), () => {})}
                  className="items-center rounded-xl py-2.5"
                  style={{ backgroundColor: colors.background }}
                >
                  <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                    {copied ? 'Copied!' : 'Copy chart link'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setCopied(false);
                  setExported(encodeChartString({ name: song.title || 'Chart', songs: [song] }));
                }}
                className="items-center rounded-xl py-2.5"
                style={{ backgroundColor: colors.background }}
              >
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  Export as chart link
                </Text>
              </Pressable>
            )}

            <Pressable onPress={onClose} className="items-center rounded-xl py-3" style={{ backgroundColor: colors.accent }}>
              <Text className="font-ui-bold text-base font-bold" style={{ color: colors['accent-foreground'] }}>
                Done
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default withScreenLoader(ChordChartEditorScreen);

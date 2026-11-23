import { SUB_LABELS } from '@jam-practice/core/meterControls';
import type { Analysis, Take } from '@jam-practice/core/timeTestAnalysis';
import { STATUS_LABEL, describeMs, fmtTime, signedMs, statusOf, verdict, whereLabel, type Status } from '@jam-practice/core/timeTestTiming';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PlayIcon, StopIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { Breakdown, Histogram, TimelineChart } from '@/components/timeTest/Charts';
import { useStatusColors } from '@/components/timeTest/parts';
import { Waveform, clampView, type WaveView } from '@/components/timeTest/Waveform';
import { Button } from '@/components/ui';
import type { Detail } from '@/lib/timeTestPeaks';
import { playbackPosition } from '@/lib/timeTestSession';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The results of one take on the phone (the website's `timetest/Analytics.tsx`, in one column): a
 * few plain sentences, the numbers as tiles, the waveform to listen back and look closer, every
 * stroke across the take, where strokes land, the worst moments, and the average by beat and by
 * note. Give it a new `key` for each take: the view starts again then.
 */

function Panel({ title, info, children }: { title: string; info?: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center gap-1.5">
        <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {info ? <InfoButton title={title} text={info} size={16} /> : null}
      </View>
      {children}
    </View>
  );
}

function Tile({ label, value, unit, sub, status }: { label: string; value: string; unit?: string; sub?: string; status?: Status }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  return (
    <View className="gap-0.5 rounded-xl px-4 py-3" style={{ backgroundColor: colors.surface, flexBasis: '46%', flexGrow: 1 }}>
      <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        {status ? <View className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor[status] }} accessibilityLabel={STATUS_LABEL[status]} /> : null}
        <Text numberOfLines={1} className="font-ui-semibold text-2xl font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
          {value}
          {unit ? (
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              {unit}
            </Text>
          ) : null}
        </Text>
      </View>
      {sub ? (
        <Text numberOfLines={2} className="font-ui text-xs" style={{ color: colors.muted }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function StatusLegend({ tol }: { tol: number }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const items: [Status, string][] = [
    ['good', `within ±${tol} ms`],
    ['warning', `up to ±${(tol * 2.5).toFixed(0)} ms`],
    ['critical', 'further off'],
  ];
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      {items.map(([s, d]) => (
        <View key={s} className="flex-row items-center gap-1.5">
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor[s] }} />
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            <Text className="font-ui-semibold font-semibold" style={{ color: colors.foreground }}>
              {STATUS_LABEL[s]}
            </Text>{' '}
            {d}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A small rounded button for the waveform's controls. */
function SmallButton({ label, onPress, primary, on, children }: { label: string; onPress: () => void; primary?: boolean; on?: boolean; children?: ReactNode }) {
  const { colors, derived } = useAppTheme();
  const fg = primary ? colors['accent-foreground'] : on === false ? colors.muted : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className="h-9 min-w-9 flex-row items-center justify-center gap-1.5 overflow-hidden rounded-md px-3"
      style={{ backgroundColor: primary ? colors.accent : derived.fill }}
    >
      {children}
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

const WAVEFORM_INFO =
  "Vertical lines are the click (bars numbered). Each stroke is a colored line, shaded back to where it should have landed; the strip under the waveform shows how early or late it was. Dashed lines are extra strokes, and hollow circles are notes you didn't play. Drag to move along, pinch to zoom, tap to play from there or drag the playhead. The strip at the bottom is the whole take: tap it to jump.";

/** The waveform with its playback controls. Its playhead moves on its own (60 times a second), so
    it's kept here rather than redrawing the whole results. */
function WaveformPanel({
  take,
  a,
  detail,
  view,
  setView,
  cursor,
  setCursor,
  playing,
  onPlay,
  onStopPlayback,
  playClick,
  setPlayClick,
}: {
  take: Take;
  a: Analysis;
  detail: Detail;
  view: WaveView;
  setView: (update: (v: WaveView) => WaveView) => void;
  cursor: number;
  setCursor: (t: number) => void;
  playing: boolean;
  onPlay: (from: number) => void;
  onStopPlayback: () => void;
  playClick: boolean;
  setPlayClick: (v: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const lastPos = useRef<number | null>(null);

  // Follow playback: move the playhead, and keep it in view.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const step = () => {
      const p = playbackPosition();
      setPlayhead(p);
      if (p !== null) {
        lastPos.current = p;
        setView((v) => {
          if (p <= v.end && p >= v.start) return v;
          const sp = v.end - v.start;
          return clampView({ start: p - sp * 0.1, end: p + sp * 0.9 }, a.duration);
        });
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      setTimeout(() => {
        // Play again from where it stopped.
        if (lastPos.current !== null) setCursor(lastPos.current);
        lastPos.current = null;
        setPlayhead(null);
      }, 0);
    };
  }, [playing, a.duration, setView, setCursor]);

  const zoom = (f: number) =>
    setView((v) => {
      const mid = (v.start + v.end) / 2;
      const sp = (v.end - v.start) * f;
      return clampView({ start: mid - sp / 2, end: mid + sp / 2 }, a.duration);
    });

  return (
    <Panel title="Listen and look closer" info={WAVEFORM_INFO}>
      <View className="flex-row flex-wrap items-center gap-2">
        <SmallButton label={playing ? 'Stop' : 'Play'} primary={!playing} onPress={() => (playing ? onStopPlayback() : onPlay(cursor))}>
          {playing ? <StopIcon color={colors.foreground} size={16} /> : <PlayIcon color={colors['accent-foreground']} size={16} />}
        </SmallButton>
        <SmallButton label={playClick ? 'With click' : 'Without click'} on={playClick} onPress={() => setPlayClick(!playClick)} />
        <Text className="font-ui flex-1 text-right text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {fmtTime(scrub ?? playhead ?? cursor)} / {fmtTime(a.duration)}
        </Text>
      </View>
      <Waveform
        take={take}
        analysis={a}
        detail={detail}
        view={view}
        setView={setView}
        playhead={playhead ?? cursor}
        playing={playing}
        onScrub={setScrub}
        onSeek={(t) => {
          setCursor(t);
          if (playing) onPlay(t);
        }}
      />
      <View className="flex-row items-center gap-2">
        <SmallButton label="−" onPress={() => zoom(2)} />
        <SmallButton label="+" onPress={() => zoom(0.5)} />
        <SmallButton label="Whole take" onPress={() => setView(() => ({ start: 0, end: a.duration }))} />
      </View>
      <StatusLegend tol={a.toleranceMs} />
    </Panel>
  );
}

export function Analytics({
  take,
  analysis: a,
  detail,
  bpm,
  beatsPerBar,
  playing,
  onPlay,
  onStopPlayback,
  playClick,
  setPlayClick,
  onTryAgain,
  onOpenMic,
  onReveal,
}: {
  take: Take;
  analysis: Analysis;
  detail: Detail;
  /** The tempo shown when the take was recorded. */
  bpm: number;
  beatsPerBar: number;
  playing: boolean;
  onPlay: (from: number) => void;
  onStopPlayback: () => void;
  playClick: boolean;
  setPlayClick: (v: boolean) => void;
  /** With no strokes heard, just these two instead of a page of zeros. */
  onTryAgain: () => void;
  onOpenMic: () => void;
  /** Scroll the page so this many points into the results are in view (the waveform). */
  onReveal: (y: number) => void;
}) {
  const { colors, derived } = useAppTheme();
  const statusColor = useStatusColors();
  const s = a.stats;
  const tol = a.toleranceMs;
  const beatLen = 60 / bpm;
  // Start at the first graded bar, zoomed to two bars (a phone's width).
  const [view, setView] = useState<WaveView>(() => {
    const start = Math.max(0, a.countInEnd - beatLen / 2);
    return clampView({ start, end: start + beatLen * beatsPerBar * 2 }, a.duration);
  });
  const [cursor, setCursor] = useState(() => Math.max(0, a.countInEnd));
  const [waveY, setWaveY] = useState(0);

  const jump = (t: number) => {
    const sp = Math.max(0.6, beatLen * 2);
    setView(clampView({ start: t - sp / 2, end: t + sp / 2 }, a.duration));
    setCursor(Math.max(0, t - sp / 2));
    onReveal(waveY);
  };

  const on = useMemo(() => a.hits.filter((h) => h.kind === 'on'), [a]);
  const range = useMemo(() => {
    const sorted = on.map((h) => Math.abs(h.errorMs)).sort((x, y) => x - y);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return Math.min(100, Math.max(tol * 3, Math.ceil((p95 * 1.2) / 5) * 5));
  }, [on, tol]);

  const byBeat = useMemo(
    () =>
      Array.from({ length: beatsPerBar }, (_, b) => {
        const e = on.filter((h) => h.beat === b && h.pos === 0).map((h) => h.errorMs);
        const m = e.reduce((x, y) => x + y, 0) / Math.max(1, e.length);
        const sd = Math.sqrt(e.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, e.length));
        return { label: `Beat ${b + 1}`, meanMs: m, stdMs: sd, count: e.length };
      }),
    [on, beatsPerBar],
  );

  const worst = useMemo(() => [...on].sort((x, y) => Math.abs(y.errorMs) - Math.abs(x.errorMs)).slice(0, 6), [on]);
  const measured = s.tempoRatio ? bpm * s.tempoRatio : null;

  // Nothing heard: a page of zeros says nothing true. Just the warning and the two ways forward.
  if (s.hits === 0) {
    return (
      <View className="w-full items-center gap-3 rounded-xl p-5" style={{ backgroundColor: colors.surface }}>
        <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.foreground }}>
          No strokes heard
        </Text>
        <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
          {verdict(a, bpm)}
        </Text>
        <View className="flex-row flex-wrap justify-center gap-2">
          <Button label="Microphone settings" kind="secondary" pill onPress={onOpenMic} />
          <Button label="Try again" pill onPress={onTryAgain} />
        </View>
      </View>
    );
  }

  const heardAs =
    a.notesPerBeat === 0 ? 'a mix (beat by beat)' : a.notesPerBeat === 1 ? 'one note a beat' : (SUB_LABELS[a.notesPerBeat] ?? `${a.notesPerBeat} per beat`).toLowerCase();

  return (
    <View className="w-full gap-4">
      <View className="gap-2">
        <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
          How you did
        </Text>
        <Text className="font-ui text-sm leading-5" style={{ color: colors.foreground }}>
          {verdict(a, bpm)}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Tile label="Score" value={String(Math.round(s.score))} unit="/100" sub="Full marks within tolerance" />
        <Tile
          label={`On time (±${tol} ms)`}
          value={`${Math.round(s.withinPct)}%`}
          sub={`${s.onCount} of ${s.hits} strokes`}
          status={s.withinPct >= 80 ? 'good' : s.withinPct >= 50 ? 'warning' : 'critical'}
        />
        <Tile label="Average" value={signedMs(s.meanMs)} sub={Math.abs(s.meanMs) < 1 ? 'Centred on the click' : s.meanMs < 0 ? 'Early (rushing)' : 'Late (dragging)'} />
        <Tile label="Consistency" value={`±${s.stdMs.toFixed(1)} ms`} sub="Spread stroke to stroke" />
        <Tile
          label="Your tempo"
          value={measured ? measured.toFixed(1) : '–'}
          sub={measured ? `Click ${bpm} BPM (${measured >= bpm ? '+' : ''}${(measured - bpm).toFixed(1)})` : 'Needs 8 or more strokes'}
        />
        <Tile label="Strokes" value={String(s.hits)} sub={`${s.missed} missed · ${s.extra} extra`} />
      </View>

      <View className="gap-1">
        {[
          `${s.earlyCount} early · ${s.onCount} on time · ${s.lateCount} late`,
          `Furthest early ${signedMs(s.maxEarlyMs)} · furthest late ${signedMs(s.maxLateMs)}`,
          `${a.autoDetected ? 'Heard as ' : 'Graded as '}${heardAs}`,
          a.bleedIgnored > 0 ? `Ignored ${a.bleedIgnored} click${a.bleedIgnored === 1 ? '' : 's'} the mic picked up` : null,
        ].map((line) =>
          line ? (
            <Text key={line} className="font-ui text-xs" style={{ color: colors.muted }}>
              {line}
            </Text>
          ) : null,
        )}
      </View>

      <View onLayout={(e) => setWaveY(e.nativeEvent.layout.y)}>
        <WaveformPanel
          take={take}
          a={a}
          detail={detail}
          view={view}
          setView={setView}
          cursor={cursor}
          setCursor={setCursor}
          playing={playing}
          onPlay={onPlay}
          onStopPlayback={onStopPlayback}
          playClick={playClick}
          setPlayClick={setPlayClick}
        />
      </View>

      <Panel title="Timing across the take">
        <TimelineChart a={a} range={range} onJump={jump} />
      </Panel>

      <Panel title="Where your strokes land">
        <Histogram a={a} range={range} />
      </Panel>

      <Panel title="Worst moments">
        {worst.length === 0 ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Nothing to show.
          </Text>
        ) : (
          <View className="overflow-hidden rounded-md" style={{ backgroundColor: colors.background }}>
            {worst.map((h, i) => (
              <Pressable
                key={i}
                onPress={() => jump(h.t)}
                accessibilityRole="button"
                android_ripple={{ color: colors['surface-hover'] }}
                className="flex-row items-center gap-3 px-3 py-2.5"
                style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : undefined}
              >
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor[statusOf(h.errorMs, tol)] }} />
                <Text numberOfLines={1} className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
                  {whereLabel(h.bar, h.beat, h.pos, h.n)}
                </Text>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                  {describeMs(h.errorMs, tol).replace(', on time', '')}
                </Text>
                <Text className="font-ui w-11 text-right text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                  {fmtTime(h.t)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Panel>

      {beatsPerBar > 1 ? (
        <Panel title="By beat of the bar">
          <Breakdown rows={byBeat} tol={tol} range={range} />
        </Panel>
      ) : null}
      {a.byPosition.length > 1 ? (
        <Panel title="By note within the beat">
          <Breakdown rows={a.byPosition} tol={tol} range={range} />
        </Panel>
      ) : null}
    </View>
  );
}

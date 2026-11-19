import { SUB_LABELS } from '@jam-practice/core/meterControls';
import type { Calibration } from '@jam-practice/core/timeTestAnalysis';
import { sensitivityThresholdDb } from '@jam-practice/core/timeTestOnset';
import { STATUS_LABEL, signedMs, statusOf, type Status, type TakeSummary } from '@jam-practice/core/timeTestTiming';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SwitchRow } from '@/components/SwitchRow';
import { Field, SheetText, SliderField, TextButton, ValueBadge, formatShortDate, useGradeColors } from '@/components/tool/ear';
import { Slider } from '@/components/tool/Slider';
import { Button } from '@/components/ui';
import { METER_FLOOR_DB, getMicMeterSnapshot, holdMic, releaseMic, subscribeMicMeter } from '@/lib/timeTestSession';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * The Time Test's smaller pieces on the phone (the website's `components/timetest/LiveFeedback`,
 * `History` and `MicPanel`): status colours, the live readout while recording, the history list
 * and the Microphone sheet.
 */

/** On time / a little off / off, in the trainers' right / half / wrong colours for this theme. */
export function useStatusColors(): Record<Status, string> {
  const g = useGradeColors();
  return { good: g.correct, warning: g.partial, critical: g.incorrect };
}

// ── While recording ───────────────────────────────────────────────────────────────────────────

const RANGE_MS = 60;

/** While recording: the last stroke's offset, big, and the last dozen on an early ↔ late strip. */
export function LiveFeedback({
  hits,
  toleranceMs,
  countInLeft,
}: {
  hits: { id: number; errorMs: number }[];
  toleranceMs: number;
  /** Clicks left in the count-in, or null once it's over. */
  countInLeft: number | null;
}) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const last = hits[hits.length - 1];
  const recent = hits.slice(-12);
  const within = hits.filter((h) => Math.abs(h.errorMs) <= toleranceMs).length;
  const x = (ms: number) => 50 + (Math.max(-RANGE_MS, Math.min(RANGE_MS, ms)) / RANGE_MS) * 50;
  const tolPct = (toleranceMs / RANGE_MS) * 50;
  const lastStatus = last ? statusOf(last.errorMs, toleranceMs) : 'good';

  return (
    <View className="w-full items-center gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }} accessibilityLiveRegion="polite">
      <View className="h-[72px] items-center justify-center">
        {countInLeft !== null ? (
          <>
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              Count-in
            </Text>
            <Text className="font-ui-semibold text-4xl font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
              {countInLeft}
            </Text>
          </>
        ) : last ? (
          <>
            <Text className="font-ui-semibold text-4xl font-semibold" style={{ color: statusColor[lastStatus], fontVariant: ['tabular-nums'] }}>
              {signedMs(last.errorMs)}
            </Text>
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>
              {STATUS_LABEL[lastStatus]}
              {Math.abs(last.errorMs) > toleranceMs ? ` · ${last.errorMs > 0 ? 'late' : 'early'}` : ''}
            </Text>
          </>
        ) : (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Start playing…
          </Text>
        )}
      </View>

      <View className="w-full">
        <View className="h-8 w-full rounded-md" style={{ backgroundColor: colors.background }}>
          <View
            className="absolute rounded-sm"
            style={{ top: 4, bottom: 4, left: `${50 - tolPct}%`, width: `${tolPct * 2}%`, backgroundColor: withAlpha(statusColor.good, 0.2) }}
          />
          <View className="absolute" style={{ top: 0, bottom: 0, left: '50%', width: 2, marginLeft: -1, backgroundColor: colors.muted }} />
          {recent.map((h, i) => (
            <View
              key={h.id}
              className="absolute h-3.5 w-3.5 rounded-full"
              style={{
                top: 9,
                left: `${x(h.errorMs)}%`,
                marginLeft: -7,
                backgroundColor: statusColor[statusOf(h.errorMs, toleranceMs)],
                borderWidth: 2,
                borderColor: colors.surface,
                opacity: 0.25 + (0.75 * (i + 1)) / recent.length,
              }}
            />
          ))}
        </View>
        <View className="mt-1 flex-row justify-between">
          {['← early', 'click', 'late →'].map((t) => (
            <Text key={t} className="font-ui text-[11px]" style={{ color: colors.muted }}>
              {t}
            </Text>
          ))}
        </View>
      </View>
      {hits.length > 0 ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {hits.length} strokes · {Math.round((within / hits.length) * 100)}% within ±{toleranceMs} ms
        </Text>
      ) : null}
    </View>
  );
}

// ── History ───────────────────────────────────────────────────────────────────────────────────

const TIME_FORMAT = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Past takes, newest first, with a strip of recent scores (the History chip's sheet). */
export function HistoryList({ takes, onClear }: { takes: TakeSummary[]; onClear: () => void }) {
  const { colors, derived } = useAppTheme();
  const statusColor = useStatusColors();
  const [confirming, setConfirming] = useState(false);
  if (takes.length === 0) return <SheetText>Record a take and its results show up here, so you can see yourself improve.</SheetText>;
  const recent = takes.slice(-30);
  return (
    <>
      <View className="h-16 flex-row items-end gap-1 rounded-md p-2" style={{ backgroundColor: colors.background }} accessibilityLabel="Scores of recent takes">
        {recent.map((t) => (
          <View
            key={t.at}
            className="flex-1 rounded-t-sm"
            style={{
              minWidth: 3,
              height: `${Math.max(4, Math.min(100, t.score))}%`,
              backgroundColor: statusColor[t.withinPct >= 80 ? 'good' : t.withinPct >= 50 ? 'warning' : 'critical'],
            }}
          />
        ))}
      </View>
      <View>
        {[...takes]
          .reverse()
          .slice(0, 40)
          .map((t, i) => (
            <View key={t.at} className="gap-0.5 py-2.5" style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : undefined}>
              <View className="flex-row items-center justify-between gap-3">
                <Text numberOfLines={1} className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
                  {t.bpm} BPM · {t.meter} · {t.notes === 0 ? 'Mixed' : (SUB_LABELS[t.notes] ?? `${t.notes} per beat`)}
                </Text>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                  {Math.round(t.score)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  {formatShortDate(t.at)} {TIME_FORMAT(t.at)} · {Math.round(t.seconds)} s
                </Text>
                <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                  {Math.round(t.withinPct)}% · {signedMs(t.meanMs)} · ±{t.stdMs.toFixed(1)}
                </Text>
              </View>
            </View>
          ))}
      </View>
      <View className="items-start">
        <TextButton label="Clear history" danger onPress={() => setConfirming(true)} />
      </View>
      <ConfirmDialog
        visible={confirming}
        title="Clear history?"
        message="Every take's results will be removed. This can't be undone."
        confirmLabel="Clear"
        onConfirm={() => {
          setConfirming(false);
          onClear();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

// ── The Microphone sheet ──────────────────────────────────────────────────────────────────────

function dbToPct(db: number) {
  return Math.min(100, Math.max(0, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));
}

/** The mic's live level, with the line a stroke has to cross and a flash for each stroke found. */
function LevelMeter({ sensitivity }: { sensitivity: number }) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();
  const { levelDb, stroke } = useSyncExternalStore(subscribeMicMeter, getMicMeterSnapshot);
  const threshold = sensitivityThresholdDb(sensitivity);
  return (
    <View className="gap-1.5">
      <View className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: colors.background }} accessibilityLabel={`Input level ${Math.round(levelDb)} dB`}>
        <View className="absolute rounded-full" style={{ top: 0, bottom: 0, left: 0, width: `${dbToPct(levelDb)}%`, backgroundColor: colors.accent }} />
        <View className="absolute" style={{ top: 0, bottom: 0, width: 2, left: `${dbToPct(threshold)}%`, backgroundColor: colors.foreground }} />
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-ui text-xs" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {levelDb <= METER_FLOOR_DB + 1 ? 'Silent' : `${levelDb.toFixed(0)} dB`}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {stroke ? (
            <Animated.View key={stroke.key} entering={ZoomIn.duration(140)} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor.good }} />
          ) : null}
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {stroke ? `Stroke heard (${stroke.db.toFixed(0)} dB)` : 'Hit your pad to test'}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** The Microphone sheet: sensitivity with a live meter, calibration and fine-tuning the latency,
    and ignoring click bleed. The mic listens while it's open. */
export function MicSheet({
  sensitivity,
  setSensitivity,
  latencyMs,
  setLatencyMs,
  calibrated,
  rejectBleed,
  setRejectBleed,
  calibrating,
  onCalibrate,
  lastCalibration,
  calibrateError,
  micError,
  busy,
}: {
  sensitivity: number;
  setSensitivity: (v: number) => void;
  latencyMs: number;
  setLatencyMs: (v: number) => void;
  calibrated: boolean;
  rejectBleed: boolean;
  setRejectBleed: (v: boolean) => void;
  calibrating: boolean;
  onCalibrate: () => void;
  lastCalibration: Calibration | null;
  calibrateError: string | null;
  micError: string | null;
  /** A take is recording: calibration waits. */
  busy: boolean;
}) {
  const { colors } = useAppTheme();
  const statusColor = useStatusColors();

  // Listen while this sheet is open, so the meter moves and strokes flash.
  useEffect(() => {
    void holdMic('meter').catch(() => {});
    return () => releaseMic('meter');
  }, []);

  return (
    <>
      {micError ? (
        <Text className="font-ui text-sm" style={{ color: colors.danger }}>
          {micError}
        </Text>
      ) : null}

      <Field
        label="Sensitivity"
        hint="Every stroke should flash green, and nothing should when you're not playing. Raise it for soft playing, lower it if it picks up the room. Put the phone near the pad, on something that doesn't rattle."
        aside={<ValueBadge>{Math.round(sensitivity * 100)}%</ValueBadge>}
      >
        <Slider label="Stroke sensitivity" value={sensitivity} onChange={(v) => setSensitivity(Math.round(v * 100) / 100)} />
        <LevelMeter sensitivity={sensitivity} />
      </Field>

      <Field
        label="Latency"
        hint="Sound takes time to get out of the speaker and back into the mic. Calibrating measures that, so a stroke right on the click scores 0 ms. Play the click through the phone's speaker (or hold your headphones to the mic) and stay quiet for 12 clicks. Calibrate again if you switch to headphones or a different speaker."
        aside={
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: calibrated ? colors.foreground : colors.muted, fontVariant: ['tabular-nums'] }}>
            {calibrated ? `${latencyMs.toFixed(1)} ms` : 'Not calibrated yet'}
          </Text>
        }
      >
        <Button label={calibrating ? 'Listening… stay quiet' : calibrated ? 'Calibrate again' : 'Calibrate'} onPress={onCalibrate} disabled={busy || calibrating} />
        {lastCalibration ? (
          <Text className="font-ui text-xs" style={{ color: lastCalibration.ok ? statusColor.good : colors.danger }}>
            {lastCalibration.message}
          </Text>
        ) : null}
        {calibrateError ? (
          <Text className="font-ui text-xs" style={{ color: colors.danger }}>
            {calibrateError}
          </Text>
        ) : null}
      </Field>

      <SliderField
        label="Fine-tune"
        value={latencyMs}
        min={-50}
        max={300}
        step={0.5}
        format={(v) => `${v.toFixed(1)} ms`}
        hint="Nudge the measured latency by hand. If every stroke you play right on the click reads a few ms late, raise it by that much."
        onChange={setLatencyMs}
      />

      <SwitchRow
        label="Ignore click bleed"
        checked={rejectBleed}
        onChange={setRejectBleed}
        hint="Don't count the click as a stroke when it leaks into the mic. It listens to the count-in to learn how loud the click is, so keep at least one bar of count-in."
      />
    </>
  );
}

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { DEFAULT_CLICK_SOUND_ID, type BeatLevel, type ClickSettings } from '@jam-practice/core/clickSounds';
import {
  COMMON_METERS,
  NEXT_LEVEL,
  SUB_LABELS,
  clampBpm,
  convertTempo,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import { analyze, detectStrokes, takeOverview, type Analysis, type AnalysisParams, type Calibration, type Take } from '@jam-practice/core/timeTestAnalysis';
import { HISTORY_LIMIT, type TakeSummary } from '@jam-practice/core/timeTestTiming';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeatIndicator } from '@/components/BeatIndicator';
import {
  DrumIcon,
  HistoryIcon,
  MeterIcon,
  MicrophoneIcon,
  RecordIcon,
  SpeakerIcon,
  StopIcon,
  StopwatchIcon,
  SubdivisionChipIcon,
  type IconProps,
} from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Analytics } from '@/components/timeTest/Analytics';
import { HistoryList, LiveFeedback, MicSheet } from '@/components/timeTest/parts';
import { Field } from '@/components/tool/ear';
import {
  BigButton,
  MeterQuickPicks,
  SoundPicker,
  SubdivisionPicker,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
  TimeSignatureControl,
  soundSummary,
} from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { ChoiceCards, CountField } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { useDeviceSettings } from '@/lib/useDeviceSettings';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { takeDetail, type Detail } from '@/lib/timeTestPeaks';
import { micErrorMessage } from '@/lib/timeTestPadInput';
import {
  MAX_TAKE_SEC,
  getTimeTestSnapshot,
  playTake,
  preparedFor,
  runCalibration,
  setLiveParams,
  startRecording,
  stopAll,
  stopPlayback,
  stopRecording,
  subscribeTimeTest,
} from '@/lib/timeTestSession';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';

/** The web's Time Test icon is a target. */
function TargetIcon({ color, size = 18 }: IconProps) {
  return <MaterialCommunityIcons name="bullseye" size={size} color={color} />;
}

const TOLERANCES = [5, 10, 15, 20, 30];

// The website's keys and defaults, so settings and history follow you between the two.
const SETTINGS_KEY = 'jam-practice-time-test';
const DEFAULT_SETTINGS = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  /** "Quarter note = bpm"; null = the meter's own beat unit. */
  tempoNoteValue: 4 as number | null,
  countInBars: 1,
  /** Notes per beat you play; 0 = work it out beat by beat. */
  notesPerBeat: 0,
  toleranceMs: 10,
  /** Play the click along with a take when listening back. */
  playClick: true,
};

// The mic and its latency belong to this phone, so they aren't synced (the website keeps them per
// computer too). `inputDeviceId` is the website's; the phone always uses its own input.
const MIC_KEY = 'jam-practice-time-test-mic';
const DEFAULT_MIC = {
  inputDeviceId: '',
  sensitivity: 0.6,
  /** The calibrated (or fine-tuned) round trip. Until then a guess is used instead. */
  latencyMs: 0,
  calibrated: false,
  rejectBleed: true,
};

const HISTORY_KEY = 'jam-practice-time-test-history';
const DEFAULT_HISTORY = { takes: [] as TakeSummary[] };

type Result = {
  id: number;
  take: Take;
  bpm: number;
  beatsPerBar: number;
  /** The analysis made when the take stopped, kept so it isn't worked out twice. */
  first: { params: AnalysisParams; analysis: Analysis };
};

function sameParams(a: AnalysisParams, b: AnalysisParams) {
  return (
    a.latencyMs === b.latencyMs &&
    a.notesPerBeat === b.notesPerBeat &&
    a.toleranceMs === b.toleranceMs &&
    a.sensitivity === b.sensitivity &&
    a.rejectBleed === b.rejectBleed
  );
}

// Finding the strokes in a long take is the slow part on a phone, and it only depends on the take
// and the sensitivity, so changing the tolerance or the latency re-grades without doing it again.
const strokeCache = new WeakMap<Take, Map<number, [number, number][]>>();
const overviewCache = new WeakMap<Take, Float32Array>();
const detailCache = new WeakMap<Take, Detail>();

function analyzeTake(take: Take, p: AnalysisParams): Analysis {
  const ready = preparedFor(take);
  let bySens = strokeCache.get(take);
  if (!bySens) {
    bySens = new Map();
    // The strokes the session found while recording, if they're at this sensitivity.
    if (ready?.strokes) bySens.set(ready.strokes.sensitivity, ready.strokes.onsets);
    strokeCache.set(take, bySens);
  }
  let onsets = bySens.get(p.sensitivity);
  if (!onsets) {
    onsets = detectStrokes(take, p.sensitivity);
    bySens.set(p.sensitivity, onsets);
  }
  let overview = overviewCache.get(take) ?? ready?.overview;
  if (!overview) {
    overview = takeOverview(take);
    overviewCache.set(take, overview);
  }
  return analyze(take, p, { onsets, overview });
}

function detailFor(take: Take): Detail {
  let d = detailCache.get(take) ?? preparedFor(take)?.detail;
  if (!d) {
    d = takeDetail(take);
    detailCache.set(take, d);
  }
  return d;
}

/**
 * The Time Test, the website's tool for the phone: play along to the click on a practice pad, the
 * mic finds every stroke, and it shows how far off each one was. The tempo and beats, the big
 * Record button, the live readout while you play, then the setting chips (Time, Subdivision,
 * Sound, Count-in, You're playing, On time within, Microphone); a take's results open under them.
 * History is a chip above the tempo once there's a take.
 *
 * Same settings keys and defaults as the website (the mic's sensitivity and latency stay on this
 * phone). The engine is `lib/timeTestSession.ts`; the detector and the grading are the website's
 * own, shared through `@jam-practice/core/timeTest*`.
 */
function TimeTestScreen() {
  const { colors } = useAppTheme();
  const [settings, update, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [micSettings, updateMic] = useDeviceSettings(MIC_KEY, DEFAULT_MIC);
  const [history, updateHistory] = useSyncedSettings(HISTORY_KEY, DEFAULT_HISTORY);
  const engine = useSyncExternalStore(subscribeTimeTest, getTimeTestSnapshot);
  const { phase, tick, liveHits, playing } = engine;
  useToolActivity('/time-test', phase !== 'idle');

  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, tempoNoteValue, countInBars } = settings;
  const accents = useMemo(() => defaultAccents(beatsPerBar, settings.accents), [beatsPerBar, settings.accents]);
  const subAccents = useMemo(() => defaultSubAccents(beatsPerBar, subdivision, settings.subAccents), [beatsPerBar, subdivision, settings.subAccents]);

  const calibrated = micSettings.calibrated;
  const latencyMs = calibrated ? micSettings.latencyMs : Math.round((engine.latencyGuessMs ?? 50) * 10) / 10;

  const [result, setResult] = useState<Result | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micOpen, setMicOpen] = useState(false);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibrateError, setCalibrateError] = useState<string | null>(null);
  const [recStart, setRecStart] = useState(0);
  const [now, setNow] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const resultsY = useRef(0);
  const scrollToResults = useRef(false);

  const recording = phase === 'recording';
  const calibrating = phase === 'calibrating';

  const clickSettings: ClickSettings = useMemo(
    () => ({
      bpm: tempoNoteValue ? convertTempo(bpm, tempoNoteValue, beatUnit) : bpm,
      beatsPerBar,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
    }),
    [bpm, tempoNoteValue, beatUnit, beatsPerBar, accents, subdivision, subAccents, volume, soundId],
  );
  // The click reads the latest settings as it schedules (tempo is locked while recording, but the
  // sound and volume can change).
  const clickRef = useRef(clickSettings);
  useEffect(() => {
    clickRef.current = clickSettings;
  }, [clickSettings]);

  const params: AnalysisParams = useMemo(
    () => ({
      latencyMs,
      notesPerBeat: settings.notesPerBeat,
      toleranceMs: settings.toleranceMs,
      sensitivity: micSettings.sensitivity,
      rejectBleed: micSettings.rejectBleed,
    }),
    [latencyMs, settings.notesPerBeat, settings.toleranceMs, micSettings.sensitivity, micSettings.rejectBleed],
  );

  useEffect(() => {
    setLiveParams({ sensitivity: params.sensitivity, latencyMs: params.latencyMs, notesPerBeat: params.notesPerBeat });
  }, [params]);

  // Grading settings re-grade the take, a moment after they stop changing (sliders).
  const [gradeParams, setGradeParams] = useState(params);
  useEffect(() => {
    const id = setTimeout(() => setGradeParams(params), 250);
    return () => clearTimeout(id);
  }, [params]);
  const analysis = useMemo(() => {
    if (!result) return null;
    return sameParams(result.first.params, gradeParams) ? result.first.analysis : analyzeTake(result.take, gradeParams);
  }, [result, gradeParams]);

  // Leaving the screen stops the click and closes the mic.
  useEffect(() => stopAll, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [recording]);

  const recMeta = useRef({ bpm, beatsPerBar });
  const record = () => {
    setError(null);
    const meta = { bpm, beatsPerBar };
    void startRecording({ getSettings: () => clickRef.current, countInBars })
      .then(() => {
        const t = Date.now();
        setRecStart(t);
        setNow(t);
        recMeta.current = meta;
      })
      .catch((e) => setError(micErrorMessage(e)));
  };

  const stopAndAnalyze = () => {
    const p = params;
    void stopRecording()
      .then((take) => {
        if (!take) return;
        setAnalyzing(true);
        // A moment for the spinner to show: finding every stroke in a long take takes a while here.
        setTimeout(() => {
          try {
            const a = analyzeTake(take, p);
            detailFor(take);
            const meta = recMeta.current;
            setGradeParams(p);
            setResult((prev) => ({ id: (prev?.id ?? 0) + 1, take, ...meta, first: { params: p, analysis: a } }));
            if (a.stats.hits > 0) {
              const summary: TakeSummary = {
                at: Date.now(),
                bpm: meta.bpm,
                meter: `${meta.beatsPerBar}/${beatUnit}`,
                notes: a.notesPerBeat,
                seconds: Math.round(a.duration * 10) / 10,
                score: Math.round(a.stats.score * 10) / 10,
                withinPct: Math.round(a.stats.withinPct * 10) / 10,
                meanMs: Math.round(a.stats.meanMs * 10) / 10,
                stdMs: Math.round(a.stats.stdMs * 10) / 10,
                hits: a.stats.hits,
                toleranceMs: a.toleranceMs,
              };
              updateHistory({ takes: [...history.takes, summary].slice(-HISTORY_LIMIT) });
            }
            scrollToResults.current = true;
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't work out the take.");
          } finally {
            setAnalyzing(false);
          }
        }, 30);
      })
      .catch((e) => setError(micErrorMessage(e)));
  };

  // The longest take the phone keeps: stop and show it.
  const takeFull = engine.takeFull;
  useEffect(() => {
    if (takeFull && recording) stopAndAnalyze();
    // Only when it fills up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeFull]);

  const calibrate = () => {
    setError(null);
    setCalibrateError(null);
    setCalibration(null);
    void runCalibration(soundId, volume)
      .then((c) => {
        setCalibration(c);
        if (c.ok) updateMic({ latencyMs: Math.round(c.latencyMs * 10) / 10, calibrated: true });
      })
      .catch((e) => setCalibrateError(micErrorMessage(e)));
  };

  const play = (from: number) => {
    if (!result) return;
    setError(null);
    void playTake(result.take, { from, latencyMs: gradeParams.latencyMs, clickVolume: settings.playClick ? volume : 0, soundId }).catch((e) =>
      setError(e instanceof Error ? e.message : "Couldn't play the take."),
    );
  };

  const tap = useTapTempo((v) => update({ bpm: clampBpm(v) }));

  const countInLeft =
    recording && (tick === null || tick.bar < countInBars) ? (tick ? countInBars * beatsPerBar - (tick.bar * beatsPerBar + tick.beat) : countInBars * beatsPerBar) : null;
  const elapsed = recording ? Math.max(0, (now - recStart) / 1000) : 0;
  const notesValue = settings.notesPerBeat === 0 ? 'Work it out' : (SUB_LABELS[settings.notesPerBeat] ?? `${settings.notesPerBeat} per beat`);

  const changeBeats = (n: number) => update({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  const cycleBeat = (i: number) => update({ accents: accents.map((l, j) => (j === i ? NEXT_LEVEL[l] : l)) });
  const cycleSub = (beat: number, sub: number) => {
    const dots = Math.max(0, Math.round(subdivision) - 1);
    const flat = beat * dots + sub;
    update({ subAccents: subAccents.map((l, j) => (j === flat ? NEXT_LEVEL[l] : l)) });
  };

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Time Test' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 24 }}
        >
          {history.takes.length > 0 ? (
            <View className="items-center">
              <SettingChip Icon={HistoryIcon} label="History" value={`${history.takes.length} take${history.takes.length === 1 ? '' : 's'}`}>
                <HistoryList takes={history.takes} onClear={() => updateHistory({ takes: [] })} />
              </SettingChip>
            </View>
          ) : null}

          <View className="items-center gap-4">
            <TempoHero
              bpm={bpm}
              setBpm={(v) => update({ bpm: clampBpm(v) })}
              beatsPerBar={beatsPerBar}
              beatUnit={beatUnit}
              onTap={tap}
              locked={recording || calibrating}
              tempoNote={<TempoNoteValuePicker value={tempoNoteValue} onChange={(v) => update({ tempoNoteValue: v })} />}
            />
            <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={beatUnit} />
            <BeatIndicator
              accents={accents}
              currentBeat={recording && tick ? tick.beat : null}
              onCycle={cycleBeat}
              subdivision={subdivision}
              subAccents={subAccents}
              currentSub={tick?.sub ?? 0}
              onCycleSub={cycleSub}
              cycleHint
            />
          </View>

          {recording ? <LiveFeedback hits={liveHits} toleranceMs={settings.toleranceMs} countInLeft={countInLeft} /> : null}

          <View className="items-center gap-3">
            {recording ? (
              <BigButton label="Stop and analyze" onPress={stopAndAnalyze} icon={<StopIcon color={colors['accent-foreground']} size={18} />} />
            ) : calibrating ? (
              <BigButton label="Calibrating… stay quiet" secondary disabled onPress={() => {}} />
            ) : (
              <BigButton label="Record" onPress={record} disabled={analyzing} icon={<RecordIcon color={colors['accent-foreground']} size={18} />} />
            )}
            {recording && countInLeft === null ? (
              <View className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.danger }} />
                <Text className="font-ui text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                  Recording {mmss(elapsed)}
                  {elapsed > MAX_TAKE_SEC - 60 ? ` · stops at ${mmss(MAX_TAKE_SEC)}` : ''}
                </Text>
              </View>
            ) : null}
            {analyzing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color={colors.muted} />
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  Working out your timing…
                </Text>
              </View>
            ) : null}
            {!calibrated && phase === 'idle' && !analyzing ? (
              <View className="items-center gap-2">
                <Text className="font-ui px-4 text-center text-xs" style={{ color: colors.muted }}>
                  Calibrate first so your phone&apos;s delay doesn&apos;t skew the results.
                </Text>
                <CalibrateButton onPress={() => setMicOpen(true)} />
              </View>
            ) : null}
            {error ? (
              <Text className="font-ui px-4 text-center text-sm" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
          </View>

          <SettingsBar>
            <SettingChip Icon={MeterIcon} label="Time" title="Time signature" value={`${beatsPerBar}/${beatUnit}`}>
              <TimeSignatureControl
                beatsPerBar={beatsPerBar}
                beatUnit={beatUnit}
                onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
                onSetBeatUnit={(u) => update({ beatUnit: u })}
              />
              <MeterQuickPicks
                meters={COMMON_METERS}
                beatsPerBar={beatsPerBar}
                beatUnit={beatUnit}
                onPick={(b, u) => update({ beatUnit: u, beatsPerBar: b, accents: defaultAccents(b, accents) })}
              />
            </SettingChip>
            <SettingChip Icon={SubdivisionChipIcon} label="Subdivision" value={SUB_LABELS[subdivision] ?? String(subdivision)}>
              <SubdivisionPicker value={subdivision} onChange={(n) => update({ subdivision: n })} />
            </SettingChip>
            <SettingChip Icon={SpeakerIcon} label="Sound" value={soundSummary(soundId, volume)}>
              <SoundPicker soundId={soundId} setSoundId={(id) => update({ soundId: id })} volume={volume} setVolume={(v) => update({ volume: v })} />
            </SettingChip>
            <SettingChip Icon={StopwatchIcon} label="Count-in" value={countInBars === 0 ? 'Off' : `${countInBars} bar${countInBars === 1 ? '' : 's'}`}>
              <CountField
                title="Bars of click before grading starts"
                value={countInBars}
                onChange={(n) => update({ countInBars: n })}
                min={0}
                max={8}
                unit={['bar', 'bars']}
              />
            </SettingChip>
            <SettingChip Icon={DrumIcon} label="You're playing" title="What you're playing" value={notesValue}>
              <Field
                label="Grid"
                hint={`Each stroke is graded against the nearest note of this grid. "Work it out" decides beat by beat, so you can move between quarters, 8ths, triplets and 16ths as you play. Choose one to hold every beat to it, so notes you leave out count as missed.`}
              >
                <Segmented
                  label="Grid"
                  value={settings.notesPerBeat === 0 ? 'auto' : 'choose'}
                  onChange={(v) => update({ notesPerBeat: v === 'auto' ? 0 : subdivision === 1 ? 4 : subdivision })}
                  options={[
                    { value: 'auto', label: 'Work it out' },
                    { value: 'choose', label: 'Choose' },
                  ]}
                />
              </Field>
              {settings.notesPerBeat !== 0 ? <SubdivisionPicker value={settings.notesPerBeat} onChange={(n) => update({ notesPerBeat: n })} /> : null}
            </SettingChip>
            <SettingChip Icon={TargetIcon} label="On time within" value={`±${settings.toleranceMs} ms`}>
              <Field label="Strokes this close to the click count as on time" hint="±10 ms is tight; very steady players are often within ±5 ms.">
                <ChoiceCards
                  label="On time within"
                  options={TOLERANCES.map((t) => ({ value: t, label: `±${t} ms` }))}
                  value={settings.toleranceMs}
                  onChange={(t) => update({ toleranceMs: t })}
                  cardWidth="30%"
                />
              </Field>
            </SettingChip>
            <SettingChip
              Icon={MicrophoneIcon}
              label="Microphone"
              title="Microphone and latency"
              open={micOpen}
              onOpenChange={setMicOpen}
              value={calibrated ? `${latencyMs.toFixed(1)} ms` : 'Not calibrated'}
            >
              <MicSheet
                sensitivity={micSettings.sensitivity}
                setSensitivity={(v) => updateMic({ sensitivity: v })}
                latencyMs={latencyMs}
                setLatencyMs={(v) => updateMic({ latencyMs: v, calibrated: true })}
                calibrated={calibrated}
                rejectBleed={micSettings.rejectBleed}
                setRejectBleed={(v) => updateMic({ rejectBleed: v })}
                calibrating={calibrating}
                onCalibrate={calibrate}
                lastCalibration={calibration}
                calibrateError={calibrateError}
                micError={engine.micError}
                busy={recording}
              />
            </SettingChip>
          </SettingsBar>

          {result && analysis ? (
            <View
              onLayout={(e) => {
                resultsY.current = e.nativeEvent.layout.y;
                if (scrollToResults.current) {
                  scrollToResults.current = false;
                  scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 8), animated: true });
                }
              }}
            >
              <Analytics
                key={result.id}
                take={result.take}
                analysis={analysis}
                detail={detailFor(result.take)}
                bpm={result.bpm}
                beatsPerBar={result.beatsPerBar}
                playing={playing}
                onPlay={play}
                onStopPlayback={stopPlayback}
                playClick={settings.playClick}
                setPlayClick={(v) => update({ playClick: v })}
                onTryAgain={record}
                onOpenMic={() => setMicOpen(true)}
                onReveal={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, resultsY.current + y - 8), animated: true })}
              />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** "Calibrate…" under Record until the latency has been measured: opens the Microphone sheet. */
function CalibrateButton({ onPress }: { onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-10 flex-row items-center gap-2 overflow-hidden rounded-full px-4"
      style={{ backgroundColor: derived.fill }}
    >
      <MicrophoneIcon color={colors.muted} size={16} />
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        Calibrate…
      </Text>
    </Pressable>
  );
}

export default withScreenLoader(TimeTestScreen);

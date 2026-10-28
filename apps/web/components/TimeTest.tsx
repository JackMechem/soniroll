"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import { HintsButton } from "@/components/CollapsiblePanel";
import Hint from "@/components/Hint";
import KeyHint from "@/components/KeyHint";
import { TempoHero, TempoNoteConversionHint, TempoNoteValuePicker } from "@/components/MeterFields";
import {
  OptionGroup,
  SUB_LABELS,
  Segmented,
  SoundPicker,
  StepperPill,
  SubdivisionPicker,
  TimeSignatureControl,
  soundSummary,
} from "@/components/metronome/MetronomeOptions";
import { RewardCard } from "@/components/reward/Reward";
import { SettingChip, SettingsBar } from "@/components/SettingsBar";
import Analytics from "@/components/timetest/Analytics";
import History, { HISTORY_LIMIT, type TakeSummary } from "@/components/timetest/History";
import LiveFeedback from "@/components/timetest/LiveFeedback";
import MicPanel from "@/components/timetest/MicPanel";
import ToolLayout from "@/components/ToolLayout";
import { DrumIcon, ListIcon, MeterIcon, MicIcon, NoteIcon, RecordIcon, SpeakerIcon, StopIcon, StopwatchIcon, TimeTestIcon } from "@/components/tools";
import { DEFAULT_CLICK_SOUND_ID, type BeatLevel, type ClickSettings } from "@/lib/clickEngine";
import { HintsContext } from "@/lib/hints";
import { MAX_BEATS } from "@/lib/meters";
import { NEXT_LEVEL, clampBpm, convertTempo, defaultAccents, defaultSubAccents, nearestNoteValue, useTapTempo } from "@/lib/meterControls";
import { analyze, type Analysis, type AnalysisParams, type Calibration, type Take } from "@/lib/timeTest/analysis";
import {
  getTimeTestServerSnapshot,
  getTimeTestSnapshot,
  playTake,
  runCalibration,
  setLiveParams,
  startMetronome,
  startRecording,
  stopAll,
  stopMetronome,
  stopPlayback,
  stopRecording,
  subscribeTimeTest,
} from "@/lib/timeTest/session";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useToolActivity } from "@/lib/toolTime";

const COMMON_METERS: [number, number][] = [
  [4, 4],
  [3, 4],
  [2, 4],
  [6, 8],
  [5, 4],
  [7, 8],
  [9, 8],
  [12, 8],
];

const TOLERANCES = [5, 10, 15, 20, 30];

const SETTINGS_KEY = "jam-practice-time-test";
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

// The mic and its latency belong to this computer's setup, so they aren't synced.
const MIC_KEY = "jam-practice-time-test-mic";
const DEFAULT_MIC = {
  inputDeviceId: "",
  sensitivity: 0.6,
  /** The calibrated (or fine-tuned) round trip. Until then a guess is used instead. */
  latencyMs: 0,
  calibrated: false,
  rejectBleed: true,
};

const HISTORY_KEY = "jam-practice-time-test-history";
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

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default function TimeTest() {
  const [settings, update] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [micSettings, updateMic] = usePersistedSettings(MIC_KEY, DEFAULT_MIC);
  const [history, updateHistory] = useSyncedSettings(HISTORY_KEY, DEFAULT_HISTORY);
  const engine = useSyncExternalStore(subscribeTimeTest, getTimeTestSnapshot, getTimeTestServerSnapshot);
  const { phase, tick, liveHits, playing } = engine;

  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, tempoNoteValue, countInBars } = settings;
  const accents = useMemo(() => defaultAccents(beatsPerBar, settings.accents), [beatsPerBar, settings.accents]);
  const subAccents = useMemo(() => defaultSubAccents(beatsPerBar, subdivision, settings.subAccents), [beatsPerBar, subdivision, settings.subAccents]);

  const calibrated = micSettings.calibrated;
  const latencyMs = calibrated ? micSettings.latencyMs : Math.round((engine.latencyGuessMs ?? 0) * 10) / 10;

  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [recStart, setRecStart] = useState(0);
  const [now, setNow] = useState(0);
  const [micHints, setMicHints] = useState(false);
  const [playingHints, setPlayingHints] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const recording = phase === "recording";
  const calibrating = phase === "calibrating";
  const sounding = phase === "metronome" || recording;
  useToolActivity("/time-test", phase !== "idle");

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
  // The click reads the latest settings as it schedules (tempo and meter are locked while
  // recording, but the sound and volume can change).
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
    const id = setTimeout(() => setGradeParams(params), 150);
    return () => clearTimeout(id);
  }, [params]);
  const analysis = useMemo(() => {
    if (!result) return null;
    return sameParams(result.first.params, gradeParams) ? result.first.analysis : analyze(result.take, gradeParams);
  }, [result, gradeParams]);

  // Leaving the page stops the click and closes the mic.
  useEffect(() => stopAll, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => {
    setError(null);
    startMetronome(() => clickRef.current);
  };

  const recMeta = useRef({ bpm, beatsPerBar });
  const record = () => {
    setError(null);
    const meta = { bpm, beatsPerBar };
    void startRecording({ deviceId: micSettings.inputDeviceId, getSettings: () => clickRef.current, countInBars })
      .then(() => {
        const t = performance.now();
        setRecStart(t);
        setNow(t);
        recMeta.current = meta;
      })
      .catch((e) => setError(errorText(e)));
  };

  const stopAndAnalyze = () => {
    const p = params;
    void stopRecording()
      .then((take) => {
        if (!take) return;
        const a = analyze(take, p);
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
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      })
      .catch((e) => setError(errorText(e)));
  };

  const calibrate = () => {
    setError(null);
    setCalibration(null);
    void runCalibration(micSettings.inputDeviceId, soundId, volume)
      .then((c) => {
        setCalibration(c);
        if (c.ok) updateMic({ latencyMs: Math.round(c.latencyMs * 10) / 10, calibrated: true });
      })
      .catch((e) => setError(errorText(e)));
  };

  const play = (from: number) => {
    if (!result) return;
    setError(null);
    void playTake(result.take, { from, latencyMs: gradeParams.latencyMs, clickVolume: settings.playClick ? volume : 0, soundId }).catch((e) =>
      setError(errorText(e)),
    );
  };

  // Space starts or stops the click (or stops a take); R records, then stops and analyzes.
  useSpaceToggle(() => {
    if (calibrating) return;
    if (recording) stopAndAnalyze();
    else if (phase === "metronome") stopMetronome();
    else start();
  });
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "r" && e.key !== "R") return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || calibrating) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.closest("[role='dialog']"))) return;
      e.preventDefault();
      if (recording) stopAndAnalyze();
      else record();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tap = useTapTempo((v) => update({ bpm: clampBpm(v) }));

  const countInLeft =
    recording && (tick === null || tick.bar < countInBars) ? (tick ? countInBars * beatsPerBar - (tick.bar * beatsPerBar + tick.beat) : countInBars * beatsPerBar) : null;
  const elapsed = recording ? Math.max(0, (now - recStart) / 1000) : 0;
  const notesValue = settings.notesPerBeat === 0 ? "Auto" : (SUB_LABELS[settings.notesPerBeat] ?? `${settings.notesPerBeat} per beat`);

  const changeBeats = (n: number) => update({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  const cycleBeat = (i: number) => update({ accents: accents.map((l, j) => (j === i ? NEXT_LEVEL[l] : l)) });
  const cycleSub = (beat: number, sub: number) => {
    const dots = Math.max(0, Math.round(subdivision) - 1);
    const flat = beat * dots + sub;
    update({ subAccents: subAccents.map((l, j) => (j === flat ? NEXT_LEVEL[l] : l)) });
  };

  return (
    <ToolLayout
      title="Time Test"
      layout="stacked"
      topAligned
      options={null}
      titleExtra={
        recording && countInLeft === null ? (
          <span className="hidden items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-semibold tabular-nums sm:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-danger motion-safe:animate-pulse" aria-hidden />
            Recording {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
          </span>
        ) : null
      }
      sidePanel={
        <SettingChip icon={ListIcon} label="History" value={history.takes.length ? `${history.takes.length} take${history.takes.length === 1 ? "" : "s"}` : "None yet"}>
          <History takes={history.takes} onClear={() => updateHistory({ takes: [] })} />
        </SettingChip>
      }
    >
      <div className="flex w-full max-w-[30rem] flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center gap-4">
          <TempoHero
            bpm={bpm}
            setBpm={(v) => update({ bpm: clampBpm(v) })}
            beatsPerBar={beatsPerBar}
            beatUnit={beatUnit}
            onTap={tap}
            locked={recording || calibrating}
            aboveNumber={<TempoNoteValuePicker value={tempoNoteValue} onChange={(v) => update({ tempoNoteValue: v })} />}
          />
          <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={beatUnit} />
          <BeatIndicator
            accents={accents}
            currentBeat={sounding && tick ? tick.beat : null}
            onCycle={cycleBeat}
            subdivision={subdivision}
            subAccents={subAccents}
            currentSub={tick?.sub ?? 0}
            onCycleSub={cycleSub}
          />
        </div>

        {recording && <LiveFeedback hits={liveHits} toleranceMs={settings.toleranceMs} countInLeft={countInLeft} />}

        <div className="flex flex-col items-center gap-3">
          {/* KeyHint pulls itself up under the buttons, so they keep the Metronome's spacing. */}
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {recording ? (
                <button
                  type="button"
                  onClick={stopAndAnalyze}
                  className="flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  <StopIcon className="h-4 w-4" />
                  Stop and analyze
                </button>
              ) : calibrating ? (
                <button type="button" disabled className="rounded-full bg-surface px-8 py-3 text-base font-semibold opacity-70">
                  Calibrating… stay quiet
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={phase === "metronome" ? stopMetronome : start}
                    className={`rounded-full px-8 py-3 text-base font-semibold transition-colors ${
                      phase === "metronome" ? "bg-surface hover:bg-surface-hover" : "bg-accent text-accent-foreground hover:bg-accent-hover"
                    }`}
                  >
                    {phase === "metronome" ? "Stop" : "Start"}
                  </button>
                  <button
                    type="button"
                    onClick={record}
                    className="flex items-center gap-2 rounded-full bg-surface px-6 py-3 text-base font-semibold transition-colors hover:bg-surface-hover"
                  >
                    <RecordIcon className="h-4 w-4 text-danger" />
                    Record
                  </button>
                </>
              )}
            </div>
            <KeyHint>
              <KeyHint.Key>Space</KeyHint.Key> start or stop · <KeyHint.Key>R</KeyHint.Key> record, then stop and analyze
            </KeyHint>
          </div>
          {!calibrated && phase === "idle" && (
            <p className="max-w-sm text-center text-xs text-muted">Calibrate first (Mic → Calibrate) so your setup&apos;s delay doesn&apos;t skew the results.</p>
          )}
          {error && <p className="max-w-sm text-center text-sm text-danger">{error}</p>}
        </div>

        <div className="flex w-full flex-col items-center gap-2">
          <SettingsBar>
            <SettingChip icon={MeterIcon} label="Time" title="Time signature" value={`${beatsPerBar}/${beatUnit}`}>
              <TimeSignatureControl
                beatsPerBar={beatsPerBar}
                beatUnit={beatUnit}
                onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
                onSetBeatUnit={(u) => update({ beatUnit: u })}
              />
              <OptionGroup title="Quick picks">
                <div role="radiogroup" aria-label="Common time signatures" className="grid grid-cols-4 gap-2">
                  {COMMON_METERS.map(([b, u]) => (
                    <RewardCard
                      key={`${b}/${u}`}
                      id={`meter:${b}/${u}`}
                      on={beatsPerBar === b && beatUnit === u}
                      label={`${b}/${u}`}
                      onPick={() => update({ beatUnit: u, beatsPerBar: b, accents: defaultAccents(b, accents) })}
                      className="h-14"
                    >
                      <span className="flex flex-col items-center text-base font-extrabold leading-[0.95] tabular-nums">
                        <span>{b}</span>
                        <span className="my-0.5 h-0.5 w-4 rounded-full bg-current opacity-60" />
                        <span>{u}</span>
                      </span>
                    </RewardCard>
                  ))}
                </div>
              </OptionGroup>
            </SettingChip>
            <SettingChip icon={NoteIcon} label="Subdivision" value={SUB_LABELS[subdivision] ?? subdivision}>
              <SubdivisionPicker value={subdivision} onChange={(n) => update({ subdivision: n })} showTitle={false} />
            </SettingChip>
            <SettingChip icon={SpeakerIcon} label="Sound" value={soundSummary(soundId, volume)}>
              <SoundPicker soundId={soundId} setSoundId={(id) => update({ soundId: id })} volume={volume} setVolume={(v) => update({ volume: v })} />
            </SettingChip>
            <SettingChip icon={StopwatchIcon} label="Count-in" value={countInBars === 0 ? "Off" : `${countInBars} bar${countInBars === 1 ? "" : "s"}`}>
              <OptionGroup title="Bars of click before grading starts">
                <StepperPill value={countInBars} onChange={(n) => update({ countInBars: n })} min={0} max={8} unit={["bar", "bars"]} label="Count-in bars" />
              </OptionGroup>
            </SettingChip>
            <SettingChip
              icon={DrumIcon}
              label="You're playing"
              title="What you're playing"
              value={notesValue}
              headerExtra={<HintsButton on={playingHints} onToggle={() => setPlayingHints((on) => !on)} />}
            >
              <HintsContext.Provider value={playingHints}>
                <Segmented
                  label="Grid"
                  value={settings.notesPerBeat === 0 ? "auto" : "choose"}
                  onChange={(v) => update({ notesPerBeat: v === "auto" ? 0 : subdivision === 1 ? 4 : subdivision })}
                  options={[
                    { value: "auto", label: "Work it out" },
                    { value: "choose", label: "Choose" },
                  ]}
                />
                <Hint>
                  Each stroke is graded against the nearest note of this grid. &quot;Work it out&quot; decides beat by beat, so you can move between quarters, 8ths,
                  triplets and 16ths as you play. Choose one to hold every beat to it, so notes you leave out count as missed.
                </Hint>
                {settings.notesPerBeat !== 0 && <SubdivisionPicker value={settings.notesPerBeat} onChange={(n) => update({ notesPerBeat: n })} />}
              </HintsContext.Provider>
            </SettingChip>
            <SettingChip icon={TimeTestIcon} label="On time within" title="On time within" value={`±${settings.toleranceMs} ms`}>
              <div role="radiogroup" aria-label="On time within" className="grid grid-cols-5 gap-2">
                {TOLERANCES.map((t) => (
                  <RewardCard key={t} id={`tolerance:${t}`} on={settings.toleranceMs === t} label={`±${t} ms`} onPick={() => update({ toleranceMs: t })} className="h-14">
                    <span className="flex flex-col items-center leading-tight">
                      <span className="text-base font-extrabold tabular-nums">±{t}</span>
                      <span className="text-[11px] font-semibold opacity-70">ms</span>
                    </span>
                  </RewardCard>
                ))}
              </div>
              <p className="text-xs text-muted">±10 ms is tight; very steady players are often within ±5 ms.</p>
            </SettingChip>
            <SettingChip
              icon={MicIcon}
              label="Mic"
              title="Mic and latency"
              wide
              value={calibrated ? `${latencyMs.toFixed(1)} ms` : "Calibrate"}
              headerExtra={<HintsButton on={micHints} onToggle={() => setMicHints((on) => !on)} />}
            >
              <HintsContext.Provider value={micHints}>
                <MicPanel
                  inputDeviceId={micSettings.inputDeviceId}
                  setInputDeviceId={(id) => updateMic({ inputDeviceId: id })}
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
                  micError={engine.micError}
                  busy={sounding}
                />
              </HintsContext.Provider>
            </SettingChip>
          </SettingsBar>
        </div>
      </div>

      {result && analysis && (
        <div ref={resultsRef} className="w-full max-w-6xl scroll-mt-4 text-left">
          <Analytics
            key={result.id}
            take={result.take}
            analysis={analysis}
            bpm={result.bpm}
            beatsPerBar={result.beatsPerBar}
            playing={playing}
            onPlay={play}
            onStopPlayback={stopPlayback}
            playClick={settings.playClick}
            setPlayClick={(v) => update({ playClick: v })}
          />
        </div>
      )}
    </ToolLayout>
  );
}

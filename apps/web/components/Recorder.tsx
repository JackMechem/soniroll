"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import LoadingSpinner from "@/components/LoadingSpinner";
import { SoundOptions, SteppedField, TempoHero, TempoNoteConversionHint, TempoNoteValuePicker } from "@/components/MeterFields";
import { RecordingCard, SaveTakeDialog } from "@/components/recordings/RecordingParts";
import Select from "@/components/Select";
import StructureEditor from "@/components/StructureEditor";
import SwitchRow from "@/components/SwitchRow";
import Hint from "@/components/Hint";
import { soundSummary } from "@/components/metronome/MetronomeOptions";
import { Segmented, SubdivisionPicker, TimeSignatureControl } from "@/components/metronome/MetronomeOptions";
import { SettingChip } from "@/components/SettingsBar";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import { MetronomeIcon, MicIcon, NoteIcon, RecordIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { type InputDevice, listAudioInputs } from "@/lib/audioInput";
import { type BeatLevel, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { NEXT_LEVEL, clampBpm, defaultAccents, defaultSubAccents, nearestNoteValue, useTapTempo } from "@/lib/meterControls";
import { getMetronomeServerSnapshot, getMetronomeSnapshot, subscribeMetronome } from "@/lib/metronomeEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  type FinishedTake,
  type RecorderInput,
  type RecorderMetronome,
  type RecorderMono,
  clearRecorderError,
  getRecorderServerSnapshot,
  getRecorderSnapshot,
  setRecorderGain,
  setRecorderSongVolume,
  startMonitor,
  startRecording,
  stopMonitor,
  stopRecording,
  subscribeRecorder,
  updateRecorderMetronome,
} from "@/lib/recorderEngine";
import { DEFAULT_MIX, formatDuration, recordingsApi, useTuneIndex, useTuneSong } from "@/lib/recordings";
import { EMPTY_STRUCTURE, type Structure, cycleSectionAccent, cycleSectionSubAccent, sectionAt } from "@/lib/structure";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useToolActivity } from "@/lib/toolTime";
import { SIGN_IN_PATH } from "@/lib/landing";
import { useDeviceUrls } from "@/lib/deviceFiles";
import { useSpaceToggle } from "@/lib/useSpaceToggle";

// The same key as the app's Recorder. Everything from `bpm` on is the Metronome tool's own
// settings shape. `autoGainOn` replaced `autoGain` (on by default before; now off, and in the Input
// chip): the old field is left alone in stored settings.
const SETTINGS_KEY = "jam-practice-recorder-take";
const DEFAULT_SETTINGS = {
  /** The microphone ("" = the system default). */
  inputDeviceId: "",
  /** Input level: a gain before anything else, 1 = as it comes in (0 to 4). */
  inputGain: 1,
  autoGainOn: false,
  /** Record in mono (one channel, both ears), from both inputs mixed or just one side. */
  mono: false,
  monoSource: "mix" as RecorderMono,
  /** With a tune that has a song: play it along while recording, at this volume. */
  playSong: true,
  songVolume: 0.7,
  metronome: false,
  countInBars: 1,
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  useStructure: false,
  structure: EMPTY_STRUCTURE as Structure,
  tempoNoteValue: 4 as number | null,
};

// ---------------------------------------------------------------- the level trace

/** The last few seconds of input level, for the scrolling trace (kept here, outside React, and
    read with `useSyncExternalStore`). Cleared when nothing's listening. */
const TRACE_LENGTH = 64;
/** -1: nothing heard yet in that slot (drawn flat; doesn't count as quiet). Peaks alongside, for
    the red "too loud" bars. */
type Trace = { levels: number[]; peaks: number[] };
const SILENT: Trace = { levels: Array<number>(TRACE_LENGTH).fill(-1), peaks: Array<number>(TRACE_LENGTH).fill(0) };
/** A peak at or above this is distorting (hard clipping on the web, the desktop's soft clipper). */
const HOT = 0.9;
let trace = SILENT;
function subscribeTrace(onChange: () => void) {
  return subscribeRecorder(() => {
    const s = getRecorderSnapshot();
    const live = s.phase === "recording" || s.phase === "countin" || s.monitoring;
    const next = live ? { levels: [...trace.levels.slice(1), s.level], peaks: [...trace.peaks.slice(1), s.peak] } : SILENT;
    if (next !== trace) {
      trace = next;
      onChange();
    }
  });
}
const getTrace = () => trace;
const getServerTrace = () => SILENT;

/** Bars of recent input level; red where it distorted. */
function LevelTrace({ trace: { levels, peaks }, live }: { trace: Trace; live: boolean }) {
  return (
    <div className="flex h-16 w-full items-center gap-[3px]" aria-hidden>
      {levels.map((v, i) => (
        <span
          key={i}
          className={`min-w-0 flex-1 rounded-full transition-[height] duration-75 ${!live ? "bg-foreground/10" : peaks[i] >= HOT ? "bg-danger" : "bg-accent"}`}
          style={{ height: `${Math.max(6, Math.min(100, v * 100))}%` }}
        />
      ))}
    </div>
  );
}

/** The input level as a short line, for the Input chip. */
function LevelBar({ level, peak }: { level: number; peak: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
      <span className={`block h-full rounded-full ${peak >= HOT ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }} />
    </span>
  );
}

const CHANNEL_OPTIONS = [
  { value: "stereo", label: "Stereo" },
  { value: "left", label: "Left" },
  { value: "mix", label: "Both" },
  { value: "right", label: "Right" },
] as const;

/**
 * The Recorder — one take at a time, from the microphone you pick, at the level you set (check it
 * first: the trace shows the input without recording), with the metronome optionally clicking along
 * and counting you in, and a tune's song playing along. Options are chips under the display: Input
 * (microphone, input level, channels, auto gain), Metronome (a switch, and the full Metronome tool's
 * settings), Count-in and Sound with it, and the Song. Recent takes are a chip above. Stopping opens
 * the save dialog — name, notes, tune, and where it's kept. `tuneId` (from a tune's page) records
 * for that tune, with the metronome at the tune's tempo.
 */
export default function Recorder({ tuneId }: { tuneId?: string }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const byId = useTuneIndex();
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;
  const recordings = useDeviceUrls(useQuery(recordingsApi.list, isAuthenticated ? {} : "skip"));
  const song = useTuneSong(tuneId);
  const songOn = !!song?.url && settings.playSong;
  const [songStart, setSongStart] = useState(0);
  const songMax = song?.durationSec ? Math.max(0, Math.floor(song.durationSec) - 1) : 3600;

  // From a tune's page, the metronome starts at the tune's own tempo (not saved as the default).
  const tuneTempo = tune?.tempos.find((t) => t.enabled)?.value ?? tune?.tempos[0]?.value;
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const bpm = clampBpm(bpmOverride ?? tuneTempo ?? settings.bpm);
  const setBpm = (next: number) => (tuneTempo !== undefined ? setBpmOverride(clampBpm(next)) : updateSettings({ bpm: clampBpm(next) }));
  const tap = useTapTempo(setBpm);

  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const rec = useSyncExternalStore(subscribeRecorder, getRecorderSnapshot, getRecorderServerSnapshot);
  const levelTrace = useSyncExternalStore(subscribeTrace, getTrace, getServerTrace);
  const levels = levelTrace.levels;
  const busy = rec.phase !== "idle";
  const live = busy || rec.monitoring;
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/recorder", busy);
  const click = useSyncExternalStore(subscribeMetronome, getMetronomeSnapshot, getMetronomeServerSnapshot);
  const clicking = busy && settings.metronome && click.running;
  const [take, setTake] = useState<FinishedTake | null>(null);

  // The input, as the engine wants it.
  const gain = Math.min(4, Math.max(0, settings.inputGain));
  const input: RecorderInput = useMemo(
    () => ({ deviceId: settings.inputDeviceId, autoGain: settings.autoGainOn, mono: settings.mono ? settings.monoSource : null, gain }),
    [settings.inputDeviceId, settings.autoGainOn, settings.mono, settings.monoSource, gain],
  );

  // Microphones: listed now and again once the browser has said yes (names are hidden until then).
  const [inputs, setInputs] = useState<InputDevice[]>([]);
  useEffect(() => {
    let alive = true;
    void listAudioInputs().then((list) => alive && setInputs(list));
    return () => {
      alive = false;
    };
  }, [rec.monitoring, rec.phase]);
  const deviceLabel = inputs.find((d) => d.id === settings.inputDeviceId)?.label;

  // Checking the level: a new microphone, channels or auto gain reopens the input; leaving stops it.
  const inputKey = `${input.deviceId}|${input.autoGain}|${input.mono}`;
  useEffect(() => {
    if (getRecorderSnapshot().monitoring) void startMonitor(input);
    // Only when the input itself changes (the gain applies live).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);
  useEffect(() => () => stopMonitor(), []);

  // Tempo, accents, sound… changed mid-take apply live, like in the Metronome tool.
  useEffect(() => {
    updateRecorderMetronome({
      enabled: true,
      settings: { bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue },
      structure: { useStructure, structure },
      countInBars: 0,
    });
  }, [bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue, useStructure, structure]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rec.phase !== "recording") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rec.phase]);
  const elapsed = rec.phase === "recording" && rec.startedAt ? (now - rec.startedAt) / 1000 : 0;

  // How the level looks over the last second or two.
  const tooLoud = live && levelTrace.peaks.slice(-24).some((p) => p >= HOT);
  // Quiet for the last ~2 seconds of input actually heard (not just since it opened).
  const tooQuiet = live && rec.phase !== "countin" && levels.slice(-40).every((v) => v >= 0 && v < 0.05);

  // Space starts and stops a take, like every tool.
  useSpaceToggle(() => void onRecord(), isAuthenticated && !take);

  async function onRecord() {
    if (rec.phase === "idle") {
      clearRecorderError();
      const metronome: RecorderMetronome = {
        enabled: settings.metronome && (!useStructure || structure.form.length > 0),
        settings: { bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue },
        structure: { useStructure, structure },
        countInBars: settings.countInBars,
      };
      await startRecording(metronome, {
        ...input,
        song: songOn && song?.url ? { url: song.url, startSec: songStart, volume: settings.songVolume } : null,
      });
      return;
    }
    if (rec.phase === "finishing") return;
    const finished = await stopRecording();
    if (finished) setTake(finished);
  }

  function setGain(next: number) {
    const g = Math.min(4, Math.max(0, next));
    updateSettings({ inputGain: g });
    setRecorderGain(g);
  }

  // --- the Metronome tool's accent/structure editing ---
  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }
  const activeSection = useStructure && structure.form.length > 0 ? sectionAt(structure, clicking ? click.formIndex : 0) : null;
  const displayAccents = activeSection ? defaultAccents(activeSection.beatsPerBar, activeSection.accents) : accents;
  const displaySubdivision = activeSection ? activeSection.subdivision : subdivision;
  const displaySubAccents = activeSection ? defaultSubAccents(activeSection.beatsPerBar, activeSection.subdivision, activeSection.subAccents) : subAccents;
  function handleCycleBeat(index: number) {
    if (activeSection) return updateSettings({ structure: cycleSectionAccent(structure, activeSection.id, index) });
    updateSettings({ accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)) });
  }
  function handleCycleSub(beatIndex: number, subIndex: number) {
    if (activeSection) return updateSettings({ structure: cycleSectionSubAccent(structure, activeSection.id, beatIndex, subIndex) });
    const flatIndex = beatIndex * Math.max(0, Math.round(subdivision) - 1) + subIndex;
    updateSettings({ subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)) });
  }

  const status =
    rec.phase === "countin"
      ? "Count-in…"
      : rec.phase === "recording"
        ? "Recording"
        : rec.phase === "finishing"
          ? "Finishing the take…"
          : rec.monitoring
            ? "Checking the level — not recording"
            : tune
              ? `For “${tune.name}”`
              : "Ready";

  const channels = settings.mono ? settings.monoSource : "stereo";
  const meterValue = useStructure ? `${structure.sections.length ? "Changing meters" : "No sections yet"}` : `${beatsPerBar}/${beatUnit}`;

  // Recent takes: a chip with the other options, under the record button (the full list is on the
  // Recordings page). Hidden until there's a take, so a fresh page doesn't lead with "0".
  const takesPanel = recordings && recordings.length > 0 && (
    <SettingChip icon={RecordIcon} label="Recent takes" wide value={String(recordings.length)}>
      <div className="flex flex-col gap-2 text-left">
        {recordings.slice(0, 5).map((r) => (
          <RecordingCard key={r._id} recording={r} tuneName={r.tuneId ? byId.get(r.tuneId)?.tune.name : null} />
        ))}
        <Link href="/recordings" className="self-end text-sm font-medium text-accent hover:underline">
          All recordings
        </Link>
      </div>
    </SettingChip>
  );

  const options = (
    <>
      <SettingChip icon={MicIcon} label="Microphone" wide value={`${deviceLabel ?? "Default mic"} · ${Math.round(gain * 100)}%`}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">Microphone</span>
            <Select
              value={inputs.some((d) => d.id === settings.inputDeviceId) ? settings.inputDeviceId : ""}
              onChange={(v) => updateSettings({ inputDeviceId: v })}
              disabled={busy}
              options={[{ value: "", label: "Default mic" }, ...inputs.map((d) => ({ value: d.id, label: d.label || "Microphone" }))]}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1 font-medium">
                Input level
                <Hint>Turns the microphone up or down before it&apos;s recorded. Set it while checking the level: loud playing should stay out of the red.</Hint>
              </span>
              <span className="tabular-nums text-muted">{Math.round(gain * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={400}
              step={5}
              value={Math.round(gain * 100)}
              onChange={(e) => setGain(Number(e.target.value) / 100)}
              aria-label="Input level"
              style={{ "--progress": `${Math.round((gain / 4) * 100)}%` } as React.CSSProperties}
              className="slider h-6 w-full cursor-pointer"
            />
            {live ? <LevelBar level={rec.level} peak={rec.peak} /> : <p className="text-xs text-muted">Check the level to see it move.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold text-muted">
              Channels
              <Hint>
                Stereo records both sides of your interface. Left or Right records just that side, in both ears — for a single mic plugged into one input. Both mixes the two into one channel.
              </Hint>
            </span>
            <Segmented
              label="Channels"
              value={channels}
              onChange={(v) => updateSettings(v === "stereo" ? { mono: false } : { mono: true, monoSource: v as RecorderMono })}
              disabled={busy}
              options={CHANNEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
          <SwitchRow
            label="Auto gain"
            checked={settings.autoGainOn}
            onChange={(v) => updateSettings({ autoGainOn: v })}
            disabled={busy}
            hint="Lets the browser (or the desktop app) keep turning the level up and down for you. Handy for a quiet room recording; it flattens your dynamics, so leave it off when you can set the input level."
          />
        </div>
      </SettingChip>

      <SettingChip
        icon={MetronomeIcon}
        label="Metronome"
        wide
        value={settings.metronome ? `${bpm} BPM · ${meterValue}` : "Off"}
      >
        {/* Like every other chip, this one opens its settings; the on/off switch is the first of them. */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-full">
            <SwitchRow
              label="Click while recording"
              checked={settings.metronome}
              onChange={(v) => updateSettings({ metronome: v })}
              disabled={busy}
              hint="Plays a metronome click (with a count-in) while you record. It isn't recorded unless your microphone picks it up."
            />
          </div>
          <TempoHero
            bpm={bpm}
            setBpm={setBpm}
            beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
            beatUnit={activeSection?.beatUnit ?? beatUnit}
            onTap={tap}
            tempoNote={<TempoNoteValuePicker value={tempoNoteValue} onChange={(v) => updateSettings({ tempoNoteValue: v })} />}
          />
          <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={activeSection?.beatUnit ?? beatUnit} />
          <Segmented
            label="Meter"
            value={useStructure ? "structure" : "single"}
            onChange={(v) => updateSettings({ useStructure: v === "structure" })}
            disabled={busy}
            options={[
              { value: "single", label: "One meter" },
              { value: "structure", label: "Changing meters" },
            ]}
          />
          {useStructure ? (
            <div className="w-full text-left">
              <StructureEditor
                structure={structure}
                onChange={(s) => updateSettings({ structure: s })}
                running={clicking}
                activeFormIndex={clicking ? click.formIndex : null}
                playingBeat={click.currentBeat}
                playingSub={click.currentSub}
              />
            </div>
          ) : (
            <div className="flex w-full flex-col gap-4">
              <TimeSignatureControl
                beatsPerBar={beatsPerBar}
                beatUnit={beatUnit}
                onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
                onSetBeatUnit={(u) => updateSettings({ beatUnit: u })}
              />
              <SubdivisionPicker value={subdivision} onChange={(n) => updateSettings({ subdivision: n })} />
            </div>
          )}
          <p className="text-xs text-muted">The click plays through your speakers, so the microphone picks it up unless you wear headphones.</p>
        </div>
      </SettingChip>

      {settings.metronome && (
        <>
          <SettingChip icon={NoteIcon} label="Count-in" value={settings.countInBars ? `${settings.countInBars} bar${settings.countInBars === 1 ? "" : "s"}` : "Off"}>
            <SteppedField
              label="Count-in bars"
              value={settings.countInBars}
              min={0}
              max={4}
              layout="row"
              disabled={busy}
              onChange={(n) => updateSettings({ countInBars: n })}
              hint="This many bars click before the recording starts, so you come in on the downbeat."
            />
          </SettingChip>
          <SettingChip icon={SpeakerIcon} label="Click sound" value={soundSummary(soundId, volume)}>
            <SoundOptions soundId={soundId} setSoundId={(id) => updateSettings({ soundId: id })} volume={volume} setVolume={(v) => updateSettings({ volume: v })} />
          </SettingChip>
        </>
      )}

      {song?.url && (
        <SettingChip
          icon={NoteIcon}
          label="Song"
          wide
          value={settings.playSong ? `From ${formatDuration(songStart)} · ${Math.round(settings.songVolume * 100)}%` : "Off"}
          toggle={{ checked: settings.playSong, onChange: (v) => updateSettings({ playSong: v }), disabled: busy }}
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Plays “{song.name}” along with you, starting when the take does (after the count-in). Wear headphones, or the microphone records it too.
            </p>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Start the song at</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={busy} onClick={() => setSongStart((t) => Math.max(0, t - 5))} className="h-8 rounded-md bg-foreground/[0.05] px-2 font-medium transition-colors hover:bg-surface-hover disabled:opacity-50">
                  −5 s
                </button>
                <span className="w-12 text-center tabular-nums">{formatDuration(songStart)}</span>
                <button type="button" disabled={busy} onClick={() => setSongStart((t) => Math.min(songMax, t + 5))} className="h-8 rounded-md bg-foreground/[0.05] px-2 font-medium transition-colors hover:bg-surface-hover disabled:opacity-50">
                  +5 s
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 font-medium">Song volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.songVolume * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  updateSettings({ songVolume: v });
                  setRecorderSongVolume(v);
                }}
                aria-label="Song volume"
                style={{ "--progress": `${Math.round(settings.songVolume * 100)}%` } as React.CSSProperties}
                className="slider h-6 min-w-0 flex-1 cursor-pointer"
              />
              <span className="w-10 text-right text-xs tabular-nums text-muted">{Math.round(settings.songVolume * 100)}%</span>
            </label>
          </div>
        </SettingChip>
      )}
      {takesPanel}
    </>
  );

  if (isLoading) {
    return (
      <ToolLayout title="Recorder" options={null}>
        <LoadingSpinner />
      </ToolLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <ToolLayout title="Recorder" options={null}>
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-dashed border-foreground/15 p-6 text-center">
          <p className="text-sm text-muted">Sign in to record: your takes are listed on your account, linked to your tunes and your Shed Log.</p>
          <Link href={SIGN_IN_PATH} className="flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            Sign in
          </Link>
        </div>
      </ToolLayout>
    );
  }

  const recordingNow = rec.phase === "recording";
  return (
    <ToolLayout
      title="Recorder"
      options={options}
      presets={toolPresets("recorder", settings, updateSettings, ["inputDeviceId", "inputGain", "autoGainOn", "mono", "monoSource", "playSong", "songVolume", "metronome"])}
    >
      <div className="flex w-full max-w-xl flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-1">
          <p className={`text-sm font-medium ${recordingNow ? "text-danger" : "text-muted"}`}>
            {recordingNow && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-danger align-middle motion-safe:animate-pulse" />}
            {status}
          </p>
          <p className="text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl">{formatDuration(elapsed)}</p>
        </div>

        <div className="flex w-full flex-col gap-1.5">
          <LevelTrace trace={levelTrace} live={live} />
          <p className={`h-4 text-center text-xs ${tooLoud ? "font-medium text-danger" : "text-muted"}`}>
            {tooLoud ? "Too loud — turn the input level down (Microphone)" : tooQuiet ? "Very quiet — turn the input level up, or move closer" : live ? "" : "Check the level before you record"}
          </p>
        </div>

        {settings.metronome &&
          (useStructure && !activeSection ? (
            <p className="text-sm text-muted">Add sections under Metronome to arrange the form.</p>
          ) : (
            <BeatIndicator
              accents={displayAccents}
              currentBeat={clicking ? click.currentBeat : null}
              onCycle={handleCycleBeat}
              subdivision={displaySubdivision}
              subAccents={displaySubAccents}
              currentSub={clicking ? click.currentSub : 0}
              onCycleSub={handleCycleSub}
            />
          ))}

        {/* The caption is inside the record button (so it's tappable too); the Level button lines
            up with the circle. */}
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-start gap-4">
          <div className="flex h-24 items-center justify-end">
            <button
              type="button"
              onClick={() => (rec.monitoring ? stopMonitor() : void startMonitor(input))}
              disabled={busy}
              aria-pressed={rec.monitoring}
              title="Listen to the input without recording, to set the level"
              className={`inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-40 ${
                rec.monitoring ? "bg-accent/15 text-accent" : "bg-foreground/[0.05] hover:bg-surface-hover"
              }`}
            >
              <MicIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{rec.monitoring ? "Stop checking" : "Check level"}</span>
              <span className="sm:hidden">Level</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => void onRecord()}
            aria-label={busy ? "Stop recording" : "Start recording"}
            title={busy ? "Stop (Space)" : "Record (Space)"}
            className="group flex flex-col items-center gap-2 rounded-2xl"
          >
            <span className="flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-foreground/15 transition-colors group-hover:border-foreground/30">
              {busy ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-danger text-white">
                  <StopIcon className="h-6 w-6" />
                </span>
              ) : (
                <span className="h-[74px] w-[74px] rounded-full bg-danger" />
              )}
            </span>
            <span className="text-sm font-semibold">{busy ? "Stop" : "Record"}</span>
          </button>
          <div aria-hidden />
        </div>
        {/* The count-in note under the button, so nothing beside it moves it. */}
        <div className="-mt-4 flex flex-col items-center text-center">
          <span className="h-4 text-xs text-muted">
            {settings.metronome && !busy && settings.countInBars > 0 && `${settings.countInBars}-bar count-in`}
          </span>
        </div>
        {rec.error && <p className="text-sm text-danger">{rec.error}</p>}
      </div>

      {take && (
        <SaveTakeDialog
          blob={take.blob}
          durationSec={take.durationSec}
          initialTuneId={tuneId ?? null}
          initialMix={take.songOffsetSec !== undefined ? { ...DEFAULT_MIX, songVolume: settings.songVolume, offsetSec: take.songOffsetSec } : null}
          onDiscard={() => setTake(null)}
          onSaved={(id) => {
            setTake(null);
            if (tuneId) router.push(`/tunes/tune?id=${tuneId}`);
            else router.push(`/recordings/view?id=${id}`);
          }}
        />
      )}
    </ToolLayout>
  );
}

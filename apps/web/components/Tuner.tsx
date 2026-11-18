"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Hint from "@/components/Hint";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import { InstrumentIcon } from "@/components/InstrumentIcons";
import KeyHint from "@/components/KeyHint";
import PanelsToggle from "@/components/PanelsToggle";
import Select from "@/components/Select";
import TunerDial from "@/components/TunerDial";
import TakePanel from "@/components/tuner/TakePanel";
import TakesChip from "@/components/tuner/TakesChip";
import { useTakePlayback } from "@/components/tuner/useTakePlayback";
import { MicIcon, RecordIcon, SlidersIcon, StopIcon, TunerIcon } from "@/components/tools";
import { InputDevice, SENSITIVITY, listAudioInputs } from "@/lib/audioInput";
import { midiToNote, parseNote } from "@/lib/noteRange";
import { centsColor, readingAt } from "@/lib/pitchTrack";
import { formatDuration } from "@/lib/recordings";
import { startTone, ToneHandle } from "@/lib/toneGenerator";
import {
  getTunerServerSnapshot,
  getTunerSnapshot,
  setTunerToneActive,
  startTunerListening,
  stopTunerListening,
  subscribeTuner,
  updateTunerConfig,
} from "@/lib/tunerEngine";
import {
  getTunerRecorderServerSnapshot,
  getTunerRecorderSnapshot,
  startTunerRecording,
  stopTunerRecording,
  subscribeTunerRecorder,
} from "@/lib/tunerRecorder";
import { type TunerTake, extensionFor, listTakes, nameOfFile, nextTakeName, saveTake, useTunerTakes } from "@/lib/tunerTakes";
import { TUNER_INSTRUMENTS, getInstrument, getTuning } from "@/lib/tunings";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";
import { startButtonClass } from "@/components/learning/quizUi";

const PANEL_IDS = ["tuner-instrument", "tuner-input", "tuner-tone"];
const SETTINGS_KEY = "jam-practice-tuner";
const DEFAULT_SETTINGS = {
  instrumentId: "guitar",
  tuningId: "standard",
  refA: 440,
  sensitivity: "normal",
  waveform: "sine",
  inputDeviceId: "",
  sustain: false,
  octave: 3,
  /** Seconds the take's pitch graph shows at once. */
  takeZoom: 6,
};

const MIN_REF = 415;
const MAX_REF = 466;
const MIN_OCTAVE = 0;
const MAX_OCTAVE = 7;
const TONE_SECONDS = 2.5;
/** The octave −/+ in the dial: round like the tempo ± buttons, and 40px on touch screens. */
const OCTAVE_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full bg-foreground/[0.05] text-lg leading-none text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:w-10";

const WAVEFORMS: { value: OscillatorType; label: string }[] = [
  { value: "sine", label: "Sine" },
  { value: "triangle", label: "Triangle" },
  { value: "sawtooth", label: "Sawtooth" },
  { value: "square", label: "Square" },
];

type Playing = { midi: number };

function freqOfMidi(midi: number, refA: number) {
  return refA * 2 ** ((midi - 69) / 12);
}

function sliderStyle(value: number, min: number, max: number) {
  return { "--progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties;
}

/** `openTakeId`: a take to open straight away (a recording sent here with "Open in Tuner"). */
export default function Tuner({ openTakeId }: { openTakeId?: string }) {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const instrument = getInstrument(settings.instrumentId);
  const tuning = getTuning(instrument, settings.tuningId);
  const refA = Math.min(MAX_REF, Math.max(MIN_REF, settings.refA));
  const octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(settings.octave)));
  const { sustain, waveform, sensitivity } = settings;
  const transpose = instrument.transpose;

  const stringMidis = tuning.strings.flatMap((s) => {
    const midi = parseNote(s);
    return midi === null ? [] : [midi];
  });

  // The actual mic-listening/pitch-detection engine lives in `lib/tunerEngine.ts`, a plain
  // module independent of this component's own mount lifecycle (see that file's own doc comment,
  // and `lib/metronomeEngine.ts`'s, for why). This component is just a view over "listening":
  // push settings in, read the live detected pitch back out. The tone generator below stays
  // local — it's a momentary action, not a session worth keeping alive across navigation.
  const tunerState = useSyncExternalStore(subscribeTuner, getTunerSnapshot, getTunerServerSnapshot);
  const { listening, error, reading: liveReading } = tunerState;
  const [playing, setPlaying] = useState<Playing | null>(null);
  // Takes (kept on this device): recording one, the list, and the one open in the tuner.
  const rec = useSyncExternalStore(subscribeTunerRecorder, getTunerRecorderSnapshot, getTunerRecorderServerSnapshot);
  const recording = rec.phase !== "idle";
  const takes = useTunerTakes();
  const playback = useTakePlayback();
  const openTake = playback.open;
  const [takeError, setTakeError] = useState<string | null>(null);
  /** Whether Record started the listening (so Stop ends it again). */
  const listenedForTake = useRef(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/tuner", listening || playing !== null || recording || playback.playing);
  const [inputs, setInputs] = useState<InputDevice[]>([]);
  const minRms = (SENSITIVITY[sensitivity] ?? SENSITIVITY.normal).rms;
  // With a take open, the needle follows the take where the playhead is (any note, chromatic).
  const reading = openTake ? (openTake.track ? readingAt(openTake.track, playback.pos, refA, minRms) : null) : liveReading;

  const toneRef = useRef<ToneHandle | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    updateTunerConfig({
      refA,
      stringMidis,
      sensitivity,
    });
  }, [refA, stringMidis, sensitivity]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      toneRef.current?.stop();
      setTunerToneActive(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listAudioInputs()
        .then((devices) => {
          if (!cancelled) setInputs(devices);
        })
        .catch(() => {});
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  const inputDeviceId = inputs.some((d) => d.id === settings.inputDeviceId)
    ? settings.inputDeviceId
    : "";

  async function startListening() {
    playback.close();
    const ok = await startTunerListening(inputDeviceId);
    if (ok) void listAudioInputs().then(setInputs);
    return ok;
  }

  function stopListening() {
    listenedForTake.current = false;
    stopTunerListening();
  }

  /** Opens a take in the tuner. The mic stops: the needle follows the take now. */
  function showTake(take: TunerTake) {
    setTakeError(null);
    // Read fresh (this also runs at the end of an await, after a take is saved).
    if (getTunerSnapshot().listening && getTunerRecorderSnapshot().phase === "idle") stopListening();
    void playback.openTake(take);
  }

  async function startRecording() {
    setTakeError(null);
    playback.close();
    stopTone();
    // The needle follows what you play while it records.
    if (!listening) listenedForTake.current = await startListening();
    await startTunerRecording(inputDeviceId);
    if (getTunerRecorderSnapshot().phase === "idle" && listenedForTake.current) stopListening();
  }

  async function stopRecording() {
    const take = await stopTunerRecording();
    if (listenedForTake.current) stopListening();
    if (!take) return;
    const all = await listTakes();
    const id = await saveTake(take.blob, nextTakeName(all), {
      source: "take",
      durationSec: take.durationSec,
      ext: extensionFor(take.blob.type),
    });
    if (!id) {
      setTakeError("This browser wouldn't keep the take. It may be out of space.");
      return;
    }
    const saved = (await listTakes()).find((t) => t.id === id);
    if (saved) showTake(saved);
  }

  async function openFile(file: File) {
    const id = await saveTake(file, nameOfFile(file.name), {
      source: "file",
      durationSec: 0,
      ext: extensionFor(file.type, file.name),
    });
    if (!id) {
      setTakeError("This browser wouldn't keep the file. It may be out of space.");
      return;
    }
    const saved = (await listTakes()).find((t) => t.id === id);
    if (saved) showTake(saved);
  }

  // A take sent here from elsewhere ("Open in Tuner" on a recording's page).
  const openedFromLink = useRef<string | null>(null);
  useEffect(() => {
    if (!openTakeId || openedFromLink.current === openTakeId) return;
    openedFromLink.current = openTakeId;
    void listTakes().then((all) => {
      const take = all.find((t) => t.id === openTakeId);
      if (take) showTake(take);
    });
    // Only when the link changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTakeId]);

  useSpaceToggle(
    openTake
      ? playback.toggle
      : recording
        ? () => void stopRecording()
        : playing
          ? stopTone
          : listening
            ? stopListening
            : () => void startListening(),
  );

  function stopTone() {
    toneRef.current?.stop();
    toneRef.current = null;
    setPlaying(null);
    setTunerToneActive(false);
  }

  /** `midi` is the concert pitch to sound. */
  function playMidi(midi: number) {
    const wasSame = playing?.midi === midi;
    stopTone();
    if (wasSame) return;
    setTunerToneActive(true);
    const freq = freqOfMidi(midi, refA);
    toneRef.current = startTone(
      freq,
      waveform as OscillatorType,
      0.35,
      sustain ? undefined : TONE_SECONDS,
      () => {
        if (mountedRef.current && !sustain) {
          setPlaying((p) => (p?.midi === midi ? null : p));
        }
      },
    );
    setPlaying({ midi });
  }

  function playPitchClass(pc: number) {
    // Ring labels are written notes, so undo the instrument's transposition.
    const written = (octave + 1) * 12 + pc;
    playMidi(written - transpose);
  }

  const written = reading ? reading.target + transpose : null;
  const detectedPc = written === null ? null : ((written % 12) + 12) % 12;
  const color = reading ? centsColor(reading.cents) : "";
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const playingWritten = playing ? playing.midi + transpose : null;
  const playingPc = playingWritten === null ? null : ((playingWritten % 12) + 12) % 12;
  const noteName = written === null ? null : midiToNote(written);
  const noteLetter = noteName ? noteName.replace(/\d+$/, "") : null;
  const noteOctave = noteName ? noteName.match(/\d+$/)?.[0] : null;
  const shownError = error ?? takeError ?? rec.error;
  const verdict = !reading
    ? ""
    : Math.abs(reading.cents) <= 8
      ? "In tune"
      : reading.cents < 0
        ? "Flat ♭"
        : "Sharp ♯";

  return (
    <ToolLayout
      title="Tuner"
      presets={toolPresets("tuner", settings, updateSettings, ["takeZoom"])}
      sidePanel={
        <TakesChip
          takes={takes}
          openId={openTake?.take.id ?? null}
          onOpen={showTake}
          onOpenFile={(file) => void openFile(file)}
          onDeleted={(id) => {
            if (openTake?.take.id === id) playback.close();
          }}
        />
      }
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />

          <CollapsiblePanel id="tuner-instrument" title="Instrument" icon={TunerIcon} summary={instrument.label}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Instrument</span>
              <Select
                value={instrument.id}
                onChange={(instrumentId) => {
                  const next = getInstrument(instrumentId);
                  updateSettings({ instrumentId, tuningId: next.tunings[0].id });
                }}
                options={TUNER_INSTRUMENTS.map((i) => ({
                  value: i.id,
                  label: i.label,
                  icon: <InstrumentIcon id={i.id} />,
                }))}
              />
            </label>
            <Hint>Sets which strings the dial and the tap-to-hear buttons below are built from.</Hint>
            {instrument.tunings.length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Tuning</span>
                <Select
                  value={tuning.id}
                  onChange={(tuningId) => updateSettings({ tuningId })}
                  options={instrument.tunings.map((t) => ({ value: t.id, label: t.label }))}
                />
              </label>
            )}
            {instrument.tunings.length > 1 && (
              <Hint>An alternate string tuning for this instrument, e.g. drop D or open G.</Hint>
            )}
            {transpose !== 0 && (
              <p className="text-xs text-muted">
                Notes are shown as written for this transposing instrument, not concert pitch.
              </p>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="tuner-input"
            title="Microphone"
            icon={MicIcon}
            summary={inputs.find((d) => d.id === inputDeviceId)?.label ?? "Default mic"}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Audio input</span>
              <Select
                value={inputDeviceId}
                onChange={(id) => updateSettings({ inputDeviceId: id })}
                disabled={listening}
                options={[
                  { value: "", label: "Default mic" },
                  ...inputs.map((d) => ({ value: d.id, label: d.label })),
                ]}
              />
            </label>
            <Hint>Which microphone or audio interface to listen through.</Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Sensitivity</span>
              <Select
                value={sensitivity in SENSITIVITY ? sensitivity : "normal"}
                onChange={(value) => updateSettings({ sensitivity: value })}
                options={Object.entries(SENSITIVITY).map(([value, { label }]) => ({
                  value,
                  label,
                }))}
              />
            </label>
            <Hint>How quiet a signal can be before it&apos;s ignored as silence — raise it in a noisy room.</Hint>
          </CollapsiblePanel>

          <CollapsiblePanel id="tuner-tone" title="Reference & tone" icon={SlidersIcon} summary={`A = ${refA} Hz`}>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center justify-between font-medium text-muted">
                Reference pitch (A4)
                <span className="flex items-center gap-2 tabular-nums text-foreground">
                  {refA} Hz
                  {refA !== 440 && (
                    <button
                      type="button"
                      onClick={() => updateSettings({ refA: 440 })}
                      className="rounded-md bg-foreground/[0.05] px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                    >
                      Reset
                    </button>
                  )}
                </span>
              </span>
              <input
                type="range"
                min={MIN_REF}
                max={MAX_REF}
                step={1}
                value={refA}
                onChange={(e) => updateSettings({ refA: Number(e.target.value) })}
                style={sliderStyle(refA, MIN_REF, MAX_REF)}
                className="slider h-6 w-full cursor-pointer"
              />
            </label>
            <Hint>
              The frequency of concert A, in Hz. 440 is standard; some orchestras and older
              recordings tune a little sharp or flat of it.
            </Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Tone generator sound</span>
              <Select
                value={waveform}
                onChange={(value) => updateSettings({ waveform: value })}
                options={WAVEFORMS}
              />
            </label>
            <Hint>The waveform played when you tap a note on the dial or a string below to hear it.</Hint>
          </CollapsiblePanel>
        </>
      }
    >
      <TunerDial
        detectedPc={detectedPc}
        detectedColor={color}
        playingPc={playingPc}
        onSelect={playPitchClass}
      >
        <button
          type="button"
          onClick={() => updateSettings({ sustain: !sustain })}
          aria-pressed={sustain}
          className={`pointer-events-auto relative rounded-full px-3 py-1 text-xs font-medium transition-colors pointer-coarse:h-8 pointer-coarse:px-4 pointer-coarse:text-sm pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:inset-x-0 ${
            sustain
              ? "bg-accent text-accent-foreground hover:bg-accent-hover"
              : "bg-foreground/[0.07] text-muted hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          Sustain
        </button>

        <div className="flex flex-col items-center leading-tight">
          {noteLetter ? (
            <>
              <span className="flex items-start text-5xl font-bold" style={{ color }}>
                {noteLetter}
                <span className="mt-1 text-lg font-medium text-muted">{noteOctave}</span>
              </span>
              <span className="text-xs font-medium tabular-nums" style={{ color }}>
                {reading!.cents > 0 ? "+" : ""}
                {reading!.cents.toFixed(1)} cents
              </span>
              <span className="text-[0.7rem] tabular-nums text-muted">
                {reading!.freq.toFixed(1)} Hz
              </span>
            </>
          ) : playing ? (
            <>
              <span className="text-4xl font-bold text-accent">
                {midiToNote(playing.midi + transpose).replace(/\d+$/, "")}
              </span>
              <span className="text-xs tabular-nums text-muted">
                {freqOfMidi(playing.midi, refA).toFixed(1)} Hz
              </span>
            </>
          ) : (
            <span className="px-2 text-xs text-muted">
              {openTake
                ? playback.playing
                  ? "No note here"
                  : "Press Play to watch the take"
                : listening
                  ? "Play a note…"
                  : "Press Start to listen, or tap a note to hear it"}
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col items-center">
          <span className="text-[0.65rem] font-medium text-muted">
            Octave
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateSettings({ octave: Math.max(MIN_OCTAVE, octave - 1) })}
              disabled={octave <= MIN_OCTAVE}
              aria-label="Octave down"
              className={OCTAVE_BUTTON}
            >
              −
            </button>
            <span className="w-4 text-xl font-medium tabular-nums">{octave}</span>
            <button
              type="button"
              onClick={() => updateSettings({ octave: Math.min(MAX_OCTAVE, octave + 1) })}
              disabled={octave >= MAX_OCTAVE}
              aria-label="Octave up"
              className={OCTAVE_BUTTON}
            >
              +
            </button>
          </div>
        </div>
      </TunerDial>

      <div className="flex w-full flex-col items-center gap-2" aria-live="polite">
        <div
          className="relative h-1.5 w-full rounded-full bg-foreground/10"
          role="meter"
          aria-label="Tuning offset in cents"
          aria-valuemin={-50}
          aria-valuemax={50}
          aria-valuenow={Math.round(cents)}
        >
          <div className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-muted/60" />
          {reading && (
            <div
              className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,background-color] duration-100"
              style={{ left: `${50 + cents}%`, background: color }}
            />
          )}
        </div>
        <div className="flex w-full justify-between text-[0.8rem] text-muted">
          <span>♭ flat</span>
          <span className="font-medium" style={{ color: reading ? color : undefined }}>
            {verdict}
          </span>
          <span>sharp ♯</span>
        </div>
      </div>

      {openTake && (
        <TakePanel
          open={openTake}
          name={takes?.find((t) => t.id === openTake.take.id)?.name ?? openTake.take.name}
          pos={playback.pos}
          playing={playback.playing}
          zoom={settings.takeZoom}
          onZoom={(takeZoom) => updateSettings({ takeZoom })}
          refA={refA}
          minRms={minRms}
          transpose={transpose}
          onToggle={playback.toggle}
          onSeek={playback.seek}
          onClose={playback.close}
        />
      )}

      {tuning.strings.length > 0 && !openTake && (
        <div className="-mt-3 flex w-full flex-col gap-2">
          <div role="group" aria-label="Tap a string to hear its pitch" className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
            {tuning.strings.map((s, i) => {
              const midi = stringMidis[i];
              const isHeard = reading?.target === midi;
              const isPlaying = playing?.midi === midi;
              return (
                <button
                  key={`${s}-${i}`}
                  type="button"
                  onClick={() => playMidi(midi)}
                  aria-pressed={isPlaying}
                  title={`Hear ${s}`}
                  className={`h-10 min-w-12 rounded-md px-3 sm:min-w-14 text-sm font-medium tabular-nums transition-colors ${
                    isPlaying
                      ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                      : "bg-foreground/[0.05] hover:bg-surface-hover"
                  }`}
                  style={
                    isHeard && !isPlaying
                      ? { background: color, color: "var(--background)" }
                      : undefined
                  }
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* While a take records the tuner listens too, so there's only the one Stop. While a tone
            plays (the tuner doesn't listen then anyway), the first button stops it, so the row
            never grows a third button and pushes the page down. */}
        {!recording && (
          <button
            type="button"
            onClick={playing ? stopTone : listening ? stopListening : () => void startListening()}
            className={startButtonClass(listening || playing !== null)}
          >
            {playing ? "Stop tone" : listening ? "Stop" : "Start listening"}
          </button>
        )}
        <button
          type="button"
          onClick={recording ? () => void stopRecording() : () => void startRecording()}
          disabled={rec.phase === "starting" || rec.phase === "finishing"}
          aria-label={recording ? "Stop recording" : "Record a take"}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground/[0.05] px-6 text-base font-semibold transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          {recording ? (
            <>
              <StopIcon className="h-4 w-4 text-danger" />
              Stop recording
              {rec.startedAt !== null && <RecordClock startedAt={rec.startedAt} />}
            </>
          ) : (
            <>
              <RecordIcon className="h-4 w-4 text-danger" />
              Record
            </>
          )}
        </button>
        {playing && recording && (
          <button
            type="button"
            onClick={stopTone}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground/[0.05] px-6 text-base font-semibold transition-colors hover:bg-surface-hover disabled:opacity-60"
          >
            Stop tone
          </button>
        )}
      </div>
      {/* An error takes the key hint's place, so the page doesn't grow (and scroll) when one shows. */}
      {shownError ? (
        <p role="alert" className="-mt-3 text-center text-sm text-danger sm:w-max sm:max-w-[min(40rem,calc(100vw-2rem))]">{shownError}</p>
      ) : (
        <KeyHint>
          Press <KeyHint.Key>Space</KeyHint.Key> to {openTake ? "play or pause the take" : recording ? "stop recording" : playing ? "stop the tone" : "start or stop listening"}
        </KeyHint>
      )}
    </ToolLayout>
  );
}

/** How long the take has been recording, ticking. */
function RecordClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums text-muted">{formatDuration((now - startedAt) / 1000)}</span>;
}

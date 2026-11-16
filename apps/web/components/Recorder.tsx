"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  SoundOptions,
  SteppedField,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
} from "@/components/MeterFields";
import { RecordingCard, SaveTakeDialog } from "@/components/recordings/RecordingParts";
import StructureEditor from "@/components/StructureEditor";
import SwitchRow from "@/components/SwitchRow";
import { soundSummary } from "@/components/metronome/MetronomeOptions";
import { SUB_LABELS, Segmented, SubdivisionPicker, TimeSignatureControl } from "@/components/metronome/MetronomeOptions";
import { ChipsModeContext, SettingChip, SettingsBar } from "@/components/SettingsBar";
import ToolLayout from "@/components/ToolLayout";
import { PresetsChip } from "@/components/PresetsChip";
import { toolPresets } from "@/lib/toolPresets";
import { MeterIcon, MetronomeIcon, NoteIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { type BeatLevel, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import {
  NEXT_LEVEL,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from "@/lib/meterControls";
import { getMetronomeServerSnapshot, getMetronomeSnapshot, subscribeMetronome } from "@/lib/metronomeEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  type FinishedTake,
  type RecorderMetronome,
  type RecorderMono,
  clearRecorderError,
  getRecorderServerSnapshot,
  getRecorderSnapshot,
  setRecorderSongVolume,
  startRecording,
  stopRecording,
  subscribeRecorder,
  updateRecorderMetronome,
} from "@/lib/recorderEngine";
import { DEFAULT_MIX, formatDuration, recordingsApi, useTuneIndex, useTuneSong } from "@/lib/recordings";
import { EMPTY_STRUCTURE, type Structure, cycleSectionAccent, cycleSectionSubAccent, sectionAt } from "@/lib/structure";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useToolActivity } from "@/lib/toolTime";

// The same key and shape as the app's Recorder, so settings follow you between the two. Everything
// from `bpm` on is the Metronome tool's own settings shape.
const SETTINGS_KEY = "jam-practice-recorder-take";
const DEFAULT_SETTINGS = {
  autoGain: true,
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

/**
 * The Recorder — one take at a time (it replaced the old multitrack recorder), with the metronome
 * optionally clicking along and counting you in. The metronome is the full Metronome tool: tempo,
 * time signature, the clickable beat strip, and the same options (meter, accent grouping,
 * subdivision, tempo note value, structures, sound). Stopping opens the save dialog — name, notes,
 * tune — and saved takes live on the account (`convex/recordings.ts`), shared with the app.
 * `tuneId` (from a tune's page) records for that tune, with the metronome at the tune's tempo.
 */
export default function Recorder({ tuneId }: { tuneId?: string }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const byId = useTuneIndex();
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;
  const recordings = useQuery(recordingsApi.list, isAuthenticated ? {} : "skip");
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
  const busy = rec.phase !== "idle";
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/recorder", busy);
  const click = useSyncExternalStore(subscribeMetronome, getMetronomeSnapshot, getMetronomeServerSnapshot);
  const clicking = busy && settings.metronome && click.running;
  const [take, setTake] = useState<FinishedTake | null>(null);

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
        autoGain: settings.autoGain,
        mono: settings.mono ? settings.monoSource : null,
        song: songOn && song?.url ? { url: song.url, startSec: songStart, volume: settings.songVolume } : null,
      });
      return;
    }
    if (rec.phase === "finishing") return;
    const finished = await stopRecording();
    if (finished) setTake(finished);
  }

  // --- the Metronome tool's accent/structure editing ---
  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }
  const activeSection = useStructure && structure.form.length > 0 ? sectionAt(structure, clicking ? click.formIndex : 0) : null;
  const displayAccents = activeSection ? defaultAccents(activeSection.beatsPerBar, activeSection.accents) : accents;
  const displaySubdivision = activeSection ? activeSection.subdivision : subdivision;
  const displaySubAccents = activeSection
    ? defaultSubAccents(activeSection.beatsPerBar, activeSection.subdivision, activeSection.subAccents)
    : subAccents;
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
    rec.phase === "countin" ? "Count-in…" : rec.phase === "recording" ? "Recording" : rec.phase === "finishing" ? "Finishing the take…" : tune ? `For “${tune.name}”` : "Ready";

  // Like the Metronome: the meter mode (it decides which chips there are) and, for changing meters,
  // the form itself, above the chips.
  const optionsMode = (
    <>
      <Segmented
        onPage
        label="Meter"
        value={useStructure ? "structure" : "single"}
        onChange={(v) => updateSettings({ useStructure: v === "structure" })}
        disabled={busy}
        options={[
          { value: "single", label: "One meter" },
          { value: "structure", label: "Changing meters" },
        ]}
      />
      {useStructure && (
        <div className="w-full rounded-3xl bg-surface p-4 text-left">
          <StructureEditor
            show="form"
            structure={structure}
            onChange={(s) => updateSettings({ structure: s })}
            running={clicking}
            activeFormIndex={clicking ? click.formIndex : null}
            playingBeat={click.currentBeat}
            playingSub={click.currentSub}
          />
        </div>
      )}
    </>
  );

  const options = (
    <>
      {useStructure ? (
        <SettingChip
          icon={MeterIcon}
          label="Sections"
          wide
          value={structure.sections.length ? `${structure.sections.length} section${structure.sections.length === 1 ? "" : "s"}` : "Add sections"}
        >
          <StructureEditor
            show="sections"
            modern
            structure={structure}
            onChange={(s) => updateSettings({ structure: s })}
            running={clicking}
            activeFormIndex={clicking ? click.formIndex : null}
            playingBeat={click.currentBeat}
            playingSub={click.currentSub}
          />
        </SettingChip>
      ) : (
        <>
          <SettingChip icon={MeterIcon} label="Time" title="Time signature" value={`${beatsPerBar}/${beatUnit}`}>
            <TimeSignatureControl
              beatsPerBar={beatsPerBar}
              beatUnit={beatUnit}
              onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
              onSetBeatUnit={(u) => updateSettings({ beatUnit: u })}
            />
          </SettingChip>
          <SettingChip icon={NoteIcon} label="Subdivision" value={SUB_LABELS[subdivision] ?? subdivision}>
            <SubdivisionPicker value={subdivision} onChange={(n) => updateSettings({ subdivision: n })} showTitle={false} />
          </SettingChip>
        </>
      )}
      <CollapsiblePanel id="recorder-countin" title="Count-in" icon={MetronomeIcon} summary={settings.countInBars ? `${settings.countInBars} bar${settings.countInBars === 1 ? "" : "s"}` : "Off"}>
        <SteppedField
          label="Count-in bars"
          value={settings.countInBars}
          min={0}
          max={4}
          layout="row"
          disabled={busy}
          onChange={(n) => updateSettings({ countInBars: n })}
          hint="With the metronome on, this many bars click before the recording starts, so you come in on the downbeat."
        />
      </CollapsiblePanel>
      <CollapsiblePanel id="recorder-sound" title="Sound" icon={SpeakerIcon} summary={soundSummary(soundId, volume)}>
        <SoundOptions soundId={soundId} setSoundId={(id) => updateSettings({ soundId: id })} volume={volume} setVolume={(v) => updateSettings({ volume: v })} />
      </CollapsiblePanel>
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
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-muted">
            Recordings are saved to your account, so you can play them back on any device — here or in the app. Sign in (bottom of the sidebar) to start recording.
          </p>
        </div>
      </ToolLayout>
    );
  }

  return (
    <ToolLayout title="Recorder" options={null} layout="stacked">
      {/* Desktop: the metronome on the left, the recorder and recent recordings on the right.
          Phones: recorder, then metronome, then recordings. */}
      <div className="grid w-full max-w-5xl items-start gap-8 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
        <div className="flex w-full flex-col items-center gap-6 lg:col-start-2 lg:row-start-1">
        <div className="flex flex-col items-center gap-2">
          <p className={`text-sm font-semibold ${rec.phase === "recording" ? "text-danger" : "text-muted"}`}>{status}</p>
          <p className="text-6xl font-extrabold tabular-nums">{formatDuration(elapsed)}</p>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={`h-full rounded-full ${rec.level > 0.85 ? "bg-danger" : "bg-accent"}`}
              style={{ width: `${Math.round((rec.phase === "recording" ? rec.level : 0) * 100)}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onRecord()}
          aria-label={busy ? "Stop recording" : "Start recording"}
          className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-surface-hover transition-transform hover:scale-105"
        >
          {busy ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger text-white">
              <StopIcon className="h-6 w-6" />
            </span>
          ) : (
            <span className="h-[74px] w-[74px] rounded-full bg-danger" />
          )}
        </button>
        {rec.error && <p className="text-sm text-danger">{rec.error}</p>}

        <div className="w-60">
          <SwitchRow
            label="Auto gain"
            checked={settings.autoGain}
            onChange={(v) => updateSettings({ autoGain: v })}
            disabled={busy}
            hint="On: the browser sets the recording level automatically, so quiet playing still comes out at a good volume. Off: the raw microphone — truer dynamics, but quieter."
          />
          <SwitchRow
            label="Mono"
            checked={settings.mono}
            onChange={(v) => updateSettings({ mono: v })}
            disabled={busy}
            hint="Records one channel that plays in both ears. Use it when your audio interface puts your mic on only the left or right side. Pick the side your mic is plugged into for full volume; Mix blends both, which makes a one-sided mic about half as loud."
          />
          {settings.mono && (
            <div className="pt-1">
              <Segmented
                onPage
                label="Mono source"
                value={settings.monoSource}
                onChange={(v) => updateSettings({ monoSource: v })}
                disabled={busy}
                options={[
                  { value: "left", label: "Left" },
                  { value: "mix", label: "Mix" },
                  { value: "right", label: "Right" },
                ]}
              />
            </div>
          )}
        </div>
        {song?.url && (
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
            <SwitchRow
              label="Play the song"
              checked={settings.playSong}
              onChange={(v) => updateSettings({ playSong: v })}
              disabled={busy}
              hint={`Plays “${song.name}” along with you, starting when the take does (after the count-in). Wear headphones, or the microphone records it too.`}
            />
            {settings.playSong && (
              <>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Start the song at</span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={busy} onClick={() => setSongStart((t) => Math.max(0, t - 5))} className="rounded-lg bg-background px-2 py-1 font-medium hover:bg-surface-hover disabled:opacity-50">
                      −5 s
                    </button>
                    <span className="w-12 text-center tabular-nums">{formatDuration(songStart)}</span>
                    <button type="button" disabled={busy} onClick={() => setSongStart((t) => Math.min(songMax, t + 5))} className="rounded-lg bg-background px-2 py-1 font-medium hover:bg-surface-hover disabled:opacity-50">
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
              </>
            )}
          </div>
        )}
        </div>
        <section className="flex w-full flex-col items-center gap-4 rounded-3xl border border-surface-hover p-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="flex w-full items-center gap-2">
            <MetronomeIcon className="h-5 w-5 text-muted" />
            <div className="flex-1">
              <SwitchRow label="Metronome" checked={settings.metronome} onChange={(v) => updateSettings({ metronome: v })} disabled={busy} />
            </div>
          </div>
          {settings.metronome && (
            <>
              <TempoHero
                bpm={bpm}
                setBpm={setBpm}
                beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
                beatUnit={activeSection?.beatUnit ?? beatUnit}
                onTap={tap}
                aboveNumber={<TempoNoteValuePicker value={tempoNoteValue} onChange={(v) => updateSettings({ tempoNoteValue: v })} />}
              />
              <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={activeSection?.beatUnit ?? beatUnit} />
              {useStructure && !activeSection ? (
                <p className="rounded-xl bg-surface px-4 py-3 text-center text-sm text-muted">Open Sections to add sections and arrange a form.</p>
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
              )}
              <p className="text-xs text-muted">The click plays through your speakers, so the microphone picks it up unless you wear headphones.</p>
              {/* The metronome's settings live here with it rather than under the page (below the
                  recordings), in the same chips-and-popovers style as every tool's options. */}
              <ChipsModeContext.Provider value={true}>
                <div className="flex w-full flex-col items-center gap-3 pt-1">
                  {optionsMode}
                  <SettingsBar fit>
                    {/* The metronome's setup only: the mic options belong to this setup, not a preset. */}
                    <PresetsChip tool={toolPresets("recorder", settings, updateSettings, ["autoGain", "mono", "monoSource", "playSong", "songVolume", "metronome"])} />
                    {options}
                  </SettingsBar>
                </div>
              </ChipsModeContext.Provider>
            </>
          )}
        </section>
        <section className="flex w-full flex-col gap-2 lg:col-start-2 lg:row-start-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Recent recordings</h2>
            <Link href="/recordings" className="text-sm font-medium text-accent hover:underline">
              All recordings{recordings ? ` (${recordings.length})` : ""}
            </Link>
          </div>
          {recordings === undefined ? (
            <LoadingSpinner />
          ) : recordings.length === 0 ? (
            <p className="text-sm text-muted">No recordings yet.</p>
          ) : (
            recordings.slice(0, 3).map((r) => <RecordingCard key={r._id} recording={r} tuneName={r.tuneId ? byId.get(r.tuneId)?.tune.name : null} />)
          )}
        </section>
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

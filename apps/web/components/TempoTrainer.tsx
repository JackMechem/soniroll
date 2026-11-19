"use client";

import { useEffect, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import PanelsToggle from "@/components/PanelsToggle";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import {
  BIG_PRIMARY,
  BIG_SECONDARY,
  SoundOptions,
  SteppedField,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
} from "@/components/MeterFields";
import StructureEditor, { StructureEmptyHint } from "@/components/StructureEditor";
import { EyeOffIcon, MeterIcon, NoteIcon, SpeakerIcon } from "@/components/tools";
import { soundSummary } from "@/components/metronome/MetronomeOptions";
import { SUB_LABELS, Segmented, SubdivisionPicker, TimeSignatureControl } from "@/components/metronome/MetronomeOptions";
import { SettingChip } from "@/components/SettingsBar";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import { type BeatLevel, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  NEXT_LEVEL,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from "@/lib/meterControls";
import {
  EMPTY_STRUCTURE,
  type Structure,
  cycleSectionAccent,
  cycleSectionSubAccent,
  sectionAt,
} from "@/lib/structure";
import {
  getTempoTrainerServerSnapshot,
  getTempoTrainerSnapshot,
  startTempoTrainer,
  stopTempoTrainer,
  subscribeTempoTrainer,
  updateTempoTrainerSettings,
  updateTempoTrainerStructure,
} from "@/lib/tempoTrainerEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";

// A silent stretch this long would make the tool pointless (you'd just be practicing with the
// click on) at one end, and impractical to configure at the other — the same "generous but
// bounded" reasoning Polyrhythm Metric Modulation Metronome's own "Bars between modulations"
// field uses for its own cap.
const MAX_CYCLE_BARS = 32;

const PANEL_IDS = ["tempo-trainer-meter", "tempo-trainer-cycle", "tempo-trainer-sound"];
const SETTINGS_KEY = "jam-practice-tempo-trainer";
// Every field through `tempoNoteValue` mirrors Metronome's own `DEFAULT_SETTINGS` exactly (see
// that component's own comments on each) — this tool's metronome is meant to be identical to the
// plain one, not a simplified copy; `onBars`/`offBars` are the one thing added on top.
const DEFAULT_SETTINGS = {
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
  // 4 bars audible, 4 muted is a reasonable, generically useful starting cycle — long enough to
  // establish the tempo before it disappears, short enough that losing it is quick to notice.
  onBars: 4,
  offBars: 4,
};

export default function TempoTrainer() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const {
    subdivision,
    volume,
    soundId,
    useStructure,
    structure,
    tempoNoteValue,
    onBars,
    offBars,
  } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const setBpm = (value: number) => updateSettings({ bpm: clampBpm(value) });
  const setBeatUnit = (beatUnit: number) => updateSettings({ beatUnit });
  const setSubdivision = (subdivision: number) => updateSettings({ subdivision });
  const setVolume = (volume: number) => updateSettings({ volume });
  const setSoundId = (soundId: string) => updateSettings({ soundId });
  const setUseStructure = (useStructure: boolean) => updateSettings({ useStructure });
  const setStructure = (structure: Structure) => updateSettings({ structure });
  const setTempoNoteValue = (tempoNoteValue: number | null) => updateSettings({ tempoNoteValue });

  // The actual engine — click scheduling, running state, structure advancement, and which on/off
  // mute-cycle phase is currently playing — lives in `lib/tempoTrainerEngine.ts`, independent of
  // this component's own mount lifecycle (see that file's own doc comment, and
  // `lib/metronomeEngine.ts`'s, for why). This component is just a view over it.
  const engineState = useSyncExternalStore(
    subscribeTempoTrainer,
    getTempoTrainerSnapshot,
    getTempoTrainerServerSnapshot,
  );
  const { running, phase, currentBeat, currentSub } = engineState;
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/tempo-trainer", running);

  useEffect(() => {
    updateTempoTrainerSettings({
      bpm,
      beatsPerBar,
      beatUnit,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
      tempoNoteValue,
      onBars,
      offBars,
    });
  }, [
    bpm,
    beatsPerBar,
    beatUnit,
    accents,
    subdivision,
    subAccents,
    volume,
    soundId,
    tempoNoteValue,
    onBars,
    offBars,
  ]);

  useEffect(() => {
    updateTempoTrainerStructure({ useStructure, structure });
  }, [useStructure, structure]);

  const canStart = !useStructure || structure.form.length > 0;

  function start() {
    if (!canStart) return;
    startTempoTrainer();
  }

  const stop = stopTempoTrainer;

  useSpaceToggle(running ? stop : start);
  const tap = useTapTempo(setBpm);

  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }

  function cycleBeat(index: number) {
    updateSettings({
      accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)),
    });
  }

  function cycleSub(beatIndex: number, subIndex: number) {
    const dotCount = Math.max(0, Math.round(subdivision) - 1);
    const flatIndex = beatIndex * dotCount + subIndex;
    updateSettings({
      subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)),
    });
  }

  // While a structure is active and has at least one form entry, the main beat display/edit
  // controls below track whichever section is currently (or was last) playing instead of the
  // plain top-level meter — `?? 0` so there's always something to show/edit even before Start
  // has ever been pressed. Identical to Metronome.tsx's own.
  const activeSection =
    useStructure && structure.form.length > 0
      ? sectionAt(structure, engineState.formIndex)
      : null;
  const displayAccents = activeSection
    ? defaultAccents(activeSection.beatsPerBar, activeSection.accents)
    : accents;
  const displaySubdivision = activeSection ? activeSection.subdivision : subdivision;
  const displaySubAccents = activeSection
    ? defaultSubAccents(activeSection.beatsPerBar, activeSection.subdivision, activeSection.subAccents)
    : subAccents;
  const effectiveBeatUnit = activeSection?.beatUnit ?? beatUnit;

  function handleCycleBeat(index: number) {
    if (activeSection) {
      setStructure(cycleSectionAccent(structure, activeSection.id, index));
      return;
    }
    cycleBeat(index);
  }

  function handleCycleSub(beatIndex: number, subIndex: number) {
    if (activeSection) {
      setStructure(cycleSectionSubAccent(structure, activeSection.id, beatIndex, subIndex));
      return;
    }
    cycleSub(beatIndex, subIndex);
  }

  // Nothing about time shows at all during a silent stretch — not the beat strip (which would
  // still reveal exactly where in the bar playback is, even without the click), not the "Section
  // X · bar Y" readout, not the structure editor's own live playing-section highlight, nothing
  // animated — per the whole point of this tool: finding out whether you can actually hold the
  // tempo without any cue, visual or audible. Idle (never started) and the audible phase both show
  // everything normally, same as a plain metronome always has.
  const silentNow = running && phase === "off";
  // What Start will do, in one line under the beats, so the tool doesn't look like a plain
  // metronome (the same idea as Metric Modulation's plan line).
  const bars = (n: number) => (n === 1 ? "1 bar" : `${n} bars`);
  const plan = `Click plays ${bars(onBars)}, then goes silent for ${bars(offBars)}`;

  return (
    <ToolLayout
      title="Tempo Trainer"
      presets={toolPresets("tempo-trainer", settings, updateSettings)}
      optionsMode={
        <>
          <Segmented
            onPage
            label="Meter"
            value={useStructure ? "structure" : "single"}
            onChange={(v) => setUseStructure(v === "structure")}
            options={[
              { value: "single", label: "One meter" },
              { value: "structure", label: "Changing meters" },
            ]}
          />
          {useStructure && structure.sections.length > 0 && (
            <div className="w-[min(30rem,calc(100cqw-2rem))] rounded-lg bg-surface p-4 text-left">
              <StructureEditor
                show="form"
                structure={structure}
                onChange={setStructure}
                running={running}
                activeFormIndex={running && !silentNow ? engineState.formIndex : null}
                playingBeat={silentNow ? null : currentBeat}
                playingSub={currentSub}
              />
            </div>
          )}
        </>
      }
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />

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
                onChange={setStructure}
                running={running}
                activeFormIndex={running && !silentNow ? engineState.formIndex : null}
                playingBeat={silentNow ? null : currentBeat}
                playingSub={currentSub}
              />
            </SettingChip>
          ) : (
            <>
              <SettingChip icon={MeterIcon} label="Time" title="Time signature" value={`${beatsPerBar}/${beatUnit}`}>
                <TimeSignatureControl
                  beatsPerBar={beatsPerBar}
                  beatUnit={beatUnit}
                  onChangeBeats={(n) => changeBeats(Math.min(MAX_BEATS, Math.max(1, n)))}
                  onSetBeatUnit={setBeatUnit}
                />
              </SettingChip>
              <SettingChip icon={NoteIcon} label="Subdivision" value={SUB_LABELS[subdivision] ?? subdivision}>
                <SubdivisionPicker value={subdivision} onChange={setSubdivision} showTitle={false} />
              </SettingChip>
            </>
          )}

          <CollapsiblePanel id="tempo-trainer-cycle" title="Mute cycle" icon={EyeOffIcon} summary={`${onBars} on · ${offBars} off`}>
            <SteppedField
              label="Bars audible"
              value={onBars}
              min={1}
              max={MAX_CYCLE_BARS}
              layout="row"
              disabled={running}
              onChange={(onBars) => updateSettings({ onBars })}
              hint="How many bars the click plays before it cuts out."
            />
            <SteppedField
              label="Bars muted"
              value={offBars}
              min={1}
              max={MAX_CYCLE_BARS}
              layout="row"
              disabled={running}
              onChange={(offBars) => updateSettings({ offBars })}
              hint="How many bars stay silent — with no beat shown either — before the click comes back. Keep the tempo going on your own until it does."
            />
          </CollapsiblePanel>

          <CollapsiblePanel id="tempo-trainer-sound" title="Sound" icon={SpeakerIcon} summary={soundSummary(soundId, volume)}>
            <SoundOptions
              soundId={soundId}
              setSoundId={setSoundId}
              volume={volume}
              setVolume={setVolume}
            />
          </CollapsiblePanel>
        </>
      }
    >
      <div className="flex w-full flex-col items-center gap-4">
        <TempoHero
          bpm={bpm}
          setBpm={setBpm}
          beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
          beatUnit={activeSection?.beatUnit ?? beatUnit}
          onTap={tap}
          tempoNote={<TempoNoteValuePicker value={tempoNoteValue} onChange={setTempoNoteValue} />}
        />
        <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={effectiveBeatUnit} />
        {/* The silent stretch hides the beats and plan but keeps their space (the card sits on top
            of them), so the page doesn't jump when the click drops out and comes back. */}
        <div className="grid w-full justify-items-center">
          <div
            aria-hidden={silentNow}
            inert={silentNow}
            className={`flex w-full flex-col items-center gap-4 [grid-area:1/1] ${silentNow ? "invisible" : ""}`}
          >
            {useStructure && activeSection && (
              <p className="text-sm font-medium text-muted">
                Section <span className="text-foreground">{activeSection.name}</span> · bar{" "}
                {engineState.barInSection + 1} of {activeSection.bars}
              </p>
            )}
            {useStructure && !activeSection ? (
              <StructureEmptyHint structure={structure} />
            ) : (
              <BeatIndicator
                accents={displayAccents}
                currentBeat={running ? currentBeat : null}
                onCycle={handleCycleBeat}
                subdivision={displaySubdivision}
                subAccents={displaySubAccents}
                currentSub={currentSub}
                onCycleSub={handleCycleSub}
                cycleHint
              />
            )}
            <p className="text-sm text-muted tabular-nums">{plan}</p>
          </div>
          {silentNow && (
            <div className="flex w-full max-w-xs flex-col items-center justify-center gap-1.5 self-center rounded-lg bg-surface px-4 py-3 text-center [grid-area:1/1]">
              <EyeOffIcon className="h-5 w-5 text-muted" />
              {/* How long the silence lasts, but no live countdown: a number changing on every bar
                  would show where the barlines fall, which is what you're meant to keep yourself. */}
              <span className="text-sm font-medium text-foreground">Silent for {bars(offBars)}</span>
              <span className="text-sm text-muted">Count them and keep the tempo going — the click comes back after that</span>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={running ? stop : start}
        disabled={!running && !canStart}
        title={!running && !canStart ? "Add sections and a form first" : undefined}
        className={running ? BIG_SECONDARY : BIG_PRIMARY}
      >
        {running ? "Stop" : "Start"}
      </button>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}

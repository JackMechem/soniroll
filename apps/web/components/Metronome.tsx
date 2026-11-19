"use client";

import { useEffect, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import {
  BIG_PRIMARY,
  BIG_SECONDARY,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
} from "@/components/MeterFields";
import StructureEditor, { StructureEmptyHint } from "@/components/StructureEditor";
import { RewardCard } from "@/components/reward/Reward";
import {
  OptionGroup,
  SUB_LABELS,
  Segmented,
  SoundPicker,
  SubdivisionPicker,
  TimeSignatureControl,
} from "@/components/metronome/MetronomeOptions";
import { SettingChip, SettingsBar } from "@/components/SettingsBar";
import { MeterIcon, NoteIcon, SpeakerIcon } from "@/components/tools";
import ToolLayout from "@/components/ToolLayout";
import KeyHint from "@/components/KeyHint";
import { BeatLevel, CLICK_SOUNDS, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
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
  getMetronomeServerSnapshot,
  getMetronomeSnapshot,
  startMetronome,
  stopMetronome,
  subscribeMetronome,
  updateMetronomeSettings,
  updateMetronomeStructure,
} from "@/lib/metronomeEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";
import { toolPresets } from "@/lib/toolPresets";

const DEFAULT_BPM = 100;

/** The time signatures people reach for most, as quick-pick cards in the Time popover. */
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

const SETTINGS_KEY = "jam-practice-metronome";
const DEFAULT_SETTINGS = {
  bpm: DEFAULT_BPM,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  // A "structure" chains bars of *different* meters in a fixed, looping sequence (e.g. 2 bars of
  // 11/8, then a bar of 12/8, then a bar of 15/8) instead of one fixed meter for the whole run —
  // see lib/structure.ts. Off by default; every field above this point keeps behaving exactly as
  // it always has while it's off.
  useStructure: false,
  structure: EMPTY_STRUCTURE as Structure,
  // Defaults to the quarter note explicitly (rather than `null`, "match the beat unit") per a
  // direct request — most real metronomes read as "quarter note = 110" by default, not a generic
  // "beat unit" label, even though the two mean the same thing while the meter's own beat unit is
  // already a quarter note (the default `beatUnit` above). `null` still means "match the beat
  // unit" for anyone who explicitly picks it — the persisted override lets the tempo number
  // instead refer to a *different* note value than the beat unit, e.g. "quarter note = 275" while
  // the meter itself is in 4/8 (so the engine actually clicks eighth notes at 550). See
  // `convertTempo` in lib/meterControls.ts.
  tempoNoteValue: 4 as number | null,
};

export default function Metronome() {
  const [settings, updateSettings] = useSyncedSettings(
    SETTINGS_KEY,
    DEFAULT_SETTINGS,
  );
  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(
    MAX_BEATS,
    Math.max(1, Math.round(settings.beatsPerBar)),
  );
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);
  const setBpm = (value: number) => updateSettings({ bpm: clampBpm(value) });
  const setBeatUnit = (beatUnit: number) => updateSettings({ beatUnit });
  const setSubdivision = (subdivision: number) =>
    updateSettings({ subdivision });
  const setVolume = (volume: number) => updateSettings({ volume });
  const setSoundId = (soundId: string) => updateSettings({ soundId });
  const setUseStructure = (useStructure: boolean) => updateSettings({ useStructure });
  const setStructure = (structure: Structure) => updateSettings({ structure });
  const setTempoNoteValue = (tempoNoteValue: number | null) => updateSettings({ tempoNoteValue });
  // The actual engine — click scheduling, running state, current beat/sub, and structure
  // advancement — lives in `lib/metronomeEngine.ts`, a plain module independent of this
  // component's own mount lifecycle (see that file's own doc comment for why). This component is
  // just a view over it: push settings in whenever they change, read the live snapshot back out.
  const engineState = useSyncExternalStore(
    subscribeMetronome,
    getMetronomeSnapshot,
    getMetronomeServerSnapshot,
  );
  const { running, currentBeat, currentSub } = engineState;
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/metronome", running);

  useEffect(() => {
    updateMetronomeSettings({
      bpm,
      beatsPerBar,
      beatUnit,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
      tempoNoteValue,
    });
  }, [bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue]);

  useEffect(() => {
    updateMetronomeStructure({ useStructure, structure });
  }, [useStructure, structure]);

  const canStart = !useStructure || structure.form.length > 0;

  function start() {
    if (!canStart) return;
    startMetronome();
  }

  const stop = stopMetronome;

  useSpaceToggle(running ? stop : start);
  const tap = useTapTempo(setBpm);

  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }

  function cycleBeat(index: number) {
    updateSettings({
      accents: accents.map((level, i) =>
        i === index ? NEXT_LEVEL[level] : level,
      ),
    });
  }

  function cycleSub(beatIndex: number, subIndex: number) {
    const dotCount = Math.max(0, Math.round(subdivision) - 1);
    const flatIndex = beatIndex * dotCount + subIndex;
    updateSettings({
      subAccents: subAccents.map((level, i) =>
        i === flatIndex ? NEXT_LEVEL[level] : level,
      ),
    });
  }

  // While a structure is active and has at least one form entry, the main beat display/edit
  // controls below track whichever section is currently (or was last) playing instead of the
  // plain top-level meter — `?? 0` so there's always something to show/edit even before Start
  // has ever been pressed.
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
  // Which beat unit `tempoNoteValue` is currently being converted against — the active section's
  // own in structure mode (it can differ bar to bar), otherwise the plain meter's.
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

  return (
    <ToolLayout
      title="Metronome"
      options={null}
      presets={toolPresets("metronome", settings, updateSettings)}
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

      {/* Settings live below Start: the meter mode (it decides which chips there are), then
          chips that each open their own popover. */}
      <div className="flex flex-col items-center gap-3">
        <div>
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
        </div>
        {useStructure && structure.sections.length > 0 && (
          <div className="w-[min(30rem,calc(100cqw-2rem))] rounded-lg bg-surface p-4 text-left">
            <StructureEditor
              show="form"
              structure={structure}
              onChange={setStructure}
              running={running}
              activeFormIndex={running ? engineState.formIndex : null}
              playingBeat={currentBeat}
              playingSub={currentSub}
            />
          </div>
        )}
        <SettingsBar>
          {useStructure ? (
            <SettingChip
              icon={MeterIcon}
              label="Sections"
              title="Sections"
              wide
              value={structure.sections.length ? `${structure.sections.length} section${structure.sections.length === 1 ? "" : "s"}` : "Add sections"}
            >
              <StructureEditor
                show="sections"
                modern
                structure={structure}
                onChange={setStructure}
                running={running}
                activeFormIndex={running ? engineState.formIndex : null}
                playingBeat={currentBeat}
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
                <OptionGroup title="Quick picks">
                  <div role="radiogroup" aria-label="Common time signatures" className="grid grid-cols-4 gap-2">
                    {COMMON_METERS.map(([b, u]) => (
                      <RewardCard
                        key={`${b}/${u}`}
                        id={`meter:${b}/${u}`}
                        on={beatsPerBar === b && beatUnit === u}
                        label={`${b}/${u}`}
                        onPick={() => {
                          setBeatUnit(u);
                          changeBeats(b);
                        }}
                        className="h-14"
                      >
                        <span className="flex flex-col items-center text-base font-semibold leading-[0.95] tabular-nums">
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
                <SubdivisionPicker value={subdivision} onChange={setSubdivision} showTitle={false} />
              </SettingChip>
            </>
          )}
          <SettingChip
            icon={SpeakerIcon}
            label="Sound"
            value={`${CLICK_SOUNDS.find((c) => c.id === soundId)?.label ?? "Click"} · ${Math.round(volume * 100)}%`}
          >
            <SoundPicker soundId={soundId} setSoundId={setSoundId} volume={volume} setVolume={setVolume} />
          </SettingChip>
        </SettingsBar>
      </div>
    </ToolLayout>
  );
}

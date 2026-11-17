"use client";

import { useEffect, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import { OptionsCard, OptionSection } from "@/components/OptionsCard";
import Select from "@/components/Select";
import StickControlStave from "@/components/StickControlStave";
import SwitchRow from "@/components/SwitchRow";
import AdvancedSlider from "@/components/AdvancedSlider";
import { BIG_PRIMARY, BIG_SECONDARY, SteppedField, SoundOptions, TempoHero } from "@/components/MeterFields";
import { ListIcon, RepeatIcon, SpeakerIcon } from "@/components/tools";
import { soundSummary } from "@/components/metronome/MetronomeOptions";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import Hint from "@/components/Hint";
import { type BeatLevel, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { NEXT_LEVEL, clampBpm, useTapTempo } from "@/lib/meterControls";
import {
  CONCRETE_ROLL_TYPES,
  ROLL_TYPES,
  TRIPLET_STICKING_OPTIONS,
  type ConcreteRollType,
  type RollType,
  type StickControlOptions,
  type TripletSticking,
} from "@/lib/stickControl";
import {
  type ClickMode,
  type StickControlSettings,
  advanceStickControlPattern,
  getStickControlServerSnapshot,
  getStickControlSnapshot,
  regenerateStickControlPattern,
  startStickControl,
  stopStickControl,
  subscribeStickControl,
  updateStickControlOptions,
  updateStickControlSettings,
} from "@/lib/stickControlEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";

const SETTINGS_KEY = "jam-practice-stick-control";

const DEFAULT_SETTINGS = {
  bpm: 100,
  rollType: "double" as RollType,
  // All three enabled by default — the original, unrestricted random choice.
  enabledRollTypes: CONCRETE_ROLL_TYPES,
  // All enabled by default — the original, unrestricted random choice.
  enabledTripletStickings: TRIPLET_STICKING_OPTIONS.map((o) => o.value),
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  clickMode: "pulse" as ClickMode,
  countOffBars: 1,
  // 20 repeats without stopping is a well-worn, generically useful default for a warmup like
  // this, not tied to any one specific set of instructions.
  repeats: 20,
  // On by default — a continuous warmup session cycling through patterns is the common case;
  // per a direct request ("make new pattern when done on by default").
  autoAdvance: true,
  // Beat 1 accented, the rest normal — the same default `lib/meterControls.ts`'s own
  // `defaultAccents` would produce for a 4-beat bar, matching Metronome's own starting look.
  accents: [2, 1, 1, 1] as BeatLevel[],
};

const CLICK_MODE_OPTIONS: { value: ClickMode; label: string }[] = [
  { value: "pulse", label: "Steady pulse (one click per beat)" },
  { value: "everyNote", label: "Click every stroke" },
  { value: "byHand", label: "Distinct pitch per hand (R/L)" },
];

// The three concrete roll types, with the same labels `ROLL_TYPES` already uses for them — reused
// (not retyped by hand) so the "Roll types" picker's own labels can never drift from the Roll type
// dropdown's own wording.
const ROLL_TYPE_PICKER_OPTIONS = ROLL_TYPES.filter(
  (o): o is { value: ConcreteRollType; label: string } => o.value !== "random",
);

export default function StickControl() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const bpm = clampBpm(settings.bpm);
  const {
    rollType,
    enabledRollTypes,
    enabledTripletStickings,
    volume,
    soundId,
    clickMode,
    countOffBars,
    repeats,
    autoAdvance,
    accents,
  } = settings;

  const options: StickControlOptions = { rollType, enabledRollTypes, enabledTripletStickings };
  const playbackSettings: StickControlSettings = {
    bpm,
    volume,
    soundId,
    clickMode,
    countOffBars,
    repeats,
    autoAdvance,
    accents,
  };

  const snapshot = useSyncExternalStore(
    subscribeStickControl,
    getStickControlSnapshot,
    getStickControlServerSnapshot,
  );
  const { running, pattern, nextPattern, phase, currentBarIndex, currentRepeat, currentBeat } =
    snapshot;

  // Structural changes (what shape of pattern to show — which roll type, which concrete types
  // "Random" can land on, or which triplet stickings are even eligible) regenerate a fresh one
  // immediately, mid-playback or not — the same "changing the meter restarts cleanly" behavior
  // Metronome's own structure mode has, needed here because the old pattern's own cell makeup
  // might not even match the new options anymore (a different cell count/rhythm, not just
  // different sticking).
  useEffect(() => {
    updateStickControlOptions(options);
    regenerateStickControlPattern();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollType, enabledRollTypes, enabledTripletStickings]);

  // Playback-only settings (tempo, sound, repeat count, ...) apply live without touching whatever
  // is currently mid-play, the same way Metronome's own bpm/volume/soundId do.
  useEffect(() => {
    updateStickControlSettings(playbackSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, volume, soundId, clickMode, countOffBars, repeats, autoAdvance, accents]);

  const setBpm = (value: number) => updateSettings({ bpm: clampBpm(value) });
  const tap = useTapTempo(setBpm);

  // Clicking a beat in the indicator cycles its accent level, the exact same interaction/semantics
  // as Metronome's own `cycleBeat` — accent → normal → muted → accent.
  function cycleBeat(index: number) {
    updateSettings({
      accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)),
    });
  }

  // Same toggle-in-array shape as `toggleTripletSticking` below — "which of these are eligible to
  // be picked when 'Random' is the roll type."
  function toggleRollType(id: ConcreteRollType) {
    updateSettings({
      enabledRollTypes: enabledRollTypes.includes(id)
        ? enabledRollTypes.filter((x) => x !== id)
        : [...enabledRollTypes, id],
    });
  }

  // Same toggle-in-array shape Scale Trainer's own mode picker already uses for "which of these
  // are eligible to be picked."
  function toggleTripletSticking(id: TripletSticking) {
    updateSettings({
      enabledTripletStickings: enabledTripletStickings.includes(id)
        ? enabledTripletStickings.filter((x) => x !== id)
        : [...enabledTripletStickings, id],
    });
  }

  function start() {
    startStickControl();
  }
  const stop = stopStickControl;
  useSpaceToggle(running ? stop : start);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/random-sticking-warmup", running);

  const phaseLabel =
    phase === "countoff"
      ? "Count-off…"
      : phase === "playing" && repeats > 1
        ? `Repeat ${currentRepeat} of ${repeats}`
        : phase === "playing"
          ? "Playing"
          : null;

  return (
    <ToolLayout
      title="Random Sticking Warmup"
      presets={toolPresets("random-sticking-warmup", settings, updateSettings)}
      layout="stacked"
      topAligned
      options={
        <OptionsCard id="stick-control">
          <OptionSection title="Pattern" icon={ListIcon} summary={ROLL_TYPES.find((r) => r.value === rollType)?.label}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">Roll type</span>
              <Select
                value={rollType}
                onChange={(v) => updateSettings({ rollType: v })}
                options={ROLL_TYPES}
              />
            </label>
            <Hint>
              &quot;Single stroke roll&quot; is the same length/speed as the double-stroke roll,
              just plain alternating R/L instead of the RRLLRRLLR rudiment. &quot;Triplets&quot;
              writes the roll as 8th-note triplets instead, with a random sticking each time —
              straight alternation, or a broken-double shape (RRL or LLR) — rather than always the
              same rudiment. &quot;Random&quot; picks a fresh roll type for every pattern instead
              of sticking to one.
            </Hint>

            {rollType === "random" && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Roll types</span>
                <div className="flex flex-wrap gap-1.5">
                  {ROLL_TYPE_PICKER_OPTIONS.map((opt) => {
                    const selected = enabledRollTypes.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleRollType(opt.value)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-foreground/15 bg-background text-foreground hover:bg-surface-hover"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <Hint>
                  Which roll types &quot;Random&quot; can pick from. Falls back to all three if
                  none are selected.
                </Hint>
              </div>
            )}

            {(rollType === "triplet" ||
              (rollType === "random" &&
                (enabledRollTypes.length === 0 || enabledRollTypes.includes("triplet")))) && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Triplet stickings</span>
                <div className="flex flex-wrap gap-1.5">
                  {TRIPLET_STICKING_OPTIONS.map((opt) => {
                    const selected = enabledTripletStickings.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTripletSticking(opt.value)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-foreground/15 bg-background text-foreground hover:bg-surface-hover"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <Hint>
                  Which of the two triplet stickings can be randomly picked. &quot;Broken
                  double&quot; always plays whichever of RRL/LLR actually fits the hand it needs to
                  start on. Falls back to both if neither is selected.
                </Hint>
              </div>
            )}
          </OptionSection>

          <OptionSection title="Playback" icon={RepeatIcon}>
            <SteppedField
              label="Count-off bars"
              value={countOffBars}
              min={0}
              max={4}
              layout="row"
              size="sm"
              minusOnRight
              onChange={(n) => updateSettings({ countOffBars: n })}
              hint="Plain metronome bars played before the pattern starts, so you come in on time."
            />
            <AdvancedSlider
              label="Repeat count"
              value={repeats}
              unit="x"
              min={1}
              max={100}
              step={1}
              onChange={(n) => updateSettings({ repeats: n })}
              hint="How many times the pattern repeats before stopping (or looping to a new one, with 'New pattern when done'). Defaults to 20."
            />
            <SwitchRow
              label="New pattern when done"
              checked={autoAdvance}
              onChange={(v) => updateSettings({ autoAdvance: v })}
              hint="After the repeat count finishes, automatically shuffle a new pattern and keep going (with a fresh count-off) instead of stopping."
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">Click</span>
              <Select
                value={clickMode}
                onChange={(v) => updateSettings({ clickMode: v })}
                options={CLICK_MODE_OPTIONS}
              />
            </label>
            <Hint>
              &quot;Distinct pitch per hand&quot; clicks a different pitch for every R vs. L
              stroke, so you can hear the sticking even without watching the notation.
            </Hint>
          </OptionSection>

          <OptionSection title="Sound" icon={SpeakerIcon} summary={soundSummary(soundId, volume)}>
            <SoundOptions
              soundId={soundId}
              setSoundId={(v) => updateSettings({ soundId: v })}
              volume={volume}
              setVolume={(v) => updateSettings({ volume: v })}
            />
          </OptionSection>
        </OptionsCard>
      }
    >
      {/* On phones Start comes straight after the tempo and beats (CSS order), so it's on screen
          without scrolling past the patterns; on bigger screens it sits under them. */}
      <div className="flex w-full max-w-5xl flex-col items-center gap-4">
        <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={4} beatUnit={4} onTap={tap} />

        <BeatIndicator
          accents={accents}
          currentBeat={running ? currentBeat : null}
          onCycle={cycleBeat}
        />
      </div>

      <div className="flex w-full flex-col items-center gap-4 max-sm:order-1">
        {/* Deliberately NOT capped at max-w-5xl like the controls above: StickControlStave measures
            its own container's real width (via ResizeObserver) to decide how many bars fit on one
            row, and capping that width artificially forces it to wrap sooner than the screen
            actually requires — reported directly ("the music lines should be able to be in one line
            if the screen is big enough"). The notation gets the full width ToolLayout's own stacked
            layout already gives this page's content section. */}
        {pattern && <StickControlStave pattern={pattern} activeBarIndex={currentBarIndex} />}

        {nextPattern && (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted">Next</p>
            <StickControlStave
              pattern={nextPattern}
              activeBarIndex={null}
              background="background"
            />
          </div>
        )}
      </div>

      {phaseLabel && (
        <p className="-my-2 text-sm font-medium text-accent">{phaseLabel}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => advanceStickControlPattern()}
          className={BIG_SECONDARY}
        >
          New pattern
        </button>
        <button
          type="button"
          onClick={running ? stop : start}
          className={running ? BIG_SECONDARY : BIG_PRIMARY}
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}

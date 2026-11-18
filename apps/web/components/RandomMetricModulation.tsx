"use client";

import { useEffect, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import PanelsToggle from "@/components/PanelsToggle";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Hint from "@/components/Hint";
import SwitchRow from "@/components/SwitchRow";
import {
  BIG_PRIMARY,
  BIG_SECONDARY,
  MeterOptions,
  SoundOptions,
  SteppedField,
  TempoHero,
} from "@/components/MeterFields";
import { ListIcon, MeterIcon, ShuffleIcon, SpeakerIcon } from "@/components/tools";
import { ClickSoundCards, OptionGroup, soundSummary } from "@/components/metronome/MetronomeOptions";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import { BeatLevel, CLICK_SOUNDS, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  NEXT_LEVEL,
  accentsFromGroups,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from "@/lib/meterControls";
import { MODULATIONS } from "@/lib/metricModulation";
import {
  clearMetricModLog,
  getMetricModServerSnapshot,
  getMetricModSnapshot,
  startMetricMod,
  stopMetricMod,
  subscribeMetricMod,
  updateMetricModLiveSettings,
} from "@/lib/metricModulationEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";
import { PoolPill } from "@/components/reward/Reward";

const DEFAULT_BPM = 100;
const MIN_BARS_PER_MODULATION = 1;
const MAX_BARS_PER_MODULATION = 32;

/** The "3:2 polyrhythm" part of a "3:2 polyrhythm — quarter = dotted quarter" label. */
function ratioPart(label: string) {
  return label.split(" — ")[0];
}

/** Just "3:2", for compact spots (toggle chips, log rows) that don't have room to spell it out. */
function shortRatio(label: string) {
  return label.split(" ")[0];
}

const PANEL_IDS = ["meter", "modulation", "reference", "metronome-sound"];
const SETTINGS_KEY = "jam-practice-metric-modulation";
const DEFAULT_SETTINGS = {
  bpm: DEFAULT_BPM,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  minBarsPerModulation: 4,
  matchToRealignment: false,
  enabledRatios: MODULATIONS.map((m) => m.id),
  avoidRepeat: true,
  returnToOriginal: false,
  playOriginalTempo: false,
  referenceMuted: false,
  // A different tone than the main click by default, so the two are easy to tell apart.
  referenceSoundId: "wood",
};

export default function RandomMetricModulation() {
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
  const {
    subdivision,
    volume,
    soundId,
    avoidRepeat,
    returnToOriginal,
    playOriginalTempo,
    referenceMuted,
    referenceSoundId,
    matchToRealignment,
  } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);
  const minBarsPerModulation = Math.min(
    MAX_BARS_PER_MODULATION,
    Math.max(
      MIN_BARS_PER_MODULATION,
      Math.round(settings.minBarsPerModulation),
    ),
  );
  const enabledRatios = settings.enabledRatios.filter((id) =>
    MODULATIONS.some((m) => m.id === id),
  );

  const setBpm = (value: number) => updateSettings({ bpm: clampBpm(value) });
  const setBeatUnit = (beatUnit: number) => updateSettings({ beatUnit });
  const setSubdivision = (subdivision: number) =>
    updateSettings({ subdivision });
  const setVolume = (volume: number) => updateSettings({ volume });
  const setSoundId = (soundId: string) => updateSettings({ soundId });
  const setMinBarsPerModulation = (minBarsPerModulation: number) =>
    updateSettings({ minBarsPerModulation });
  const setMatchToRealignment = (matchToRealignment: boolean) =>
    updateSettings({ matchToRealignment });
  const setAvoidRepeat = (avoidRepeat: boolean) =>
    updateSettings({ avoidRepeat });
  const setReturnToOriginal = (returnToOriginal: boolean) =>
    updateSettings({ returnToOriginal });
  // Turning the previous-tempo click on also forces "Play until tempos realign" on — that's what
  // guarantees the reference click's predicted realignment (see the comment further down, near
  // where that's computed) actually stays true rather than drifting out of sync with the main
  // click, so the two toggles aren't independently choosable while this one's on. Turning it back
  // off just lifts that restriction — matchToRealignment stays however it was left, not reset.
  const setPlayOriginalTempo = (playOriginalTempo: boolean) =>
    updateSettings(
      playOriginalTempo ? { playOriginalTempo, matchToRealignment: true } : { playOriginalTempo },
    );
  const setReferenceMuted = (referenceMuted: boolean) =>
    updateSettings({ referenceMuted });
  const setReferenceSoundId = (referenceSoundId: string) =>
    updateSettings({ referenceSoundId });
  const toggleRatio = (id: string) =>
    updateSettings({
      enabledRatios: enabledRatios.includes(id)
        ? enabledRatios.filter((r) => r !== id)
        : [...enabledRatios, id],
    });

  // The actual engine — click scheduling, modulation planning, running state, and the log — lives
  // in `lib/metricModulationEngine.ts`, a plain module independent of this component's own mount
  // lifecycle (see that file's own doc comment, and `lib/metronomeEngine.ts`'s, for why). This
  // component is just a view: push live-editable settings in, read the snapshot back out.
  const engineState = useSyncExternalStore(
    subscribeMetricMod,
    getMetricModSnapshot,
    getMetricModServerSnapshot,
  );
  const {
    running,
    currentBeat,
    currentSub,
    referenceBeat,
    referenceBpmDisplay,
    preciseBpmDisplay,
    barsIntoInterval,
    effectiveBars,
    lastModulation,
    nextPreview,
    log,
    playingReference,
  } = engineState;

  useEffect(() => {
    updateMetricModLiveSettings({
      beatsPerBar,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
      referenceMuted,
      referenceSoundId,
    });
  }, [beatsPerBar, accents, subdivision, subAccents, volume, soundId, referenceMuted, referenceSoundId]);

  function start() {
    startMetricMod({
      bpm,
      returnToOriginal,
      enabledRatios,
      avoidRepeat,
      matchToRealignment,
      minBarsPerModulation,
      playOriginalTempo,
    });
  }

  const stop = stopMetricMod;

  useSpaceToggle(running ? stop : start);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/random-metric-modulation", running);
  const tap = useTapTempo(setBpm);

  // What Start will do, on the main display ("Tempo changes every 4 bars · 3:2, 2:3, 4:3 and 7
  // more"), so the tool doesn't look like a plain metronome before it runs. Says how many more
  // rather than a trailing "…" that read as cut off; it wraps on a phone.
  const pool = enabledRatios.length ? MODULATIONS.filter((m) => enabledRatios.includes(m.id)) : MODULATIONS;
  const plan = `${
    matchToRealignment
      ? "Tempo changes once the tempos realign"
      : `Tempo changes every ${minBarsPerModulation === 1 ? "bar" : `${minBarsPerModulation} bars`}`
  } · ${pool.slice(0, pool.length > 4 ? 3 : 4).map((m) => shortRatio(m.label)).join(", ")}${pool.length > 4 ? ` and ${pool.length - 3} more` : ""}${returnToOriginal ? " · back to your tempo in between" : ""}`;

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

  return (
    <ToolLayout
      title="Polyrhythm Metric Modulation Metronome"
      presets={toolPresets("random-metric-modulation", settings, updateSettings)}
      credit="Idea by Rob Moreno"
      // Always shown (not only once there's a log), so its row doesn't appear when you start.
      sidePanel={
        <CollapsiblePanel
            id="modulation-log"
            title="History"
            icon={ListIcon}
            summary={log.length > 0 ? `${log.length} tempo change${log.length === 1 ? "" : "s"}` : "None yet"}
          >
            {log.length === 0 && (
              <p className="text-sm text-muted">Each tempo change shows up here while it plays.</p>
            )}
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {[...log].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 border-b border-foreground/10 py-2 text-sm last:border-b-0"
                >
                  <span className="text-xs text-muted">
                    {shortRatio(entry.label)}
                  </span>
                  <span className="tabular-nums font-medium">
                    {Math.round(entry.from)} → {Math.round(entry.to)}
                  </span>
                </div>
              ))}
            </div>
            {log.length > 0 && (
              <button
                type="button"
                onClick={clearMetricModLog}
                className="self-start text-sm font-medium text-muted hover:text-danger"
              >
                Clear log
              </button>
            )}
          </CollapsiblePanel>
      }
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />

          <CollapsiblePanel
            id="meter"
            title="Meter & subdivision"
            icon={MeterIcon}
            summary={`${beatsPerBar}/${beatUnit}`}
          >
            <MeterOptions
              beatsPerBar={beatsPerBar}
              beatUnit={beatUnit}
              accents={accents}
              subdivision={subdivision}
              onChangeBeats={changeBeats}
              onSetBeatUnit={setBeatUnit}
              onSetSubdivision={setSubdivision}
              onApplyGroups={(groups) =>
                updateSettings({
                  beatsPerBar: groups.reduce((a, b) => a + b, 0),
                  accents: accentsFromGroups(groups),
                })
              }
            />
          </CollapsiblePanel>

          <CollapsiblePanel
            id="modulation"
            title="Modulation"
            icon={ShuffleIcon}
            summary={`${
              matchToRealignment
                ? "When tempos realign"
                : `Every ${minBarsPerModulation} bar${minBarsPerModulation === 1 ? "" : "s"}`
            } · ${
              enabledRatios.length === 0 || enabledRatios.length === MODULATIONS.length
                ? "all ratios"
                : enabledRatios.length === 1
                  ? shortRatio(MODULATIONS.find((m) => m.id === enabledRatios[0])!.label)
                  : `${enabledRatios.length} ratios`
            }`}
          >
            <SteppedField
              label={
                matchToRealignment
                  ? "Minimum bars between modulations"
                  : "Bars between modulations"
              }
              value={minBarsPerModulation}
              min={MIN_BARS_PER_MODULATION}
              max={MAX_BARS_PER_MODULATION}
              disabled={running}
              layout="row"
              onChange={setMinBarsPerModulation}
              hint={
                matchToRealignment
                  ? "The interval is stretched to at least this many bars if realigning takes longer."
                  : "How many bars play at a tempo before it jumps to the next."
              }
            />

            <SwitchRow
              label="Play until tempos realign"
              checked={matchToRealignment}
              onChange={setMatchToRealignment}
              disabled={running || playOriginalTempo}
              hint={
                playOriginalTempo
                  ? "Extends each interval to however many bars it takes the new tempo to land back on a downbeat with the reference tempo. Required — and locked on — while the previous tempo click is on, so the two stay in sync; turn that off first to change this."
                  : "Extends each interval to however many bars it takes the new tempo to land back on a downbeat with the reference tempo."
              }
            />
            {/* Says why it's greyed out: the previous tempo click turned it on and holds it there. */}
            {playOriginalTempo && <p className="-mt-1 text-xs text-muted">On while Previous tempo click is on.</p>}

            <SwitchRow
              label="Return to original tempo"
              checked={returnToOriginal}
              onChange={setReturnToOriginal}
              disabled={running}
              hint="Alternates modulating away from and back to the tempo you started at, instead of drifting freely to a new one each time."
            />

            <SwitchRow
              label="Avoid repeating the same polyrhythm"
              checked={avoidRepeat}
              onChange={setAvoidRepeat}
              disabled={running}
              hint="Won't pick the same ratio twice in a row."
            />

            <div className="flex flex-col gap-2 text-sm">
              <span className="font-medium text-muted">
                Polyrhythms in the mix
              </span>
              <Hint>Which ratios can be picked for a modulation.</Hint>
              <div className="flex flex-wrap gap-2">
                {MODULATIONS.map((m) => {
                  const on = enabledRatios.includes(m.id);
                  return (
                    <PoolPill key={m.id} on={on} onClick={() => toggleRatio(m.id)} disabled={running} title={m.label} plainClassName="rounded-md px-3 py-1.5 text-sm font-medium tabular-nums">
                      {shortRatio(m.label)}
                    </PoolPill>
                  );
                })}
              </div>
              {enabledRatios.length === 0 && (
                <p className="text-xs text-muted">
                  None selected — picking from all of them instead.
                </p>
              )}
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            id="reference"
            title="Previous tempo click"
            icon={SpeakerIcon}
            summary={referenceMuted ? "Muted" : CLICK_SOUNDS.find((c) => c.id === referenceSoundId)?.label}
            toggle={{
              checked: playOriginalTempo,
              onChange: setPlayOriginalTempo,
              disabled: running,
            }}
          >
            <OptionGroup title="Click">
              <ClickSoundCards label="Previous tempo click sound" soundId={referenceSoundId} onChange={setReferenceSoundId} volume={volume} />
            </OptionGroup>
            <Hint>
              A different click sound than the main one, so the two are easy to tell apart.
            </Hint>

            <SwitchRow
              label="Mute"
              checked={referenceMuted}
              onChange={setReferenceMuted}
              disabled={!playOriginalTempo}
              hint="Keeps this second click running silently, still shown and counted, just not heard."
            />
          </CollapsiblePanel>

          <CollapsiblePanel
            id="metronome-sound"
            title="Sound"
            icon={SpeakerIcon}
            summary={soundSummary(soundId, volume)}
          >
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
        {running && playingReference && (
          <div className="flex flex-col items-center gap-2 opacity-80">
            <div className="flex flex-col items-center">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {Math.round(referenceBpmDisplay)}
              </span>
              <span className="text-xs text-muted">
                {engineState.returnToOriginal ? "Original" : "Previous"} · {beatsPerBar}/
                {beatUnit}
              </span>
            </div>
            <BeatIndicator
              accents={accents}
              currentBeat={referenceBeat}
              size="sm"
            />
          </div>
        )}

        {/* Starting hides the tempo slider and buttons; the next-modulation card takes their
            place, and an invisible copy of the idle controls holds their height, so the page
            doesn't jump when you start or stop. */}
        <div className="grid w-full justify-items-center">
          {running && (
            <div aria-hidden inert className="invisible w-full [grid-area:1/1]">
              <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={beatsPerBar} beatUnit={beatUnit} onTap={tap} />
            </div>
          )}
          <div className="flex w-full flex-col items-center gap-3 self-start [grid-area:1/1]">
            <TempoHero
              bpm={bpm}
              setBpm={setBpm}
              beatsPerBar={beatsPerBar}
              beatUnit={beatUnit}
              onTap={tap}
              locked={running}
              precise={preciseBpmDisplay}
            />
            {running && nextPreview && (
              <div className="flex items-baseline gap-3 rounded-lg bg-surface px-5 py-2">
                <span className="text-xs text-muted">Next</span>
                <span className="text-2xl font-semibold tabular-nums text-accent">
                  {shortRatio(nextPreview.label)}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {Math.round(nextPreview.toBpm)} BPM
                </span>
              </div>
            )}
          </div>
        </div>
        <BeatIndicator
          accents={accents}
          currentBeat={running ? currentBeat : null}
          onCycle={cycleBeat}
          subdivision={subdivision}
          subAccents={subAccents}
          currentSub={currentSub}
          onCycleSub={cycleSub}
        />

        {/* Always two lines: the plan, then where you are (running) or the last tempo change
            (stopped), so nothing moves when either appears. */}
        <p className="text-balance text-center text-sm text-muted tabular-nums">
          {plan}
          {running ? (
            <span className="block">Bar {barsIntoInterval + 1} of {effectiveBars}</span>
          ) : lastModulation ? (
            <span className="block font-medium text-foreground">
              Modulated {ratioPart(lastModulation.label)}: {Math.round(lastModulation.from)} →{" "}
              {Math.round(lastModulation.to)} BPM
            </span>
          ) : (
            <span aria-hidden className="invisible block">&nbsp;</span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={running ? stop : start}
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

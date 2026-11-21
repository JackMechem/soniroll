"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import Hint from "@/components/Hint";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import KeyHint from "@/components/KeyHint";
import { BIG_PRIMARY, BIG_SECONDARY } from "@/components/MeterFields";
import PanelsToggle from "@/components/PanelsToggle";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import TunesPanel from "@/components/TunesPanel";
import { MetronomeIcon, PlusIcon } from "@/components/tools";
import { STANDARDS, standardToTune } from "@/lib/standards";
import { CountOff, parseBeatsPerBar, playCountOff } from "@/lib/metronome";
import type { BeatLevel } from "@/lib/clickEngine";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useLibraryTunes } from "@/lib/useTuneLists";
import { useTunesToLearn } from "@/lib/useTunesToLearn";
import { Key, Tempo, Tune } from "@/lib/types";
import { useToolActivity } from "@/lib/toolTime";

type PickResult = {
  tune: Tune;
  tempo: Tempo | null;
  key: Key | null;
};

const BAR_OPTIONS = [1, 2, 4, 8, 16].map((n) => ({ value: n, label: String(n) }));
const PANEL_IDS = ["jam-tunes", "jam-countoff"];
const SETTINGS_KEY = "jam-practice-settings-v2";
const DEFAULT_SETTINGS = {
  countOffBars: 8,
  accentFirstBeat: true,
  keepGoingIndefinitely: true,
  pickFromStandards: false,
};

export default function JamPractice() {
  const [tunes, setTunes] = useSyncedTunes();
  // Tunes in the Library's other lists, for the empty message (this picks from Tunes I Know only).
  const [libraryTunes] = useLibraryTunes();
  const [learnTunes] = useTunesToLearn();
  const otherTunes = libraryTunes.length + learnTunes.length;
  const [pick, setPick] = useState<PickResult | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // The tune search, opened from the Picking from chip or the empty state below.
  const [adding, setAdding] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);
  // Counts as practice while the click plays (and the tab's in view). Stop / Esc, or the count-off
  // ending, stop the count: a tune left on screen with nothing playing isn't practice time.
  useToolActivity("/jam-practice", isCounting, { visibleOnly: true });
  const [settings, updateSettings] = usePersistedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const { countOffBars, accentFirstBeat, keepGoingIndefinitely, pickFromStandards } = settings;
  const setCountOffBars = (countOffBars: number) => updateSettings({ countOffBars });
  const setAccentFirstBeat = (accentFirstBeat: boolean) => updateSettings({ accentFirstBeat });
  const setKeepGoingIndefinitely = (keepGoingIndefinitely: boolean) =>
    updateSettings({ keepGoingIndefinitely });

  const countOffRef = useRef<CountOff | null>(null);
  const countOffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      countOffRef.current?.stop();
      if (countOffTimeoutRef.current) clearTimeout(countOffTimeoutRef.current);
    };
  }, []);

  function stopCountOff() {
    countOffRef.current?.stop();
    countOffRef.current = null;
    if (countOffTimeoutRef.current) {
      clearTimeout(countOffTimeoutRef.current);
      countOffTimeoutRef.current = null;
    }
    setIsCounting(false);
    setCurrentBeat(null);
  }

  function pickRandom() {
    stopCountOff();

    if (!pickFromStandards && tunes.length === 0) {
      setPickError("Add a tune or use the jazz standards first.");
      setPick(null);
      return;
    }
    let tune: Tune;
    if (pickFromStandards) {
      // Any of the built-in standards, whether or not they're in your list.
      const standard = STANDARDS[Math.floor(Math.random() * STANDARDS.length)];
      tune = { ...standardToTune(standard), notes: standard.composer };
    } else {
      tune = tunes[Math.floor(Math.random() * tunes.length)];
    }
    const enabledTempos = tune.tempos.filter((t) => t.enabled);
    const enabledKeys = tune.keys.filter((k) => k.enabled);
    const tempo =
      enabledTempos.length > 0
        ? enabledTempos[Math.floor(Math.random() * enabledTempos.length)]
        : null;
    const key =
      enabledKeys.length > 0 ? enabledKeys[Math.floor(Math.random() * enabledKeys.length)] : null;
    setPick({ tune, tempo, key });
    setPickError(null);

    if (tempo) {
      const countOff = playCountOff(
        tempo.value,
        tune.timeSignature,
        countOffBars,
        accentFirstBeat,
        keepGoingIndefinitely,
        setCurrentBeat,
      );
      countOffRef.current = countOff;
      setIsCounting(true);
      if (!keepGoingIndefinitely) {
        countOffTimeoutRef.current = setTimeout(() => {
          countOffRef.current = null;
          countOffTimeoutRef.current = null;
          setIsCounting(false);
        }, countOff.durationMs);
      }
    }
  }

  function handleDeleteTune(id: string) {
    setTunes((prev) => prev.filter((t) => t.id !== id));
    if (pick?.tune.id === id) {
      setPick(null);
      stopCountOff();
    }
  }

  useSpaceToggle(pickRandom);

  const stopRef = useRef(stopCountOff);
  useEffect(() => {
    stopRef.current = stopCountOff;
  });
  useEffect(() => {
    if (!isCounting) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Dialogs and open menus use Escape to close themselves first.
      if (
        document.querySelector(
          "[role='dialog'], [role='alertdialog'], [role='combobox'][aria-expanded='true']",
        )
      ) {
        return;
      }
      stopRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCounting]);

  function handleClearTunes() {
    setTunes([]);
    setPick(null);
    stopCountOff();
  }

  return (
    <ToolLayout
      title="Jam Practice"
      presets={toolPresets("jam-practice", settings, updateSettings)}
      credit="Idea by Rob Moreno"
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />
          <TunesPanel
            onDeleteTune={handleDeleteTune}
            onClearAll={handleClearTunes}
            pickFromStandards={pickFromStandards}
            onPickFromStandardsChange={(checked) => updateSettings({ pickFromStandards: checked })}
            addOpen={adding}
            onAddOpenChange={setAdding}
          />

          {/* The click: how long it counts you in, and whether it keeps going. Its value says what the
              number means ("8-bar count-off", not a bare "8 bars" that could be the tune's length). */}
          <CollapsiblePanel
            id="jam-countoff"
            title="Click"
            icon={MetronomeIcon}
            summary={`${countOffBars}-bar count-off${keepGoingIndefinitely ? ", keeps going" : ""}`}
          >
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Count-off bars</span>
              <Select
                value={countOffBars}
                onChange={setCountOffBars}
                options={BAR_OPTIONS}
                className="min-w-20"
              />
            </label>
            <Hint>
              How many bars click before the tune starts (or, with Keep metronome going on,
              before it hands off to the running metronome).
            </Hint>
            <SwitchRow
              label="Accent"
              checked={accentFirstBeat}
              onChange={setAccentFirstBeat}
              hint="Plays beat 1 of every bar louder and higher-pitched, so you can hear where the bar starts."
            />
            <SwitchRow
              label="Keep metronome going"
              checked={keepGoingIndefinitely}
              onChange={setKeepGoingIndefinitely}
              hint="Keeps clicking at the tune's tempo after the count-off, instead of stopping once it ends."
            />
          </CollapsiblePanel>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        {pick ? (
          <>
            <p className="text-sm text-muted">Now practicing</p>
            <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{pick.tune.name}</h1>
          </>
        ) : tunes.length === 0 && !pickFromStandards ? (
          // Nothing to pick from yet: offer both ways in, right here.
          <div className="flex w-[min(24rem,calc(100cqw-2rem))] flex-col items-center gap-4 rounded-lg border border-dashed border-foreground/15 p-5 text-sm text-muted">
            {otherTunes > 0 ? (
              <p>
                None of your tunes are in Tunes I Know yet. Move some there from your{" "}
                <Link href="/tunes" className="font-medium text-foreground underline underline-offset-2 hover:text-accent">
                  Library
                </Link>
                , or pick from {STANDARDS.length} jazz standards.
              </p>
            ) : (
              <p>Your tune list is empty. Add the tunes you know, or pick from {STANDARDS.length} jazz standards.</p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                <PlusIcon className="h-4 w-4" /> Add a tune
              </button>
              <button
                type="button"
                onClick={() => {
                  updateSettings({ pickFromStandards: true });
                  setPickError(null);
                }}
                className="flex h-10 items-center rounded-md bg-foreground/[0.05] px-3 font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                Use the jazz standards
              </button>
            </div>
          </div>
        ) : (
          <div className="w-[min(24rem,calc(100cqw-2rem))] rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">
            No tune picked yet.
          </div>
        )}
        {/* Only what the tune has: a tune with no tempo or key just shows its time signature. */}
        {pick && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-base text-muted sm:gap-x-6 sm:text-lg">
            {pick.key && <span>{pick.key.value}</span>}
            <span>{pick.tune.timeSignature}</span>
          </div>
        )}
        {pick?.tune.notes && (
          <p className="max-w-md whitespace-pre-wrap text-sm text-muted">{pick.tune.notes}</p>
        )}
        {/* The tempo shows once, big (the line above has the key and time signature). */}
        {pick?.tempo && (
          <div className="mt-4 flex flex-col items-center">
            <span className="text-6xl font-bold tracking-tight tabular-nums sm:text-7xl">
              {pick.tempo.value}
            </span>
            <span className="text-sm text-muted">BPM</span>
          </div>
        )}
        {/* Stays in place (dimmed, still) after Stop, so the buttons below don't jump up. */}
        {pick?.tempo && (
          <div className={`flex flex-col items-center gap-3 transition-opacity ${isCounting ? "" : "opacity-50"}`}>
            <BeatIndicator
              accents={Array.from(
                { length: parseBeatsPerBar(pick.tune.timeSignature) },
                (_, i): BeatLevel => (accentFirstBeat && i === 0 ? 2 : 1),
              )}
              currentBeat={isCounting ? currentBeat : null}
            />
            <span className="text-sm text-muted">
              {!isCounting
                ? "Click stopped"
                : keepGoingIndefinitely
                  ? "Metronome running"
                  : `Counting off ${countOffBars} bar${countOffBars === 1 ? "" : "s"}`}
            </span>
          </div>
        )}
      </div>

      {pickError && tunes.length === 0 && !pickFromStandards && <p className="text-sm text-danger">{pickError}</p>}

      {(pickFromStandards || tunes.length > 0) && (
        <p className="-mb-3 text-sm text-muted">
          {pickFromStandards
            ? `Random picks come from all ${STANDARDS.length} built-in standards, not just your list.`
            : "Random picks come from the tunes in your list."}
        </p>
      )}

      {/* Nothing to pick from (no tunes, standards off): disabled; the empty state above has the
          two ways in. */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {isCounting && (
          <button type="button" onClick={stopCountOff} className={BIG_SECONDARY}>
            Stop
          </button>
        )}
        <button
          type="button"
          onClick={pickRandom}
          disabled={!pickFromStandards && tunes.length === 0}
          title={!pickFromStandards && tunes.length === 0 ? "Add a tune or use the jazz standards first" : undefined}
          className={BIG_PRIMARY}
        >
          {pick ? "Pick another" : "Pick a tune"}
        </button>
      </div>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to pick a tune · <KeyHint.Key>Esc</KeyHint.Key> to
        stop
      </KeyHint>
    </ToolLayout>
  );
}

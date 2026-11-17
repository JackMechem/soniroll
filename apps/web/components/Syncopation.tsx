"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import { TempoHero } from "@/components/MeterFields";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { Field, LevelRow, OptionsSheet, PanelSection } from "@/components/bassgenius/PlayPanel";
import { PresetsSection } from "@/components/PresetsChip";
import { toolPresets } from "@/lib/toolPresets";
import SyncopationScore from "@/components/syncopation/SyncopationScore";
import { DrumIcon, MetronomeIcon, NoteIcon, PlayIcon, ShuffleIcon, SlidersIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from "@/lib/drumSounds";
import { startSyncopation, VOICES, type SyncopationPlayback, type SyncopationRun } from "@/lib/syncopationEngine";
import {
  activeFamilies,
  effectiveOstinato,
  EXERCISE_BARS,
  generateExercise,
  OSTINATOS,
  PHRASE_MODES,
  RHYTHM_FAMILIES,
  TICKS_PER_BEAT,
  type Ostinato,
  type PhraseMode,
  type RhythmFamily,
  type SyncopationBar,
  type SyncopationOptions,
} from "@/lib/syncopation";
import { useTapTempo } from "@/lib/meterControls";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useToolActivity } from "@/lib/toolTime";

type AfterExercise = "new" | "repeat" | "stop";

type Settings = {
  bpm: number;
  families: RhythmFamily[];
  rests: boolean;
  phrase: PhraseMode;
  /** The pattern moves between snare and bass drum at random (over the hand hi-hat). */
  split: boolean;
  ostinato: Ostinato;
  /** Hear the snare part (off: read it against the feet alone). */
  snare: boolean;
  click: boolean;
  countIn: boolean;
  after: AfterExercise;
  volume: number;
  room: number;
};

const SETTINGS_KEY = "jam-practice-syncopation";
const DEFAULT_SETTINGS: Settings = {
  bpm: 80,
  families: ["quarter", "eighth"],
  rests: true,
  phrase: "new",
  split: false,
  ostinato: "kick",
  snare: true,
  click: false,
  countIn: true,
  after: "new",
  volume: 0.8,
  room: 0.4,
};

const AFTER_OPTIONS: { value: AfterExercise; label: string }[] = [
  { value: "new", label: "Go on to a new exercise" },
  { value: "repeat", label: "Play it again" },
  { value: "stop", label: "Stop" },
];

const MIN_BPM = 30;
const MAX_BPM = 240;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Syncopation: random 16-bar snare reading exercises (four 4-bar lines) from the rhythm families
 * switched on, over a steady part in the feet, written out and played on the real kit.
 */
export default function Syncopation() {
  const [settings, update] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const families = useMemo(() => activeFamilies(settings.families), [settings.families]);
  const genOpts: SyncopationOptions = useMemo(
    () => ({ families, rests: settings.rests, phrase: settings.phrase, split: settings.split }),
    [families, settings.rests, settings.phrase, settings.split],
  );
  const ostinato = effectiveOstinato(settings.ostinato, settings.split);
  const playback: SyncopationPlayback = useMemo(
    () => ({ ostinato, snare: settings.snare, click: settings.click }),
    [ostinato, settings.snare, settings.click],
  );

  const [seed, setSeed] = useState(newSeed);
  const preview = useMemo(() => generateExercise(seed, genOpts), [seed, genOpts]);

  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/syncopation", running);
  const [starting, setStarting] = useState(false);
  const [download, setDownload] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  // While playing: every exercise played so far (the engine asks for the next one at the end).
  const [played, setPlayed] = useState<SyncopationBar[][]>([]);
  const [shown, setShown] = useState(0);
  const runRef = useRef<SyncopationRun | null>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  // What the engine reads when an exercise ends (kept in refs: it asks from its own timer).
  const afterRef = useRef(settings.after);
  const genRef = useRef(genOpts);
  useEffect(() => {
    afterRef.current = settings.after;
    genRef.current = genOpts;
  }, [settings.after, genOpts]);

  // Desktop: the settings panel fits the window below where it sits.
  const asideRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = asideRef.current;
      if (!el) return;
      let max = Math.max(240, window.innerHeight - Math.max(16, el.getBoundingClientRect().top) - 24);
      el.style.maxHeight = `${max}px`;
      // The page's padding below the panel isn't counted above: if the panel is what makes the
      // page scroll (it reaches lower than the exercise), take off the overflow too.
      const scroller = el.parentElement?.closest<HTMLElement>(".overflow-y-auto");
      const card = cardRef.current;
      if (!scroller || !card) return;
      const over = scroller.scrollHeight - scroller.clientHeight;
      if (over > 0 && el.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom) {
        max = Math.max(240, max - over);
        el.style.maxHeight = `${max}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("scroll", fit, true);
    // Also when the exercise redraws (it can change height) or the page around it changes size.
    const ro = new ResizeObserver(() => fit());
    if (cardRef.current) ro.observe(cardRef.current);
    const scroller = asideRef.current?.parentElement?.closest<HTMLElement>(".overflow-y-auto");
    if (scroller) ro.observe(scroller);
    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("scroll", fit, true);
      ro.disconnect();
    };
  }, []);

  const setBpm = (v: number) => update({ bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v))) });
  const tap = useTapTempo(setBpm);

  useEffect(() => setDrumsVolume(settings.volume), [settings.volume]);
  useEffect(() => setDrumsRoom(settings.room), [settings.room]);
  useEffect(() => runRef.current?.setBpm(settings.bpm), [settings.bpm]);
  useEffect(() => runRef.current?.setPlayback(playback), [playback]);
  useEffect(() => () => runRef.current?.stop(), []);

  const stop = useCallback(() => {
    runRef.current?.stop();
    runRef.current = null;
    setRunning(false);
    setStarting(false);
    scoreRef.current?.querySelectorAll(".syn-now").forEach((el) => el.classList.remove("syn-now"));
  }, []);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setLoadError(false);
    try {
      if (!drumsReady("sticks", VOICES)) await loadDrums("sticks", setDownload, VOICES);
    } catch {
      setLoadError(true);
      setStarting(false);
      return;
    }
    setDownload(null);
    setDrumsVolume(settings.volume);
    setDrumsRoom(settings.room);
    let list: SyncopationBar[][] = [preview];
    setPlayed(list);
    setShown(0);
    runRef.current = startSyncopation({
      bars: preview,
      bpm: settings.bpm,
      countIn: settings.countIn,
      playback,
      next: () => {
        const after = afterRef.current;
        if (after === "stop") return null;
        const bars = after === "repeat" ? list[list.length - 1] : generateExercise(newSeed(), genRef.current);
        list = [...list, bars];
        setPlayed(list);
        return bars;
      },
      onEnd: () => {
        runRef.current = null;
        setRunning(false);
        scoreRef.current?.querySelectorAll(".syn-now").forEach((el) => el.classList.remove("syn-now"));
      },
    });
    setStarting(false);
    setRunning(true);
  }, [starting, settings.volume, settings.room, settings.bpm, settings.countIn, playback, preview]);

  const toggle = useCallback(() => (running || starting ? stop() : void start()), [running, starting, start, stop]);
  useSpaceToggle(toggle);

  const live = running && played.length > 0;
  const bars = live ? (played[Math.min(shown, played.length - 1)] ?? preview) : preview;

  // Follow the music: which exercise is showing, and the notes being heard lit.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const pos = runRef.current?.position();
      if (!pos) return;
      if (pos.exercise !== shown && pos.bar >= 0) setShown(pos.exercise);
      const key = `${pos.exercise}:${pos.bar}:${pos.tick}`;
      if (key === lastKey) return;
      lastKey = key;
      const root = scoreRef.current;
      if (!root) return;
      root.querySelectorAll(".syn-now").forEach((el) => el.classList.remove("syn-now"));
      if (pos.bar < 0 || pos.exercise !== shown) return;
      for (const dir of ["up", "down"]) {
        let best: Element | null = null;
        let bestTick = -1;
        root.querySelectorAll(`[data-at^="${pos.bar}:"][data-at$=":${dir}"]`).forEach((el) => {
          const t = Number(el.getAttribute("data-at")!.split(":")[1]);
          if (t <= pos.tick && t > bestTick) {
            bestTick = t;
            best = el;
          }
        });
        // Lit for up to a beat (a held half note doesn't stay lit for both beats).
        if (best && pos.tick - bestTick < TICKS_PER_BEAT) (best as Element).classList.add("syn-now");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, shown]);

  const toggleFamily = (id: RhythmFamily) => {
    const on = families.includes(id);
    if (on && families.length === 1) return; // keep at least one
    update({ families: on ? families.filter((f) => f !== id) : [...families, id] });
  };

  const downloading = starting && !running;
  const status = loadError
    ? "Couldn't download the drums — check your connection and try again."
    : downloading
      ? `Downloading the drums… ${Math.round((download ?? 0) * 100)}%`
      : "";

  const familyNames = RHYTHM_FAMILIES.filter((f) => families.includes(f.id)).map((f) => f.short);

  const panel = (
    <div className="shrink-0 overflow-hidden bg-surface text-left lg:rounded-2xl">
      <PresetsSection id="syn-presets" tool={toolPresets("syncopation", settings, update)} />
      <PanelSection id="syn-tempo" title="Tempo" icon={MetronomeIcon} summary={`${settings.bpm} BPM`}>
        <TempoHero bpm={settings.bpm} setBpm={setBpm} beatsPerBar={4} beatUnit={4} onTap={tap} />
      </PanelSection>
      <PanelSection
        id="syn-rhythms"
        title="Rhythms"
        icon={NoteIcon}
        summary={RHYTHM_FAMILIES.filter((f) => families.includes(f.id)).map((f) => f.short).join(" · ")}
      >
        <Field label="In the mix" note="Each beat is drawn from the rhythms switched on.">
          <div className="grid grid-cols-2 gap-1.5">
            {RHYTHM_FAMILIES.map((f) => {
              const on = families.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleFamily(f.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ${on ? "bg-accent text-accent-foreground" : "bg-background text-muted hover:bg-surface-hover"}`}
                >
                  <RhythmGlyph family={f.id} />
                  {f.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Played on" note={settings.split ? "Each note goes to the snare or the bass drum at random, over the hi-hat." : undefined}>
          <Segmented
            label="Played on"
            value={settings.split ? "split" : "snare"}
            onChange={(v) => update({ split: v === "split" })}
            options={[
              { value: "snare", label: "Snare" },
              { value: "split", label: "Snare + bass" },
            ]}
          />
        </Field>
        <SwitchRow label="Rests" checked={settings.rests} onChange={(v) => update({ rests: v })} />
        <Field label="Lines">
          <Select value={settings.phrase} onChange={(v) => update({ phrase: v })} options={PHRASE_MODES.map((m) => ({ value: m.id, label: m.label }))} className="w-full" />
        </Field>
      </PanelSection>
      <PanelSection id="syn-feet" title="Underneath" icon={DrumIcon} summary={OSTINATOS.find((o) => o.id === ostinato)?.label}>
        <Field label="Keep going underneath">
          <Select
            value={ostinato}
            onChange={(v) => update({ ostinato: v })}
            options={OSTINATOS.filter((o) => !(settings.split && o.feet)).map((o) => ({ value: o.id, label: o.label }))}
            className="w-full"
          />
        </Field>
      </PanelSection>
      <PanelSection id="syn-playback" title="Playback" icon={SlidersIcon} summary={AFTER_OPTIONS.find((o) => o.value === settings.after)?.label}>
        <SwitchRow label="Hear the pattern" checked={settings.snare} onChange={(v) => update({ snare: v })} />
        <SwitchRow label="Hi-hat click on every beat" checked={settings.click} onChange={(v) => update({ click: v })} />
        <SwitchRow label="Count-in" checked={settings.countIn} onChange={(v) => update({ countIn: v })} />
        <Field label={`After the ${EXERCISE_BARS} bars`}>
          <Select value={settings.after} onChange={(v) => update({ after: v })} options={AFTER_OPTIONS} className="w-full" />
        </Field>
      </PanelSection>
      <PanelSection id="syn-mix" title="Mix" icon={SpeakerIcon} summary={`${Math.round(settings.volume * 100)}%`}>
        <LevelRow label="Drums" value={settings.volume} onChange={(v) => update({ volume: v })} />
        <LevelRow label="Room" value={settings.room} onChange={(v) => update({ room: v })} />
      </PanelSection>
    </div>
  );

  return (
    <ToolLayout title="Syncopation" layout="stacked" topAligned options={null}>
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className={`flex min-w-40 items-center justify-center gap-2 rounded-full px-8 py-3 text-lg font-semibold ${
              running || downloading ? "bg-surface text-foreground hover:bg-surface-hover" : "bg-accent text-accent-foreground hover:bg-accent-hover"
            }`}
          >
            {running || downloading ? <StopIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            {running || downloading ? "Stop" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label="Options"
            className="flex h-12 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold hover:bg-surface-hover lg:hidden"
          >
            <SlidersIcon className="h-4 w-4" /> Options
          </button>
        </div>
        <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
          {status}
        </p>
      </div>

      <div className="grid w-full max-w-[100rem] gap-6 text-left lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <aside ref={asideRef} aria-label="Settings" className="hidden min-w-0 lg:sticky lg:top-4 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-2xl">
          {panel}
        </aside>
        <div ref={cardRef} className="min-w-0 rounded-2xl bg-surface p-3 sm:p-5">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <h2 className="text-lg font-bold">
                {live ? `Exercise ${Math.min(shown, played.length - 1) + 1}` : "Exercise"}
                <span className="ml-2 text-sm font-normal text-muted">{familyNames.join(" · ")}</span>
              </h2>
              <p className="text-sm text-muted">
                {EXERCISE_BARS} bars in four 4-bar lines · {OSTINATOS.find((o) => o.id === ostinato)?.label.toLowerCase()} underneath
              </p>
            </div>
            {!running && (
              <button
                type="button"
                onClick={() => setSeed(newSeed())}
                className="flex items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover"
              >
                <ShuffleIcon className="h-3.5 w-3.5" /> New exercise
              </button>
            )}
          </div>
          <div ref={scoreRef}>
            <style>{`.syncopation-score g.syn-now{fill:var(--accent);stroke:var(--accent);color:var(--accent)}`}</style>
            <SyncopationScore bars={bars} ostinato={ostinato} />
          </div>
        </div>
      </div>

      <OptionsSheet open={optionsOpen} onClose={closeOptions}>
        {panel}
      </OptionsSheet>
    </ToolLayout>
  );
}

/** A tiny picture of each rhythm family for its toggle. */
function RhythmGlyph({ family }: { family: RhythmFamily }) {
  const stems = family === "quarter" ? 1 : family === "eighth" ? 2 : family === "sixteenth" ? 4 : 3;
  const w = 6 + (stems - 1) * 5;
  return (
    <svg viewBox={`0 0 ${w + 2} 16`} className="h-4 shrink-0" style={{ width: (w + 2) * 1 }} fill="currentColor" stroke="currentColor" aria-hidden>
      {Array.from({ length: stems }, (_, i) => (
        <g key={i}>
          <ellipse cx={3 + i * 5} cy={13} rx={2.4} ry={1.7} stroke="none" />
          <line x1={5.2 + i * 5} y1={13} x2={5.2 + i * 5} y2={2} strokeWidth={1} />
        </g>
      ))}
      {stems > 1 && <line x1={5.2} y1={2.5} x2={5.2 + (stems - 1) * 5} y2={2.5} strokeWidth={1.8} />}
      {family === "sixteenth" && <line x1={5.2} y1={5.5} x2={5.2 + (stems - 1) * 5} y2={5.5} strokeWidth={1.8} />}
    </svg>
  );
}

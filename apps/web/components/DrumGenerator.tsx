"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import { TempoHero } from "@/components/MeterFields";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { Field, LevelRow, OptionsSheet, PanelSection } from "@/components/bassgenius/PlayPanel";
import { PresetsSection } from "@/components/PresetsChip";
import { toolPresets } from "@/lib/toolPresets";
import DrumScore, { DRUM_LEGEND } from "@/components/drumgen/DrumScore";
import { DrumIcon, MetronomeIcon, PlayIcon, ShuffleIcon, SlidersIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { ALL_VOICES, drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from "@/lib/drumSounds";
import { BLOCK_BARS, startDrumGenerator, type DrumBlock, type DrumGeneratorRun } from "@/lib/drumGeneratorEngine";
import {
  CLAVE_LABEL,
  claveDirectionMatters,
  claveKindsFor,
  COUNTRIES,
  DRUM_STYLES,
  generateGroove,
  mainTimeVoice,
  resolveClave,
  styleById,
  TIME_VOICES,
  type ClaveChoice,
  type ClaveSide,
  type GrooveOptions,
  type HandChoice,
} from "@/lib/drumStyles";
import type { DrumVoice } from "@/lib/drums";
import { useTapTempo } from "@/lib/meterControls";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useToolActivity } from "@/lib/toolTime";

type Settings = {
  style: string;
  /** Tempo per style (each style keeps its own). */
  tempos: Record<string, number>;
  /** Clave direction per style (styles in clave). */
  claves: Record<string, ClaveSide>;
  /** Old single switch (clave on the woodblock); read as `blocks` "style" when that's unset. */
  claveOnBlock: boolean;
  /** Per style: what the cross-stick plays, what the woodblock plays, the timekeeping instrument. */
  crossSticks: Record<string, ClaveChoice>;
  blocks: Record<string, ClaveChoice>;
  hands: Record<string, HandChoice>;
  /** A fill every this many bars; 0 = none. */
  fillEvery: number;
  /** 0–1: how often the drummer moves off the basic pattern. */
  variation: number;
  /** 0–1: timing looseness and level variation. */
  humanize: number;
  countIn: boolean;
  volume: number;
  room: number;
  /** Each kit part's fader, 0–1 (0.5 = as recorded, 1 = +6 dB, 0 = off); missing = 0.5. */
  parts: Record<string, number>;
};

const SETTINGS_KEY = "jam-practice-drum-generator";
const DEFAULT_SETTINGS: Settings = {
  style: "bossa-nova",
  tempos: {},
  claves: {},
  claveOnBlock: false,
  crossSticks: {},
  blocks: {},
  hands: {},
  fillEvery: 8,
  variation: 0.5,
  humanize: 0.5,
  countIn: true,
  volume: 0.8,
  room: 0.5,
  parts: {},
};

const FILL_OPTIONS = [
  { value: 0, label: "No fills" },
  { value: 4, label: "Every 4 bars" },
  { value: 8, label: "Every 8 bars" },
  { value: 16, label: "Every 16 bars" },
];

/** The kit, as a mixer sees it: one fader per part (a part can be several sounds). */
const KIT_PARTS: { id: string; label: string; voices: DrumVoice[] }[] = [
  { id: "kick", label: "Bass drum", voices: ["kick"] },
  { id: "snare", label: "Snare", voices: ["snare", "rimshot"] },
  { id: "crossStick", label: "Cross-stick", voices: ["crossStick"] },
  { id: "hihat", label: "Hi-hat", voices: ["hhClosed", "hhOpen"] },
  { id: "pedal", label: "Hi-hat foot", voices: ["pedal"] },
  { id: "ride", label: "Ride", voices: ["ride", "bell"] },
  { id: "crash", label: "Crash", voices: ["crash"] },
  { id: "toms", label: "Toms", voices: ["tomHigh", "tomLow"] },
  { id: "cowbell", label: "Cowbell", voices: ["cowbell"] },
  { id: "block", label: "Woodblock", voices: ["block"] },
];
const PART_DEFAULT = 0.5;
/** Fader position → gain: linear, 0.5 = unity, 1 = ×2 (+6 dB). */
const partGain = (v: number) => v / PART_DEFAULT;
const dbLabel = (v: number) => {
  if (v <= 0.001) return "Off";
  const db = 20 * Math.log10(partGain(v));
  return Math.abs(db) < 0.05 ? "0 dB" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
};

/** One kit part's fader (double-click resets it). */
function PartFader({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted tabular-nums">{dbLabel(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(PART_DEFAULT)}
        style={{ "--progress": `${value * 100}%` } as React.CSSProperties}
        className="slider h-6 w-full cursor-pointer"
        aria-label={`${label} level`}
        title="Double-click to reset"
      />
    </div>
  );
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Drum Generator: a drummer on a real kit (the Virtuosity Drums samples Bass Genius uses) playing
 * jazz and Latin American grooves (grouped by country), written out on a percussion staff as it plays.
 */
export default function DrumGenerator() {
  const [settings, update] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const style = styleById(settings.style);
  const bpm = settings.tempos[style.id] ?? style.tempo.initial;
  const clave: ClaveSide = settings.claves[style.id] ?? style.clave?.written ?? "2-3";
  const crossStick: ClaveChoice = settings.crossSticks[style.id] ?? "style";
  const blockChoice: ClaveChoice = settings.blocks[style.id] ?? (settings.claveOnBlock && style.clave ? "style" : "off");
  const hand: HandChoice = settings.hands[style.id] ?? "style";
  const opts: GrooveOptions = useMemo(
    () => ({ clave, crossStick, block: blockChoice, hand, fillEvery: settings.fillEvery, variation: settings.variation }),
    [clave, crossStick, blockChoice, hand, settings.fillEvery, settings.variation],
  );

  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/drum-generator", running);
  const [starting, setStarting] = useState(false);
  const [download, setDownload] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  const [seed, setSeed] = useState(newSeed);
  const [blocks, setBlocks] = useState<DrumBlock[]>([]);
  const [shownBlock, setShownBlock] = useState(0);
  const runRef = useRef<DrumGeneratorRun | null>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  // Desktop: the settings panel fits the window below where it sits (it sticks near the top as
  // the page scrolls), so its bottom is never off screen.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = asideRef.current;
      if (!el) return;
      el.style.maxHeight = `${Math.max(240, window.innerHeight - Math.max(16, el.getBoundingClientRect().top) - 24)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("scroll", fit, true);
    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("scroll", fit, true);
    };
  }, []);

  const setBpm = (v: number) => update({ tempos: { ...settings.tempos, [style.id]: Math.max(style.tempo.min, Math.min(style.tempo.max, Math.round(v))) } });
  const tap = useTapTempo(setBpm);

  useEffect(() => setDrumsVolume(settings.volume), [settings.volume]);
  useEffect(() => setDrumsRoom(settings.room), [settings.room]);
  useEffect(() => runRef.current?.setBpm(bpm), [bpm]);
  useEffect(() => runRef.current?.setHumanize(settings.humanize), [settings.humanize]);
  // The kit parts' faders, as a gain per sound.
  const voiceGains = useMemo(() => {
    const g: Partial<Record<DrumVoice, number>> = {};
    for (const p of KIT_PARTS) for (const v of p.voices) g[v] = partGain(settings.parts[p.id] ?? PART_DEFAULT);
    return g;
  }, [settings.parts]);
  useEffect(() => runRef.current?.setVoiceGains(voiceGains), [voiceGains]);
  // A new style or new options while playing: from the next bar line.
  useEffect(() => runRef.current?.setGroove(style, opts), [style, opts]);
  useEffect(() => () => runRef.current?.stop(), []);

  const stop = useCallback(() => {
    runRef.current?.stop();
    runRef.current = null;
    setRunning(false);
    setStarting(false);
  }, []);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setLoadError(false);
    try {
      if (!drumsReady("sticks", ALL_VOICES)) await loadDrums("sticks", setDownload, ALL_VOICES);
    } catch {
      setLoadError(true);
      setStarting(false);
      return;
    }
    setDownload(null);
    setDrumsVolume(settings.volume);
    setDrumsRoom(settings.room);
    setShownBlock(0);
    runRef.current = startDrumGenerator({ style, opts, bpm, seed, countIn: settings.countIn, humanize: settings.humanize, voiceGains, onWrite: setBlocks });
    setStarting(false);
    setRunning(true);
  }, [starting, settings.volume, settings.room, settings.countIn, settings.humanize, voiceGains, style, opts, bpm, seed]);

  const toggle = useCallback(() => (running || starting ? stop() : void start()), [running, starting, start, stop]);
  useSpaceToggle(toggle);

  // Stopped: the first 8 bars the current settings would play (Play plays exactly these).
  const previewOpts = useDeferredValue(opts);
  const preview = useMemo<DrumBlock>(
    () => ({ start: 0, style, seed, bars: generateGroove(style, 0, BLOCK_BARS, seed, previewOpts) }),
    [style, seed, previewOpts],
  );
  const live = running && blocks.length > 0;
  const block = live ? (blocks[Math.min(shownBlock, blocks.length - 1)] ?? blocks[0]) : preview;

  // While playing: follow the music — which block is showing, and the note being heard lit.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const run = runRef.current;
      if (!run) return;
      const pos = run.position();
      if (pos < 0) return;
      const idx = blocks.findIndex((b, i) => pos >= b.start && (i === blocks.length - 1 || pos < blocks[i + 1].start));
      if (idx < 0) return;
      if (idx !== shownBlock) setShownBlock(idx);
      const b = blocks[idx];
      const rel = pos - b.start;
      const bar = Math.floor(rel / b.style.beats);
      const step = Math.floor((rel - bar * b.style.beats) * b.style.stepsPerBeat + 1e-6);
      const key = `${idx}:${bar}:${step}`;
      if (key === lastKey) return;
      lastKey = key;
      const root = scoreRef.current;
      if (!root) return;
      root.querySelectorAll(".drum-now").forEach((el) => el.classList.remove("drum-now"));
      for (const dir of ["up", "down"]) {
        let best: Element | null = null;
        let bestStep = -1;
        root.querySelectorAll(`[data-at^="${bar}:"][data-at$=":${dir}"]`).forEach((el) => {
          const s = Number(el.getAttribute("data-at")!.split(":")[1]);
          if (s <= step && s > bestStep) {
            bestStep = s;
            best = el;
          }
        });
        if (best && step - bestStep < b.style.stepsPerBeat) (best as Element).classList.add("drum-now");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, blocks, shownBlock]);

  const downloading = starting && !running;
  const status = loadError
    ? "Couldn't download the drums — check your connection and try again."
    : downloading
      ? `Downloading the drums… ${Math.round((download ?? 0) * 100)}%`
      : "";

  // The key under the staff: every drum the style can use (from its patterns, not from one
  // random take, so it's the same on the server and in the browser).
  const legendVoices = useMemo(() => {
    const st = block.style;
    const set = new Set<string>();
    if (st.swing) ["ride", "pedal", "kick", ...(st.swing.comping ? ["snare", "crash"] : [])].forEach((v) => set.add(v));
    for (const lanes of [st.lanes ?? {}, ...(st.variations ?? []).map((v) => v.lanes)])
      for (const [v, l] of Object.entries(lanes)) if (l) set.add(v === "hhOpen" ? "hhClosed" : v);
    if (!st.swing && settings.fillEvery > 0) ["snare", "tomHigh", "tomLow", "crash"].forEach((v) => set.add(v));
    // The hand on the instrument chosen (unless the drummer's free to move between them).
    const main = mainTimeVoice(st);
    const handVoice = main && hand !== "style" && hand !== "auto" ? hand : main;
    if (main && hand !== "auto") {
      for (const t of TIME_VOICES) if (t.id !== handVoice && !Object.entries(st.lanes ?? {}).some(([v, l]) => v === t.id && l && v !== main)) set.delete(t.id);
      set.add(handVoice!);
    }
    if (crossStick === "off") set.delete("crossStick");
    else if (resolveClave(st, crossStick, "crossStick")) set.add("crossStick");
    if (resolveClave(st, blockChoice, "block")) set.add("block");
    return set;
  }, [block.style, settings.fillEvery, hand, crossStick, blockChoice]);

  // The faders shown: the parts this style plays (the open hi-hat counts as the hi-hat).
  const partInUse = useMemo(() => new Set<string>([...legendVoices, ...(legendVoices.has("hhClosed") ? ["hhOpen"] : [])]), [legendVoices]);

  const panel = (
    <div className="shrink-0 overflow-hidden bg-surface text-left lg:rounded-2xl">
      <PresetsSection id="dg-presets" tool={toolPresets("drum-generator", settings, update)} />
      <PanelSection id="dg-tempo" title="Tempo" icon={MetronomeIcon} summary={`${bpm} BPM`}>
        <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={style.meter.top} beatUnit={style.meter.bottom} onTap={tap} />
        {style.meter.bottom === 8 && <p className="-mt-2 text-center text-xs text-muted">Dotted quarter = {bpm}</p>}
      </PanelSection>
      <PanelSection id="dg-style" title="Style" icon={DrumIcon} summary={`${style.name} · ${COUNTRIES.find((c) => c.id === style.country)?.label ?? ""}`}>
        {COUNTRIES.filter((c) => DRUM_STYLES.some((s) => s.country === c.id)).map((f) => (
          <Field key={f.id} label={f.label}>
            <div className="flex flex-wrap gap-1.5">
              {DRUM_STYLES.filter((s) => s.country === f.id).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => update({ style: s.id })}
                  aria-pressed={s.id === style.id}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${s.id === style.id ? "bg-accent text-accent-foreground" : "bg-background hover:bg-surface-hover"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Field>
        ))}
      </PanelSection>
      <PanelSection id="dg-feel" title="Feel" icon={SlidersIcon} summary={`${FILL_OPTIONS.find((o) => o.value === settings.fillEvery)?.label ?? ""}`}>
        {mainTimeVoice(style) && (
          <Field label="Timekeeping">
            <Select
              value={hand}
              onChange={(v) => update({ hands: { ...settings.hands, [style.id]: v } })}
              options={[
                { value: "style" as HandChoice, label: `${TIME_VOICES.find((t) => t.id === mainTimeVoice(style))?.label} (the style's own)` },
                ...TIME_VOICES.filter((t) => t.id !== mainTimeVoice(style)).map((t) => ({ value: t.id as HandChoice, label: t.label })),
                { value: "auto" as HandChoice, label: "Automatic (moves between them)" },
              ]}
              className="w-full"
            />
          </Field>
        )}
        {claveKindsFor(style).length > 0 && (
          <>
            <Field label="Cross-stick">
              <Select
                value={crossStick}
                onChange={(v) => update({ crossSticks: { ...settings.crossSticks, [style.id]: v } })}
                options={[
                  ...(style.lanes?.crossStick || style.variations?.some((v) => v.lanes.crossStick) ? [{ value: "style" as ClaveChoice, label: "The style's own part" }] : [{ value: "style" as ClaveChoice, label: "None (the style has none)" }]),
                  ...claveKindsFor(style).map((k) => ({ value: k as ClaveChoice, label: CLAVE_LABEL[k] })),
                  ...(style.lanes?.crossStick ? [{ value: "off" as ClaveChoice, label: "None" }] : []),
                ]}
                className="w-full"
              />
            </Field>
            <Field label="Woodblock">
              <Select
                value={blockChoice}
                onChange={(v) => update({ blocks: { ...settings.blocks, [style.id]: v } })}
                options={[
                  { value: "off" as ClaveChoice, label: "None" },
                  ...(style.clave ? [{ value: "style" as ClaveChoice, label: `The style's clave (${CLAVE_LABEL[style.clave.kind].toLowerCase()})` }] : []),
                  ...claveKindsFor(style)
                    .filter((k) => k !== style.clave?.kind)
                    .map((k) => ({ value: k as ClaveChoice, label: CLAVE_LABEL[k] })),
                ]}
                className="w-full"
              />
            </Field>
          </>
        )}
        {claveDirectionMatters(style, opts) && (
          <Field label="Clave direction">
            <Segmented
              label="Clave direction"
              value={clave}
              onChange={(v) => update({ claves: { ...settings.claves, [style.id]: v } })}
              options={[
                { value: "3-2", label: "3-2" },
                { value: "2-3", label: "2-3" },
              ]}
            />
          </Field>
        )}
        <Field label="Fills">
          <Select value={settings.fillEvery} onChange={(v) => update({ fillEvery: v })} options={FILL_OPTIONS} className="w-full" />
        </Field>
        <LevelRow label="Variation" value={settings.variation} onChange={(v) => update({ variation: v })} />
        <LevelRow label="Human feel" value={settings.humanize} onChange={(v) => update({ humanize: v })} />
        <SwitchRow label="Count-in" checked={settings.countIn} onChange={(v) => update({ countIn: v })} />
      </PanelSection>
      <PanelSection id="dg-mix" title="Mix" icon={SpeakerIcon} summary={`${Math.round(settings.volume * 100)}%`}>
        <LevelRow label="Drums" value={settings.volume} onChange={(v) => update({ volume: v })} />
        <LevelRow label="Room" value={settings.room} onChange={(v) => update({ room: v })} />
        <div className="flex items-baseline justify-between border-t border-foreground/10 pt-3">
          <span className="text-xs font-semibold text-muted">Kit</span>
          {Object.keys(settings.parts).length > 0 && (
            <button type="button" onClick={() => update({ parts: {} })} className="text-xs font-semibold text-accent hover:underline">
              Reset kit
            </button>
          )}
        </div>
        {KIT_PARTS.filter((p) => p.voices.some((v) => partInUse.has(v))).map((p) => (
          <PartFader
            key={p.id}
            label={p.label}
            value={settings.parts[p.id] ?? PART_DEFAULT}
            onChange={(v) => {
              const parts = { ...settings.parts, [p.id]: v };
              if (Math.abs(v - PART_DEFAULT) < 0.005) delete parts[p.id];
              update({ parts });
            }}
          />
        ))}
      </PanelSection>
    </div>
  );

  // Bar numbers count from the first bar played.
  const firstBar = live ? Math.round(block.start / block.style.beats) + 1 : 1;

  return (
    <ToolLayout title="Drum Generator" layout="stacked" topAligned options={null}>
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
        <div className="min-w-0 rounded-2xl bg-surface p-3 sm:p-5">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <h2 className="text-lg font-bold">
                {block.style.name}
                <span className="ml-2 text-sm font-normal text-muted">{COUNTRIES.find((c) => c.id === block.style.country)?.label}</span>
                {claveDirectionMatters(block.style, opts) && <span className="ml-2 text-sm font-normal text-muted">· {clave} clave</span>}
              </h2>
              <p className="max-w-2xl text-sm text-muted">{block.style.about}</p>
            </div>
            {!live && (
              <button
                type="button"
                onClick={() => setSeed(newSeed())}
                className="flex items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-semibold hover:bg-surface-hover"
              >
                <ShuffleIcon className="h-3.5 w-3.5" /> New groove
              </button>
            )}
          </div>
          <div ref={scoreRef}>
            <style>{`.drum-score g.drum-now{fill:var(--accent);stroke:var(--accent);color:var(--accent)}`}</style>
            <DrumScore style={block.style} bars={block.bars} firstBar={firstBar} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
            {DRUM_LEGEND.filter((l) => legendVoices.has(l.voice)).map((l) => (
              <span key={l.voice}>
                <span className="font-semibold text-foreground">{NOTEHEAD_HINT[l.voice] ?? "●"}</span> {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <OptionsSheet open={optionsOpen} onClose={closeOptions}>
        {panel}
      </OptionsSheet>
    </ToolLayout>
  );
}

/** A plain-text stand-in for each notehead in the key under the staff. */
const NOTEHEAD_HINT: Partial<Record<string, string>> = {
  crash: "× top",
  hhClosed: "× (o = open)",
  ride: "×",
  bell: "◆",
  cowbell: "▲ high",
  crossStick: "⊗",
  block: "▲ low",
  pedal: "× below",
};

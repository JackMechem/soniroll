"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import BassPlayersTab from "@/components/bassgenius/BassPlayersTab";
import TranscriptionScore from "@/components/notation/Score";
import PhraseDialog from "@/components/bassgenius/PhraseDialog";
import { Field, LevelRow, OptionsSheet, PanelSection } from "@/components/bassgenius/PlayPanel";
import { PresetsSection } from "@/components/PresetsChip";
import { toolPresets } from "@/lib/toolPresets";
import { TempoHero } from "@/components/MeterFields";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { BassIcon, ChordChartIcon, ChordIcon, DrumIcon, EyeIcon, EyeOffIcon, MetronomeIcon, PlayIcon, ShuffleIcon, SlidersIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { BASS_PLAYERS, type BassFeel, type BassNote, type BassPhrase, type BassTouch, type PerformedBeat } from "@/lib/bassLine";
import { chorusToTranscription } from "@/lib/bassLineScore";
import { analyzeStyle } from "@/lib/bassStyle";
import { learnModel } from "@/lib/bassLearned";
import { useBassPlayers, usePlayerTranscriptions } from "@/lib/useBassPlayers";
import { previewChorus, startBassGenius, type BassGeniusRun, type BassSwing } from "@/lib/bassGeniusEngine";
import { compReady, loadComp, setCompRoom, setCompVolume, type CompInstrument } from "@/lib/compSounds";
import type { CompStyle } from "@/lib/comping";
import { DEFAULT_DRUM_CONFIG, drumConfigOf, type DrumConfig, type DrumKit } from "@/lib/drums";
import DrumSettingsDialog from "@/components/bassgenius/DrumSettingsDialog";
import { drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from "@/lib/drumSounds";
import { formatComposer, KEY_NAMES, prettyQuality, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { useTapTempo } from "@/lib/meterControls";
import { loadUprightBass, setUprightBassRoom, setUprightBassVolume, uprightBassReady } from "@/lib/uprightBass";
import { parseTypedProgression } from "@/lib/typedProgression";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";

type Settings = {
  /** Play along, or manage bass players and their transcriptions. */
  tab: "play" | "players";
  /** Play over one of your charts, or a progression typed in. */
  source: "chart" | "typed";
  chartId: string;
  /** The typed progression — chord names or roman numerals, "|" between bars. */
  typedText: string;
  /** Key the typed numerals are in (a `KEY_NAMES` entry). */
  typedKey: string;
  typedMeter: "4/4" | "3/4";
  /** "computer", or the id of one of your bass players (who plays from their transcriptions). */
  player: string;
  /** For one of your players: copy phrases from their transcriptions, or write new lines in
      their style. */
  playerMode: "copy" | "learn";
  feel: BassFeel;
  touch: BassTouch;
  bpm: number;
  /** 0 = keep going until stopped. */
  choruses: number;
  countIn: boolean;
  click: boolean;
  /** Off-beat eighths pushed late; "auto" follows the tempo. */
  swing: BassSwing;
  volume: number;
  room: boolean;
  /** Chords under the bass: off, or a piano / Rhodes comping the changes. */
  chords: "off" | CompInstrument;
  chordStyle: CompStyle;
  chordVolume: number;
  /** A drummer swinging along (sticks), or none. */
  drums: "off" | DrumKit;
  drumsVolume: number;
  /** The drummer comping (snare chatter, accents marking sections) or just keeping time. */
  drumsComping: boolean;
  /** The drum settings dialog's values. */
  drumConfig: DrumConfig;
  /** Hi-hat click level, 0–1. */
  clickVolume: number;
  /** How much room sound (reverb), 0–1, when Room is on. */
  roomAmount: number;
  /** "" = the chart's own key. */
  transposeKey: string;
  /** Desktop: the chord chart beside the bass line (or hidden). */
  showChart: boolean;
};

const SETTINGS_KEY = "jam-practice-bass-genius";
const DEFAULT_SETTINGS: Settings = {
  tab: "play",
  source: "chart",
  chartId: "",
  typedText: "ii7 | V7 | Imaj7 | %",
  typedKey: "C",
  typedMeter: "4/4",
  player: "computer",
  playerMode: "copy",
  feel: "walking",
  touch: "medium",
  bpm: 140,
  choruses: 0,
  countIn: true,
  click: false,
  swing: "auto",
  volume: 0.85,
  room: true,
  chords: "off",
  chordStyle: "comp",
  chordVolume: 0.6,
  clickVolume: 0.6,
  drums: "off",
  drumsVolume: 0.7,
  drumsComping: false,
  drumConfig: DEFAULT_DRUM_CONFIG,
  roomAmount: 0.5,
  transposeKey: "",
  showChart: true,
};

const noop = () => {};

/** Each phrase of a chorus as a range of the chorus's bars (0-based). */
function barsOfPhrases(c: { beats: PerformedBeat[]; start: number; phrases: BassPhrase[] }): { from: number; to: number }[] {
  const barOf: number[] = [];
  let bar = -1;
  c.beats.forEach((b, i) => {
    if (b.beatInBar === 0 || i === 0) bar++;
    barOf.push(bar);
  });
  return c.phrases.map((p) => {
    const a = p.beat - c.start;
    return { from: barOf[a] ?? 0, to: barOf[Math.min(a + p.length - 1, barOf.length - 1)] ?? 0 };
  });
}

const SWING_OPTIONS: { value: BassSwing; label: string }[] = [
  { value: "auto", label: "Swing (by tempo)" },
  { value: "light", label: "Light swing" },
  { value: "hard", label: "Hard swing" },
  { value: "straight", label: "Straight" },
];

const CHORUS_OPTIONS = [
  { value: 0, label: "Keep going" },
  ...[1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: n === 1 ? "Once through" : `${n} choruses` })),
];
/** Starting points for the typed progression. */
const PRESETS: { label: string; text: string }[] = [
  { label: "ii–V–I", text: "ii7 | V7 | Imaj7 | %" },
  { label: "Minor ii–V–i", text: "iiø7 | V7b9 | i-6 | %" },
  { label: "I–vi–ii–V", text: "Imaj7 | vi7 | ii7 | V7" },
  { label: "Jazz blues", text: "I7 | IV7 | I7 | v7 I7 | IV7 | #ivo7 | I7 | VI7 | ii7 | V7 | I7 VI7 | ii7 V7" },
  { label: "Rhythm changes A", text: "Imaj7 vi7 | ii7 V7 | iii7 VI7 | ii7 V7 | v7 I7 | IV7 #ivo7 | iii7 VI7 | ii7 V7" },
];
const METERS = { "4/4": { top: 4, bottom: 4 }, "3/4": { top: 3, bottom: 4 } } as const;

const TOUCH_OPTIONS: { value: BassTouch; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

/**
 * Bass Genius: pick one of your chord charts and a sampled jazz upright walks (or plays a two-feel
 * over) the changes, following the chart's repeats, endings and D.C./coda. The bass line is
 * written by a "player" (`packages/core/bassLine.ts`) — just "Computer" for now; players modelled
 * on real bassists come later.
 */
export default function BassGenius() {
  const [settings, update] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const { tab, source, chartId, typedText, typedKey, typedMeter, player, playerMode, feel, touch, bpm, choruses, countIn, click, swing, volume, room, transposeKey, chords, chordStyle, chordVolume, clickVolume, roomAmount, drumsVolume, drumsComping } = settings;
  // Brushes were dropped; a saved "brushes" plays sticks.
  const drums: "off" | DrumKit = settings.drums === "off" ? "off" : "sticks";
  const drumConfig = useMemo(() => drumConfigOf(settings.drumConfig), [settings.drumConfig]);
  const [drumSettingsOpen, setDrumSettingsOpen] = useState(false);
  // Phones: the options panel opens as a sheet.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);
  const typed = source === "typed";
  const { selectedSong, selectedSongLoading, allSongs, loading } = useChordChartsLibrary(!typed && chartId ? chartId : null);
  const meta = allSongs.find((s) => s.id === chartId) ?? null;

  const chartSong = useMemo(() => {
    if (!selectedSong || !transposeKey) return selectedSong;
    const semis = (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selectedSong.key) + 12) % 12;
    return semis ? transposeSong(selectedSong, semis) : selectedSong;
  }, [selectedSong, transposeKey]);
  const typedResult = useMemo(
    () => parseTypedProgression(typedText, Math.max(0, KEY_NAMES.indexOf(typedKey)), METERS[typedMeter] ?? METERS["4/4"]),
    [typedText, typedKey, typedMeter],
  );
  const song = typed ? typedResult.song : chartSong;

  // A player of your own: their transcriptions, analysed, are what the line is made from.
  const { players, loading: playersLoading } = useBassPlayers();
  const customPlayer = player === "computer" ? null : (players.find((p) => p.id === player) ?? null);
  const playerTranscriptions = usePlayerTranscriptions(customPlayer?.id ?? null, customPlayer?.name);
  const style = useMemo(
    () => (customPlayer && playerTranscriptions ? analyzeStyle(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions],
  );
  const model = useMemo(
    () => (customPlayer && playerTranscriptions && playerMode === "learn" ? learnModel(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions, playerMode],
  );
  const learning = !!customPlayer && playerMode === "learn";
  const styleLoading = !!customPlayer && playerTranscriptions === undefined;


  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/bass-genius", running);
  const [download, setDownload] = useState<number | null>(uprightBassReady() ? 1 : null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState<{ beat: number; info: PerformedBeat | null } | null>(null);
  const runRef = useRef<BassGeniusRun | null>(null);
  // The line as it's written (a chorus ahead of the music), for showing it on a staff.
  const [writtenChoruses, setWrittenChoruses] = useState<{ chorus: number; notes: BassNote[]; beats: PerformedBeat[]; start: number; phrases: BassPhrase[] }[]>([]);
  // The phrase whose working is open (index into the shown chorus's phrases).
  const [opened, setOpened] = useState<{ chorus: number; index: number } | null>(null);
  const [viewChorus, setViewChorus] = useState(0);
  // The line's seed: the preview shows the first chorus this seed writes with the current settings,
  // and Play uses the same seed, so it plays what's shown. "New line" picks another.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const scoreBoxRef = useRef<HTMLDivElement>(null);
  // Desktop: the settings panel is as tall as the window has room for below where it sits now (it
  // starts lower down, then sticks near the top as the page scrolls), so its bottom is never off
  // screen.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = asideRef.current;
      if (!el) return;
      const top = Math.max(16, el.getBoundingClientRect().top);
      el.style.maxHeight = `${Math.max(240, window.innerHeight - top - 24)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    document.addEventListener("scroll", fit, true); // the app scrolls an inner element
    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("scroll", fit, true);
    };
  }, [tab]);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => setUprightBassVolume(volume), [volume]);
  useEffect(() => setUprightBassRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setBpm(bpm), [bpm]);
  useEffect(() => runRef.current?.setClick(click), [click]);
  useEffect(() => runRef.current?.setSwing(swing), [swing]);
  useEffect(() => setCompVolume(chordVolume), [chordVolume]);
  useEffect(() => setCompRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setClickVolume(clickVolume), [clickVolume]);
  useEffect(() => setDrumsVolume(drumsVolume), [drumsVolume]);
  useEffect(() => runRef.current?.setDrumsComping(drumsComping), [drumsComping]);
  useEffect(() => runRef.current?.setDrumConfig(drumConfig), [drumConfig]);
  useEffect(() => setDrumsRoom(room ? roomAmount : 0), [room, roomAmount]);
  // Drums switched on (or changed) while playing: load the kit, then bring it in.
  const [drumDownload, setDrumDownload] = useState<number | null>(null);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (drums === "off") return run.setDrums(null);
    if (drumsReady(drums)) return run.setDrums(drums);
    let live = true;
    loadDrums(drums, (f) => live && setDrumDownload(f))
      .then(() => {
        if (live) {
          setDrumDownload(null);
          runRef.current?.setDrums(drums);
        }
      })
      .catch(() => live && setDrumDownload(null));
    return () => {
      live = false;
    };
  }, [drums, running]);
  // Chords switched on (or changed) while playing: load the instrument, then bring it in.
  const [chordDownload, setChordDownload] = useState<number | null>(null);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (chords === "off") return run.setComp(null);
    if (compReady(chords)) return run.setComp({ instrument: chords, style: chordStyle });
    let live = true;
    loadComp(chords, (f) => live && setChordDownload(f))
      .then(() => {
        if (live) {
          setChordDownload(null);
          runRef.current?.setComp({ instrument: chords, style: chordStyle });
        }
      })
      .catch(() => live && setChordDownload(null));
    return () => {
      live = false;
    };
  }, [chords, chordStyle, running]);
  useEffect(() => () => runRef.current?.stop(), []);

  const stop = useCallback(() => {
    runRef.current?.stop();
    runRef.current = null;
    startingRef.current = false;
    setStarting(false);
    setRunning(false);
    setNow(null);
    setOpened(null);
  }, []);

  // Editing the typed progression while it plays takes over from the next time through.
  useEffect(() => {
    if (typed && typedResult.song) runRef.current?.setSong(typedResult.song);
  }, [typed, typedResult.song]);
  const switchSource = (next: "chart" | "typed") => {
    if (next === source) return;
    stop();
    update({ source: next });
  };

  const start = useCallback(async () => {
    if (!song || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setLoadError(false);
    try {
      await Promise.all([
        loadUprightBass(setDownload),
        chords !== "off" ? loadComp(chords).catch(() => undefined) : Promise.resolve(),
        drums !== "off" ? loadDrums(drums).catch(() => undefined) : Promise.resolve(),
      ]);
    } catch {
      setLoadError(true);
      startingRef.current = false;
      setStarting(false);
      return;
    }
    if (!startingRef.current) return; // stopped while downloading
    setUprightBassVolume(volume);
    setUprightBassRoom(room ? roomAmount : 0);
    setWrittenChoruses([]);
    setViewChorus(0);
    setOpened(null);
    runRef.current = startBassGenius({
      song,
      line: { player, feel, touch, styleMode: playerMode },
      style,
      model,
      bpm,
      seed,
      choruses,
      countIn,
      click,
      swing,
      clickVolume,
      comp: chords !== "off" && compReady(chords) ? { instrument: chords, style: chordStyle } : null,
      drums: drums !== "off" && drumsReady(drums) ? drums : null,
      drumsComping,
      drumConfig,
      onBeat: (beat, info) => {
        setNow({ beat, info });
        if (info) setViewChorus(info.chorus);
      },
      onWrite: (chorus, notes, beats, start, phrases) =>
        setWrittenChoruses((list) => [...list.filter((c) => c.chorus >= chorus - 2), { chorus, notes, beats, start, phrases }]),
      onEnd: () => {
        runRef.current = null;
        startingRef.current = false;
        setStarting(false);
        setRunning(false);
        setNow(null);
      },
    });
    setStarting(false);
    setRunning(true);
  }, [song, player, playerMode, feel, touch, style, model, bpm, choruses, countIn, click, swing, volume, room, roomAmount, clickVolume, chords, chordStyle, drums, drumsComping, drumConfig, seed]);


  // Stopped: the line written as the options are set (tempo deferred, so dragging it stays smooth).
  const previewBpm = useDeferredValue(bpm);
  const preview = useMemo(() => {
    if (!song || styleLoading) return null;
    const line = { player, feel, touch, styleMode: playerMode };
    return { chorus: 0, ...previewChorus({ song, line, style, model, bpm: previewBpm, choruses, seed }) };
  }, [song, styleLoading, player, feel, touch, playerMode, style, model, previewBpm, choruses, seed]);
  const live = running || starting;
  const choruses_ = live ? writtenChoruses : preview ? [preview] : [];
  const viewed = live ? viewChorus : 0;
  const shown = choruses_.find((c) => c.chorus === viewed) ?? null;
  const preferFlat = !/^(G|D|A|E|B|F#|C#)(?!b)/.test(song?.key ?? "");
  const scored = useMemo(
    () =>
      shown && song
        ? chorusToTranscription(shown.notes, shown.beats, shown.start, { title: "", preferFlat, timeSignature: song.timeSignature })
        : null,
    [shown, song, preferFlat],
  );
  // The shown chorus's phrases as bar ranges (0-based measures of the chorus), and the one playing.
  const phraseBars = useMemo(() => (shown ? barsOfPhrases(shown) : []), [shown]);
  const openPhrase = opened && opened.chorus === viewed ? opened.index : null;
  const openChorus = opened ? (choruses_.find((c) => c.chorus === opened.chorus) ?? null) : null;
  const openDetail = useMemo(() => {
    if (!opened || !openChorus || !song) return null;
    const phrase = openChorus.phrases[opened.index];
    if (!phrase) return null;
    const bars = barsOfPhrases(openChorus)[opened.index];
    const t = chorusToTranscription(openChorus.notes, openChorus.beats, openChorus.start, { title: "", preferFlat, timeSignature: song.timeSignature }).transcription;
    return { phrase, previous: openChorus.phrases[opened.index - 1] ?? null, bars, played: { ...t, measures: t.measures.slice(bars.from, bars.to + 1) } };
  }, [opened, openChorus, song, preferFlat]);
  const playingPhrase =
    running && now && now.beat >= 0 && shown ? shown.phrases.findIndex((p) => now.beat >= p.beat && now.beat < p.beat + p.length) : -1;

  // The note being heard, lit on the staff (straight on the drawn SVG — no redraw per note) and
  // kept in view.
  const nowBeat = running && now && now.beat >= 0 ? now.beat : null;
  useEffect(() => {
    const box = scoreBoxRef.current;
    if (!box) return;
    box.querySelectorAll(".bass-now").forEach((el) => el.classList.remove("bass-now"));
    if (nowBeat === null || !scored) return;
    let at: (typeof scored.noteAt)[number] | null = null;
    for (const n of scored.noteAt) {
      if (n.beat > nowBeat + 1e-6) break;
      at = n;
    }
    if (!at) return;
    const el = box.querySelector(`[data-note="${at.measure}:${at.note}"]`);
    if (!el) return;
    el.classList.add("bass-now");
    // Keep the playing note in view by scrolling — not on phones, where it fought your own scrolling.
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nowBeat, scored]);

  const toggle = useCallback(() => (running || starting ? stop() : void start()), [running, starting, start, stop]);
  useSpaceToggle(toggle);
  const tap = useTapTempo((v) => update({ bpm: v }));

  const downloading = starting && !running;
  const activeBar = running && now && now.info ? now.info.bar : null;
  const countingIn = running && now !== null && now.beat < 0;
  const ts = song?.timeSignature ?? { top: 4, bottom: 4 };

  // Only said when something needs doing; otherwise the controls speak for themselves.
  const playerInfo = !customPlayer ? null : styleLoading ? (
    <LoadingSpinner size="sm" inline label="Reading transcriptions" showLabel />
  ) : !style || style.transcriptions === 0 ? (
    <>
      No transcriptions yet — add some under{" "}
      <button type="button" className="font-semibold text-accent hover:underline" onClick={() => update({ tab: "players" })}>
        Bass players
      </button>
      .
    </>
  ) : style.usableBars === 0 ? (
    <>Their transcriptions need chord symbols to be matched to a chart.</>
  ) : null;

  const playerName = customPlayer?.name ?? "Computer";
  const chartName = typed ? "Typed progression" : (meta?.title ?? "No chart");
  const tempoSection = (
    <PanelSection id="tempo" title="Tempo" icon={MetronomeIcon} summary={`${bpm} BPM`}>
      <TempoHero bpm={bpm} setBpm={(v) => update({ bpm: v })} beatsPerBar={ts.top} beatUnit={ts.bottom} onTap={tap} />
    </PanelSection>
  );
  const panel = (
    <div className="shrink-0 overflow-hidden bg-surface text-left lg:rounded-2xl">
      {/* The band setup only: which chart (and its key) and the view stay as they are. */}
      <PresetsSection
        id="presets"
        tool={toolPresets("bass-genius", settings, update, ["tab", "showChart", "source", "chartId", "typedText", "typedKey", "typedMeter", "transposeKey"])}
      />
      {tempoSection}
      <PanelSection id="tune" title="Tune" icon={ChordChartIcon} summary={`${chartName}${!typed && transposeKey ? ` · in ${transposeKey}` : ""}`}>
        <Segmented
          label="Play over"
          value={source}
          onChange={switchSource}
          options={[
            { value: "chart", label: "A chart" },
            { value: "typed", label: "Type chords" },
          ]}
        />
        {typed ? (
          <>
            <Field
              label=""
              note={typedResult.unknown.length > 0 ? <span className="text-danger">Didn&apos;t understand: {typedResult.unknown.map((t) => `“${t}”`).join(", ")}</span> : null}
            >
              <textarea
                value={typedText}
                onChange={(e) => update({ typedText: e.target.value })}
                rows={3}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Dm7 G7 | Cmaj7 | %   or   ii7 V7 | Imaj7"
                className="w-full resize-y rounded-lg bg-background px-3 py-2 font-mono text-sm outline-none ring-accent focus:ring-2"
                aria-label="Chord progression"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => update({ typedText: p.text })}
                  className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={typedResult.usesNumerals ? "Key" : "Key (numerals)"}>
                <Select value={typedKey} onChange={(v) => update({ typedKey: v })} options={KEY_NAMES.map((k) => ({ value: k, label: k }))} className="w-full" />
              </Field>
              <Field label="Time">
                <Select
                  value={typedMeter}
                  onChange={(v) => {
                    stop();
                    update({ typedMeter: v });
                  }}
                  options={[
                    { value: "4/4" as const, label: "4/4" },
                    { value: "3/4" as const, label: "3/4" },
                  ]}
                  className="w-full"
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5 text-left hover:bg-surface-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{meta?.title ?? (loading ? "Loading your charts…" : "Pick a chart")}</span>
                {meta && <span className="block truncate text-xs text-muted">{[meta.key, meta.style].filter(Boolean).join(" · ")}</span>}
              </span>
              <span className="shrink-0 text-xs font-semibold text-accent">{meta ? "Change" : "Choose"}</span>
            </button>
            <Field label="Key">
              <Select
                value={transposeKey}
                onChange={(v) => {
                  // A new key is a different bass line: stop rather than keep playing the old one.
                  stop();
                  update({ transposeKey: v });
                }}
                options={[{ value: "", label: `Original${selectedSong?.key ? ` (${selectedSong.key})` : ""}` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
                className="w-full"
              />
            </Field>
          </>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <Field label="How long">
            <Select value={choruses} onChange={(v) => update({ choruses: v })} options={CHORUS_OPTIONS} disabled={running} className="w-full" />
          </Field>
          <div className="pb-2">
            <SwitchRow label="Count-in" checked={countIn} onChange={(v) => update({ countIn: v })} />
          </div>
        </div>
      </PanelSection>

      <PanelSection id="bass" title="Bass" icon={BassIcon} summary={`${playerName}${customPlayer ? (learning ? " · their style" : " · their phrases") : ` · ${feel === "two" ? "two feel" : "walking"}`}`}>
        <Field label="">
          <Select
            value={customPlayer || playersLoading ? player : "computer"}
            onChange={(v) => update({ player: v })}
            options={[...BASS_PLAYERS.map((p) => ({ value: p.id as string, label: p.label })), ...players.map((p) => ({ value: p.id, label: p.name }))]}
            disabled={running}
            className="w-full"
          />
        </Field>
        {customPlayer ? (
          <Field label="" note={playerInfo}>
            <Segmented
              label="How they play"
              value={playerMode}
              onChange={(v) => update({ playerMode: v })}
              disabled={running}
              options={[
                { value: "copy", label: "Their phrases" },
                { value: "learn", label: "Their style" },
              ]}
            />
          </Field>
        ) : (
          <Field label="">
            <Segmented
              label="Feel"
              value={feel}
              onChange={(v) => update({ feel: v })}
              disabled={running}
              options={[
                { value: "walking", label: "Walking in 4" },
                { value: "two", label: "Two feel" },
              ]}
            />
          </Field>
        )}
        <Field label="Touch">
          <Segmented label="Touch" value={touch} onChange={(v) => update({ touch: v })} disabled={running} options={TOUCH_OPTIONS} />
        </Field>
        <Field label="Swing">
          <Select value={swing} onChange={(v) => update({ swing: v })} options={SWING_OPTIONS} className="w-full" />
        </Field>
      </PanelSection>

      <PanelSection
        id="chords"
        title="Chords"
        icon={ChordIcon}
        summary={chords === "off" ? "Off" : `${chords === "piano" ? "Piano" : "Rhodes"} · ${chordStyle === "comp" ? "comping" : "held"}`}
      >
        <Segmented
          label="Chords"
          value={chords}
          onChange={(v) => update({ chords: v })}
          options={[
            { value: "off", label: "Off" },
            { value: "piano", label: "Piano" },
            { value: "rhodes", label: "Rhodes" },
          ]}
        />
        {chords !== "off" && (
          <Field label="">
            <Segmented
              label="Chord rhythm"
              value={chordStyle}
              onChange={(v) => update({ chordStyle: v })}
              options={[
                { value: "comp", label: "Comping" },
                { value: "sustain", label: "Held" },
              ]}
            />
          </Field>
        )}
        {chordDownload !== null && <p className="text-xs text-muted">Downloading the {chords === "rhodes" ? "Rhodes" : "piano"}… {Math.round(chordDownload * 100)}%</p>}
      </PanelSection>

      <PanelSection id="drums" title="Drums" icon={DrumIcon} summary={drums === "off" ? (click ? "Off · click on 2 & 4" : "Off") : drumsComping ? "With comping" : "Just time"}>
        <Segmented
          label="Drums"
          value={drums === "off" ? "off" : drumsComping ? "comp" : "time"}
          onChange={(v) => update(v === "off" ? { drums: "off" } : { drums: "sticks", drumsComping: v === "comp" })}
          options={[
            { value: "off", label: "Off" },
            { value: "time", label: "Time" },
            { value: "comp", label: "Comping" },
          ]}
        />
        {drums === "off" ? (
          <SwitchRow label="Hi-hat click on 2 & 4" checked={click} onChange={(v) => update({ click: v })} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setDrumSettingsOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-background px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              <SlidersIcon className="h-4 w-4" /> Drum settings
            </button>
          </>
        )}
        {drumDownload !== null && <p className="text-xs text-muted">Downloading the drums… {Math.round(drumDownload * 100)}%</p>}
      </PanelSection>

      <PanelSection id="mix" title="Mix" icon={SpeakerIcon} summary={`Bass ${Math.round(volume * 100)}%`}>
        <LevelRow label="Bass" value={volume} onChange={(v) => update({ volume: v })} />
        <LevelRow label="Chords" value={chords === "off" ? null : chordVolume} onChange={(v) => update({ chordVolume: v })} onTurnOn={() => update({ chords: "piano" })} />
        <LevelRow label="Drums" value={drums === "off" ? null : drumsVolume} onChange={(v) => update({ drumsVolume: v })} onTurnOn={() => update({ drums: "sticks" })} />
        <LevelRow
          label="Click"
          value={click && drums === "off" ? clickVolume : null}
          onChange={(v) => update({ clickVolume: v })}
          offLabel={drums !== "off" ? "Off with drums" : "Turn on"}
          onTurnOn={drums !== "off" ? undefined : () => update({ click: true })}
        />
        <LevelRow label="Room" value={room ? roomAmount : 0} onChange={(v) => update({ roomAmount: v, room: v > 0 })} />
      </PanelSection>
    </div>
  );

  const status = loadError
    ? "Couldn't download the bass — check your connection and try again."
    : downloading
      ? `Downloading the bass… ${Math.round((download ?? 0) * 100)}%`
      : countingIn
        ? `Count-in… ${(now?.beat ?? 0) + ts.top + 1}`
        : running && now?.info
          ? `Chorus ${now.info.chorus + 1} · ${now.info.harmony ? prettyQuality(now.info.harmony.symbol) : "N.C."}${
              customPlayer ? ` · ${learning ? `in ${customPlayer.name}'s style` : now.info.from ? `from ${now.info.from}` : "filling in"}` : ""
            }`
          : "";

  const transport = (
    <div className="-mt-2 flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={!song || styleLoading}
        className={`flex min-w-40 items-center justify-center gap-2 rounded-full px-8 py-3 text-lg font-semibold disabled:opacity-50 ${
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
      <p className="min-h-5 text-center text-sm text-muted tabular-nums" aria-live="polite">
        {status}
      </p>
    </div>
  );

  return (
    <ToolLayout
      title="Bass Genius"
      titleExtra={<span className="hidden text-xs text-muted sm:inline">Idea and built-in transcriptions by Rob Moreno</span>}
      layout="stacked"
      topAligned
      options={null}
    >
      <Segmented
        onPage
        label="Bass Genius section"
        value={tab}
        onChange={(v) => {
          if (v !== "play") stop();
          update({ tab: v });
        }}
        options={[
          { value: "play", label: "Play" },
          { value: "players", label: "Bass players" },
        ]}
      />
      {tab === "play" && transport}
      {tab === "players" ? (
        <BassPlayersTab />
      ) : (
        <div className="grid w-full max-w-[100rem] gap-6 text-left lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <aside ref={asideRef} aria-label="Settings" className="hidden min-w-0 lg:sticky lg:flex lg:flex-col lg:top-4 lg:overflow-y-auto lg:rounded-2xl">
            {panel}
          </aside>
          <div
            className={`grid min-w-0 gap-6 ${scored && song && settings.showChart ? "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start" : ""}`}
          >
            {scored && (
              <div ref={scoreBoxRef} className="bass-line-score w-full rounded-2xl bg-surface p-3 text-left sm:p-5">
                <style>{`.bass-line-score g.bass-now{fill:var(--accent);stroke:var(--accent);color:var(--accent)}`}</style>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
                  <h3 className="text-sm font-semibold">Bass line{live && <span className="ml-2 font-normal text-muted">Chorus {viewed + 1}</span>}</h3>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <button
                      type="button"
                      onClick={() => update({ showChart: !settings.showChart })}
                      aria-pressed={settings.showChart}
                      title={settings.showChart ? "Hide the chord chart" : "Show the chord chart"}
                      className="flex items-center gap-1 rounded-full bg-background px-2.5 py-1 font-semibold text-foreground hover:bg-surface-hover"
                    >
                      {settings.showChart ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                      {settings.showChart ? "Hide chart" : "Show chart"}
                    </button>
                    {!live && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpened(null);
                          setSeed(Math.floor(Math.random() * 2 ** 31));
                        }}
                        className="flex items-center gap-1 rounded-full bg-background px-2.5 py-1 font-semibold text-foreground hover:bg-surface-hover"
                      >
                        <ShuffleIcon className="h-3.5 w-3.5" /> New line
                      </button>
                    )}
                  </span>
                </div>
                {customPlayer && shown && shown.phrases.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 px-1" aria-label="Phrases — how each was made">
                    {shown.phrases.map((p, i) => {
                      const b = phraseBars[i];
                      const src = p.source;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setOpened({ chorus: viewed, index: i })}
                          title="How this phrase was made"
                          className={`flex flex-col items-start rounded-lg px-2.5 py-1 text-left text-xs transition-colors ${
                            i === playingPhrase ? "bg-accent text-accent-foreground" : openPhrase === i ? "bg-surface-hover" : "bg-background hover:bg-surface-hover"
                          }`}
                        >
                          <span className="font-semibold">{b ? (b.from === b.to ? `Bar ${b.from + 1}` : `Bars ${b.from + 1}–${b.to + 1}`) : "Phrase"}</span>
                          <span className={i === playingPhrase ? "opacity-80" : "text-muted"}>
                            {src ? `${src.title} ${Math.floor(src.startBeat / 4) + 1}–${Math.ceil((src.startBeat + p.length) / 4)}` : p.learned ? "New, in their style" : "Computer"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <TranscriptionScore
                  transcription={scored.transcription}
                  cursor={null}
                  playing={null}
                  mode="select"
                  range={openPhrase !== null && phraseBars[openPhrase] ? phraseBars[openPhrase] : null}
                  onSelect={noop}
                  onAdd={noop}
                  onReplace={noop}
                  onChordClick={noop}
                />
              </div>
            )}
            {(!song || !scored || settings.showChart) && (
            <div className="min-w-0 xl:sticky xl:top-4">
            {typed ? (
              song ? (
                <div className="w-full rounded-2xl bg-surface p-2 text-left sm:p-6">
                  <ChordChart song={song} hideHeader activeBar={activeBar} />
                </div>
              ) : (
                <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">Type some chords to play over.</p>
              )
            ) : !loading && allSongs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-6 text-sm text-muted">
                <p>You don&apos;t have any chord charts yet.</p>
                <Link href="/tunes?tab=charts" className="font-semibold text-accent hover:underline">
                  Import or make one in Chord Charts
                </Link>
              </div>
            ) : !chartId ? (
              <button type="button" onClick={() => setPicking(true)} className="rounded-2xl bg-surface p-6 text-sm text-muted hover:bg-surface-hover">
                Pick one of your chord charts to play over.
              </button>
            ) : selectedSongLoading || (!song && loading) ? (
              <LoadingSpinner label="Loading chart…" showLabel />
            ) : song ? (
              <div className="w-full rounded-2xl bg-surface p-2 text-left sm:p-6">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 px-2 sm:px-0">
                  <h2 className="text-xl font-bold">{song.title}</h2>
                  <p className="text-sm text-muted">
                    {[song.composer ? formatComposer(song.composer) : null, song.style || null, song.key, `${song.timeSignature.top}/${song.timeSignature.bottom}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChordChart song={song} hideHeader activeBar={activeBar} />
              </div>
            ) : (
              <p className="text-sm text-muted">That chart isn&apos;t in your library anymore.</p>
            )}
            </div>
            )}
          </div>
        </div>
      )}

      {openDetail && customPlayer && style && (
        <PhraseDialog
          phrase={openDetail.phrase}
          previous={openDetail.previous}
          bars={{ from: openDetail.bars.from + 1, to: openDetail.bars.to + 1 }}
          playerName={customPlayer.name}
          median={style.median}
          source={openDetail.phrase.source ? (playerTranscriptions?.[openDetail.phrase.source.transcription] ?? null) : null}
          played={openDetail.played}
          onClose={() => setOpened(null)}
        />
      )}
      <OptionsSheet open={optionsOpen} onClose={closeOptions}>
        {panel}
      </OptionsSheet>
      {drumSettingsOpen && <DrumSettingsDialog config={drumConfig} onChange={(c) => update({ drumConfig: c })} onClose={() => setDrumSettingsOpen(false)} />}
      {picking && (
        <ChartLinkPicker
          songs={allSongs}
          initialQuery=""
          onPick={(id) => {
            stop();
            update({ chartId: id, transposeKey: "" });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </ToolLayout>
  );
}

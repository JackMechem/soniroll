"use client";

import Link from "next/link";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toolPresets } from "@/lib/toolPresets";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import { RewardProvider } from "@/components/reward/Reward";
import ToolLayout from "@/components/ToolLayout";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import BassPlayersTab from "@/components/bassgenius/BassPlayersTab";
import TranscriptionScore from "@/components/notation/Score";
import PhraseDialog from "@/components/bassgenius/PhraseDialog";
import DrumSettingsDialog from "@/components/bassgenius/DrumSettingsDialog";
import { Field, LevelRow, OptionsSheet, OptionsSummaryChip, PanelSection } from "@/components/bassgenius/PlayPanel";
import { GrooveScore, KIT_PARTS, PART_DEFAULT, PartFader, partGain, useStyleVoices } from "@/components/rhythmsection/kit";
import { BIG_PRIMARY, BIG_SECONDARY, TempoHero } from "@/components/MeterFields";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import {
  BassIcon,
  ChordChartIcon,
  ChordIcon,
  DrumIcon,
  EyeIcon,
  EyeOffIcon,
  MetronomeIcon,
  PlayIcon,
  ShuffleIcon,
  SlidersIcon,
  SpeakerIcon,
  StopIcon,
} from "@/components/tools";
import { BASS_PLAYERS, beatsInMeter, type BassFeel, type BassNote, type BassPhrase, type BassTouch, type PerformedBeat } from "@/lib/bassLine";
import { chorusToTranscription } from "@/lib/bassLineScore";
import { analyzeStyle } from "@/lib/bassStyle";
import { learnModel } from "@/lib/bassLearned";
import { useBassPlayers, usePlayerTranscriptions } from "@/lib/useBassPlayers";
import { previewChorus, previewDrums, startRhythmSection, type BassSwing, type RhythmSectionRun } from "@/lib/rhythmSectionEngine";
import { BASS_FAMILY_ABOUT, bassFamilyOf } from "@/lib/rhythmSection";
import { compReady, loadComp, setCompRoom, setCompVolume, type CompInstrument } from "@/lib/compSounds";
import type { CompStyle } from "@/lib/comping";
import { DEFAULT_DRUM_CONFIG, drumConfigOf, type DrumConfig, type DrumVoice } from "@/lib/drums";
import { ALL_VOICES, drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from "@/lib/drumSounds";
import {
  CLAVE_LABEL,
  claveDirectionMatters,
  claveKindsFor,
  COUNTRIES,
  DRUM_STYLES,
  mainTimeVoice,
  styleById,
  TIME_VOICES,
  type ClaveChoice,
  type ClaveSide,
  type GrooveBar,
  type GrooveOptions,
  type HandChoice,
} from "@/lib/drumStyles";
import { formatComposer, KEY_NAMES, prettyQuality, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { useTapTempo } from "@/lib/meterControls";
import { loadUprightBass, setUprightBassRoom, setUprightBassVolume, uprightBassReady } from "@/lib/uprightBass";
import { parseTypedProgression } from "@/lib/typedProgression";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { useToolActivity } from "@/lib/toolTime";

// Settings live under the two old tools' keys, so nobody's saved settings are lost: the tune, bass,
// chords, swing drummer and mix under Bass Genius's, the groove (style, tempo per style, clave,
// fills, kit faders) under the Drum Generator's.

type BandSettings = {
  /** Play along, or manage bass players and their transcriptions. */
  tab: "play" | "players";
  /** No chart (the drums on their own), one of your charts, or a progression typed in. "" = never
      picked: "A chart", or "No chart" for someone with no charts. */
  source: "" | "none" | "chart" | "typed";
  chartId: string;
  /** The typed progression — chord names or roman numerals, "|" between bars. */
  typedText: string;
  /** Key the typed numerals are in (a `KEY_NAMES` entry). */
  typedKey: string;
  typedMeter: "4/4" | "3/4";
  /** Whether the bass plays. */
  bass: boolean;
  /** "computer", or the id of one of your bass players (who plays from their transcriptions). */
  player: string;
  /** For one of your players: copy phrases from their transcriptions, or write new lines in
      their style. */
  playerMode: "copy" | "learn";
  feel: BassFeel;
  touch: BassTouch;
  /** Bass Genius's tempo (0 = never set). Tempos are kept per style now (`GrooveSettings.tempos`);
      this is only read as the swing styles' tempo until one is set there. */
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
  /** "off" or the drums on ("sticks"; an old saved "brushes" counts as on). Only with a chart —
      with none, the drums always play. */
  drums: string;
  drumsVolume: number;
  /** The swing drummer comping (snare chatter, accents marking sections) or just keeping time. */
  drumsComping: boolean;
  /** The drum settings dialog's values (the swing drummer). */
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

/** Bass Genius's settings key (Rhythm Section's tune, bass, chords and mix). */
const BAND_KEY = "jam-practice-bass-genius";
const BAND_DEFAULTS: BandSettings = {
  tab: "play",
  source: "",
  chartId: "",
  typedText: "ii7 | V7 | Imaj7 | %",
  typedKey: "C",
  typedMeter: "4/4",
  bass: true,
  player: "computer",
  playerMode: "copy",
  feel: "walking",
  touch: "medium",
  bpm: 0,
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
  drums: "sticks",
  drumsVolume: 0.7,
  drumsComping: false,
  drumConfig: DEFAULT_DRUM_CONFIG,
  roomAmount: 0.5,
  transposeKey: "",
  showChart: true,
};

type GrooveSettings = {
  /** The drum style ("" = never picked: swing with a chart, bossa nova without). The old "Swing
      with comping" style reads as Medium swing with comping. */
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
  /** Each kit part's fader, 0–1 (0.5 = as recorded, 1 = +6 dB, 0 = off); missing = 0.5. */
  parts: Record<string, number>;
};

/** The Drum Generator's settings key (Rhythm Section's groove). */
const GROOVE_KEY = "jam-practice-drum-generator";
const GROOVE_DEFAULTS: GrooveSettings = {
  style: "",
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
  parts: {},
};

/** Band fields a preset leaves alone: the tune you're on and the view. */
const BAND_NOT_OPTIONS = ["tab", "source", "chartId", "typedText", "typedKey", "typedMeter", "transposeKey", "showChart"] as const;

const noop = () => {};
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
/** Bars of drums shown at a time. */
const DRUM_WINDOW = 8;

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

const FILL_OPTIONS = [
  { value: 0, label: "No fills" },
  { value: 4, label: "Every 4 bars" },
  { value: 8, label: "Every 8 bars" },
  { value: 16, label: "Every 16 bars" },
];

/** The styles in the picker: the old "Swing with comping" is Medium swing with comping on. */
const PICKABLE = DRUM_STYLES.filter((s) => s.id !== "swing-comping");

/**
 * Rhythm Section: a band to play along with. Pick a drum style and it plays on its own — or pick
 * one of your chord charts (or type chords) and an upright bass and a piano or Rhodes play the
 * changes with the drums, the bass written out as it plays. Swing styles walk (the Computer, or
 * bass players modelled on transcriptions) over a jazz drummer; the other styles play the groove
 * with a bass part that fits it. Replaced Bass Genius and the Drum Generator.
 */
export default function RhythmSection({
  initialTab,
  initialPlay,
  initialChart,
  initialKey,
}: {
  initialTab?: string;
  initialPlay?: string;
  /** Play along from the library: open this chart (in `initialKey`, a `KEY_NAMES` entry, if given). */
  initialChart?: string;
  initialKey?: string;
}) {
  const [settings, update, bandReady] = useSyncedSettings(BAND_KEY, BAND_DEFAULTS);
  const [grooveSettings, updateGroove] = useSyncedSettings(GROOVE_KEY, GROOVE_DEFAULTS);
  // One preset covers both stores: the band (bass, chords, mix — not the tune) and the groove.
  const presets = useMemo(() => {
    const band: Partial<BandSettings> = { ...settings };
    for (const f of BAND_NOT_OPTIONS) delete band[f];
    return toolPresets("rhythm-section", { band, groove: grooveSettings }, (patch) => {
      if (patch.band) update(patch.band);
      if (patch.groove) updateGroove(patch.groove);
    });
  }, [settings, grooveSettings, update, updateGroove]);
  const { tab, source: storedSource, chartId, typedText, typedKey, typedMeter, player, playerMode, feel, touch, choruses, click, swing, volume, room, transposeKey, chordStyle, chordVolume, clickVolume, roomAmount, drumsVolume } = settings;
  const countIn = settings.countIn && grooveSettings.countIn;
  const drumConfig = useMemo(() => drumConfigOf(settings.drumConfig), [settings.drumConfig]);
  const [drumSettingsOpen, setDrumSettingsOpen] = useState(false);
  // Phones: the options panel opens as a sheet.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const closeOptions = useCallback(() => setOptionsOpen(false), []);

  // Old links: /bass-genius?tab=players opens the Bass players tab; /drum-generator plays the
  // drums on their own. ?chart= (Play along from a tune or chart page) picks that chart. Waits for
  // the settings to load, so the write merges into them rather than into the defaults.
  useEffect(() => {
    if (!bandReady) return;
    if (initialTab === "players" || initialTab === "play") update({ tab: initialTab });
    if (initialPlay === "drums") update({ source: "none", tab: "play" });
    if (initialChart) update({ tab: "play", source: "chart", chartId: initialChart, transposeKey: initialKey && KEY_NAMES.includes(initialKey) ? initialKey : "" });
    if ((initialTab || initialPlay || initialChart) && window.location.pathname === "/rhythm-section") window.history.replaceState(window.history.state, "", "/rhythm-section");
  }, [bandReady, initialTab, initialPlay, initialChart, initialKey, update]);

  // ——— The tune ———
  const { isLoading: authLoading } = useConvexAuth();
  const { selectedSong, selectedSongLoading, allSongs, loading } = useChordChartsLibrary((storedSource === "chart" || storedSource === "") && chartId ? chartId : null);
  // Never picked: "A chart", except for someone with no charts yet, who starts on "No chart"
  // (decided once the settings and the library have loaded, so nothing jumps).
  const source = storedSource || (bandReady && !authLoading && !loading && allSongs.length === 0 ? "none" : "chart");
  const typed = source === "typed";
  const noTune = source === "none";
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
  const song = noTune ? null : typed ? typedResult.song : chartSong;
  const wantsTune = typed || (source === "chart" && !!chartId);

  // ——— The style ———
  const storedStyle = grooveSettings.style === "swing-comping" ? "medium-swing" : grooveSettings.style;
  const style = useMemo(
    () => styleById(storedStyle || (wantsTune ? ((song ? beatsInMeter(song.timeSignature) : 4) === 3 ? "jazz-waltz" : "medium-swing") : "bossa-nova")),
    [storedStyle, wantsTune, song],
  );
  const family = bassFamilyOf(style);
  const walking = family === "walking";
  const drumsComping = settings.drumsComping || grooveSettings.style === "swing-comping";
  const setStyle = (id: string) => updateGroove({ style: id });
  const setComping = (on: boolean) => {
    update({ drumsComping: on });
    if (grooveSettings.style === "swing-comping") updateGroove({ style: "medium-swing" });
  };
  const clave: ClaveSide = grooveSettings.claves[style.id] ?? style.clave?.written ?? "2-3";
  const crossStick: ClaveChoice = grooveSettings.crossSticks[style.id] ?? "style";
  const blockChoice: ClaveChoice = grooveSettings.blocks[style.id] ?? (grooveSettings.claveOnBlock && style.clave ? "style" : "off");
  const hand: HandChoice = grooveSettings.hands[style.id] ?? "style";
  const grooveOpts: GrooveOptions = useMemo(
    () => ({ clave, crossStick, block: blockChoice, hand, fillEvery: grooveSettings.fillEvery, variation: grooveSettings.variation }),
    [clave, crossStick, blockChoice, hand, grooveSettings.fillEvery, grooveSettings.variation],
  );
  const tempos = grooveSettings.tempos;
  const bpm = tempos[style.id] ?? (style.swing && settings.bpm > 0 ? settings.bpm : style.tempo.initial);
  const setBpm = (v: number) => updateGroove({ tempos: { ...tempos, [style.id]: Math.max(20, Math.min(400, Math.round(v))) } });

  // What plays: with no chart, just the drums.
  const bassOn = !!song && settings.bass;
  const chords: "off" | CompInstrument = song ? settings.chords : "off";
  const drumsOn = !song || settings.drums !== "off";

  // ——— The bass player ———
  const { players, loading: playersLoading } = useBassPlayers();
  const customPlayer = player === "computer" ? null : (players.find((p) => p.id === player) ?? null);
  const playerTranscriptions = usePlayerTranscriptions(customPlayer?.id ?? null, customPlayer?.name);
  const bassStyle = useMemo(
    () => (customPlayer && playerTranscriptions ? analyzeStyle(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions],
  );
  const model = useMemo(
    () => (customPlayer && playerTranscriptions && playerMode === "learn" ? learnModel(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions, playerMode],
  );
  // Your bass players play the swing styles' walking line.
  const playingPlayer = walking ? customPlayer : null;
  const learning = !!playingPlayer && playerMode === "learn";
  const styleLoading = bassOn && !!playingPlayer && playerTranscriptions === undefined;

  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState(false);
  // Counts as practice in the Shed Log while it runs.
  useToolActivity("/rhythm-section", running);
  const [download, setDownload] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState<{ beat: number; info: PerformedBeat | null } | null>(null);
  const runRef = useRef<RhythmSectionRun | null>(null);
  // The line as it's written (a chorus ahead of the music), for showing it on a staff.
  const [writtenChoruses, setWrittenChoruses] = useState<{ chorus: number; notes: BassNote[]; beats: PerformedBeat[]; start: number; phrases: BassPhrase[] }[]>([]);
  // The drums as they're written, as notation bars.
  const [writtenDrums, setWrittenDrums] = useState<{ chorus: number; bars: { time: GrooveBar[]; comp: GrooveBar[] } }[]>([]);
  const [drumWindow, setDrumWindow] = useState(0);
  // The phrase whose working is open (index into the shown chorus's phrases).
  const [opened, setOpened] = useState<{ chorus: number; index: number } | null>(null);
  const [viewChorus, setViewChorus] = useState(0);
  // The seeds: the previews show what these seeds play with the current settings, and Play uses
  // the same ones, so it plays what's shown. "New line" / "New groove" pick others.
  const [seed, setSeed] = useState(newSeed);
  const [grooveSeed, setGrooveSeed] = useState(newSeed);
  const scoreBoxRef = useRef<HTMLDivElement>(null);
  const drumScoreRef = useRef<HTMLDivElement>(null);
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

  // The kit parts' faders, as a gain per sound.
  const voiceGains = useMemo(() => {
    const g: Partial<Record<DrumVoice, number>> = {};
    for (const p of KIT_PARTS) for (const v of p.voices) g[v] = partGain(grooveSettings.parts[p.id] ?? PART_DEFAULT);
    return g;
  }, [grooveSettings.parts]);

  useEffect(() => setUprightBassVolume(volume), [volume]);
  useEffect(() => setUprightBassRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setBpm(bpm), [bpm]);
  useEffect(() => runRef.current?.setClick(click), [click]);
  useEffect(() => runRef.current?.setSwing(swing), [swing]);
  useEffect(() => setCompVolume(chordVolume), [chordVolume]);
  useEffect(() => setCompRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setClickVolume(clickVolume), [clickVolume]);
  useEffect(() => setDrumsVolume(drumsVolume), [drumsVolume]);
  useEffect(() => setDrumsRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setDrumsComping(drumsComping), [drumsComping]);
  useEffect(() => runRef.current?.setDrumConfig(drumConfig), [drumConfig]);
  useEffect(() => runRef.current?.setHumanize(grooveSettings.humanize), [grooveSettings.humanize]);
  useEffect(() => runRef.current?.setVoiceGains(voiceGains), [voiceGains]);
  // A new style or groove option while playing: from the next bar line (bass and chords follow).
  useEffect(() => runRef.current?.setGroove(style, grooveOpts), [style, grooveOpts]);
  // Parts switched on while playing: download them if needed, then bring them in.
  const [partDownload, setPartDownload] = useState<number | null>(null);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (!drumsOn) return run.setDrums(false);
    if (drumsReady("sticks", ALL_VOICES)) return run.setDrums(true);
    let live = true;
    loadDrums("sticks", (f) => live && setPartDownload(f), ALL_VOICES)
      .then(() => {
        if (live) {
          setPartDownload(null);
          runRef.current?.setDrums(true);
        }
      })
      .catch(() => live && setPartDownload(null));
    return () => {
      live = false;
    };
  }, [drumsOn, running]);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (!bassOn) return run.setBass(false);
    if (uprightBassReady()) return run.setBass(true);
    let live = true;
    loadUprightBass((f) => live && setPartDownload(f))
      .then(() => {
        if (live) {
          setPartDownload(null);
          runRef.current?.setBass(true);
        }
      })
      .catch(() => live && setPartDownload(null));
    return () => {
      live = false;
    };
  }, [bassOn, running]);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (chords === "off") return run.setComp(null);
    if (compReady(chords)) return run.setComp({ instrument: chords, style: chordStyle });
    let live = true;
    loadComp(chords, (f) => live && setPartDownload(f))
      .then(() => {
        if (live) {
          setPartDownload(null);
          runRef.current?.setComp({ instrument: chords, style: chordStyle });
        }
      })
      .catch(() => live && setPartDownload(null));
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
  const switchSource = (next: "none" | "chart" | "typed") => {
    if (next === source) return;
    stop();
    update({ source: next });
  };

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setLoadError(false);
    // Each part's download counts toward the progress shown.
    const parts = [bassOn && !uprightBassReady(), drumsOn && !drumsReady("sticks", ALL_VOICES)].filter(Boolean).length;
    const progress = [0, 0];
    const report = (i: number) => (f: number) => {
      progress[i] = f;
      setDownload(parts ? (progress[0] + progress[1]) / parts : 1);
    };
    setDownload(parts ? 0 : 1);
    try {
      await Promise.all([
        bassOn ? loadUprightBass(report(0)) : Promise.resolve(),
        drumsOn ? loadDrums("sticks", report(1), ALL_VOICES) : Promise.resolve(),
        chords !== "off" ? loadComp(chords).catch(() => undefined) : Promise.resolve(),
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
    setDrumsVolume(drumsVolume);
    setDrumsRoom(room ? roomAmount : 0);
    setWrittenChoruses([]);
    setWrittenDrums([]);
    setDrumWindow(0);
    setViewChorus(0);
    setOpened(null);
    runRef.current = startRhythmSection({
      song,
      bass: bassOn,
      line: { player: playingPlayer ? player : "computer", feel, touch, styleMode: playerMode },
      style: playingPlayer ? bassStyle : null,
      model: playingPlayer ? model : null,
      groove: style,
      grooveOpts,
      drums: drumsOn,
      drumsComping,
      drumConfig,
      humanize: grooveSettings.humanize,
      voiceGains,
      bpm,
      seed,
      grooveSeed,
      choruses,
      countIn,
      click,
      clickVolume,
      swing,
      comp: chords !== "off" && compReady(chords) ? { instrument: chords, style: chordStyle } : null,
      onBeat: (beat, info) => {
        setNow({ beat, info });
        if (info) setViewChorus(info.chorus);
      },
      onWrite: (chorus, notes, beats, start, phrases) =>
        setWrittenChoruses((list) => [...list.filter((c) => c.chorus >= chorus - 2 && c.chorus !== chorus), { chorus, notes, beats, start, phrases }]),
      onDrums: (chorus, bars) => setWrittenDrums((list) => [...list.filter((c) => c.chorus >= chorus - 2 && c.chorus !== chorus), { chorus, bars }]),
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
  }, [song, bassOn, drumsOn, playingPlayer, player, playerMode, feel, touch, bassStyle, model, style, grooveOpts, drumsComping, drumConfig, grooveSettings.humanize, voiceGains, bpm, seed, grooveSeed, choruses, countIn, click, clickVolume, swing, volume, room, roomAmount, drumsVolume, chords, chordStyle]);

  // ——— What's shown ———
  // Stopped: the line written as the options are set (tempo deferred, so dragging it stays smooth).
  const previewBpm = useDeferredValue(bpm);
  const preview = useMemo(() => {
    if (!song || !bassOn || styleLoading) return null;
    const line = { player: playingPlayer ? player : "computer", feel, touch, styleMode: playerMode };
    return {
      chorus: 0,
      ...previewChorus({ song, line, style: playingPlayer ? bassStyle : null, model: playingPlayer ? model : null, bpm: previewBpm, choruses, seed, groove: style }),
    };
  }, [song, bassOn, styleLoading, playingPlayer, player, feel, touch, playerMode, bassStyle, model, previewBpm, choruses, seed, style]);
  const live = running || starting;
  const choruses_ = live ? writtenChoruses : preview ? [preview] : [];
  const viewed = live ? viewChorus : 0;
  const shown = bassOn ? (choruses_.find((c) => c.chorus === viewed) ?? null) : null;
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

  // The drums: stopped, the first bars Play will play; playing, the bars around the music.
  const way = style.swing && drumsComping ? "comp" : "time";
  const previewDrumBars = useMemo(
    () => previewDrums({ song, groove: style, grooveOpts, drumConfig, choruses, grooveSeed }),
    [song, style, grooveOpts, drumConfig, choruses, grooveSeed],
  );
  const liveDrums = running && writtenDrums.length > 0;
  const drumBars = useMemo(() => {
    if (!liveDrums) return previewDrumBars[way].slice(0, DRUM_WINDOW);
    const all = writtenDrums.flatMap((c) => c.bars[way]);
    return all.filter((b) => b.bar >= drumWindow && b.bar < drumWindow + DRUM_WINDOW).sort((a, b) => a.bar - b.bar);
  }, [liveDrums, previewDrumBars, writtenDrums, way, drumWindow]);
  const drumFirstBar = (drumBars[0]?.bar ?? 0) + 1;
  // A swing drummer over a chart plays in the chart's meter.
  const scoreStyle = useMemo(
    () => (style.swing && song ? { ...style, meter: song.timeSignature, beats: beatsInMeter(song.timeSignature) } : style),
    [style, song],
  );
  // While playing: follow the music — which bars are showing, and the drum being heard lit.
  useEffect(() => {
    if (!running || !drumsOn) return;
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const run = runRef.current;
      if (!run) return;
      const pos = run.position();
      if (pos.bar < 0) return;
      const windowStart = Math.floor(pos.bar / DRUM_WINDOW) * DRUM_WINDOW;
      if (windowStart !== drumWindow) {
        setDrumWindow(windowStart);
        return;
      }
      const i = drumBars.findIndex((b) => b.bar === pos.bar);
      if (i < 0) return;
      const step = Math.floor(pos.inBar * scoreStyle.stepsPerBeat + 1e-6);
      const key = `${i}:${step}`;
      if (key === lastKey) return;
      lastKey = key;
      const root = drumScoreRef.current;
      if (!root) return;
      root.querySelectorAll(".drum-now").forEach((el) => el.classList.remove("drum-now"));
      for (const dir of ["up", "down"]) {
        let best: Element | null = null;
        let bestStep = -1;
        root.querySelectorAll(`[data-at^="${i}:"][data-at$=":${dir}"]`).forEach((el) => {
          const s = Number(el.getAttribute("data-at")!.split(":")[1]);
          if (s <= step && s > bestStep) {
            bestStep = s;
            best = el;
          }
        });
        if (best && step - bestStep < scoreStyle.stepsPerBeat) (best as Element).classList.add("drum-now");
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, drumsOn, drumBars, drumWindow, scoreStyle]);

  const voices = useStyleVoices(style, { fillEvery: grooveSettings.fillEvery, hand, crossStick, block: blockChoice, comping: drumsComping });
  // The faders shown: the parts this style plays (the open hi-hat counts as the hi-hat).
  const partInUse = useMemo(() => new Set<string>([...voices, ...(voices.has("hhClosed") ? ["hhOpen"] : [])]), [voices]);

  const toggle = useCallback(() => (running || starting ? stop() : void start()), [running, starting, start, stop]);
  useSpaceToggle(toggle);
  const tap = useTapTempo(setBpm);

  const downloading = starting && !running;
  const activeBar = running && now && now.info && song ? now.info.bar : null;
  const countingIn = running && now !== null && now.beat < 0;
  const ts = song?.timeSignature ?? style.meter;
  const countryOf = (id: string) => COUNTRIES.find((c) => c.id === id)?.label ?? "";
  // A groove written in a different meter from the chart plays the start of each of its bars.
  const meterMismatch = !!song && !style.swing && beatsInMeter(song.timeSignature) !== style.beats;

  // Only said when something needs doing; otherwise the controls speak for themselves.
  const playerInfo = !customPlayer ? null : styleLoading ? (
    <LoadingSpinner size="sm" inline label="Reading transcriptions" showLabel />
  ) : !bassStyle || bassStyle.transcriptions === 0 ? (
    <>
      No transcriptions yet — add some under{" "}
      <button type="button" className="font-semibold text-accent hover:underline" onClick={() => update({ tab: "players" })}>
        Bass players
      </button>
      .
    </>
  ) : bassStyle.usableBars === 0 ? (
    <>Their transcriptions need chord symbols to be matched to a chart.</>
  ) : null;

  const playerName = customPlayer?.name ?? "Computer";
  const chartName = noTune ? "No chart, just drums" : typed ? "Typed progression" : (meta?.title ?? "No chart");
  const needTune = <p className="text-xs text-muted">Pick a chart or type chords to add it.</p>;

  const panel = (
    <div className="shrink-0 overflow-hidden bg-surface text-left lg:rounded-lg lg:border lg:border-foreground/10">
      <PanelSection id="tempo" title="Tempo" icon={MetronomeIcon} summary={`${bpm} BPM`}>
        <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={ts.top} beatUnit={ts.bottom} onTap={tap} />
        {style.meter.bottom === 8 && <p className="-mt-2 text-center text-xs text-muted">Dotted quarter = {bpm}</p>}
      </PanelSection>

      <PanelSection id="tune" title="Tune" icon={ChordChartIcon} summary={`${chartName}${source === "chart" && transposeKey ? ` · in ${transposeKey}` : ""}`}>
        <Segmented
          label="Play over"
          value={source}
          onChange={switchSource}
          options={[
            { value: "none", label: "No chart" },
            { value: "chart", label: "A chart" },
            { value: "typed", label: "Typed" },
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
                className="w-full resize-y rounded-md bg-foreground/[0.05] px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent/40"
                aria-label="Chord progression"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => update({ typedText: p.text })}
                  className="rounded-md bg-background px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
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
        ) : source === "chart" ? (
          <>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex items-center gap-3 rounded-md bg-background px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{meta?.title ?? (loading ? "Loading your charts…" : "Pick a chart")}</span>
                {meta && <span className="block truncate text-xs text-muted">{[meta.key, meta.style].filter(Boolean).join(" · ")}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{meta ? "Change" : "Choose"}</span>
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
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          {song ? (
            <Field label="How long">
              <Select value={choruses} onChange={(v) => update({ choruses: v })} options={CHORUS_OPTIONS} disabled={running} className="w-full" />
            </Field>
          ) : (
            <span />
          )}
          <div className="pb-2">
            <SwitchRow label="Count-in" checked={countIn} 
              onChange={(v) => {
                update({ countIn: v });
                updateGroove({ countIn: v });
              }}
            />
          </div>
        </div>
      </PanelSection>

      <PanelSection id="style" title="Style" icon={DrumIcon} summary={`${style.name} · ${countryOf(style.country)}`}>
        {COUNTRIES.filter((c) => PICKABLE.some((s) => s.country === c.id)).map((f) => (
          <Field key={f.id} label={f.label}>
            <div className="flex flex-wrap gap-1.5">
              {PICKABLE.filter((s) => s.country === f.id).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  aria-pressed={s.id === style.id}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${s.id === style.id ? "bg-accent text-accent-foreground" : "bg-foreground/[0.05] hover:bg-surface-hover"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Field>
        ))}
        {style.swing && (
          <Field label="Swing">
            <Select value={swing} onChange={(v) => update({ swing: v })} options={SWING_OPTIONS} className="w-full" />
          </Field>
        )}
        {meterMismatch && (
          <p className="text-xs text-muted">
            This groove is in {style.meter.top}/{style.meter.bottom}; the chart is in {song!.timeSignature.top}/{song!.timeSignature.bottom}.
          </p>
        )}
      </PanelSection>

      <PanelSection
        id="drums"
        title="Drums"
        icon={DrumIcon}
        summary={!drumsOn ? (click ? "Off · click on 2 & 4" : "Off") : style.swing ? (drumsComping ? "With comping" : "Just time") : "On"}
      >
        {style.swing ? (
          <Segmented
            label="Drums"
            value={!drumsOn ? "off" : drumsComping ? "comp" : "time"}
            onChange={(v) => {
              if (v === "off") return update({ drums: "off" });
              update({ drums: "sticks" });
              setComping(v === "comp");
            }}
            options={[...(song ? [{ value: "off", label: "Off" }] : []), { value: "time", label: "Time" }, { value: "comp", label: "Comping" }]}
          />
        ) : (
          song && (
            <Segmented
              label="Drums"
              value={drumsOn ? "on" : "off"}
              onChange={(v) => update({ drums: v === "off" ? "off" : "sticks" })}
              options={[
                { value: "off", label: "Off" },
                { value: "on", label: "On" },
              ]}
            />
          )
        )}
        {!drumsOn ? (
          <SwitchRow label="Hi-hat click on 2 & 4" checked={click} onChange={(v) => update({ click: v })} />
        ) : style.swing ? (
          <button
            type="button"
            onClick={() => setDrumSettingsOpen(true)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-background px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            <SlidersIcon className="h-4 w-4" /> Drum settings
          </button>
        ) : (
          <>
            {mainTimeVoice(style) && (
              <Field label="Timekeeping">
                <Select
                  value={hand}
                  onChange={(v) => updateGroove({ hands: { ...grooveSettings.hands, [style.id]: v } })}
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
                    onChange={(v) => updateGroove({ crossSticks: { ...grooveSettings.crossSticks, [style.id]: v } })}
                    options={[
                      ...(style.lanes?.crossStick || style.variations?.some((v) => v.lanes.crossStick)
                        ? [{ value: "style" as ClaveChoice, label: "The style's own part" }]
                        : [{ value: "style" as ClaveChoice, label: "None (the style has none)" }]),
                      ...claveKindsFor(style).map((k) => ({ value: k as ClaveChoice, label: CLAVE_LABEL[k] })),
                      ...(style.lanes?.crossStick ? [{ value: "off" as ClaveChoice, label: "None" }] : []),
                    ]}
                    className="w-full"
                  />
                </Field>
                <Field label="Woodblock">
                  <Select
                    value={blockChoice}
                    onChange={(v) => updateGroove({ blocks: { ...grooveSettings.blocks, [style.id]: v } })}
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
            {claveDirectionMatters(style, grooveOpts) && (
              <Field label="Clave direction">
                <Segmented
                  label="Clave direction"
                  value={clave}
                  onChange={(v) => updateGroove({ claves: { ...grooveSettings.claves, [style.id]: v } })}
                  options={[
                    { value: "3-2", label: "3-2" },
                    { value: "2-3", label: "2-3" },
                  ]}
                />
              </Field>
            )}
            <Field label="Fills">
              <Select value={grooveSettings.fillEvery} onChange={(v) => updateGroove({ fillEvery: v })} options={FILL_OPTIONS} className="w-full" />
            </Field>
            <LevelRow label="Variation" value={grooveSettings.variation} onChange={(v) => updateGroove({ variation: v })} />
            <LevelRow label="Human feel" value={grooveSettings.humanize} onChange={(v) => updateGroove({ humanize: v })} />
          </>
        )}
      </PanelSection>

      <PanelSection
        id="bass"
        title="Bass"
        icon={BassIcon}
        summary={!song ? "Needs a chart" : !settings.bass ? "Off" : walking ? `${playerName}${customPlayer ? (learning ? " · their style" : " · their phrases") : ` · ${feel === "two" ? "two feel" : "walking"}`}` : style.name}
      >
        {!song ? (
          needTune
        ) : (
          <>
            <Segmented
              label="Bass"
              value={settings.bass ? "on" : "off"}
              onChange={(v) => update({ bass: v === "on" })}
              options={[
                { value: "off", label: "Off" },
                { value: "on", label: "Upright bass" },
              ]}
            />
            {settings.bass &&
              (walking ? (
                <>
                  <Field label="Player">
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
                </>
              ) : (
                <Field label="Part">
                  <p className="text-sm">{BASS_FAMILY_ABOUT[family]}</p>
                </Field>
              ))}
            {settings.bass && (
              <Field label="Touch">
                <Segmented label="Touch" value={touch} onChange={(v) => update({ touch: v })} disabled={running} options={TOUCH_OPTIONS} />
              </Field>
            )}
          </>
        )}
      </PanelSection>

      <PanelSection
        id="chords"
        title="Chords"
        icon={ChordIcon}
        summary={!song ? "Needs a chart" : chords === "off" ? "Off" : `${chords === "piano" ? "Piano" : "Rhodes"} · ${walking && chordStyle === "comp" ? "comping" : "held"}`}
      >
        {!song ? (
          needTune
        ) : (
          <>
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
            {chords !== "off" && walking && (
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
          </>
        )}
      </PanelSection>

      <PanelSection id="mix" title="Mix" icon={SpeakerIcon} summary={song ? `Bass ${Math.round(volume * 100)}%` : `Drums ${Math.round(drumsVolume * 100)}%`}>
        {song && (
          <>
            <LevelRow label="Bass" value={bassOn ? volume : null} onChange={(v) => update({ volume: v })} onTurnOn={() => update({ bass: true })} />
            <LevelRow label="Chords" value={chords === "off" ? null : chordVolume} onChange={(v) => update({ chordVolume: v })} onTurnOn={() => update({ chords: "piano" })} />
          </>
        )}
        <LevelRow label="Drums" value={drumsOn ? drumsVolume : null} onChange={(v) => update({ drumsVolume: v })} onTurnOn={() => update({ drums: "sticks" })} />
        {song && (
          <LevelRow
            label="Click"
            value={click && !drumsOn ? clickVolume : null}
            onChange={(v) => update({ clickVolume: v })}
            offLabel={drumsOn ? "Off with drums" : "Turn on"}
            onTurnOn={drumsOn ? undefined : () => update({ click: true })}
          />
        )}
        <LevelRow label="Room" value={room ? roomAmount : 0} onChange={(v) => update({ roomAmount: v, room: v > 0 })} />
        {drumsOn && (
          <>
            <div className="flex items-baseline justify-between border-t border-foreground/10 pt-3">
              <span className="text-xs font-semibold text-muted">Kit</span>
              {Object.keys(grooveSettings.parts).length > 0 && (
                <button type="button" onClick={() => updateGroove({ parts: {} })} className="text-xs font-semibold text-accent hover:underline">
                  Reset kit
                </button>
              )}
            </div>
            {KIT_PARTS.filter((p) => p.voices.some((v) => partInUse.has(v))).map((p) => (
              <PartFader
                key={p.id}
                label={p.label}
                value={grooveSettings.parts[p.id] ?? PART_DEFAULT}
                onChange={(v) => {
                  const parts = { ...grooveSettings.parts, [p.id]: v };
                  if (Math.abs(v - PART_DEFAULT) < 0.005) delete parts[p.id];
                  updateGroove({ parts });
                }}
              />
            ))}
          </>
        )}
      </PanelSection>
    </div>
  );

  const status = loadError
    ? "Couldn't download the sounds — check your connection and try again."
    : downloading
      ? `Downloading the sounds… ${Math.round((download ?? 0) * 100)}%`
      : partDownload !== null
        ? `Downloading… ${Math.round(partDownload * 100)}%`
        : countingIn
          ? `Count-in… ${(now?.beat ?? 0) + (song ? ts.top : style.beats) + 1}`
          : running && now?.info && song
            ? `Chorus ${now.info.chorus + 1} · ${now.info.harmony ? prettyQuality(now.info.harmony.symbol) : "N.C."}${
                playingPlayer && bassOn ? ` · ${learning ? `in ${playingPlayer.name}'s style` : now.info.from ? `from ${now.info.from}` : "filling in"}` : ""
              }`
            : "";

  const transport = (
    <div className="-mt-2 flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={styleLoading}
          className={running || downloading ? BIG_SECONDARY : BIG_PRIMARY}
        >
          {running || downloading ? <StopIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          {running || downloading ? "Stop" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => setOptionsOpen(true)}
          aria-label="Options"
          className="flex h-11 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover lg:hidden"
        >
          <SlidersIcon className="h-4 w-4" /> Options
        </button>
      </div>
      <OptionsSummaryChip summary={`${bpm} BPM · ${style.name}`} onOpen={() => setOptionsOpen(true)} />
      <p className="min-h-5 text-center text-sm text-muted tabular-nums" aria-live="polite">
        {status}
      </p>
    </div>
  );

  const drumsCard = drumsOn && (
    <div className="min-w-0 rounded-lg bg-surface p-3 text-left sm:p-5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className={song ? "text-sm font-medium" : "text-base font-semibold"}>
            {song ? "Drums" : style.name}
            <span className="ml-2 text-sm font-normal text-muted">{song ? style.name : countryOf(style.country)}</span>
            {claveDirectionMatters(style, grooveOpts) && <span className="ml-2 text-sm font-normal text-muted">· {clave} clave</span>}
          </h2>
          {!song && <p className="max-w-2xl text-sm text-muted">{style.about}</p>}
        </div>
        {!running && (
          <button
            type="button"
            onClick={() => setGrooveSeed(newSeed())}
            className="flex h-8 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            <ShuffleIcon className="h-4 w-4 text-muted" /> New groove
          </button>
        )}
      </div>
      <GrooveScore style={scoreStyle} bars={drumBars} firstBar={drumFirstBar} voices={voices} scoreRef={drumScoreRef} />
    </div>
  );

  return (
    <ToolLayout
      title="Rhythm Section"
      titleExtra={<span className="hidden text-xs text-muted sm:inline">Bass idea and built-in transcriptions by Rob Moreno</span>}
      layout="stacked"
      topAligned
      options={null}
      presets={presets}
    >
      {/* The shared switch in its reward look (the gradient), like the other tools' mode switches
          and the Shed Log's views; the rest of this page keeps its own plain options. */}
      <RewardProvider href="/rhythm-section" color="var(--accent)">
        <Segmented
          onPage
          label="Rhythm Section section"
          value={tab}
          onChange={(v) => {
            if (v !== "play") stop();
            update({ tab: v });
          }}
          options={[
            { value: "play", label: "Band" },
            { value: "players", label: "Bass players" },
          ]}
        />
      </RewardProvider>
      {tab === "play" && transport}
      {tab === "players" ? (
        <BassPlayersTab />
      ) : (
        <div className="grid w-full max-w-[100rem] gap-6 text-left lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
          <aside ref={asideRef} aria-label="Settings" className="hidden min-w-0 lg:sticky lg:flex lg:flex-col lg:top-4 lg:overflow-y-auto lg:rounded-lg">
            {panel}
          </aside>
          <div className="grid min-w-0 gap-6">
            {!noTune && (
              <div className={`grid min-w-0 gap-6 ${scored && song && settings.showChart ? "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start" : ""}`}>
                {scored && (
                  <div ref={scoreBoxRef} className="bass-line-score w-full rounded-lg bg-surface p-3 text-left sm:p-5">
                    <style>{`.bass-line-score g.bass-now{fill:var(--accent);stroke:var(--accent);color:var(--accent)}`}</style>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1">
                      <h3 className="text-sm font-medium">Bass line{live && <span className="ml-2 font-normal text-muted">Chorus {viewed + 1}</span>}</h3>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <button
                          type="button"
                          onClick={() => update({ showChart: !settings.showChart })}
                          aria-pressed={settings.showChart}
                          title={settings.showChart ? "Hide the chord chart" : "Show the chord chart"}
                          className="flex h-7 items-center gap-1 rounded-md bg-foreground/[0.05] px-2.5 font-medium text-foreground transition-colors hover:bg-surface-hover"
                        >
                          {settings.showChart ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                          {settings.showChart ? "Hide chart" : "Show chart"}
                        </button>
                        {!live && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpened(null);
                              setSeed(newSeed());
                            }}
                            className="flex h-7 items-center gap-1 rounded-md bg-foreground/[0.05] px-2.5 font-medium text-foreground transition-colors hover:bg-surface-hover"
                          >
                            <ShuffleIcon className="h-3.5 w-3.5" /> New line
                          </button>
                        )}
                      </span>
                    </div>
                    {playingPlayer && shown && shown.phrases.length > 0 && (
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
                              className={`flex flex-col items-start rounded-md px-2.5 py-1 text-left text-xs transition-colors ${
                                i === playingPhrase ? "bg-accent text-accent-foreground" : openPhrase === i ? "bg-foreground/[0.12]" : "bg-foreground/[0.05] hover:bg-surface-hover"
                              }`}
                            >
                              <span className="font-medium">{b ? (b.from === b.to ? `Bar ${b.from + 1}` : `Bars ${b.from + 1}–${b.to + 1}`) : "Phrase"}</span>
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
                        <div className="w-full rounded-lg bg-surface p-2 text-left sm:p-6">
                          <ChordChart song={song} hideHeader activeBar={activeBar} />
                        </div>
                      ) : (
                        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">Type some chords to play over.</p>
                      )
                    ) : !loading && allSongs.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">
                        <p>You don&apos;t have any chord charts yet — the drums play on their own until you pick one.</p>
                        <Link href="/tunes?tab=charts" className="font-medium text-accent hover:underline">
                          Import or make one in Chord Charts
                        </Link>
                      </div>
                    ) : !chartId ? (
                      <button type="button" onClick={() => setPicking(true)} className="w-full rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground">
                        Pick one of your chord charts to play over. Until then, the drums play on their own.
                      </button>
                    ) : selectedSongLoading || (!song && loading) ? (
                      <LoadingSpinner label="Loading chart…" showLabel />
                    ) : song ? (
                      <div className="w-full rounded-lg bg-surface p-2 text-left sm:p-6">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 px-2 sm:px-0">
                          <h2 className="text-lg font-semibold tracking-tight">{song.title}</h2>
                          {/* One line, cut short with "…" in a narrow column (wrapping left "· 4/4" alone). */}
                          {(() => {
                            const details = [song.composer ? formatComposer(song.composer) : null, song.style || null, song.key, `${song.timeSignature.top}/${song.timeSignature.bottom}`]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              <p className="min-w-0 max-w-full truncate text-sm text-muted" title={details}>
                                {details}
                              </p>
                            );
                          })()}
                        </div>
                        <ChordChart song={song} hideHeader activeBar={activeBar} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted">That chart isn&apos;t in your library anymore.</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {drumsCard}
          </div>
        </div>
      )}

      {openDetail && playingPlayer && bassStyle && (
        <PhraseDialog
          phrase={openDetail.phrase}
          previous={openDetail.previous}
          bars={{ from: openDetail.bars.from + 1, to: openDetail.bars.to + 1 }}
          playerName={playingPlayer.name}
          median={bassStyle.median}
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

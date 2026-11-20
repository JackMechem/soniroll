import { BASS_PLAYERS, beatsInMeter, type BassFeel, type BassNote, type BassPhrase, type BassTouch, type PerformedBeat } from '@jam-practice/core/bassLine';
import { learnModel } from '@jam-practice/core/bassLearned';
import { chorusToTranscription } from '@jam-practice/core/bassLineScore';
import { analyzeStyle } from '@jam-practice/core/bassStyle';
import type { CompStyle } from '@jam-practice/core/comping';
import { KIT_PARTS, PART_DEFAULT, partGain, styleVoices } from '@jam-practice/core/drumKit';
import { DEFAULT_DRUM_CONFIG, drumConfigOf, type DrumConfig, type DrumVoice } from '@jam-practice/core/drums';
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
  type DrumStyle,
  type GrooveBar,
  type GrooveOptions,
  type HandChoice,
} from '@jam-practice/core/drumStyles';
import { formatComposer, KEY_NAMES, keyPitchClass, prettyQuality, transposeSong } from '@jam-practice/core/iRealPro';
import { useTapTempo } from '@jam-practice/core/meterControls';
import { BASS_FAMILY_ABOUT, bassFamilyOf } from '@jam-practice/core/rhythmSection';
import { parseTypedProgression } from '@jam-practice/core/typedProgression';
import { useConvexAuth } from '@convex-dev/auth/react';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dropdown } from '@/components/Dropdown';
import { BassIcon, ChevronRightIcon, ChordChartIcon, ChordIcon, DrumIcon, EyeOffIcon, MetronomeIcon, ShuffleIcon, SpeakerIcon } from '@/components/icons';
import { ChartPickerModal } from '@/components/library/ChartPickerModal';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import Score from '@/components/notation/Score';
import { LevelRow, PartFader } from '@/components/rhythmSection/controls';
import { DrumSettingsSheet } from '@/components/rhythmSection/DrumSettingsSheet';
import { GrooveScore } from '@/components/rhythmSection/DrumScore';
import { BassPlayersTab } from '@/components/rhythmSection/BassPlayersTab';
import { PhraseSheet } from '@/components/rhythmSection/PhraseSheet';
import { RhythmChart } from '@/components/rhythmSection/RhythmChart';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import { Field, GroupLabel, PillChoice, SheetButton, SheetDivider, SheetText, SliderField } from '@/components/tool/ear';
import { BigButton, TempoHero } from '@/components/tool/meter';
import { Segmented } from '@/components/tool/reward';
import { MoreOptionsChip, SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { EmptyState } from '@/components/ui';
import { compReady, loadComp, setCompRoom, setCompVolume, type CompInstrument } from '@/lib/compSounds';
import { ALL_VOICES, drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from '@/lib/drumSounds';
import { previewChorus, previewDrums, startRhythmSection, type BassSwing, type RhythmSectionRun } from '@/lib/rhythmSectionEngine';
import { loadUprightBass, setUprightBassRoom, setUprightBassVolume, uprightBassReady } from '@/lib/uprightBass';
import { useBassPlayers, usePlayerTranscriptions } from '@/lib/useBassPlayers';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useToolActivity } from '@/lib/toolTime';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';

// The website's two settings keys and defaults (`apps/web/components/RhythmSection.tsx`), so
// settings follow you between the two: the tune, bass, chords, swing drummer and mix under Bass
// Genius's key, the groove (style, tempo per style, clave, fills, kit faders) under the Drum
// Generator's. Fields only the website uses (the tab, the bass players) are kept as they are.

type BandSettings = {
  tab: 'play' | 'players';
  /** No chart (the drums on their own), one of your charts, or a typed progression. "" = never
      picked: "A chart", or "No chart" for someone with no charts. */
  source: '' | 'none' | 'chart' | 'typed';
  chartId: string;
  typedText: string;
  typedKey: string;
  typedMeter: '4/4' | '3/4';
  bass: boolean;
  /** "computer", or the id of a bass player (who plays from their transcriptions). */
  player: string;
  playerMode: 'copy' | 'learn';
  feel: BassFeel;
  touch: BassTouch;
  /** Bass Genius's tempo (0 = never set): the swing styles' tempo until one is set per style. */
  bpm: number;
  /** 0 = keep going until stopped. */
  choruses: number;
  countIn: boolean;
  click: boolean;
  swing: BassSwing;
  volume: number;
  room: boolean;
  /** "rhodes" may still be stored from before the Rhodes was taken out; it plays the piano. */
  chords: 'off' | CompInstrument | 'rhodes';
  chordStyle: CompStyle;
  chordVolume: number;
  /** "off" or on ("sticks"; an old "brushes" counts as on). With no chart the drums always play. */
  drums: string;
  drumsVolume: number;
  drumsComping: boolean;
  drumConfig: DrumConfig;
  clickVolume: number;
  roomAmount: number;
  /** "" = the chart's own key. */
  transposeKey: string;
  showChart: boolean;
};

const BAND_KEY = 'jam-practice-bass-genius';
const BAND_DEFAULTS: BandSettings = {
  tab: 'play',
  source: '',
  chartId: '',
  typedText: 'ii7 | V7 | Imaj7 | %',
  typedKey: 'C',
  typedMeter: '4/4',
  bass: true,
  player: 'computer',
  playerMode: 'copy',
  feel: 'walking',
  touch: 'medium',
  bpm: 0,
  choruses: 0,
  countIn: true,
  click: false,
  swing: 'auto',
  volume: 0.85,
  room: true,
  chords: 'off',
  chordStyle: 'comp',
  chordVolume: 0.6,
  clickVolume: 0.6,
  drums: 'sticks',
  drumsVolume: 0.7,
  drumsComping: false,
  drumConfig: DEFAULT_DRUM_CONFIG,
  roomAmount: 0.5,
  transposeKey: '',
  showChart: true,
};

type GrooveSettings = {
  /** "" = never picked: swing with a chart, bossa nova without. Old "swing-comping" reads as
      Medium swing with comping. */
  style: string;
  tempos: Record<string, number>;
  claves: Record<string, ClaveSide>;
  claveOnBlock: boolean;
  crossSticks: Record<string, ClaveChoice>;
  blocks: Record<string, ClaveChoice>;
  hands: Record<string, HandChoice>;
  fillEvery: number;
  variation: number;
  humanize: number;
  countIn: boolean;
  /** Each kit part's fader, 0–1 (0.5 = as recorded); missing = 0.5. */
  parts: Record<string, number>;
};

const GROOVE_KEY = 'jam-practice-drum-generator';
const GROOVE_DEFAULTS: GrooveSettings = {
  style: '',
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

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
/** Bars of drums shown at a time. */
const DRUM_WINDOW = 8;
/** A sheet's fade-out, before another full-screen thing opens (two at once trips iOS up). */
const SHEET_CLOSE_MS = 280;

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
  { value: 'auto', label: 'Swing (by tempo)' },
  { value: 'light', label: 'Light swing' },
  { value: 'hard', label: 'Hard swing' },
  { value: 'straight', label: 'Straight' },
];
const CHORUS_OPTIONS = [
  { value: 0, label: 'Keep going' },
  ...[1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: n === 1 ? 'Once through' : `${n} choruses` })),
];
/** Starting points for the typed progression. */
const PRESETS: { label: string; text: string }[] = [
  { label: 'ii–V–I', text: 'ii7 | V7 | Imaj7 | %' },
  { label: 'Minor ii–V–i', text: 'iiø7 | V7b9 | i-6 | %' },
  { label: 'I–vi–ii–V', text: 'Imaj7 | vi7 | ii7 | V7' },
  { label: 'Jazz blues', text: 'I7 | IV7 | I7 | v7 I7 | IV7 | #ivo7 | I7 | VI7 | ii7 | V7 | I7 VI7 | ii7 V7' },
  { label: 'Rhythm changes A', text: 'Imaj7 vi7 | ii7 V7 | iii7 VI7 | ii7 V7 | v7 I7 | IV7 #ivo7 | iii7 VI7 | ii7 V7' },
];
const METERS = { '4/4': { top: 4, bottom: 4 }, '3/4': { top: 3, bottom: 4 } } as const;
const TOUCH_OPTIONS: { value: BassTouch; label: string }[] = [
  { value: 'soft', label: 'Soft' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
];
const FILL_OPTIONS = [
  { value: 0, label: 'No fills' },
  { value: 4, label: 'Every 4 bars' },
  { value: 8, label: 'Every 8 bars' },
  { value: 16, label: 'Every 16 bars' },
];
/** The styles in the picker: the old "Swing with comping" is Medium swing with comping on. */
const PICKABLE = DRUM_STYLES.filter((s) => s.id !== 'swing-comping');
const PICKER_COUNTRIES = COUNTRIES.filter((c) => PICKABLE.some((s) => s.country === c.id));
const countryOf = (id: string) => COUNTRIES.find((c) => c.id === id)?.label ?? '';
const short = (text: string, max = 22) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

type WrittenChorus = { chorus: number; notes: BassNote[]; beats: PerformedBeat[]; start: number; phrases: BassPhrase[] };
type WrittenDrums = { chorus: number; bars: { time: GrooveBar[]; comp: GrooveBar[] } };

/**
 * Rhythm Section: a band to play along with — the website's tool (`apps/web/components/
 * RhythmSection.tsx`, the Band tab) for the phone. Pick a drum style and it plays on its own, or
 * pick one of your chord charts (or type chords) and an upright bass and a piano play the changes
 * with the drums; the style decides how the whole band plays. Play and the setting chips stay at
 * the top; the bass line, the chart and the drums, written out as they play, scroll under them.
 * The Bass players tab (the switch at the top) is where you make bass players by transcribing their
 * lines (`components/rhythmSection/BassPlayersTab.tsx`).
 */
function RhythmSectionScreen() {
  const { colors, derived } = useAppTheme();
  const [settings, update, bandReady] = useSyncedSettings(BAND_KEY, BAND_DEFAULTS);
  const [grooveSettings, updateGroove, grooveReady] = useSyncedSettings(GROOVE_KEY, GROOVE_DEFAULTS);
  const { source: storedSource, chartId, typedText, typedKey, typedMeter, player, playerMode, feel, touch, choruses, click, swing, volume, room, transposeKey, chordStyle, chordVolume, clickVolume, roomAmount, drumsVolume } =
    settings;
  const countIn = settings.countIn && grooveSettings.countIn;
  const drumConfig = useMemo(() => drumConfigOf(settings.drumConfig), [settings.drumConfig]);

  // Sheets opened from inside other sheets (a chart picker, the drum settings) wait for the first
  // to close.
  const [tuneOpen, setTuneOpen] = useState(false);
  const [drumsOpen, setDrumsOpen] = useState(false);
  const [drumSettingsOpen, setDrumSettingsOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const afterSheet = (closeSheet: () => void, then: () => void) => {
    closeSheet();
    setTimeout(then, SHEET_CLOSE_MS);
  };

  // ——— The tune ———
  const { isLoading: authLoading } = useConvexAuth();
  const { selectedSong, selectedSongLoading, allSongs, loading } = useChordChartsLibrary((storedSource === 'chart' || storedSource === '') && chartId ? chartId : null);
  // Never picked: "A chart", except for someone with no charts yet, who starts on "No chart".
  const source = storedSource || (bandReady && !authLoading && !loading && allSongs.length === 0 ? 'none' : 'chart');
  const typed = source === 'typed';
  const noTune = source === 'none';
  const meta = allSongs.find((s) => s.id === chartId) ?? null;
  const chartSong = useMemo(() => {
    if (!selectedSong || !transposeKey) return selectedSong;
    const semis = (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selectedSong.key) + 12) % 12;
    return semis ? transposeSong(selectedSong, semis) : selectedSong;
  }, [selectedSong, transposeKey]);
  const typedResult = useMemo(
    () => parseTypedProgression(typedText, Math.max(0, KEY_NAMES.indexOf(typedKey)), METERS[typedMeter] ?? METERS['4/4']),
    [typedText, typedKey, typedMeter],
  );
  const song = noTune ? null : typed ? typedResult.song : chartSong;
  const wantsTune = typed || (source === 'chart' && !!chartId);

  // ——— The style ———
  const storedStyle = grooveSettings.style === 'swing-comping' ? 'medium-swing' : grooveSettings.style;
  const style = useMemo(
    () => styleById(storedStyle || (wantsTune ? ((song ? beatsInMeter(song.timeSignature) : 4) === 3 ? 'jazz-waltz' : 'medium-swing') : 'bossa-nova')),
    [storedStyle, wantsTune, song],
  );
  const family = bassFamilyOf(style);
  const walking = family === 'walking';
  const drumsComping = settings.drumsComping || grooveSettings.style === 'swing-comping';
  const setStyle = (id: string) => updateGroove({ style: id });
  const setComping = (on: boolean) => {
    update({ drumsComping: on });
    if (grooveSettings.style === 'swing-comping') updateGroove({ style: 'medium-swing' });
  };
  const clave: ClaveSide = grooveSettings.claves[style.id] ?? style.clave?.written ?? '2-3';
  const crossStick: ClaveChoice = grooveSettings.crossSticks[style.id] ?? 'style';
  const blockChoice: ClaveChoice = grooveSettings.blocks[style.id] ?? (grooveSettings.claveOnBlock && style.clave ? 'style' : 'off');
  const hand: HandChoice = grooveSettings.hands[style.id] ?? 'style';
  const grooveOpts: GrooveOptions = useMemo(
    () => ({ clave, crossStick, block: blockChoice, hand, fillEvery: grooveSettings.fillEvery, variation: grooveSettings.variation }),
    [clave, crossStick, blockChoice, hand, grooveSettings.fillEvery, grooveSettings.variation],
  );
  const tempos = grooveSettings.tempos;
  const bpm = tempos[style.id] ?? (style.swing && settings.bpm > 0 ? settings.bpm : style.tempo.initial);
  const setBpm = (v: number) => updateGroove({ tempos: { ...tempos, [style.id]: Math.max(20, Math.min(400, Math.round(v))) } });
  const tap = useTapTempo(setBpm);

  // What plays: with no chart, just the drums.
  const bassOn = !!song && settings.bass;
  const chords: 'off' | CompInstrument = song && settings.chords !== 'off' ? 'piano' : 'off';
  const drumsOn = !song || settings.drums !== 'off';

  // ——— The bass player ———
  const { players, loading: playersLoading } = useBassPlayers();
  const customPlayer = player === 'computer' ? null : (players.find((p) => p.id === player) ?? null);
  const playerTranscriptions = usePlayerTranscriptions(customPlayer?.id ?? null, customPlayer?.name);
  const bassStyle = useMemo(() => (customPlayer && playerTranscriptions ? analyzeStyle(customPlayer.name, playerTranscriptions) : null), [customPlayer, playerTranscriptions]);
  const model = useMemo(
    () => (customPlayer && playerTranscriptions && playerMode === 'learn' ? learnModel(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions, playerMode],
  );
  // Bass players play the swing styles' walking line.
  const playingPlayer = walking ? customPlayer : null;
  const learning = !!playingPlayer && playerMode === 'learn';
  const styleLoading = bassOn && !!playingPlayer && playerTranscriptions === undefined;

  const [running, setRunning] = useState(false);
  useToolActivity('/rhythm-section', running);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [download, setDownload] = useState<number | null>(null);
  const [partDownload, setPartDownload] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState<{ beat: number; info: PerformedBeat | null } | null>(null);
  const runRef = useRef<RhythmSectionRun | null>(null);
  // The line and the drums as they're written (a chorus ahead of the music).
  const [writtenChoruses, setWrittenChoruses] = useState<WrittenChorus[]>([]);
  const [writtenDrums, setWrittenDrums] = useState<WrittenDrums[]>([]);
  const [drumWindow, setDrumWindow] = useState(0);
  // The phrase whose working is open.
  const [opened, setOpened] = useState<{ chorus: number; index: number } | null>(null);
  const [viewChorus, setViewChorus] = useState(0);
  // The previews show what these seeds play; Play uses the same ones. "New line" / "New groove".
  const [seed, setSeed] = useState(newSeed);
  const [grooveSeed, setGrooveSeed] = useState(newSeed);

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
  // Parts switched on while playing: load them if needed, then bring them in.
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (!drumsOn) return run.setDrums(false);
    if (drumsReady('sticks', ALL_VOICES)) return run.setDrums(true);
    let live = true;
    loadDrums('sticks', (f) => live && setPartDownload(f), ALL_VOICES)
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
    if (chords === 'off') return run.setComp(null);
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

  const stop = () => {
    runRef.current?.stop();
    runRef.current = null;
    startingRef.current = false;
    setStarting(false);
    setRunning(false);
    setNow(null);
    setOpened(null);
  };

  // Editing the typed progression while it plays takes over from the next time through.
  useEffect(() => {
    if (typed && typedResult.song) runRef.current?.setSong(typedResult.song);
  }, [typed, typedResult.song]);
  const switchSource = (next: 'none' | 'chart' | 'typed') => {
    if (next === source) return;
    stop();
    update({ source: next });
  };

  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setLoadError(false);
    // Each part's loading counts toward the progress shown.
    const parts = [bassOn && !uprightBassReady(), drumsOn && !drumsReady('sticks', ALL_VOICES)].filter(Boolean).length;
    const progress = [0, 0];
    const report = (i: number) => (f: number) => {
      progress[i] = f;
      setDownload(parts ? (progress[0] + progress[1]) / parts : 1);
    };
    setDownload(parts ? 0 : 1);
    try {
      await Promise.all([
        bassOn ? loadUprightBass(report(0)) : Promise.resolve(),
        drumsOn ? loadDrums('sticks', report(1), ALL_VOICES) : Promise.resolve(),
        chords !== 'off' ? loadComp(chords).catch(() => undefined) : Promise.resolve(),
      ]);
    } catch {
      setLoadError(true);
      startingRef.current = false;
      setStarting(false);
      return;
    }
    if (!startingRef.current) return; // stopped while loading
    setUprightBassVolume(volume);
    setUprightBassRoom(room ? roomAmount : 0);
    setDrumsVolume(drumsVolume);
    setDrumsRoom(room ? roomAmount : 0);
    setCompVolume(chordVolume);
    setCompRoom(room ? roomAmount : 0);
    setWrittenChoruses([]);
    setWrittenDrums([]);
    setDrumWindow(0);
    setViewChorus(0);
    setOpened(null);
    runRef.current = startRhythmSection({
      song,
      bass: bassOn,
      line: { player: playingPlayer ? player : 'computer', feel, touch, styleMode: playerMode },
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
      comp: chords !== 'off' && compReady(chords) ? { instrument: chords, style: chordStyle } : null,
      onBeat: (beat, info) => {
        setNow({ beat, info });
        if (info) setViewChorus(info.chorus);
      },
      onWrite: (chorus, notes, beats, startBeat, phrases) =>
        setWrittenChoruses((list) => [...list.filter((c) => c.chorus >= chorus - 2 && c.chorus !== chorus), { chorus, notes, beats, start: startBeat, phrases }]),
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
  };

  // ——— What's shown ———
  // Stopped: the line written as the options are set (tempo deferred, so dragging it stays smooth).
  const previewBpm = useDeferredValue(bpm);
  const preview = useMemo(() => {
    if (!song || !bassOn || styleLoading) return null;
    const line = { player: playingPlayer ? player : 'computer', feel, touch, styleMode: playerMode };
    return {
      chorus: 0,
      ...previewChorus({ song, line, style: playingPlayer ? bassStyle : null, model: playingPlayer ? model : null, bpm: previewBpm, choruses, seed, groove: style }),
    };
  }, [song, bassOn, styleLoading, playingPlayer, player, feel, touch, playerMode, bassStyle, model, previewBpm, choruses, seed, style]);
  const live = running || starting;
  const choruses_ = live ? writtenChoruses : preview ? [preview] : [];
  const viewed = live ? viewChorus : 0;
  const shown = bassOn ? (choruses_.find((c) => c.chorus === viewed) ?? null) : null;
  const preferFlat = !/^(G|D|A|E|B|F#|C#)(?!b)/.test(song?.key ?? '');
  const scored = useMemo(
    () => (shown && song ? chorusToTranscription(shown.notes, shown.beats, shown.start, { title: '', preferFlat, timeSignature: song.timeSignature }) : null),
    [shown, song, preferFlat],
  );
  const phraseBars = useMemo(() => (shown ? barsOfPhrases(shown) : []), [shown]);
  const openPhrase = opened && opened.chorus === viewed ? opened.index : null;
  const openChorus = opened ? (choruses_.find((c) => c.chorus === opened.chorus) ?? null) : null;
  const openDetail = useMemo(() => {
    if (!opened || !openChorus || !song) return null;
    const phrase = openChorus.phrases[opened.index];
    if (!phrase) return null;
    const bars = barsOfPhrases(openChorus)[opened.index];
    const t = chorusToTranscription(openChorus.notes, openChorus.beats, openChorus.start, { title: '', preferFlat, timeSignature: song.timeSignature }).transcription;
    return { phrase, previous: openChorus.phrases[opened.index - 1] ?? null, bars, played: { ...t, measures: t.measures.slice(bars.from, bars.to + 1) } };
  }, [opened, openChorus, song, preferFlat]);
  const nowBeat = running && now && now.beat >= 0 ? now.beat : null;
  const playingPhrase = nowBeat !== null && shown ? shown.phrases.findIndex((p) => nowBeat >= p.beat && nowBeat < p.beat + p.length) : -1;
  // The note being heard, lit on the staff (it isn't scrolled to: Jack found that annoying).
  const playingNote = useMemo(() => {
    if (nowBeat === null || !scored) return null;
    let at: (typeof scored.noteAt)[number] | null = null;
    for (const n of scored.noteAt) {
      if (n.beat > nowBeat + 1e-6) break;
      at = n;
    }
    return at ? { measure: at.measure, note: at.note } : null;
  }, [nowBeat, scored]);

  // The drums: stopped, the first bars Play will play; playing, the bars around the music.
  const way = style.swing && drumsComping ? 'comp' : 'time';
  const previewDrumBars = useMemo(() => previewDrums({ song, groove: style, grooveOpts, drumConfig, choruses, grooveSeed }), [song, style, grooveOpts, drumConfig, choruses, grooveSeed]);
  const liveDrums = running && writtenDrums.length > 0;
  const drumBars = useMemo(() => {
    if (!liveDrums) return previewDrumBars[way].slice(0, DRUM_WINDOW);
    const all = writtenDrums.flatMap((c) => c.bars[way]);
    return all.filter((b) => b.bar >= drumWindow && b.bar < drumWindow + DRUM_WINDOW).sort((a, b) => a.bar - b.bar);
  }, [liveDrums, previewDrumBars, writtenDrums, way, drumWindow]);
  const drumFirstBar = (drumBars[0]?.bar ?? 0) + 1;
  // A swing drummer over a chart plays in the chart's meter.
  const scoreStyle = useMemo(() => (style.swing && song ? { ...style, meter: song.timeSignature, beats: beatsInMeter(song.timeSignature) } : style), [style, song]);
  const voices = useMemo(
    () => styleVoices(style, { fillEvery: grooveSettings.fillEvery, hand, crossStick, block: blockChoice, comping: drumsComping }),
    [style, grooveSettings.fillEvery, hand, crossStick, blockChoice, drumsComping],
  );
  // The faders shown: the parts this style plays (the open hi-hat counts as the hi-hat).
  const partInUse = useMemo(() => new Set<string>([...voices, ...(voices.has('hhClosed') ? ['hhOpen'] : [])]), [voices]);

  if (!bandReady || !grooveReady) return <ScreenSpinner />;

  const toggle = () => (running || starting ? stop() : void start());
  const downloading = starting && !running;
  const activeBar = running && now && now.info && song ? now.info.bar : null;
  const countingIn = running && now !== null && now.beat < 0;
  const ts = song?.timeSignature ?? style.meter;
  const meterMismatch = !!song && !style.swing && beatsInMeter(song.timeSignature) !== style.beats;
  const playerName = customPlayer?.name ?? 'Computer';
  const chartName = noTune ? 'No chart' : typed ? 'Typed chords' : (meta?.title ?? 'Pick a chart');
  const showClave = claveDirectionMatters(style, grooveOpts);

  const status = loadError
    ? "Couldn't load the sounds. Check your connection and try again."
    : downloading
      ? `Getting the sounds ready… ${Math.round((download ?? 0) * 100)}%`
      : partDownload !== null
        ? `Loading… ${Math.round(partDownload * 100)}%`
        : countingIn
          ? `Count-in… ${(now?.beat ?? 0) + (song ? ts.top : style.beats) + 1}`
          : running && now?.info && song
            ? `Chorus ${now.info.chorus + 1} · ${now.info.harmony ? prettyQuality(now.info.harmony.symbol) : 'N.C.'}${
                playingPlayer && bassOn ? ` · ${learning ? `in ${playingPlayer.name}'s style` : now.info.from ? `from ${now.info.from}` : 'filling in'}` : ''
              }`
            : '';

  const needTune = <SheetText>Pick a chart or type chords (under Tune) to add it.</SheetText>;
  const playerInfo = !customPlayer
    ? null
    : styleLoading
      ? 'Reading their transcriptions…'
      : !bassStyle || bassStyle.transcriptions === 0
        ? 'No transcriptions yet. Add some under Bass players, at the top.'
        : bassStyle.usableBars === 0
          ? 'Their transcriptions need chord symbols to be matched to a chart.'
          : null;

  const pickChart = () => afterSheet(() => setTuneOpen(false), () => setPicking(true));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Rhythm Section' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {/* The band, or making bass players (the website's two tabs; the choice syncs with it). */}
        <View className="px-4 pt-2">
          <Segmented
            onPage
            label="Rhythm Section section"
            value={settings.tab === 'players' ? 'players' : 'play'}
            onChange={(v) => {
              if (v !== 'play') stop();
              update({ tab: v });
            }}
            options={[
              { value: 'play', label: 'Band' },
              { value: 'players', label: 'Bass players' },
            ]}
          />
        </View>
        {settings.tab === 'players' ? (
          <BassPlayersTab />
        ) : (
          <>
          {/* Play and the settings stay put; the music scrolls under them. */}
          <View className="gap-2 pb-2 pt-3" style={{ borderBottomWidth: 1, borderBottomColor: derived.hairline }}>
            <View className="items-center gap-1 px-4">
              <BigButton label={running || starting ? 'Stop' : 'Play'} secondary={running || starting} disabled={styleLoading} onPress={toggle} />
              <Text numberOfLines={1} className="font-ui min-h-5 text-center text-sm" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
                {status}
              </Text>
            </View>
            <View className="px-4">
              <SettingsBar>
                <SettingChip Icon={MetronomeIcon} label="Tempo" value={`${bpm} BPM`}>
                  <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={ts.top} beatUnit={ts.bottom} onTap={tap} />
                  {style.meter.bottom === 8 ? <SheetText>Dotted quarter = {bpm}</SheetText> : null}
                </SettingChip>

                <SettingChip Icon={ChordChartIcon} label="Tune" value={short(chartName)} open={tuneOpen} onOpenChange={setTuneOpen}>
                  <Field label="Play over">
                    <Segmented
                      label="Play over"
                      value={source}
                      onChange={switchSource}
                      options={[
                        { value: 'none', label: 'No chart' },
                        { value: 'chart', label: 'A chart' },
                        { value: 'typed', label: 'Typed' },
                      ]}
                    />
                  </Field>
                  {typed ? (
                    <>
                      <Field label="Chords" hint="Chord names (Dm7 G7 | Cmaj7) or numerals (ii7 V7 | Imaj7), with | between bars and % to repeat a bar.">
                        <TextInput
                          value={typedText}
                          onChangeText={(t) => update({ typedText: t })}
                          multiline
                          autoCapitalize="none"
                          autoCorrect={false}
                          spellCheck={false}
                          placeholder="Dm7 G7 | Cmaj7 | %"
                          placeholderTextColor={colors.muted}
                          accessibilityLabel="Chord progression"
                          className="font-ui min-h-20 rounded-lg px-3 py-2 text-base"
                          style={{ backgroundColor: colors.background, color: colors.foreground, textAlignVertical: 'top' }}
                        />
                        {typedResult.unknown.length > 0 ? (
                          <Text className="font-ui text-sm" style={{ color: colors.danger }}>
                            Didn’t understand: {typedResult.unknown.map((t) => `“${t}”`).join(', ')}
                          </Text>
                        ) : null}
                      </Field>
                      <View className="flex-row flex-wrap gap-2">
                        {PRESETS.map((p) => (
                          <SheetButton key={p.label} label={p.label} onPress={() => update({ typedText: p.text })} />
                        ))}
                      </View>
                      <Field label={typedResult.usesNumerals ? 'Key' : 'Key (for numerals)'}>
                        <View className="flex-row">
                          <Dropdown value={typedKey} onChange={(v) => update({ typedKey: v })} options={KEY_NAMES.map((k) => ({ value: k, label: k }))} />
                        </View>
                      </Field>
                      <Field label="Time">
                        <Segmented
                          label="Time"
                          value={typedMeter}
                          onChange={(v) => {
                            stop();
                            update({ typedMeter: v });
                          }}
                          options={[
                            { value: '4/4', label: '4/4' },
                            { value: '3/4', label: '3/4' },
                          ]}
                        />
                      </Field>
                    </>
                  ) : source === 'chart' ? (
                    <>
                      <ChartButton title={meta?.title ?? (loading ? 'Loading your charts…' : 'Pick a chart')} detail={meta ? [meta.key, meta.style].filter(Boolean).join(' · ') : ''} action={meta ? 'Change' : 'Choose'} onPress={pickChart} />
                      <Field label="Key">
                        <View className="flex-row">
                          <Dropdown
                            value={transposeKey}
                            onChange={(v) => {
                              // A new key is a different bass line: stop rather than keep playing the old one.
                              stop();
                              update({ transposeKey: v });
                            }}
                            options={[{ value: '', label: `Original${selectedSong?.key ? ` (${selectedSong.key})` : ''}` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
                          />
                        </View>
                      </Field>
                    </>
                  ) : (
                    <SheetText>The drums play on their own. Pick a chart or type chords to add a bass and a piano.</SheetText>
                  )}
                  {song ? (
                    <Field label="How long">
                      <View className="flex-row" pointerEvents={running ? 'none' : 'auto'} style={{ opacity: running ? 0.5 : 1 }}>
                        <Dropdown value={choruses} onChange={(v) => update({ choruses: v })} options={CHORUS_OPTIONS} />
                      </View>
                    </Field>
                  ) : null}
                  <SwitchRow
                    label="Count-in"
                    hint="A bar of hi-hat (or a click, with the drums off) before the band comes in."
                    checked={countIn}
                    onChange={(v) => {
                      update({ countIn: v });
                      updateGroove({ countIn: v });
                    }}
                  />
                </SettingChip>

                <SettingChip Icon={DrumIcon} label="Style" value={style.name}>
                  <View className="gap-1">
                    <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
                      {style.name}{' '}
                      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                        {countryOf(style.country)}
                      </Text>
                    </Text>
                    <SheetText>{style.about}</SheetText>
                  </View>
                  {PICKER_COUNTRIES.map((c) => (
                    <View key={c.id} className="gap-2">
                      <GroupLabel>{c.label}</GroupLabel>
                      <PillChoice label={c.label} value={style.id} onChange={setStyle} options={PICKABLE.filter((s) => s.country === c.id).map((s) => ({ value: s.id, label: s.name }))} />
                    </View>
                  ))}
                  <SheetDivider title="Groove" />
                  {style.swing ? (
                    <Field label="Swing" hint="How long the first eighth note of each pair is. By tempo swings harder at slow tempos and lighter as it gets fast.">
                      <View className="flex-row">
                        <Dropdown value={swing} onChange={(v) => update({ swing: v })} options={SWING_OPTIONS} />
                      </View>
                    </Field>
                  ) : null}
                  {meterMismatch ? (
                    <SheetText>
                      This groove is in {style.meter.top}/{style.meter.bottom}; the chart is in {song!.timeSignature.top}/{song!.timeSignature.bottom}.
                    </SheetText>
                  ) : null}
                  {!style.swing ? (
                    <GrooveOptionsFields
                      style={style}
                      hand={hand}
                      crossStick={crossStick}
                      blockChoice={blockChoice}
                      clave={clave}
                      showClave={showClave}
                      grooveSettings={grooveSettings}
                      updateGroove={updateGroove}
                    />
                  ) : null}
                  {!running ? <SheetButton label="New groove" onPress={() => setGrooveSeed(newSeed())} /> : null}
                </SettingChip>

                {/* The rest in one "More options" chip, so the chips stay a row or two and the music keeps its room. */}
                <MoreOptionsChip>
                  <SettingChip
                    Icon={DrumIcon}
                    label="Drums"
                    value={!drumsOn ? (click ? 'Click' : 'Off') : style.swing ? (drumsComping ? 'Comping' : 'Time') : 'On'}
                    open={drumsOpen}
                    onOpenChange={setDrumsOpen}
                  >
                    {style.swing ? (
                      <Segmented
                        label="Drums"
                        value={!drumsOn ? 'off' : drumsComping ? 'comp' : 'time'}
                        onChange={(v) => {
                          if (v === 'off') return update({ drums: 'off' });
                          update({ drums: 'sticks' });
                          setComping(v === 'comp');
                        }}
                        options={[...(song ? [{ value: 'off', label: 'Off' }] : []), { value: 'time', label: 'Time' }, { value: 'comp', label: 'Comping' }]}
                      />
                    ) : song ? (
                      <Segmented
                        label="Drums"
                        value={drumsOn ? 'on' : 'off'}
                        onChange={(v) => update({ drums: v === 'off' ? 'off' : 'sticks' })}
                        options={[
                          { value: 'off', label: 'Off' },
                          { value: 'on', label: 'On' },
                        ]}
                      />
                    ) : (
                      <SheetText>With no chart the drums always play.</SheetText>
                    )}
                    {!drumsOn ? (
                      <SwitchRow label="Hi-hat click on 2 & 4" checked={click} onChange={(v) => update({ click: v })} />
                    ) : style.swing ? (
                      <SheetButton label="Drum settings" onPress={() => afterSheet(() => setDrumsOpen(false), () => setDrumSettingsOpen(true))} />
                    ) : null}
                    {drumsOn ? (
                      <View className="gap-4">
                        <Field
                          label="Kit"
                          hint="A fader for each part of the kit: the middle is the level it was recorded at."
                          aside={Object.keys(grooveSettings.parts).length > 0 ? <SheetButton label="Reset kit" onPress={() => updateGroove({ parts: {} })} /> : null}
                        />
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
                      </View>
                    ) : null}
                  </SettingChip>

                  <SettingChip
                    Icon={BassIcon}
                    label="Bass"
                    value={!song ? 'Needs a chart' : !settings.bass ? 'Off' : walking ? (customPlayer ? playerName : feel === 'two' ? 'Two feel' : 'Walking') : 'Style part'}
                    toggle={song ? { checked: settings.bass, onChange: (on) => update({ bass: on }) } : undefined}
                  >
                    {!song ? (
                      needTune
                    ) : (
                      <>
                        <Segmented
                          label="Bass"
                          value={settings.bass ? 'on' : 'off'}
                          onChange={(v) => update({ bass: v === 'on' })}
                          options={[
                            { value: 'off', label: 'Off' },
                            { value: 'on', label: 'Upright bass' },
                          ]}
                        />
                        {settings.bass && walking ? (
                          <>
                            <Field label="Player" hint="The Computer walks a line from scratch. A bass player (Ray Brown is built in; add your own on the website) plays from their transcriptions.">
                              <View className="flex-row" pointerEvents={running ? 'none' : 'auto'} style={{ opacity: running ? 0.5 : 1 }}>
                                <Dropdown
                                  value={customPlayer || playersLoading ? player : 'computer'}
                                  onChange={(v) => update({ player: v })}
                                  options={[...BASS_PLAYERS.map((p) => ({ value: p.id as string, label: p.label })), ...players.map((p) => ({ value: p.id, label: p.name }))]}
                                />
                              </View>
                            </Field>
                            {customPlayer ? (
                              <Field label="How they play" hint="Their phrases reuses their lines, moved to fit this chart. Their style writes new lines the way they play.">
                                <Segmented
                                  label="How they play"
                                  value={playerMode}
                                  onChange={(v) => update({ playerMode: v })}
                                  disabled={running}
                                  options={[
                                    { value: 'copy', label: 'Their phrases' },
                                    { value: 'learn', label: 'Their style' },
                                  ]}
                                />
                                {playerInfo ? <SheetText>{playerInfo}</SheetText> : null}
                              </Field>
                            ) : (
                              <Field label="Feel">
                                <Segmented
                                  label="Feel"
                                  value={feel}
                                  onChange={(v) => update({ feel: v })}
                                  disabled={running}
                                  options={[
                                    { value: 'walking', label: 'Walking in 4' },
                                    { value: 'two', label: 'Two feel' },
                                  ]}
                                />
                              </Field>
                            )}
                          </>
                        ) : settings.bass ? (
                          <Field label="Part">
                            <SheetText>{BASS_FAMILY_ABOUT[family]}</SheetText>
                          </Field>
                        ) : null}
                        {settings.bass ? (
                          <Field label="Touch" hint="How hard the strings are plucked.">
                            <Segmented label="Touch" value={touch} onChange={(v) => update({ touch: v })} disabled={running} options={TOUCH_OPTIONS} />
                          </Field>
                        ) : null}
                      </>
                    )}
                  </SettingChip>

                  <SettingChip
                    Icon={ChordIcon}
                    label="Chords"
                    value={!song ? 'Needs a chart' : chords === 'off' ? 'Off' : `Piano · ${walking && chordStyle === 'comp' ? 'comping' : 'held'}`}
                    toggle={song ? { checked: chords !== 'off', onChange: (on) => update({ chords: on ? 'piano' : 'off' }) } : undefined}
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
                            { value: 'off', label: 'Off' },
                            { value: 'piano', label: 'Piano' },
                          ]}
                        />
                        {chords !== 'off' && walking ? (
                          <Field label="Rhythm" hint="Comping plays varied rhythms; Held plays one chord per change. Styles other than swing hold the chords.">
                            <Segmented
                              label="Chord rhythm"
                              value={chordStyle}
                              onChange={(v) => update({ chordStyle: v })}
                              options={[
                                { value: 'comp', label: 'Comping' },
                                { value: 'sustain', label: 'Held' },
                              ]}
                            />
                          </Field>
                        ) : null}
                      </>
                    )}
                  </SettingChip>

                  <SettingChip Icon={SpeakerIcon} label="Mix" value={song ? `Bass ${Math.round(volume * 100)}%` : `Drums ${Math.round(drumsVolume * 100)}%`}>
                    {song ? (
                      <>
                        <LevelRow label="Bass" value={bassOn ? volume : null} onChange={(v) => update({ volume: v })} onTurnOn={() => update({ bass: true })} />
                        <LevelRow label="Chords" value={chords === 'off' ? null : chordVolume} onChange={(v) => update({ chordVolume: v })} onTurnOn={() => update({ chords: 'piano' })} />
                      </>
                    ) : null}
                    <LevelRow label="Drums" value={drumsOn ? drumsVolume : null} onChange={(v) => update({ drumsVolume: v })} onTurnOn={() => update({ drums: 'sticks' })} />
                    {song ? (
                      <LevelRow
                        label="Click"
                        value={click && !drumsOn ? clickVolume : null}
                        onChange={(v) => update({ clickVolume: v })}
                        offLabel={drumsOn ? 'Off with drums' : 'Turn on'}
                        onTurnOn={drumsOn ? undefined : () => update({ click: true })}
                      />
                    ) : null}
                    <LevelRow label="Room" value={room ? roomAmount : 0} onChange={(v) => update({ roomAmount: v, room: v > 0 })} />
                  </SettingChip>
                </MoreOptionsChip>
              </SettingsBar>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {!noTune && scored ? (
              <Card>
                <View className="flex-row flex-wrap items-center gap-2 px-1">
                  <Text className="font-ui-semibold flex-1 text-base font-semibold" style={{ color: colors.foreground }}>
                    Bass line
                    {live ? (
                      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                        {'  '}Chorus {viewed + 1}
                      </Text>
                    ) : null}
                  </Text>
                  <SmallButton
                    label={settings.showChart ? 'Hide chart' : 'Show chart'}
                    Icon={settings.showChart ? EyeOffIcon : ChordChartIcon}
                    onPress={() => update({ showChart: !settings.showChart })}
                  />
                  {/* Stays in place while playing (disabled) so the notation doesn't jump. */}
                  <SmallButton
                    label="New line"
                    Icon={ShuffleIcon}
                    disabled={live}
                    onPress={() => {
                      setOpened(null);
                      setSeed(newSeed());
                    }}
                  />
                </View>
                {playingPlayer && shown && shown.phrases.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -12 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
                    {shown.phrases.map((p, i) => {
                      const b = phraseBars[i];
                      const src = p.source;
                      return (
                        <PhraseChip
                          key={i}
                          title={b ? (b.from === b.to ? `Bar ${b.from + 1}` : `Bars ${b.from + 1}–${b.to + 1}`) : 'Phrase'}
                          detail={src ? `${src.title} ${Math.floor(src.startBeat / 4) + 1}–${Math.ceil((src.startBeat + p.length) / 4)}` : p.learned ? 'New, in their style' : 'Computer'}
                          playing={i === playingPhrase}
                          open={openPhrase === i}
                          onPress={() => setOpened({ chorus: viewed, index: i })}
                        />
                      );
                    })}
                  </ScrollView>
                ) : null}
                <Score transcription={scored.transcription} playing={playingNote} range={openPhrase !== null && phraseBars[openPhrase] ? phraseBars[openPhrase] : null} />
              </Card>
            ) : null}

            {!noTune && (!song || !scored || settings.showChart) ? (
              typed ? (
                song ? (
                  <Card>
                    <RhythmChart song={song} activeBar={activeBar} />
                  </Card>
                ) : (
                  <EmptyState Icon={ChordChartIcon} title="No chords yet" body="Type some chords to play over, under Tune." action={{ label: 'Type chords', onPress: () => setTuneOpen(true) }} />
                )
              ) : !loading && allSongs.length === 0 ? (
                <EmptyState
                  Icon={ChordChartIcon}
                  title="No chord charts yet"
                  body="The drums play on their own until you pick one. Import or make a chart in Charts."
                  action={{ label: 'Go to Charts', onPress: () => router.push('/charts') }}
                />
              ) : !chartId ? (
                <EmptyState
                  Icon={ChordChartIcon}
                  title="No chart picked"
                  body="Pick one of your chord charts to play over. Until then, the drums play on their own."
                  action={{ label: 'Pick a chart', onPress: () => setPicking(true) }}
                />
              ) : selectedSongLoading || (!song && loading) ? (
                <LoadingSpinner showLabel label="Loading chart…" />
              ) : song ? (
                <Card>
                  <View className="gap-0.5 px-1">
                    <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.foreground }}>
                      {song.title}
                    </Text>
                    <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
                      {[song.composer ? formatComposer(song.composer) : null, song.style || null, song.key, `${song.timeSignature.top}/${song.timeSignature.bottom}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <RhythmChart song={song} activeBar={activeBar} />
                </Card>
              ) : (
                <EmptyState
                  Icon={ChordChartIcon}
                  title="That chart is gone"
                  body="It isn’t in your library anymore."
                  action={{ label: 'Pick another', onPress: () => setPicking(true) }}
                />
              )
            ) : null}

            {drumsOn ? (
              <Card>
                <View className="flex-row items-start gap-2 px-1">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                      {song ? 'Drums' : style.name}
                      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                        {'  '}
                        {song ? style.name : countryOf(style.country)}
                        {showClave ? ` · ${clave} clave` : ''}
                      </Text>
                    </Text>
                    {!song ? <SheetText>{style.about}</SheetText> : null}
                  </View>
                  <SmallButton label="New groove" Icon={ShuffleIcon} disabled={running} onPress={() => setGrooveSeed(newSeed())} />
                </View>
                <LiveDrums
                  runRef={runRef}
                  running={running}
                  style={scoreStyle}
                  bars={drumBars}
                  firstBar={drumFirstBar}
                  voices={voices}
                  drumWindow={drumWindow}
                  onWindow={setDrumWindow}
                />
              </Card>
            ) : null}

            <Text className="font-ui px-1 text-center text-xs" style={{ color: colors.muted }}>
              Bass idea and built-in transcriptions by Rob Moreno
            </Text>
          </ScrollView>
          </>
        )}
      </SafeAreaView>

      <DrumSettingsSheet visible={drumSettingsOpen} config={drumConfig} onChange={(c) => update({ drumConfig: c })} onClose={() => setDrumSettingsOpen(false)} />
      <ChartPickerModal
        visible={picking}
        title="Pick a chart to play over"
        onPick={(s) => {
          stop();
          update({ chartId: s.id, transposeKey: '', source: 'chart' });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
      {openDetail && playingPlayer && bassStyle ? (
        <PhraseSheet
          phrase={openDetail.phrase}
          previous={openDetail.previous}
          bars={{ from: openDetail.bars.from + 1, to: openDetail.bars.to + 1 }}
          playerName={playingPlayer.name}
          median={bassStyle.median}
          source={openDetail.phrase.source ? (playerTranscriptions?.[openDetail.phrase.source.transcription] ?? null) : null}
          played={openDetail.played}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </View>
  );
}

/** The groove options of a style that isn't swing: what the hand plays, cross-stick, woodblock,
    clave direction, fills, variation and human feel. */
function GrooveOptionsFields({
  style,
  hand,
  crossStick,
  blockChoice,
  clave,
  showClave,
  grooveSettings,
  updateGroove,
}: {
  style: DrumStyle;
  hand: HandChoice;
  crossStick: ClaveChoice;
  blockChoice: ClaveChoice;
  clave: ClaveSide;
  showClave: boolean;
  grooveSettings: GrooveSettings;
  updateGroove: (patch: Partial<GrooveSettings>) => void;
}) {
  const main = mainTimeVoice(style);
  const kinds = claveKindsFor(style);
  return (
    <>
      {main ? (
        <Field label="Timekeeping" hint="What the drummer's hand keeps time on: the style's own instrument, another one, or moving between them.">
          <View className="flex-row">
            <Dropdown
              value={hand}
              onChange={(v) => updateGroove({ hands: { ...grooveSettings.hands, [style.id]: v } })}
              options={[
                { value: 'style' as HandChoice, label: `${TIME_VOICES.find((t) => t.id === main)?.label} (the style's own)` },
                ...TIME_VOICES.filter((t) => t.id !== main).map((t) => ({ value: t.id as HandChoice, label: t.label })),
                { value: 'auto' as HandChoice, label: 'Automatic (moves between them)' },
              ]}
            />
          </View>
        </Field>
      ) : null}
      {kinds.length > 0 ? (
        <>
          <Field label="Cross-stick" hint="What the cross-stick plays: the style's own part, a clave, or nothing.">
            <View className="flex-row">
              <Dropdown
                value={crossStick}
                onChange={(v) => updateGroove({ crossSticks: { ...grooveSettings.crossSticks, [style.id]: v } })}
                options={[
                  ...(style.lanes?.crossStick || style.variations?.some((v) => v.lanes.crossStick)
                    ? [{ value: 'style' as ClaveChoice, label: "The style's own part" }]
                    : [{ value: 'style' as ClaveChoice, label: 'None (the style has none)' }]),
                  ...kinds.map((k) => ({ value: k as ClaveChoice, label: CLAVE_LABEL[k] })),
                  ...(style.lanes?.crossStick ? [{ value: 'off' as ClaveChoice, label: 'None' }] : []),
                ]}
              />
            </View>
          </Field>
          <Field label="Woodblock" hint="A clave on the woodblock, or nothing.">
            <View className="flex-row">
              <Dropdown
                value={blockChoice}
                onChange={(v) => updateGroove({ blocks: { ...grooveSettings.blocks, [style.id]: v } })}
                options={[
                  { value: 'off' as ClaveChoice, label: 'None' },
                  ...(style.clave ? [{ value: 'style' as ClaveChoice, label: `The style's clave (${CLAVE_LABEL[style.clave.kind].toLowerCase()})` }] : []),
                  ...kinds.filter((k) => k !== style.clave?.kind).map((k) => ({ value: k as ClaveChoice, label: CLAVE_LABEL[k] })),
                ]}
              />
            </View>
          </Field>
        </>
      ) : null}
      {showClave ? (
        <Field label="Clave direction" hint="Which side of the clave the tune starts on: 3-2 starts with the three hits, 2-3 with the two.">
          <Segmented
            label="Clave direction"
            value={clave}
            onChange={(v) => updateGroove({ claves: { ...grooveSettings.claves, [style.id]: v } })}
            options={[
              { value: '3-2', label: '3-2' },
              { value: '2-3', label: '2-3' },
            ]}
          />
        </Field>
      ) : null}
      <Field label="Fills" hint="A drum fill every few bars, leading into the next phrase.">
        <View className="flex-row">
          <Dropdown value={grooveSettings.fillEvery} onChange={(v) => updateGroove({ fillEvery: v })} options={FILL_OPTIONS} />
        </View>
      </Field>
      <SliderField
        label="Variation"
        hint="How often the drummer moves off the basic pattern."
        value={grooveSettings.variation}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => updateGroove({ variation: v })}
      />
      <SliderField
        label="Human feel"
        hint="How loose the timing is and how much each hit's level varies."
        value={grooveSettings.humanize}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => updateGroove({ humanize: v })}
      />
    </>
  );
}

/**
 * The drums written out, following the music while it plays: which 8 bars are showing (moving on
 * a window at a time) and the drum being heard lit. Its own component so the lit note, which
 * changes many times a second, only redraws this.
 */
function LiveDrums({
  runRef,
  running,
  style,
  bars,
  firstBar,
  voices,
  drumWindow,
  onWindow,
}: {
  runRef: RefObject<RhythmSectionRun | null>;
  running: boolean;
  style: DrumStyle;
  bars: GrooveBar[];
  firstBar: number;
  voices: Set<string>;
  drumWindow: number;
  onWindow: (start: number) => void;
}) {
  const [lit, setLit] = useState<{ key: string; tags: Set<string> } | null>(null);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastKey = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const run = runRef.current;
      if (!run) return;
      const pos = run.position();
      if (pos.bar < 0) return;
      const windowStart = Math.floor(pos.bar / DRUM_WINDOW) * DRUM_WINDOW;
      if (windowStart !== drumWindow) {
        onWindow(windowStart);
        return;
      }
      const i = bars.findIndex((b) => b.bar === pos.bar);
      if (i < 0) return;
      const per = style.stepsPerBeat;
      const step = Math.floor(pos.inBar * per + 1e-6);
      const key = `${i}:${step}`;
      if (key === lastKey) return;
      lastKey = key;
      // In each direction (hands, feet), the last note struck at or before now, within a beat.
      const tags = new Set<string>();
      for (const dir of ['up', 'down'] as const) {
        let best = -1;
        for (const h of bars[i].hits) {
          const up = h.voice !== 'kick' && h.voice !== 'pedal';
          if ((dir === 'up') !== up) continue;
          if (h.step <= step && h.step > best) best = h.step;
        }
        if (best >= 0 && step - best < per) tags.add(`${i}:${best}:${dir}`);
      }
      setLit({ key, tags });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, runRef, bars, drumWindow, onWindow, style.stepsPerBeat]);
  const tags = running && lit ? lit.tags : NONE;
  return <GrooveScore style={style} bars={bars} firstBar={firstBar} voices={voices} lit={tags} />;
}
const NONE = new Set<string>();

function Card({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-3 overflow-hidden rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
      {children}
    </View>
  );
}

/** A small button on a card ("New line", "Hide chart"). */
function SmallButton({ label, Icon, onPress, disabled }: { label: string; Icon: typeof ShuffleIcon; onPress: () => void; disabled?: boolean }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 flex-row items-center gap-1.5 overflow-hidden rounded-lg px-3"
      style={{ backgroundColor: derived.fill, opacity: disabled ? 0.4 : 1 }}
    >
      <Icon color={colors.muted} size={16} />
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The picked chart in the Tune sheet, opening the chart picker. */
function ChartButton({ title, detail, action, onPress }: { title: string; detail: string; action: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${action} chart: ${title}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-14 flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
      style={{ backgroundColor: colors.background }}
    >
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-sm" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
        {action}
      </Text>
      <ChevronRightIcon color={colors.muted} size={18} />
    </Pressable>
  );
}

/** One phrase of a modelled player's chorus: its bars and where it came from; opens how it was made. */
function PhraseChip({ title, detail, playing, open, onPress }: { title: string; detail: string; playing: boolean; open: boolean; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  const fg = playing ? colors['accent-foreground'] : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}: how this phrase was made`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="overflow-hidden rounded-lg px-2.5 py-1.5"
      style={{ backgroundColor: playing ? colors.accent : open ? colors['surface-hover'] : derived.fill }}
    >
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: fg }}>
        {title}
      </Text>
      <Text numberOfLines={1} className="font-ui text-xs" style={{ color: playing ? fg : colors.muted, opacity: playing ? 0.85 : 1 }}>
        {detail}
      </Text>
    </Pressable>
  );
}

export default withScreenLoader(RhythmSectionScreen);

import {
  activeFamilies,
  effectiveOstinato,
  EXERCISE_BARS,
  generateExercise,
  OSTINATOS,
  PHRASE_MODES,
  RHYTHM_FAMILIES,
  type Ostinato,
  type PhraseMode,
  type RhythmFamily,
  type SyncopationBar,
  type SyncopationOptions,
} from '@jam-practice/core/syncopation';
import { useTapTempo } from '@jam-practice/core/meterControls';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DrumIcon, MetronomeIcon, NoteIcon, ShuffleIcon, SpeakerIcon } from '@/components/icons';
import { PlaybackIcon } from '@/components/tool/toolIcons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import { SyncopationScore } from '@/components/SyncopationScore';
import { BigButton, TempoHero } from '@/components/tool/meter';
import { OptionGroup, Segmented } from '@/components/tool/reward';
import { ChoiceCards, PoolPills } from '@/components/tool/rhythm';
import { MoreOptionsChip, SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { Slider } from '@/components/tool/Slider';
import { drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from '@/lib/drumSounds';
import { startSyncopation, VOICES, type SyncopationPlayback, type SyncopationRun } from '@/lib/syncopationEngine';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useToolActivity } from '@/lib/toolTime';

type AfterExercise = 'new' | 'repeat' | 'stop';

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

// The website's key and defaults, so settings follow you between the two.
const SETTINGS_KEY = 'jam-practice-syncopation';
const DEFAULT_SETTINGS: Settings = {
  bpm: 80,
  families: ['quarter', 'eighth'],
  rests: true,
  phrase: 'new',
  split: false,
  ostinato: 'kick',
  snare: true,
  click: false,
  countIn: true,
  after: 'new',
  volume: 0.8,
  room: 0.4,
};

const AFTER_OPTIONS: { value: AfterExercise; label: string }[] = [
  { value: 'new', label: 'Go on to a new exercise' },
  { value: 'repeat', label: 'Play it again' },
  { value: 'stop', label: 'Stop' },
];

const MIN_BPM = 30;
const MAX_BPM = 240;
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * Syncopation: random 16-bar snare reading exercises (four 4-bar lines) from the rhythm families
 * switched on, over a steady part in the feet, written out and played on the real kit — the
 * website's tool (`apps/web/components/Syncopation.tsx`) for the phone. Play and the setting chips
 * stay at the top; the exercise scrolls under them, with the bar being heard lit.
 */
function SyncopationScreen() {
  const { colors, derived } = useAppTheme();
  const [settings, update, ready] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
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
  useToolActivity('/syncopation', running);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // While playing: every exercise played so far (the engine asks for the next one at the end).
  const [played, setPlayed] = useState<SyncopationBar[][]>([]);
  const [shown, setShown] = useState(0);
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const runRef = useRef<SyncopationRun | null>(null);

  // What the engine reads when an exercise ends (it asks from its own timer).
  const afterRef = useRef(settings.after);
  const genRef = useRef(genOpts);
  useEffect(() => {
    afterRef.current = settings.after;
    genRef.current = genOpts;
  }, [settings.after, genOpts]);

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
    setActiveBar(null);
  }, []);

  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setLoadError(false);
    try {
      if (!drumsReady('sticks', VOICES)) await loadDrums('sticks', undefined, VOICES);
    } catch {
      setLoadError(true);
      setStarting(false);
      return;
    }
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
        if (after === 'stop') return null;
        const bars = after === 'repeat' ? list[list.length - 1] : generateExercise(newSeed(), genRef.current);
        list = [...list, bars];
        setPlayed(list);
        return bars;
      },
      onEnd: () => {
        runRef.current = null;
        setRunning(false);
        setActiveBar(null);
      },
    });
    setStarting(false);
    setRunning(true);
  }, [starting, settings.volume, settings.room, settings.bpm, settings.countIn, playback, preview]);

  // Follow the music: which exercise is showing, and the bar being heard.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastKey = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const pos = runRef.current?.position();
      if (!pos) return;
      const key = `${pos.exercise}:${pos.bar}`;
      if (key === lastKey) return;
      lastKey = key;
      if (pos.bar >= 0) setShown(pos.exercise);
      setActiveBar(pos.bar >= 0 ? pos.bar : null);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const toggleFamily = (id: RhythmFamily) => {
    const on = families.includes(id);
    if (on && families.length === 1) return; // keep at least one
    update({ families: on ? families.filter((f) => f !== id) : [...families, id] });
  };

  if (!ready) return <ScreenSpinner />;

  const live = running && played.length > 0;
  const bars = live ? (played[Math.min(shown, played.length - 1)] ?? preview) : preview;
  const familyNames = RHYTHM_FAMILIES.filter((f) => families.includes(f.id)).map((f) => f.short);
  const ostinatoLabel = OSTINATOS.find((o) => o.id === ostinato)?.label ?? '';
  const status = loadError
    ? "Couldn't load the drums. Try again."
    : starting && !running
      ? 'Getting the drums ready…'
      : live
        ? `Playing exercise ${Math.min(shown, played.length - 1) + 1}`
        : '';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Syncopation' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {/* Play and the settings stay put; the exercise scrolls under them. */}
        <View className="gap-2 pb-2 pt-3" style={{ borderBottomWidth: 1, borderBottomColor: derived.hairline }}>
          <View className="items-center gap-1 px-4">
            <BigButton label={running || starting ? 'Stop' : 'Play'} secondary={running || starting} onPress={() => (running || starting ? stop() : void start())} />
            <Text className="font-ui min-h-5 text-center text-sm" style={{ color: colors.muted }}>
              {status}
            </Text>
          </View>
          <View className="px-4">
            <SettingsBar>
              <SettingChip Icon={MetronomeIcon} label="Tempo" value={`${settings.bpm} BPM`}>
                <TempoHero bpm={settings.bpm} setBpm={setBpm} beatsPerBar={4} beatUnit={4} onTap={tap} />
              </SettingChip>
              <SettingChip Icon={NoteIcon} label="Rhythms" value={familyNames.join(' · ')}>
                <OptionGroup title="In the mix">
                  <PoolPills
                    label="Rhythms in the mix"
                    options={RHYTHM_FAMILIES.map((f) => ({ value: f.id, label: f.label }))}
                    selected={families}
                    onToggle={toggleFamily}
                  />
                </OptionGroup>
                <OptionGroup title="Played on">
                  <Segmented
                    label="Played on"
                    value={settings.split ? 'split' : 'snare'}
                    onChange={(v) => update({ split: v === 'split' })}
                    options={[
                      { value: 'snare', label: 'Snare' },
                      { value: 'split', label: 'Snare + bass' },
                    ]}
                  />
                </OptionGroup>
                <SwitchRow label="Rests" checked={settings.rests} onChange={(v) => update({ rests: v })} />
                <OptionGroup title="Lines">
                  <ChoiceCards
                    label="Lines"
                    options={PHRASE_MODES.map((m) => ({ value: m.id, label: m.label }))}
                    value={settings.phrase}
                    onChange={(v) => update({ phrase: v })}
                    cardWidth="100%"
                  />
                </OptionGroup>
              </SettingChip>
              <SettingChip Icon={DrumIcon} label="Underneath" value={ostinatoLabel}>
                <ChoiceCards
                  label="Keep going underneath"
                  options={OSTINATOS.filter((o) => !(settings.split && o.feet)).map((o) => ({ value: o.id, label: o.label }))}
                  value={ostinato}
                  onChange={(v) => update({ ostinato: v })}
                  cardWidth="100%"
                />
              </SettingChip>
              {/* The rarer settings, so the chips stay one or two rows and the exercise keeps its room. */}
              <MoreOptionsChip>
                <SettingChip Icon={PlaybackIcon} label="Playback" value={AFTER_OPTIONS.find((o) => o.value === settings.after)?.label}>
                  <SwitchRow label="Hear the pattern" checked={settings.snare} onChange={(v) => update({ snare: v })} />
                  <SwitchRow label="Hi-hat click on every beat" checked={settings.click} onChange={(v) => update({ click: v })} />
                  <SwitchRow label="Count-in" checked={settings.countIn} onChange={(v) => update({ countIn: v })} />
                  <OptionGroup title={`After the ${EXERCISE_BARS} bars`}>
                    <ChoiceCards label="After the exercise" options={AFTER_OPTIONS} value={settings.after} onChange={(v) => update({ after: v })} cardWidth="100%" />
                  </OptionGroup>
                </SettingChip>
                <SettingChip Icon={SpeakerIcon} label="Mix" value={`${Math.round(settings.volume * 100)}%`}>
                  <OptionGroup title="Drums" aside={<Percent value={settings.volume} />}>
                    <Slider label="Drums" value={settings.volume} onChange={(v) => update({ volume: Math.round(v * 20) / 20 })} />
                  </OptionGroup>
                  <OptionGroup title="Room" aside={<Percent value={settings.room} />}>
                    <Slider label="Room" value={settings.room} onChange={(v) => update({ room: Math.round(v * 20) / 20 })} />
                  </OptionGroup>
                </SettingChip>
              </MoreOptionsChip>
            </SettingsBar>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View className="gap-3 overflow-hidden rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-start gap-2 px-1">
              <View className="flex-1">
                <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                  Exercise{' '}
                  <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                    {familyNames.join(' · ')}
                  </Text>
                </Text>
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  {EXERCISE_BARS} bars · {ostinatoLabel.toLowerCase()} underneath
                </Text>
              </View>
              {/* Stays in place while playing (disabled) so the notation doesn't jump. */}
              <Pressable
                onPress={() => setSeed(newSeed())}
                disabled={running}
                accessibilityLabel="New exercise"
                android_ripple={{ color: colors['surface-hover'] }}
                className="h-9 flex-row items-center gap-1.5 overflow-hidden rounded-lg px-3"
                style={{ backgroundColor: derived.fill, opacity: running ? 0.4 : 1 }}
              >
                <ShuffleIcon color={colors.muted} size={16} />
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  New
                </Text>
              </Pressable>
            </View>
            <SyncopationScore bars={bars} ostinato={ostinato} activeBar={live ? activeBar : null} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Percent({ value }: { value: number }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
      {Math.round(value * 100)}%
    </Text>
  );
}

export default withScreenLoader(SyncopationScreen);

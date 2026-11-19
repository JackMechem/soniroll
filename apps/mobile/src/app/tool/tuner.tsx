import { midiToNote, parseNote } from '@jam-practice/core/noteRange';
import { TUNER_INSTRUMENTS, getInstrument, getTuning } from '@jam-practice/core/tunings';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dropdown } from '@/components/Dropdown';
import { SlidersIcon } from '@/components/icons';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import { TunerDial } from '@/components/TunerDial';
import { SENSITIVITY } from '@/lib/audioInput';
import { startTone, type ToneHandle } from '@/lib/toneGenerator';
import {
  getTunerSnapshot,
  setTunerToneActive,
  startTunerListening,
  stopTunerListening,
  subscribeTuner,
  updateTunerConfig,
} from '@/lib/tunerEngine';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';

/**
 * Native port of `apps/web/components/Tuner.tsx`. Same mic-listening engine shape
 * (`lib/tunerEngine.ts`, a plain module like `metronomeEngine.ts`/`practiceTimerEngine.ts` — the
 * screen just pushes settings in and reads the live reading back out via `useSyncExternalStore`),
 * same `TunerDial` ring-of-12-notes concept (now `react-native-svg` instead of a DOM `<svg>`), and
 * the same "main display has only the essentials, everything else lives in a tabbed
 * `ToolOptionsSheet`" shape every tool since the Metronome has followed. Deliberately **no input-
 * device picker** — `lib/audioInput.ts`'s own doc comment explains why there's no native
 * equivalent of web's `MediaDeviceInfo` enumeration to build one from.
 */
const SETTINGS_KEY = 'jam-practice-tuner';
const DEFAULT_SETTINGS = {
  instrumentId: 'guitar',
  tuningId: 'standard',
  refA: 440,
  sensitivity: 'normal',
  waveform: 'sine' as 'sine' | 'triangle' | 'sawtooth' | 'square',
  sustain: false,
  octave: 3,
};

const MIN_REF = 415;
const MAX_REF = 466;
const MIN_OCTAVE = 0;
const MAX_OCTAVE = 7;
const TONE_SECONDS = 2.5;

const WAVEFORMS: { value: 'sine' | 'triangle' | 'sawtooth' | 'square'; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
];

const IN_TUNE = '#22c55e';
const CLOSE = '#f59e0b';
const OFF = '#ef4444';

function centsColor(cents: number) {
  const abs = Math.abs(cents);
  return abs <= 8 ? IN_TUNE : abs <= 25 ? CLOSE : OFF;
}

function freqOfMidi(midi: number, refA: number) {
  return refA * 2 ** ((midi - 69) / 12);
}

type Playing = { midi: number };

function TunerScreen() {
  const { colors } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const instrument = getInstrument(settings.instrumentId);
  const tuning = getTuning(instrument, settings.tuningId);
  const refA = Math.min(MAX_REF, Math.max(MIN_REF, settings.refA));
  const octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(settings.octave)));
  const { sustain, waveform, sensitivity } = settings;
  const transpose = instrument.transpose;

  const stringMidis = tuning.strings.flatMap((s) => {
    const midi = parseNote(s);
    return midi === null ? [] : [midi];
  });

  const tunerState = useSyncExternalStore(subscribeTuner, getTunerSnapshot);
  const { listening, error, reading } = tunerState;
  const [playing, setPlaying] = useState<Playing | null>(null);

  const toneRef = useRef<ToneHandle | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    updateTunerConfig({ refA, stringMidis, sensitivity });
    // `stringMidis` is deterministically derived from `tuning.id` alone (and is a fresh array
    // reference every render either way) — depending on the stable id instead of the array avoids
    // needing an exhaustive-deps suppression for something that would otherwise refire every
    // render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refA, sensitivity, tuning.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      toneRef.current?.stop();
      setTunerToneActive(false);
      stopTunerListening();
    };
  }, []);

  function stopTone() {
    toneRef.current?.stop();
    toneRef.current = null;
    setPlaying(null);
    setTunerToneActive(false);
  }

  /** `midi` is the concert pitch to sound. */
  function playMidi(midi: number) {
    const wasSame = playing?.midi === midi;
    stopTone();
    if (wasSame) return;
    setTunerToneActive(true);
    const freq = freqOfMidi(midi, refA);
    toneRef.current = startTone(freq, waveform, 0.35, sustain ? undefined : TONE_SECONDS, () => {
      if (mountedRef.current && !sustain) {
        setPlaying((p) => (p?.midi === midi ? null : p));
      }
    });
    setPlaying({ midi });
  }

  function playPitchClass(pc: number) {
    const written = (octave + 1) * 12 + pc;
    playMidi(written - transpose);
  }

  const written = reading ? reading.target + transpose : null;
  const detectedPc = written === null ? null : ((written % 12) + 12) % 12;
  const color = reading ? centsColor(reading.cents) : '';
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const playingWritten = playing ? playing.midi + transpose : null;
  const playingPc = playingWritten === null ? null : ((playingWritten % 12) + 12) % 12;
  const noteName = written === null ? null : midiToNote(written);
  const noteLetter = noteName ? noteName.replace(/-?\d+$/, '') : null;
  const noteOctave = noteName ? noteName.match(/-?\d+$/)?.[0] : null;
  const verdict = !reading ? '' : Math.abs(reading.cents) <= 8 ? 'In tune' : reading.cents < 0 ? 'Flat ♭' : 'Sharp ♯';

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Tuner' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="flex-1 px-6 py-3">
          <View className="flex-row justify-end">
            <Pressable
              onPress={() => setOptionsOpen(true)}
              hitSlop={8}
              accessibilityLabel="Options"
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: colors.surface }}
            >
              <SlidersIcon color={colors.foreground} size={18} />
              <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.foreground }}>
                Options
              </Text>
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center gap-4">
            <TunerDial detectedPc={detectedPc} detectedColor={color} playingPc={playingPc} onSelect={playPitchClass}>
              <Pressable
                onPress={() => updateSettings({ sustain: !sustain })}
                className="rounded-full px-3 py-1"
                style={{ backgroundColor: sustain ? colors.accent : colors.surface }}
              >
                <Text
                  className="text-xs font-bold font-ui-bold"
                  style={{ color: sustain ? colors['accent-foreground'] : colors.muted }}
                >
                  Sustain
                </Text>
              </Pressable>

              <View className="items-center">
                {noteLetter ? (
                  <>
                    <View className="flex-row items-start">
                      <Text className="text-4xl font-bold font-ui-bold" style={{ color }}>
                        {noteLetter}
                      </Text>
                      <Text className="mt-1 text-base font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                        {noteOctave}
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold font-ui-semibold" style={{ color }}>
                      {reading!.cents > 0 ? '+' : ''}
                      {reading!.cents.toFixed(1)} cents
                    </Text>
                    <Text className="text-[11px] font-ui" style={{ color: colors.muted }}>
                      {reading!.freq.toFixed(1)} Hz
                    </Text>
                  </>
                ) : playing ? (
                  <>
                    <Text className="text-3xl font-bold font-ui-bold" style={{ color: colors.accent }}>
                      {midiToNote(playing.midi + transpose).replace(/-?\d+$/, '')}
                    </Text>
                    <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                      {freqOfMidi(playing.midi, refA).toFixed(1)} Hz
                    </Text>
                  </>
                ) : (
                  <Text className="px-2 text-center text-xs font-ui" style={{ color: colors.muted }}>
                    {listening ? 'Play a note…' : 'Tap a note to hear it'}
                  </Text>
                )}
              </View>

              <View className="items-center">
                <Text
                  className="text-[10px] font-semibold font-ui-semibold"
                  style={{ color: colors.muted }}
                >
                  Octave
                </Text>
                <View className="flex-row items-center gap-3">
                  <Pressable
                    onPress={() => updateSettings({ octave: Math.max(MIN_OCTAVE, octave - 1) })}
                    disabled={octave <= MIN_OCTAVE}
                    accessibilityLabel="Octave down"
                    className="h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.surface, opacity: octave <= MIN_OCTAVE ? 0.4 : 1 }}
                  >
                    <Text className="text-base font-bold font-ui-bold" style={{ color: colors.foreground }}>
                      −
                    </Text>
                  </Pressable>
                  <Text className="w-4 text-center text-lg font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                    {octave}
                  </Text>
                  <Pressable
                    onPress={() => updateSettings({ octave: Math.min(MAX_OCTAVE, octave + 1) })}
                    disabled={octave >= MAX_OCTAVE}
                    accessibilityLabel="Octave up"
                    className="h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.surface, opacity: octave >= MAX_OCTAVE ? 0.4 : 1 }}
                  >
                    <Text className="text-base font-bold font-ui-bold" style={{ color: colors.foreground }}>
                      +
                    </Text>
                  </Pressable>
                </View>
              </View>
            </TunerDial>

            <View className="w-full items-center gap-1.5">
              <View className="h-2 w-full rounded-full" style={{ backgroundColor: colors.surface }}>
                <View
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -3,
                    width: 1,
                    height: 14,
                    backgroundColor: `${colors.muted}99`,
                  }}
                />
                {reading ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: `${50 + cents}%`,
                      width: 6,
                      height: 16,
                      marginLeft: -3,
                      marginTop: -8,
                      borderRadius: 3,
                      backgroundColor: color,
                    }}
                  />
                ) : null}
              </View>
              <View className="w-full flex-row justify-between">
                <Text className="text-[11px] font-ui" style={{ color: colors.muted }}>
                  ♭ flat
                </Text>
                <Text className="text-[11px] font-bold font-ui-bold" style={{ color: reading ? color : colors.muted }}>
                  {verdict}
                </Text>
                <Text className="text-[11px] font-ui" style={{ color: colors.muted }}>
                  sharp ♯
                </Text>
              </View>
            </View>

            {tuning.strings.length > 0 ? (
              <View className="w-full items-center gap-2">
                <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                  Tap a string to hear its pitch
                </Text>
                <View className="flex-row flex-wrap justify-center gap-2">
                  {tuning.strings.map((s, i) => {
                    const midi = stringMidis[i];
                    const isHeard = reading?.target === midi;
                    const isPlaying = playing?.midi === midi;
                    return (
                      <Pressable
                        key={`${s}-${i}`}
                        onPress={() => playMidi(midi)}
                        className="min-w-[56px] items-center rounded-xl px-3 py-2"
                        style={{
                          backgroundColor: isPlaying ? colors.accent : isHeard ? color : colors.surface,
                        }}
                      >
                        <Text
                          className="text-sm font-semibold font-ui-semibold"
                          style={{ color: isPlaying ? colors['accent-foreground'] : isHeard ? colors.background : colors.foreground }}
                        >
                          {s}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {error ? (
              <Text className="text-center text-sm font-ui" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}

            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => (listening ? stopTunerListening() : void startTunerListening())}
                className="rounded-full px-8 py-3"
                style={{ backgroundColor: listening ? colors.surface : colors.accent }}
              >
                <Text
                  className="text-base font-bold font-ui-bold"
                  style={{ color: listening ? colors.foreground : colors['accent-foreground'] }}
                >
                  {listening ? 'Stop' : 'Start listening'}
                </Text>
              </Pressable>
              {playing ? (
                <Pressable
                  onPress={stopTone}
                  className="rounded-full px-5 py-3"
                  style={{ backgroundColor: colors.surface }}
                >
                  <Text className="text-base font-bold font-ui-bold" style={{ color: colors.foreground }}>
                    Stop tone
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Tuner options"
        tabs={[
          {
            key: 'instrument',
            label: 'Instrument',
            content: () => (
              <>
                <View className="gap-1.5">
                  <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                    Instrument
                  </Text>
                  <Dropdown
                    value={instrument.id}
                    options={TUNER_INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }))}
                    onChange={(instrumentId) => {
                      const next = getInstrument(instrumentId);
                      updateSettings({ instrumentId, tuningId: next.tunings[0].id });
                    }}
                  />
                </View>
                {instrument.tunings.length > 1 ? (
                  <View className="gap-1.5">
                    <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                      Tuning
                    </Text>
                    <Dropdown
                      value={tuning.id}
                      options={instrument.tunings.map((t) => ({ value: t.id, label: t.label }))}
                      onChange={(tuningId) => updateSettings({ tuningId })}
                    />
                  </View>
                ) : null}
                {transpose !== 0 ? (
                  <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                    Notes are shown as written for this transposing instrument, not concert pitch.
                  </Text>
                ) : null}
              </>
            ),
          },
          {
            key: 'input',
            label: 'Input',
            content: () => (
              <View className="gap-1.5">
                <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                  Sensitivity
                </Text>
                <Dropdown
                  value={sensitivity in SENSITIVITY ? sensitivity : 'normal'}
                  options={Object.entries(SENSITIVITY).map(([value, { label }]) => ({ value, label }))}
                  onChange={(value) => updateSettings({ sensitivity: value })}
                />
                <Text className="text-xs font-ui" style={{ color: colors.muted }}>
                  How quiet a signal can be before it&apos;s ignored as silence — raise it in a noisy room.
                </Text>
              </View>
            ),
          },
          {
            key: 'tone',
            label: 'Reference & tone',
            content: () => (
              <>
                <View className="items-center gap-1.5">
                  <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.muted }}>
                    Reference pitch (A4)
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      onPress={() => updateSettings({ refA: Math.max(MIN_REF, refA - 1) })}
                      disabled={refA <= MIN_REF}
                      accessibilityLabel="Decrease reference pitch"
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: colors.surface, opacity: refA <= MIN_REF ? 0.4 : 1 }}
                    >
                      <Text className="text-lg font-bold font-ui-bold" style={{ color: colors.foreground }}>
                        −
                      </Text>
                    </Pressable>
                    <Text className="min-w-[72px] text-center text-xl font-extrabold font-ui-extrabold" style={{ color: colors.foreground }}>
                      {refA} Hz
                    </Text>
                    <Pressable
                      onPress={() => updateSettings({ refA: Math.min(MAX_REF, refA + 1) })}
                      disabled={refA >= MAX_REF}
                      accessibilityLabel="Increase reference pitch"
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: colors.surface, opacity: refA >= MAX_REF ? 0.4 : 1 }}
                    >
                      <Text className="text-lg font-bold font-ui-bold" style={{ color: colors.foreground }}>
                        +
                      </Text>
                    </Pressable>
                  </View>
                  {refA !== 440 ? (
                    <Pressable onPress={() => updateSettings({ refA: 440 })}>
                      <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.accent }}>
                        Reset to 440
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text className="text-center text-xs font-ui" style={{ color: colors.muted }}>
                    The frequency of concert A, in Hz. 440 is standard; some orchestras and older recordings tune a
                    little sharp or flat of it.
                  </Text>
                </View>
                <View className="gap-1.5">
                  <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
                    Tone generator sound
                  </Text>
                  <Dropdown value={waveform} options={WAVEFORMS} onChange={(value) => updateSettings({ waveform: value })} />
                </View>
              </>
            ),
          },
        ]}
      />
    </View>
  );
}

export default withScreenLoader(TunerScreen);

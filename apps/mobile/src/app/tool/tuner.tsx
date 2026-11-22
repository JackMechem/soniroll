import { midiToNote, parseNote } from '@jam-practice/core/noteRange';
import { TUNER_INSTRUMENTS, getInstrument, getTuning } from '@jam-practice/core/tunings';
import { getRecordingPermissionsAsync } from 'expo-audio';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Dropdown } from '@/components/Dropdown';
import { MicrophoneIcon, TunerIcon, WaveIcon } from '@/components/icons';
import { ToneIcon } from '@/components/tool/toolIcons';
import { SwitchRow } from '@/components/SwitchRow';
import { Field, PillChoice, SheetButton, SheetText, SliderField, noteGlyphs } from '@/components/tool/ear';
import { BigButton, StepButton } from '@/components/tool/meter';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { ToolFrame } from '@/components/tool/ToolFrame';
import { IN_TUNE, TunerDial, TunerMeter, centsColor } from '@/components/TunerDial';
import { TunerDialGraph } from '@/components/TunerDialGraph';
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
import { useToolActivity } from '@/lib/toolTime';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';

/**
 * Native port of `apps/web/components/Tuner.tsx`. Same mic-listening engine shape
 * (`lib/tunerEngine.ts`, a plain module like `metronomeEngine.ts`/`practiceTimerEngine.ts` — the
 * screen just pushes settings in and reads the live reading back out via `useSyncExternalStore`),
 * same `TunerDial` ring-of-12-notes concept (now `react-native-svg` instead of a DOM `<svg>`), laid
 * out like every tool (`ToolFrame`): the dial (the heard note big inside it) fitted to the space,
 * the cents meter (the main feedback), the strings, then the footer: Start listening and the
 * Instrument, Microphone, Reference & tone (the octave of tapped notes is in that sheet) and Pitch
 * graph chips. The pitch graph (`dialGraph`, off by default, like the website's) draws the last few
 * seconds of what's heard inside the ring (`TunerDialGraph`), with a smaller readout above it. It
 * starts listening by itself when the microphone's already allowed. The website's recorded takes
 * (Record, the Takes chip) aren't on mobile, so the graph is always live. Deliberately **no input-
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
  /** The last few seconds of pitch drawn inside the ring of notes. */
  dialGraph: false,
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

function freqOfMidi(midi: number, refA: number) {
  return refA * 2 ** ((midi - 69) / 12);
}

type Playing = { midi: number };

function TunerScreen() {
  const { colors, derived } = useAppTheme();
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const instrument = getInstrument(settings.instrumentId);
  const tuning = getTuning(instrument, settings.tuningId);
  const refA = Math.min(MAX_REF, Math.max(MIN_REF, settings.refA));
  const octave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(settings.octave)));
  const { sustain, waveform, sensitivity, dialGraph } = settings;
  const transpose = instrument.transpose;

  const stringMidis = tuning.strings.flatMap((s) => {
    const midi = parseNote(s);
    return midi === null ? [] : [midi];
  });

  const tunerState = useSyncExternalStore(subscribeTuner, getTunerSnapshot);
  const { listening, error, reading } = tunerState;
  const [playing, setPlaying] = useState<Playing | null>(null);
  useToolActivity('/tuner', listening || playing !== null);
  useKeepAwakeWhile(listening || playing !== null);
  const [dialBox, setDialBox] = useState({ w: 0, h: 0 });
  const dialSize = Math.floor(Math.max(0, Math.min(340, dialBox.w, dialBox.h)));

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

  // Start listening straight away when the microphone's already allowed (asking for it waits for
  // Start listening, so the permission prompt never appears out of nowhere).
  useEffect(() => {
    let cancelled = false;
    getRecordingPermissionsAsync()
      .then(({ granted }) => {
        if (granted && !cancelled && !getTunerSnapshot().listening) void startTunerListening();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    <ToolFrame
      title="Tuner"
      scroll={false}
      // While a tone plays (the tuner doesn't listen then anyway) the one button stops it.
      action={
        <BigButton
          label={playing ? 'Stop tone' : listening ? 'Stop listening' : 'Start listening'}
          secondary={listening || playing !== null}
          onPress={playing ? stopTone : listening ? stopTunerListening : () => void startTunerListening()}
        />
      }
      chips={
        <SettingsBar>
            <SettingChip Icon={TunerIcon} label="Instrument" value={instrument.label.split(' (')[0]}>
              <Field label="Instrument" hint="Sets which strings the dial and the tap-to-hear buttons below are built from.">
                <PillChoice
                  label="Instrument"
                  value={instrument.id}
                  options={TUNER_INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }))}
                  onChange={(instrumentId) => {
                    const next = getInstrument(instrumentId);
                    updateSettings({ instrumentId, tuningId: next.tunings[0].id });
                  }}
                />
              </Field>
              {instrument.tunings.length > 1 ? (
                <Field label="Tuning" hint="An alternate string tuning for this instrument, e.g. drop D or open G.">
                  <Dropdown value={tuning.id} options={instrument.tunings.map((t) => ({ value: t.id, label: t.label }))} onChange={(tuningId) => updateSettings({ tuningId })} />
                </Field>
              ) : null}
              {transpose !== 0 ? <SheetText>Notes are shown as written for this transposing instrument, not concert pitch.</SheetText> : null}
            </SettingChip>

            <SettingChip Icon={MicrophoneIcon} label="Microphone" value={(SENSITIVITY[sensitivity] ?? SENSITIVITY.normal).label.split(' (')[0]}>
              <Field label="Sensitivity" hint="How quiet a signal can be before it's ignored as silence — raise it in a noisy room.">
                <PillChoice
                  label="Sensitivity"
                  value={sensitivity in SENSITIVITY ? sensitivity : 'normal'}
                  options={Object.entries(SENSITIVITY).map(([value, { label }]) => ({ value, label }))}
                  onChange={(value) => updateSettings({ sensitivity: value })}
                />
              </Field>
            </SettingChip>

            <SettingChip Icon={ToneIcon} label="Reference & tone" value={`A = ${refA} Hz${sustain ? ' · notes held' : ''}`}>
              <SliderField
                label="Reference pitch (A4)"
                value={refA}
                unit=" Hz"
                min={MIN_REF}
                max={MAX_REF}
                step={1}
                onChange={(v) => updateSettings({ refA: v })}
                hint="The frequency of concert A, in Hz. 440 is standard; some orchestras and older recordings tune a little sharp or flat of it."
              />
              {refA !== 440 ? <SheetButton label="Reset to 440" onPress={() => updateSettings({ refA: 440 })} /> : null}
            <Field label="Octave of tapped notes" hint="Which octave a note you tap on the dial plays in.">
              <View className="flex-row items-center gap-3">
                <StepButton label="Octave down" disabled={octave <= MIN_OCTAVE} onPress={() => updateSettings({ octave: Math.max(MIN_OCTAVE, octave - 1) })}>
                  −
                </StepButton>
                <Text className="font-ui-semibold w-6 text-center text-xl font-semibold tabular-nums" style={{ color: colors.foreground }}>
                  {octave}
                </Text>
                <StepButton label="Octave up" disabled={octave >= MAX_OCTAVE} onPress={() => updateSettings({ octave: Math.min(MAX_OCTAVE, octave + 1) })}>
                  +
                </StepButton>
              </View>
            </Field>
              <Field label="Tone generator sound" hint="The waveform played when you tap a note on the dial or a string below to hear it.">
                <PillChoice label="Tone generator sound" value={waveform} options={WAVEFORMS} onChange={(value) => updateSettings({ waveform: value })} />
              </Field>
              <SwitchRow
                label="Hold tapped notes"
                checked={sustain}
                onChange={(v) => updateSettings({ sustain: v })}
                hint="Off: a note you tap rings for a couple of seconds. On: it keeps sounding until you tap it again or press Stop tone."
              />
            </SettingChip>

            <SettingChip
              Icon={WaveIcon}
              label="Pitch graph"
              value={dialGraph ? 'In the dial' : 'Off'}
              toggle={{ checked: dialGraph, onChange: (v) => updateSettings({ dialGraph: v }) }}
            >
              <SwitchRow
                label="Pitch graph in the dial"
                checked={dialGraph}
                onChange={(v) => updateSettings({ dialGraph: v })}
                hint="Draws the last few seconds of what you play inside the ring of notes, so you can watch a held note drift sharp or flat."
              />
            </SettingChip>
        </SettingsBar>
      }
    >
      <View className="flex-1 items-center gap-4 px-4 pb-2 pt-3">
        {/* The dial takes what's left, square, up to 340 across. */}
        <View className="w-full flex-1 items-center justify-center" style={{ minHeight: 0 }} onLayout={(e) => setDialBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {dialSize > 0 ? (
            <TunerDial size={dialSize} detectedPc={detectedPc} detectedColor={color} playingPc={playingPc} onSelect={playPitchClass} tight={dialGraph}>
              {dialGraph ? (
                // Smaller, at a fixed height so the graph under it doesn't jump as notes come and go.
                <View className="w-full items-center justify-center" style={{ height: Math.max(46, Math.round(dialSize * 0.17)) }}>
                  {noteLetter ? (
                    <>
                      <View className="flex-row items-start">
                        <Text className="font-ui-bold font-bold" style={{ color, fontSize: Math.round(dialSize * 0.1), lineHeight: Math.round(dialSize * 0.115) }}>
                          {noteGlyphs(noteLetter)}
                        </Text>
                        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
                          {noteOctave}
                        </Text>
                      </View>
                      <Text numberOfLines={1} className="font-ui text-[11px] tabular-nums" style={{ color: colors.muted }}>
                        <Text className="font-ui-semibold text-[11px] font-semibold" style={{ color }}>
                          {reading!.cents > 0 ? '+' : ''}
                          {reading!.cents.toFixed(1)} cents
                        </Text>
                        {` · ${reading!.freq.toFixed(0)} Hz`}
                      </Text>
                    </>
                  ) : playing ? (
                    <>
                      <Text className="font-ui-bold font-bold" style={{ color: colors.accent, fontSize: Math.round(dialSize * 0.1), lineHeight: Math.round(dialSize * 0.115) }}>
                        {noteGlyphs(midiToNote(playing.midi + transpose).replace(/-?\d+$/, ''))}
                      </Text>
                      <Text className="font-ui text-[11px] tabular-nums" style={{ color: colors.muted }}>
                        {freqOfMidi(playing.midi, refA).toFixed(1)} Hz
                      </Text>
                    </>
                  ) : (
                    <View className="items-center" style={{ maxWidth: '75%' }}>
                      <Text numberOfLines={1} adjustsFontSizeToFit className="font-ui-semibold text-base font-semibold" style={{ color: listening ? colors.muted : colors.foreground }}>
                        {listening ? 'Play a note…' : instrument.label.split(' (')[0]}
                      </Text>
                      <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.muted }}>
                        {tuning.strings.length > 0 ? tuning.label : `A = ${refA} Hz`}
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}
              {dialGraph ? <TunerDialGraph listening={listening} /> : noteLetter ? (
                <View className="items-center">
                  <View className="flex-row items-start">
                    <Text className="font-ui-bold font-bold" style={{ color, fontSize: Math.round(dialSize * 0.22), lineHeight: Math.round(dialSize * 0.26) }}>
                      {noteGlyphs(noteLetter)}
                    </Text>
                    <Text className="font-ui-semibold mt-2 text-xl font-semibold" style={{ color: colors.muted }}>
                      {noteOctave}
                    </Text>
                  </View>
                  <Text className="font-ui-semibold text-sm font-semibold tabular-nums" style={{ color }}>
                    {reading!.cents > 0 ? '+' : ''}
                    {reading!.cents.toFixed(1)} cents
                  </Text>
                  <Text className="font-ui text-[11px] tabular-nums" style={{ color: colors.muted }}>
                    {reading!.freq.toFixed(1)} Hz
                  </Text>
                </View>
              ) : playing ? (
                <View className="items-center">
                  <Text className="font-ui-bold font-bold" style={{ color: colors.accent, fontSize: Math.round(dialSize * 0.18), lineHeight: Math.round(dialSize * 0.22) }}>
                    {noteGlyphs(midiToNote(playing.midi + transpose).replace(/-?\d+$/, ''))}
                  </Text>
                  <Text className="font-ui text-xs tabular-nums" style={{ color: colors.muted }}>
                    {freqOfMidi(playing.midi, refA).toFixed(1)} Hz
                  </Text>
                </View>
              ) : (
                // Nothing heard: what it's set up for.
                <View className="items-center px-2">
                  <Text numberOfLines={1} adjustsFontSizeToFit className="font-ui-bold text-2xl font-bold" style={{ color: listening ? colors.muted : colors.foreground }}>
                    {listening ? 'Listening…' : instrument.label.split(' (')[0]}
                  </Text>
                  <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                    {tuning.strings.length > 0 ? tuning.label : `A = ${refA} Hz`}
                  </Text>
                </View>
              )}
            </TunerDial>
          ) : null}
        </View>

        <TunerMeter
          cents={reading ? cents : null}
          color={color}
          zoneColor={IN_TUNE}
          // Listening with nothing heard yet, the dial already says "Listening…" (a blank line keeps
          // the layout still).
          caption={reading ? verdict : playing ? 'Playing a tone' : listening ? '\u00a0' : 'Start listening, or tap a note to hear it'}
          captionColor={reading ? color : colors.muted}
        />

        {tuning.strings.length > 0 ? (
          <View accessibilityLabel="Tap a string to hear its pitch" className="w-full flex-row flex-wrap justify-center gap-1.5">
            {tuning.strings.map((s, i) => {
              const midi = stringMidis[i];
              const isHeard = reading?.target === midi;
              const isPlaying = playing?.midi === midi;
              return (
                <Pressable
                  key={`${s}-${i}`}
                  onPress={() => playMidi(midi)}
                  accessibilityRole="button"
                  accessibilityLabel={`Hear ${s}`}
                  accessibilityState={{ selected: isPlaying }}
                  android_ripple={{ color: colors['surface-hover'] }}
                  className="h-11 min-w-12 items-center justify-center overflow-hidden rounded-lg px-3"
                  style={{ backgroundColor: isPlaying ? colors.accent : isHeard ? color : derived.fill }}
                >
                  <Text
                    className="font-ui-semibold text-sm font-semibold tabular-nums"
                    style={{ color: isPlaying ? colors['accent-foreground'] : isHeard ? colors.background : colors.foreground }}
                  >
                    {noteGlyphs(s)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {error ? (
          <Text className="font-ui text-center text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
      </View>
    </ToolFrame>
  );
}

export default withScreenLoader(TunerScreen);

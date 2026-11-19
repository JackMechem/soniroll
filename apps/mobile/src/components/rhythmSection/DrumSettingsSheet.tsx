import { DEFAULT_DRUM_CONFIG, type DrumConfig } from '@jam-practice/core/drums';
import { Pressable, Text, View } from 'react-native';

import { SwitchRow } from '@/components/SwitchRow';
import { SheetButton, SheetDivider, SliderField } from '@/components/tool/ear';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The swing drummer's settings in detail — the website's `DrumSettingsDialog`
 * (`apps/web/components/bassgenius/DrumSettingsDialog.tsx`) as a sheet: swing (amount, easing,
 * drift, variation, lay back, timing), the ride's patterns and dynamics, hi-hat and bass drum,
 * comping. Each setting's explanation is behind its ⓘ; changed ones get a Reset, and the whole lot
 * can go back to the defaults.
 */

type NumKey = { [K in keyof DrumConfig]: DrumConfig[K] extends number ? K : never }[keyof DrumConfig];
type BoolKey = { [K in keyof DrumConfig]: DrumConfig[K] extends boolean ? K : never }[keyof DrumConfig];

type SliderRow = { key: NumKey; label: string; min: number; max: number; step: number; show: (v: number) => string; hint: string };
type ToggleRow = { key: BoolKey; label: string; hint: string };
type Section = { title: string; note?: string; rows: (SliderRow | ToggleRow)[] };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const level = (v: number) => `${Math.round(v * 100)}`;
const beat = (v: number) => `${v.toFixed(2)} beat`;

// The website's sections, word for word.
const SECTIONS: Section[] = [
  {
    title: 'Swing',
    note: 'Changes here are heard straight away.',
    rows: [
      { key: 'swing', label: 'Swing', min: 0.5, max: 0.8, step: 0.005, show: (v) => `${v.toFixed(3)}${Math.abs(v - 2 / 3) < 0.01 ? ' (triplet)' : v < 0.52 ? ' (straight)' : ''}`, hint: 'Where the ride\'s skip note (the "a") falls at medium tempos: 0.5 is straight eighths, 0.67 a triplet, higher is harder swing.' },
      { key: 'swingEases', label: 'Lighter swing at fast tempos', hint: 'Drummers swing less as the tempo goes up — from 150 BPM the swing eases toward a lighter one by 300.' },
      { key: 'swingDrift', label: 'Swing drift', min: 0, max: 0.12, step: 0.005, show: beat, hint: "How far the swing wanders from bar to bar, the way a real drummer's does. 0 is the same every bar." },
      { key: 'swingJitter', label: 'Swing variation, note to note', min: 0, max: 0.08, step: 0.005, show: beat, hint: 'A little difference between one skip note and the next.' },
      { key: 'layBackMs', label: 'Lay back of the "a-lang"', min: 0, max: 40, step: 1, show: (v) => `${v} ms`, hint: 'How far the "a" and "lang" sit behind the time (the spang and hi-hat stay on top).' },
      { key: 'timingMs', label: 'Timing looseness', min: 0, max: 15, step: 0.5, show: (v) => `±${v} ms`, hint: 'Human timing — everything struck together moves together, so the hi-hat stays with the ride.' },
    ],
  },
  {
    title: 'Ride pattern',
    note: 'Pattern and level changes take effect from the next chorus.',
    rows: [
      { key: 'figSpangALang', label: '"Spang, spang-a-lang"', min: 0, max: 1, step: 0.01, show: pct, hint: 'How often a bar is the classic pattern (relative to the two below).' },
      { key: 'figQuarters', label: 'Plain quarter notes', min: 0, max: 1, step: 0.01, show: pct, hint: 'How often a bar is just quarter notes.' },
      { key: 'figALangALang', label: '"Spang-a-lang-a-lang-spang"', min: 0, max: 1, step: 0.01, show: pct, hint: 'How often the skips go into 2 and 3 instead.' },
      { key: 'keepFigure', label: 'Keep a pattern for the next bar', min: 0, max: 1, step: 0.01, show: pct, hint: 'Drummers settle into a pattern for a couple of bars rather than changing every bar.' },
    ],
  },
  {
    title: 'Ride dynamics',
    rows: [
      { key: 'spang', label: 'Spang', min: 0, max: 1, step: 0.01, show: level, hint: 'The beat leading into the skip — the loudest.' },
      { key: 'a', label: '"a" (the skip note)', min: 0, max: 1, step: 0.01, show: level, hint: 'The skip note. Same recording as the lang, so they share a tone.' },
      { key: 'lang', label: '"lang"', min: 0, max: 1, step: 0.01, show: level, hint: 'The beat after the skip — the stick falling back, just under the "a".' },
      { key: 'quarterBack', label: 'Quarter notes on 2 and 4', min: 0, max: 1, step: 0.01, show: level, hint: 'In plain quarter-note bars.' },
      { key: 'quarterOther', label: 'Quarter notes on 1 and 3', min: 0, max: 1, step: 0.01, show: level, hint: 'In plain quarter-note bars.' },
      { key: 'phraseSwell', label: 'Phrase swell', min: 0, max: 0.15, step: 0.005, show: level, hint: 'The ride rising a little through each 4-bar phrase and easing back at its end.' },
      { key: 'levelJitter', label: 'Level variation', min: 0, max: 0.1, step: 0.005, show: level, hint: "How much each hit's level varies from the next." },
    ],
  },
  {
    title: 'Hi-hat and bass drum',
    rows: [
      { key: 'hihat', label: 'Hi-hat foot on 2 and 4', hint: 'The hi-hat pedal closing on the backbeats.' },
      { key: 'hihatLevel', label: 'Hi-hat level', min: 0, max: 1, step: 0.01, show: level, hint: '' },
      { key: 'kick', label: 'Feathered bass drum', hint: 'A very soft bass drum under every beat — felt more than heard.' },
      { key: 'kickLevel', label: 'Bass drum level', min: 0, max: 0.5, step: 0.01, show: level, hint: '' },
    ],
  },
  {
    title: 'Comping',
    note: 'Only when the drummer plays "With comping".',
    rows: [
      { key: 'snareDensity', label: 'Snare hits per bar', min: 0, max: 3, step: 0.1, show: (v) => v.toFixed(1), hint: 'The left hand\'s chatter, on the swung "and"s, on average per bar.' },
      { key: 'ghostLevel', label: 'Ghost note level', min: 0, max: 0.6, step: 0.01, show: level, hint: 'Most snare hits are ghost notes, barely there.' },
      { key: 'accentChance', label: 'Accented snare hits', min: 0, max: 1, step: 0.01, show: pct, hint: 'Of the snare hits, how many are firm accents rather than ghosts.' },
      { key: 'accentLevel', label: 'Accent level', min: 0, max: 1, step: 0.01, show: level, hint: '' },
      { key: 'setups', label: 'Set up each section', hint: 'Snare and kick on the last "and" before a new section.' },
      { key: 'setupLevel', label: 'Setup level', min: 0, max: 1, step: 0.01, show: level, hint: '' },
      { key: 'sectionCrashes', label: 'Crash the ride on each section', hint: 'A big ride hit (with a little crash cymbal and a kick) on the first beat of each section.' },
      { key: 'rideCrashLevel', label: 'Ride crash level', min: 0, max: 1, step: 0.01, show: level, hint: '' },
      { key: 'crashLevel', label: 'Crash cymbal under it', min: 0, max: 1, step: 0.01, show: level, hint: '0 leaves just the ride.' },
      { key: 'bombChance', label: 'Bass drum "bombs"', min: 0, max: 0.4, step: 0.01, show: pct, hint: 'The chance, each bar, of a lone accent on the bass drum.' },
    ],
  },
];

export function DrumSettingsSheet({
  visible,
  config,
  onChange,
  onClose,
}: {
  visible: boolean;
  config: DrumConfig;
  onChange: (config: DrumConfig) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const changed = (Object.keys(DEFAULT_DRUM_CONFIG) as (keyof DrumConfig)[]).some((k) => config[k] !== DEFAULT_DRUM_CONFIG[k]);
  const set = <K extends keyof DrumConfig>(key: K, value: DrumConfig[K]) => onChange({ ...config, [key]: value });
  return (
    <ToolSheet visible={visible} onClose={onClose} title="Drum settings">
      <View className="flex-row items-center gap-2">
        <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
          How the drummer plays.
        </Text>
        <SheetButton label="Reset to defaults" onPress={() => onChange({ ...DEFAULT_DRUM_CONFIG })} disabled={!changed} />
      </View>
      {SECTIONS.map((section) => (
        <View key={section.title} className="gap-4">
          <SheetDivider title={section.title} />
          {section.note ? (
            <Text className="font-ui -mt-2 text-xs" style={{ color: colors.muted }}>
              {section.note}
            </Text>
          ) : null}
          {section.rows.map((row) =>
            'min' in row ? (
              <View key={row.key} className="gap-0.5">
                <SliderField
                  label={row.label}
                  hint={row.hint || undefined}
                  value={config[row.key]}
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  format={row.show}
                  onChange={(v) => set(row.key, v)}
                />
                {config[row.key] !== DEFAULT_DRUM_CONFIG[row.key] ? <ResetLink label={`Back to ${row.show(DEFAULT_DRUM_CONFIG[row.key])}`} onPress={() => set(row.key, DEFAULT_DRUM_CONFIG[row.key])} /> : null}
              </View>
            ) : (
              <SwitchRow key={row.key} label={row.label} hint={row.hint} checked={config[row.key]} onChange={(v) => set(row.key, v)} />
            ),
          )}
        </View>
      ))}
    </ToolSheet>
  );
}

function ResetLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" className="self-end">
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
        {label}
      </Text>
    </Pressable>
  );
}

import { CLICK_SOUNDS } from '@jam-practice/core/clickSounds';
import {
  MAX_BPM,
  MIN_BPM,
  NOTE_VALUES,
  NOTE_VALUE_NAMES,
  SUBDIVISIONS,
  clampBpm,
  groupsFromAccents,
  nearestNoteValue,
  parseGroups,
} from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Dropdown } from '@/components/Dropdown';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The native sibling of `apps/web/components/MeterFields.tsx` — same underlying math
 * (`@jam-practice/core/meterControls`), deliberately different *interaction* for two controls
 * where the web version leans on a mouse-friendly drag:
 *
 * - **No continuous BPM/volume slider.** Precisely dragging a log-scaled slider with a finger is
 *   genuinely fiddly compared to a mouse — large tap targets (±1 BPM steppers, a direct numeric
 *   entry field, and Tap Tempo) are the primary interface here instead, which is how most real
 *   mobile metronome apps are built in the first place, not a cut corner.
 * - **No accent-grouping free-text field's drag-reorder equivalent anywhere here** — accent
 *   grouping stays a plain "3+2+2" text field, same as web, since typing digits is equally easy on
 *   both platforms.
 *
 * Sound and subdivision pickers are rows of pill buttons rather than a dropdown `<Select>` — there
 * are only 5 and 6 options respectively, few enough that showing all of them at once beats hiding
 * them behind a menu tap.
 *
 * Split into **main-display** controls (`TimeSignatureControls`, `TempoControls`) and
 * **options-sheet** controls (`TempoNoteValueControls`, `AccentAndSubdivisionControls`,
 * `SoundOptions`) per a direct request: the metronome's own screen shows only its most-reached-for
 * controls directly (time signature, tempo, the beat indicator, Start/Stop) with no scrolling at
 * all, and everything else lives in `ToolOptionsSheet` instead — see that component's own doc
 * comment for the shape this is meant to generalize to every future tool, not just this one.
 * `MeterOptions` (the full beats/unit/accent-grouping/subdivision bundle) is kept as its own export
 * too, unchanged, since `StructureEditor`'s own section cards still want the complete bundle in one
 * place — a structure section doesn't have a "main display" of its own to split fields out of.
 */

function Stepper({
  label,
  value,
  display,
  onDecrement,
  onIncrement,
  disabledDecrement,
  disabledIncrement,
}: {
  label: string;
  value: string;
  display?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabledDecrement?: boolean;
  disabledIncrement?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="items-center gap-1.5">
      <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.muted }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <StepButton symbol="−" onPress={onDecrement} disabled={disabledDecrement} />
        <Text
          className="min-w-[56px] text-center text-xl font-extrabold font-ui-extrabold"
          style={{ color: colors.foreground }}
        >
          {display ?? value}
        </Text>
        <StepButton symbol="+" onPress={onIncrement} disabled={disabledIncrement} />
      </View>
    </View>
  );
}

function StepButton({
  symbol,
  onPress,
  disabled,
}: {
  symbol: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="h-10 w-10 items-center justify-center rounded-full"
      style={{ backgroundColor: colors.surface, opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-lg font-bold font-ui-bold" style={{ color: colors.foreground }}>
        {symbol}
      </Text>
    </Pressable>
  );
}

export function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-3.5 py-2"
      style={{ backgroundColor: selected ? colors.accent : colors.surface }}
    >
      <Text
        className="text-[13px] font-bold font-ui-bold"
        style={{ color: selected ? colors['accent-foreground'] : colors.foreground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The one option explicitly called out to live directly on the main display, not behind the
    options sheet: beats-per-bar and beat-unit, compact enough to sit right under the tempo. */
export function TimeSignatureControls({
  beatsPerBar,
  beatUnit,
  onChangeBeats,
  onSetBeatUnit,
}: {
  beatsPerBar: number;
  beatUnit: number;
  onChangeBeats: (n: number) => void;
  onSetBeatUnit: (unit: number) => void;
}) {
  const { colors } = useAppTheme();
  const unitIndex = NOTE_VALUES.indexOf(nearestNoteValue(beatUnit) as (typeof NOTE_VALUES)[number]);
  return (
    <View className="flex-row items-center justify-center gap-2">
      <StepButton
        symbol="−"
        onPress={() => onChangeBeats(Math.max(1, beatsPerBar - 1))}
        disabled={beatsPerBar <= 1}
      />
      <Text className="min-w-[20px] text-center text-2xl font-extrabold font-ui-extrabold" style={{ color: colors.foreground }}>
        {beatsPerBar}
      </Text>
      <StepButton
        symbol="+"
        onPress={() => onChangeBeats(Math.min(MAX_BEATS, beatsPerBar + 1))}
        disabled={beatsPerBar >= MAX_BEATS}
      />
      <Text className="text-2xl font-extrabold font-ui-extrabold" style={{ color: colors.muted }}>
        /
      </Text>
      <StepButton
        symbol="−"
        onPress={() => onSetBeatUnit(NOTE_VALUES[Math.max(0, unitIndex - 1)])}
        disabled={unitIndex <= 0}
      />
      <Text className="min-w-[20px] text-center text-2xl font-extrabold font-ui-extrabold" style={{ color: colors.foreground }}>
        {beatUnit}
      </Text>
      <StepButton
        symbol="+"
        onPress={() => onSetBeatUnit(NOTE_VALUES[Math.min(NOTE_VALUES.length - 1, unitIndex + 1)])}
        disabled={unitIndex >= NOTE_VALUES.length - 1}
      />
    </View>
  );
}

export function TempoControls({
  bpm,
  setBpm,
  onTap,
}: {
  bpm: number;
  setBpm: (bpm: number) => void;
  onTap: () => void;
}) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<string | null>(null);

  function commitDraft() {
    if (draft !== null && draft !== '') {
      const parsed = Number(draft);
      if (Number.isFinite(parsed)) setBpm(clampBpm(parsed));
    }
    setDraft(null);
  }

  return (
    <View className="items-center gap-2">
      <View className="flex-row items-center gap-4">
        <StepButton symbol="−" onPress={() => setBpm(clampBpm(bpm - 1))} disabled={bpm <= MIN_BPM} />
        <TextInput
          value={draft ?? String(bpm)}
          onChangeText={setDraft}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          keyboardType="number-pad"
          className="min-w-[110px] text-center text-5xl font-extrabold font-ui-extrabold"
          style={{ color: colors.foreground }}
        />
        <StepButton symbol="+" onPress={() => setBpm(clampBpm(bpm + 1))} disabled={bpm >= MAX_BPM} />
      </View>
      <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.muted }}>
        BPM
      </Text>
      <Pressable
        onPress={onTap}
        className="rounded-full px-6 py-2"
        style={{ backgroundColor: colors.surface }}
      >
        <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.foreground }}>
          Tap tempo
        </Text>
      </Pressable>
    </View>
  );
}

const TEMPO_NOTE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Beat unit' },
  ...NOTE_VALUES.map((v) => ({ value: v as number | null, label: NOTE_VALUE_NAMES[v] })),
];

/** The "quarter = 110" style note-value picker — a dropdown (not a pill row) per a direct request,
    sitting directly above the tempo number on the main display rather than tucked into the
    options sheet, since it changes what the big number right below it actually *means*. Defaults
    to "Quarter note" (`DEFAULT_SETTINGS.tempoNoteValue = 4` in `app/tool/metronome.tsx`), with
    "Beat unit" (meaning "whatever note value the time signature's own beat unit already is")
    still available as one of the dropdown's own options. */
export function TempoNoteValueControls({
  tempoNoteValue,
  setTempoNoteValue,
  effectiveBeatUnit,
}: {
  tempoNoteValue: number | null;
  setTempoNoteValue: (value: number | null) => void;
  effectiveBeatUnit: number;
}) {
  const { colors } = useAppTheme();
  const showConversion = tempoNoteValue !== null && tempoNoteValue !== effectiveBeatUnit;

  return (
    <View className="items-center gap-1.5">
      <Dropdown value={tempoNoteValue} options={TEMPO_NOTE_OPTIONS} onChange={setTempoNoteValue} />
      {showConversion ? (
        <Text className="text-xl font-bold font-ui-bold" style={{ color: colors.muted }}>
          =
        </Text>
      ) : null}
    </View>
  );
}

/** Accent grouping + subdivision — the rest of "Meter & subdivision" once beats/unit moved to the
    main display. */
export function AccentAndSubdivisionControls({
  accents,
  subdivision,
  onSetSubdivision,
  onApplyGroups,
}: {
  accents: import('@jam-practice/core/clickSounds').BeatLevel[];
  subdivision: number;
  onSetSubdivision: (subdivision: number) => void;
  onApplyGroups: (groups: number[]) => void;
}) {
  const { colors } = useAppTheme();
  const [groupsText, setGroupsText] = useState(() => groupsFromAccents(accents).join('+'));

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
          Accent grouping
        </Text>
        <TextInput
          value={groupsText}
          onChangeText={(text) => {
            setGroupsText(text);
            const groups = parseGroups(text, MAX_BEATS);
            if (groups) onApplyGroups(groups);
          }}
          placeholder="3+2+2"
          placeholderTextColor={colors.muted}
          className="rounded-2xl px-4 py-3 text-base font-ui"
          style={{ backgroundColor: colors.surface, color: colors.foreground }}
        />
      </View>

      <View className="gap-1.5">
        <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
          Subdivision
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SUBDIVISIONS.map((option) => (
            <Pill
              key={option.value}
              label={option.label}
              selected={subdivision === option.value}
              onPress={() => onSetSubdivision(option.value)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** The complete beats/unit/accent-grouping/subdivision bundle — unchanged, still used by
    `StructureEditor`'s own section cards, which have no "main display" to split fields out of. */
export function MeterOptions({
  beatsPerBar,
  beatUnit,
  accents,
  subdivision,
  onChangeBeats,
  onSetBeatUnit,
  onSetSubdivision,
  onApplyGroups,
}: {
  beatsPerBar: number;
  beatUnit: number;
  accents: import('@jam-practice/core/clickSounds').BeatLevel[];
  subdivision: number;
  onChangeBeats: (n: number) => void;
  onSetBeatUnit: (unit: number) => void;
  onSetSubdivision: (subdivision: number) => void;
  onApplyGroups: (groups: number[]) => void;
}) {
  return (
    <View className="gap-4">
      <View className="flex-row justify-center gap-6">
        <Stepper
          label="Beats per bar"
          value={String(beatsPerBar)}
          onDecrement={() => onChangeBeats(Math.max(1, beatsPerBar - 1))}
          onIncrement={() => onChangeBeats(Math.min(MAX_BEATS, beatsPerBar + 1))}
          disabledDecrement={beatsPerBar <= 1}
          disabledIncrement={beatsPerBar >= MAX_BEATS}
        />
        <Stepper
          label="Beat unit"
          value={String(beatUnit)}
          onDecrement={() => {
            const i = NOTE_VALUES.indexOf(nearestNoteValue(beatUnit) as (typeof NOTE_VALUES)[number]);
            onSetBeatUnit(NOTE_VALUES[Math.max(0, i - 1)]);
          }}
          onIncrement={() => {
            const i = NOTE_VALUES.indexOf(nearestNoteValue(beatUnit) as (typeof NOTE_VALUES)[number]);
            onSetBeatUnit(NOTE_VALUES[Math.min(NOTE_VALUES.length - 1, i + 1)]);
          }}
        />
      </View>
      <AccentAndSubdivisionControls
        accents={accents}
        subdivision={subdivision}
        onSetSubdivision={onSetSubdivision}
        onApplyGroups={onApplyGroups}
      />
    </View>
  );
}

export function SoundOptions({
  soundId,
  setSoundId,
  volume,
  setVolume,
}: {
  soundId: string;
  setSoundId: (id: string) => void;
  volume: number;
  setVolume: (volume: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
          Tone
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {CLICK_SOUNDS.map((sound) => (
            <Pill
              key={sound.id}
              label={sound.label}
              selected={soundId === sound.id}
              onPress={() => setSoundId(sound.id)}
            />
          ))}
        </View>
      </View>

      <Stepper
        label="Volume"
        value={String(Math.round(volume * 100))}
        display={`${Math.round(volume * 100)}%`}
        onDecrement={() => setVolume(Math.max(0, Math.round((volume - 0.1) * 100) / 100))}
        onIncrement={() => setVolume(Math.min(1, Math.round((volume + 0.1) * 100) / 100))}
        disabledDecrement={volume <= 0}
        disabledIncrement={volume >= 1}
      />
    </View>
  );
}

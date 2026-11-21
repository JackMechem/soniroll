import { CLICK_SOUNDS, getClickSound, resolveMainBeatClick } from '@jam-practice/core/clickSounds';
import {
  MAX_BPM,
  MIN_BPM,
  NOTE_VALUES,
  NOTE_VALUE_NAMES,
  SHORT_NOTE_NAME,
  SUBDIVISIONS,
  SUB_LABELS,
  bpmFromSlider,
  clampBpm,
  convertTempo,
  sliderFromBpm,
  splitTenths,
} from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Dropdown } from '@/components/Dropdown';
import { ChevronLeftIcon, ChevronRightIcon, MetronomeIcon, PlayIcon } from '@/components/icons';
import { OptionGroup, RewardCard } from '@/components/tool/reward';
import { Slider } from '@/components/tool/Slider';
import { getAudioContext } from '@/lib/audioContext';
import { scheduleClick } from '@/lib/metronomeClickEngine';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * The website's metronome controls (`apps/web/components/MeterFields.tsx` and
 * `components/metronome/MetronomeOptions.tsx`) for the phone: the tempo display, the big
 * Start/Stop button, and the pickers that go in the Time, Subdivision and Sound sheets. Shared by
 * every metronome-style tool so they look and behave the same.
 */

/** The big Start/Stop (Play, Record) button in a tool's footer (`ToolFrame`'s `action`): a wide
    round pill across the footer, the accent while stopped and the faint fill while running. Two
    side by side each go in a `flex-1` view. */
export function BigButton({
  label,
  onPress,
  secondary,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      android_ripple={{ color: secondary ? colors['surface-hover'] : colors['accent-hover'] }}
      className="h-12 flex-row items-center justify-center gap-2 self-stretch overflow-hidden rounded-full px-6"
      style={{ backgroundColor: secondary ? derived.fill : colors.accent, opacity: disabled ? 0.5 : 1 }}
    >
      {icon}
      <Text className="font-ui-semibold text-base font-semibold" style={{ color: secondary ? colors.foreground : colors['accent-foreground'] }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A round − / + button on the faint fill, 48 across (a comfortable thumb target). */
export function StepButton({
  label,
  onPress,
  disabled,
  compact,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 44 across, for a tight spot (the tuner's octave, inside its dial). */
  compact?: boolean;
  children: ReactNode;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className={`${compact ? 'h-11 w-11' : 'h-12 w-12'} items-center justify-center overflow-hidden rounded-full`}
      style={{ backgroundColor: derived.fill, opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="font-ui text-2xl" style={{ color: colors.foreground, lineHeight: 28 }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** A number you can type into, kept as text while editing and committed on blur/Done. */
function NumberInput({
  value,
  onChange,
  min,
  max,
  label,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  label: string;
  className: string;
}) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== '') {
      const n = Math.round(Number(draft));
      if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    }
    setDraft(null);
  };
  return (
    <TextInput
      value={draft ?? String(value)}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      selectTextOnFocus
      keyboardType="number-pad"
      returnKeyType="done"
      accessibilityLabel={label}
      className={className}
      style={{ color: colors.foreground, padding: 0 }}
    />
  );
}

/** A small round "+5" / "−10" button beside Tap tempo. */
function JumpButton({ amount, onPress }: { amount: number; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${amount > 0 ? 'Increase' : 'Decrease'} tempo by ${Math.abs(amount)}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-11 w-11 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: derived.fill }}
    >
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {amount > 0 ? '+' : '−'}
        {Math.abs(amount)}
      </Text>
    </Pressable>
  );
}

/**
 * The tempo, front and centre (the web's `TempoHero`): − / the big number (type to change it) / +,
 * the note value it counts and the meter under it, a slider for big moves, and −10 −5 Tap tempo +5
 * +10. `locked` (a tool changing tempo on its own while running) shows just the number, with
 * `precise`'s tenths if it isn't whole.
 */
export function TempoHero({
  bpm,
  setBpm,
  beatsPerBar,
  beatUnit,
  onTap,
  tempoNote,
  locked,
  precise,
}: {
  bpm: number;
  setBpm: (bpm: number) => void;
  beatsPerBar: number;
  beatUnit: number;
  onTap: () => void;
  tempoNote?: ReactNode;
  locked?: boolean;
  precise?: number;
}) {
  const { colors, derived } = useAppTheme();
  const { whole, tenths } = splitTenths(precise ?? bpm);
  const set = (n: number) => setBpm(clampBpm(n));
  return (
    <View className="w-full items-center gap-3">
      <View className="items-center">
        <View className="flex-row items-center gap-3">
          {!locked ? (
            <StepButton label="Decrease tempo" onPress={() => set(bpm - 1)} disabled={bpm <= MIN_BPM}>
              −
            </StepButton>
          ) : null}
          <View className="w-40 items-center">
            {locked ? (
              <Text className="font-ui-bold text-center text-6xl font-bold tracking-tight" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
                {whole}
                {tenths !== null ? <Text className="text-2xl" style={{ color: colors.muted }}>.{tenths}</Text> : null}
              </Text>
            ) : (
              <NumberInput
                value={bpm}
                onChange={setBpm}
                min={MIN_BPM}
                max={MAX_BPM}
                label="Tempo in BPM"
                className="font-ui-bold w-full text-center text-6xl font-bold tracking-tight"
              />
            )}
          </View>
          {!locked ? (
            <StepButton label="Increase tempo" onPress={() => set(bpm + 1)} disabled={bpm >= MAX_BPM}>
              +
            </StepButton>
          ) : null}
        </View>
        <View className="mt-1 flex-row items-center gap-1.5">
          {tempoNote}
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            BPM · {beatsPerBar}/{beatUnit}
          </Text>
        </View>
      </View>

      {!locked ? (
        <View className="w-full gap-2">
          <Slider label="Tempo" value={sliderFromBpm(bpm) / 1000} onChange={(v) => set(Math.round(bpmFromSlider(v * 1000)))} />
          <View className="flex-row flex-wrap items-center justify-center gap-1.5">
            {[-10, -5].map((n) => (
              <JumpButton key={n} amount={n} onPress={() => set(bpm + n)} />
            ))}
            <Pressable
              onPress={onTap}
              accessibilityLabel="Tap tempo"
              android_ripple={{ color: colors['surface-hover'] }}
              className="mx-1 h-11 flex-row items-center gap-2 overflow-hidden rounded-full px-4"
              style={{ backgroundColor: derived.fill }}
            >
              <MetronomeIcon color={colors.muted} size={16} />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                Tap tempo
              </Text>
            </Pressable>
            {[5, 10].map((n) => (
              <JumpButton key={n} amount={n} onPress={() => set(bpm + n)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** One engraved note of a note value (hollow for whole/half, flags below a quarter). */
export function NoteValueIcon({ value, color, height = 20 }: { value: number; color: string; height?: number }) {
  const filled = value >= 4;
  const flags = value > 4 ? Math.round(Math.log2(value)) - 2 : 0;
  return (
    <Svg width={(height * 12) / 28} height={height} viewBox="0 0 12 28">
      <Ellipse
        cx={4}
        cy={23}
        rx={3.2}
        ry={2.4}
        transform="rotate(-20 4 23)"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 1.1}
      />
      {value >= 2 ? <Rect x={6.4} y={9} width={1.2} height={14} fill={color} /> : null}
      {Array.from({ length: flags }, (_, i) => (
        <Path key={i} d={`M7.6 ${9 + i * 4.5} q5 1.5 4.5 7 q-2.5 -2.5 -4.5 -1.5 z`} fill={color} />
      ))}
    </Svg>
  );
}

const TEMPO_NOTE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Beat unit' },
  ...NOTE_VALUES.map((v) => ({ value: v as number | null, label: SHORT_NOTE_NAME[v] ?? `1/${v}` })),
];

/** The note value the tempo counts ("Quarter", "Eighth" …), for `TempoHero`'s `tempoNote` slot.
    `null` means "the time signature's beat unit". */
export function TempoNoteValuePicker({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <Dropdown value={value} options={TEMPO_NOTE_OPTIONS} onChange={onChange} />;
}

/** "= 550 BPM at eighth note clicks", under the tempo, once the tempo's note value differs from the
    beat unit it's converted against. */
export function TempoNoteConversionHint({
  bpm,
  tempoNoteValue,
  effectiveBeatUnit,
}: {
  bpm: number;
  tempoNoteValue: number | null;
  effectiveBeatUnit: number;
}) {
  const { colors } = useAppTheme();
  if (tempoNoteValue === null || tempoNoteValue === effectiveBeatUnit) return null;
  return (
    <Text className="font-ui text-xs" style={{ color: colors.muted }}>
      = {Math.round(convertTempo(bpm, tempoNoteValue, effectiveBeatUnit))} BPM at{' '}
      {(NOTE_VALUE_NAMES[effectiveBeatUnit] ?? `1/${effectiveBeatUnit} note`).toLowerCase()} clicks
    </Text>
  );
}

function Arrow({ dir, label, onPress, disabled }: { dir: 'left' | 'right'; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  const Icon = dir === 'left' ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center rounded-md"
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      <Icon color={colors.muted} size={20} />
    </Pressable>
  );
}

/** The time signature drawn as one — beats over beat unit, arrows either side of each — with "4
    quarter notes per bar" beside it. Typing the beats works too. */
export function TimeSignatureControl({
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
  const unitIndex = NOTE_VALUES.indexOf(beatUnit as (typeof NOTE_VALUES)[number]);
  const noteName = (NOTE_VALUE_NAMES[beatUnit] ?? `1/${beatUnit} note`).toLowerCase();
  const num = 'font-ui-semibold w-12 text-center text-3xl font-semibold';
  return (
    <View className="flex-row items-center gap-4">
      <View className="items-center rounded-lg px-1 py-1.5" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center">
          <Arrow dir="left" label="Fewer beats per bar" onPress={() => onChangeBeats(beatsPerBar - 1)} disabled={beatsPerBar <= 1} />
          <NumberInput value={beatsPerBar} onChange={onChangeBeats} min={1} max={MAX_BEATS} label="Beats per bar" className={num} />
          <Arrow dir="right" label="More beats per bar" onPress={() => onChangeBeats(beatsPerBar + 1)} disabled={beatsPerBar >= MAX_BEATS} />
        </View>
        <View className="my-1 h-0.5 w-10 rounded-full" style={{ backgroundColor: colors.foreground, opacity: 0.7 }} />
        <View className="flex-row items-center">
          <Arrow dir="left" label="Longer beat" onPress={() => onSetBeatUnit(NOTE_VALUES[unitIndex - 1])} disabled={unitIndex <= 0} />
          <Text className={num} style={{ color: colors.foreground }} accessibilityLabel={`Beat unit ${beatUnit}`}>
            {beatUnit}
          </Text>
          <Arrow
            dir="right"
            label="Shorter beat"
            onPress={() => onSetBeatUnit(NOTE_VALUES[unitIndex + 1])}
            disabled={unitIndex < 0 || unitIndex >= NOTE_VALUES.length - 1}
          />
        </View>
      </View>
      <View className="flex-1">
        <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
          {beatsPerBar} {beatsPerBar === 1 ? noteName : `${noteName}s`}
        </Text>
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          per bar
        </Text>
      </View>
    </View>
  );
}

/** Quick-pick cards for common time signatures, drawn stacked ("6 over 8"). */
export function MeterQuickPicks({
  meters,
  beatsPerBar,
  beatUnit,
  onPick,
}: {
  meters: [number, number][];
  beatsPerBar: number;
  beatUnit: number;
  onPick: (beats: number, unit: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <OptionGroup title="Quick picks">
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        {meters.map(([b, u]) => (
          <RewardCard key={`${b}/${u}`} on={beatsPerBar === b && beatUnit === u} label={`${b}/${u}`} onPick={() => onPick(b, u)} style={{ height: 56, width: '23%', flexGrow: 1 }}>
            <View className="items-center">
              <Text className="font-ui-semibold text-base font-semibold leading-5" style={{ color: colors.foreground }}>
                {b}
              </Text>
              <View className="my-0.5 h-0.5 w-4 rounded-full" style={{ backgroundColor: colors.foreground, opacity: 0.6 }} />
              <Text className="font-ui-semibold text-base font-semibold leading-5" style={{ color: colors.foreground }}>
                {u}
              </Text>
            </View>
          </RewardCard>
        ))}
      </View>
    </OptionGroup>
  );
}

/** A number with arrows either side and a unit after it ("‹ 4 › bars"). */
export function StepperPill({
  value,
  onChange,
  min,
  max,
  unit,
  label,
  onPage,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  unit: [string, string];
  label: string;
  /** On the page (a surface track); in a sheet it's the background colour. */
  onPage?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-row items-center rounded-md p-0.5" style={{ backgroundColor: onPage ? colors.surface : colors.background }}>
        <Arrow dir="left" label={`Fewer ${unit[1]}`} onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} />
        <NumberInput value={value} onChange={onChange} min={min} max={max} label={label} className="font-ui-semibold w-12 text-center text-xl font-semibold" />
        <Arrow dir="right" label={`More ${unit[1]}`} onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} />
      </View>
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
        {value === 1 ? unit[0] : unit[1]}
      </Text>
    </View>
  );
}

/** Beamed notes for a subdivision (one quarter, two eighths, a triplet …). */
export function SubdivisionIcon({ count, color }: { count: number; color: string }) {
  const spacing = 9;
  const width = count === 1 ? 12 : (count - 1) * spacing + 12;
  const beams = count <= 1 ? 0 : count <= 3 ? 1 : 2;
  const xs = Array.from({ length: count }, (_, i) => 4 + i * spacing);
  const tuplet = count === 3 || count >= 5;
  return (
    <Svg width={width} height={28} viewBox={`0 0 ${width} 28`}>
      {xs.map((x) => (
        <G key={x}>
          <Ellipse cx={x} cy={23} rx={3.2} ry={2.4} transform={`rotate(-20 ${x} 23)`} fill={color} />
          <Rect x={x + 2.4} y={9} width={1.2} height={14} fill={color} />
        </G>
      ))}
      {beams >= 1 ? <Rect x={xs[0] + 2.4} y={9} width={xs[count - 1] - xs[0] + 1.2} height={2.2} fill={color} /> : null}
      {beams >= 2 ? <Rect x={xs[0] + 2.4} y={12.6} width={xs[count - 1] - xs[0] + 1.2} height={2.2} fill={color} /> : null}
      {tuplet ? (
        <SvgText x={(xs[0] + xs[count - 1] + 3.6) / 2} y={6.5} fontSize={7} fontWeight="700" textAnchor="middle" fill={color}>
          {count}
        </SvgText>
      ) : null}
    </Svg>
  );
}

/** How many clicks per beat, as cards with the notes drawn. */
export function SubdivisionPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Subdivision" className="flex-row flex-wrap gap-2.5">
      {SUBDIVISIONS.map((s) => (
        <RewardCard key={s.value} on={s.value === value} onPick={() => onChange(s.value)} label={s.label} style={{ height: 80, width: '30%', flexGrow: 1 }}>
          <View className="h-8 justify-end">
            <SubdivisionIcon count={s.value} color={colors.foreground} />
          </View>
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
            {SUB_LABELS[s.value] ?? s.label}
          </Text>
        </RewardCard>
      ))}
    </View>
  );
}

/** Plays one accented click of a sound, so picking a sound lets you hear it. */
export function previewClick(soundId: string, volume: number) {
  try {
    const ctx = getAudioContext();
    const sound = getClickSound(soundId);
    const click = resolveMainBeatClick(2, sound, volume);
    if (click) scheduleClick(ctx, ctx.currentTime + 0.02, sound.wave, click.freq, click.gain, click.length);
  } catch {
    // No audio yet (e.g. web before a tap) — picking still works.
  }
}

/** A Sound chip's value: "Woodblock · 80%". */
export function soundSummary(soundId: string, volume: number) {
  return `${CLICK_SOUNDS.find((c) => c.id === soundId)?.label ?? 'Click'} · ${Math.round(volume * 100)}%`;
}

/** The click sounds as cards (each plays when picked) and a volume slider. */
export function SoundPicker({
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
  const pct = Math.round(volume * 100);
  return (
    <>
      <OptionGroup title="Click">
        <View accessibilityRole="radiogroup" accessibilityLabel="Click sound" className="flex-row flex-wrap gap-2.5">
          {CLICK_SOUNDS.map((c) => (
            <RewardCard
              key={c.id}
              row
              on={c.id === soundId}
              label={c.label}
              onPick={() => {
                setSoundId(c.id);
                previewClick(c.id, volume);
              }}
              style={{ height: 44, width: '47%', flexGrow: 1 }}
            >
              <PlayIcon color={colors.accent} size={16} />
              <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {c.label}
              </Text>
            </RewardCard>
          ))}
        </View>
      </OptionGroup>
      <OptionGroup
        title="Volume"
        aside={
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {pct}%
          </Text>
        }
      >
        <Slider
          label="Volume"
          value={volume}
          onChange={(v) => setVolume(Math.round(v * 20) / 20)}
          onEnd={() => previewClick(soundId, volume)}
        />
      </OptionGroup>
    </>
  );
}

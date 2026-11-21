import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CLICK_SOUNDS } from '@jam-practice/core/clickSounds';
import { groupsFromAccents, parseGroups } from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
import type { BeatLevel } from '@jam-practice/core/clickSounds';
import { useState, type ComponentType, type ReactNode } from 'react';
import { type DimensionValue, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { IconProps } from '@/components/icons';
import { PlayIcon } from '@/components/icons';
import { InfoButton } from '@/components/InfoButton';
import { StepperPill, previewClick } from '@/components/tool/meter';
import { OptionGroup, RewardCard, usePop } from '@/components/tool/reward';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * Small pieces the rhythm and practice tools share on top of the tool kit (`SettingChip`,
 * `reward.tsx`, `meter.tsx`): labelled steppers and pools inside a chip's sheet, the plan line
 * under a tool's beats, and the round secondary buttons beside a tool's big button.
 */

/** A list icon (the web's `ListIcon`) for "Pattern" and "Picking from" chips. */
export function ListIcon({ color, size = 18 }: IconProps) {
  return <MaterialCommunityIcons name="format-list-bulleted" size={size} color={color} />;
}

/** A setting's name in a sheet, with its description behind an ⓘ. */
export function OptionLabel({ title, hint, aside }: { title: string; hint?: string; aside?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {title}
      </Text>
      {hint ? <InfoButton title={title} text={hint} size={16} /> : null}
      {aside ? <View className="flex-1 items-end">{aside}</View> : null}
    </View>
  );
}

/** A whole number in a sheet: the name (and ⓘ) above "‹ 4 › bars". Greyed and untouchable while
    `disabled` (e.g. fixed while the tool runs). */
export function CountField({
  title,
  hint,
  value,
  onChange,
  min,
  max,
  unit,
  disabled,
}: {
  title: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  unit: [string, string];
  disabled?: boolean;
}) {
  return (
    <View className="gap-2.5">
      <OptionLabel title={title} hint={hint} />
      <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.5 : 1 }}>
        <StepperPill value={value} onChange={(n) => onChange(Math.min(max, Math.max(min, Math.round(n))))} min={min} max={max} unit={unit} label={title} />
      </View>
    </View>
  );
}

/** A pool of choices toggled on and off (which ratios, which roll types): pills lit with the
    accent gradient when on. Lives in a sheet, so the off ones sit on the background colour. */
export function PoolPills<T extends string>({
  options,
  selected,
  onToggle,
  disabled,
  label,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-2" style={{ opacity: disabled ? 0.5 : 1 }}>
      {options.map((o) => (
        <PoolPill key={o.value} label={o.label} on={selected.includes(o.value)} disabled={disabled} onPress={() => onToggle(o.value)} />
      ))}
    </View>
  );
}

function PoolPill({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const pop = usePop(on);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      hitSlop={{ top: 2, bottom: 2 }}
      className="h-10 items-center justify-center overflow-hidden rounded-lg px-3.5"
      style={{ backgroundColor: on ? colors.accent : colors.background }}
    >
      <Animated.View style={on ? pop : undefined}>
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: on ? colors['accent-foreground'] : colors.foreground }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** One choice from a few, as picker cards (two to a row by default: "Roll type", "Click"). */
export function ChoiceCards<T extends string | number>({
  options,
  value,
  onChange,
  label,
  cardWidth = '47%',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Each card's share of the row ('47%' is two to a row; '14%' fits five short ones — the gaps are fixed, so leave room). */
  cardWidth?: DimensionValue;
}) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2.5">
      {options.map((o) => (
        <RewardCard key={String(o.value)} on={o.value === value} label={o.label} onPick={() => onChange(o.value)} style={{ height: 44, width: cardWidth, flexGrow: 1 }}>
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {o.label}
          </Text>
        </RewardCard>
      ))}
    </View>
  );
}

/** The click sounds as cards (each plays when picked), without the volume — for a second click
    like Metric Modulation's previous-tempo one. */
export function ClickSoundCards({ soundId, onChange, volume, label }: { soundId: string; onChange: (id: string) => void; volume: number; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2.5">
      {CLICK_SOUNDS.map((c) => (
        <RewardCard
          key={c.id}
          row
          on={c.id === soundId}
          label={c.label}
          onPick={() => {
            onChange(c.id);
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
  );
}

/** Accent grouping typed as "3+2+2": sets the beats per bar and accents the first of each group. */
export function AccentGroupingField({ accents, onApply }: { accents: BeatLevel[]; onApply: (groups: number[]) => void }) {
  const { colors } = useAppTheme();
  const [text, setText] = useState(() => groupsFromAccents(accents).join('+'));
  return (
    <OptionGroup title="Accent grouping">
      <TextInput
        value={text}
        onChangeText={(next) => {
          setText(next);
          const groups = parseGroups(next, MAX_BEATS);
          if (groups) onApply(groups);
        }}
        placeholder="3+2+2"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Accent grouping"
        className="font-ui h-11 rounded-lg px-3 text-base"
        style={{ backgroundColor: colors.background, color: colors.foreground }}
      />
    </OptionGroup>
  );
}

/** What Start will do, in a line or two under a tool's beats (muted, centred). */
export function PlanText({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui px-2 text-center text-sm leading-5" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
      {children}
    </Text>
  );
}

/** A round button as tall as `BigButton`, for the actions beside it (New pattern, Skip, Stop):
    the faint fill, or the accent for `primary`; `danger` colours the text. */
export function PillButton({
  label,
  onPress,
  Icon,
  primary,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  Icon?: ComponentType<IconProps>;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { colors, derived } = useAppTheme();
  const fg = primary ? colors['accent-foreground'] : danger ? colors.danger : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className="h-12 flex-row items-center justify-center gap-2 overflow-hidden rounded-full px-5"
      style={{ backgroundColor: primary ? colors.accent : derived.fill, opacity: disabled ? 0.5 : 1 }}
    >
      {Icon ? <Icon color={primary ? fg : danger ? colors.danger : colors.muted} size={18} /> : null}
      <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Quiet text standing in for something with nothing to show yet, on the surface colour like
    `EmptyState` (inside a sheet it reads as plain centred text). On a page, prefer `EmptyState`
    from `components/ui.tsx`, with an icon, a title and the action that fills it. */
export function EmptyPanel({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="w-full items-center gap-3 rounded-xl px-5 py-5" style={{ backgroundColor: colors.surface }}>
      {typeof children === 'string' ? (
        <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

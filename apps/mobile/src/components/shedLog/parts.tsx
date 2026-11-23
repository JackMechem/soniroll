import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ROUTINE_COLORS } from '@jam-practice/core/practiceLog';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { CheckIcon, type IconProps } from '@/components/icons';
import { useGradeColors } from '@/components/tool/ear';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * The Shed Log's small shared pieces on the phone: a routine's icon in its colour, a section
 * heading, progress bars, the checkbox, the flame, small buttons, and the text box.
 */

type McName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** The website's routine icons (`components/practicelog/RoutineIcon.tsx`'s `ROUTINE_ICONS`, same
    ids, so a routine shows the same kind of icon on both), drawn from the app's icon pack. */
export const ROUTINE_ICONS: { id: string; label: string; icon: McName | 'fa5:drum' }[] = [
  { id: 'note', label: 'Note', icon: 'music-note' },
  { id: 'metronome', label: 'Metronome', icon: 'metronome' },
  { id: 'drum', label: 'Drums', icon: 'fa5:drum' },
  { id: 'rhythm', label: 'Rhythm', icon: 'music-note-eighth' },
  { id: 'guitar', label: 'Guitar', icon: 'guitar-acoustic' },
  { id: 'bass', label: 'Bass', icon: 'music-clef-bass' },
  { id: 'piano', label: 'Piano', icon: 'piano' },
  { id: 'mic', label: 'Voice', icon: 'microphone' },
  { id: 'ear', label: 'Ear training', icon: 'ear-hearing' },
  { id: 'chord', label: 'Chords', icon: 'music-box-multiple-outline' },
  { id: 'scale', label: 'Scales', icon: 'stairs' },
  { id: 'tuner', label: 'Tuning', icon: 'tune' },
  { id: 'wave', label: 'Listening', icon: 'waveform' },
  { id: 'chart', label: 'Charts', icon: 'file-music-outline' },
  { id: 'setlist', label: 'Repertoire', icon: 'playlist-music-outline' },
  { id: 'book', label: 'Reading', icon: 'book-open-variant' },
  { id: 'pencil', label: 'Writing', icon: 'pencil-outline' },
  { id: 'bulb', label: 'Theory', icon: 'lightbulb-outline' },
  { id: 'dumbbell', label: 'Technique', icon: 'dumbbell' },
  { id: 'target', label: 'Focus', icon: 'bullseye' },
  { id: 'bolt', label: 'Speed', icon: 'lightning-bolt' },
  { id: 'stopwatch', label: 'Timed', icon: 'timer-outline' },
  { id: 'flame', label: 'Flame', icon: 'fire' },
  { id: 'star', label: 'Star', icon: 'star' },
  { id: 'heart', label: 'Heart', icon: 'heart' },
  { id: 'sun', label: 'Morning', icon: 'white-balance-sunny' },
  { id: 'moon', label: 'Evening', icon: 'weather-night' },
];
const ICON_BY_ID = new Map(ROUTINE_ICONS.map((i) => [i.id, i.icon]));

/** A routine icon (by id) on its own, in `color`. */
export function RoutineGlyph({ id, color, size }: { id: string | undefined; color: string; size: number }) {
  const name = (id && ICON_BY_ID.get(id)) || 'music-note';
  if (name === 'fa5:drum') return <FontAwesome5 name="drum" size={size * 0.85} color={color} />;
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function routineColor(index: number) {
  return ROUTINE_COLORS[((index % ROUTINE_COLORS.length) + ROUTINE_COLORS.length) % ROUTINE_COLORS.length];
}

/** A routine's icon in a circle of its colour — how a routine is shown everywhere. */
export function RoutineIcon({ icon, color, size = 32 }: { icon: string | undefined; color: number; size?: number }) {
  return (
    <View className="items-center justify-center rounded-full" style={{ width: size, height: size, backgroundColor: routineColor(color) }}>
      <RoutineGlyph id={icon} color="#ffffff" size={Math.round(size * 0.55)} />
    </View>
  );
}

function mci(name: McName) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}

export const FlameIcon = mci('fire');
export const ChecklistIcon = mci('format-list-checks');
export const StatsIcon = mci('chart-box-outline');
export const RoutinesIcon = mci('format-list-bulleted');
export const SoundOffIcon = mci('volume-off');
export const CalendarIcon = mci('calendar-month');

/** The flame's colour: orange once you've practiced today, faded while the streak waits for today. */
export const FLAME = '#f97316';

/** Green for "done", the web's `--success` for this theme. */
export function useSuccess() {
  return useGradeColors().correct;
}

/** One part of a page: a small heading (icon, title, a count, an action on the right) over its content. */
export function Section({
  icon,
  title,
  count,
  action,
  children,
}: {
  icon?: ReactNode;
  title: string;
  count?: string | number;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2">
      {/* The app's one section heading (as `SectionHeader` in `components/ui.tsx`): the title at
          15px, a count after a dot. */}
      <View className="min-h-9 flex-row items-center gap-2 px-1">
        {icon}
        <Text numberOfLines={1} className="font-ui-semibold shrink text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {title}
          {count !== undefined ? (
            <Text className="font-ui text-[15px]" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
              {` · ${count}`}
            </Text>
          ) : null}
        </Text>
        <View className="flex-1" />
        {action}
      </View>
      {children}
    </View>
  );
}

/** A filled panel (the card fill on the page). */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-3 rounded-xl p-4" style={[{ backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}

/** A thin progress bar; `color` for the fill (the accent by default). */
export function Bar({ frac, color, height = 6 }: { frac: number; color?: string; height?: number }) {
  const { colors } = useAppTheme();
  return (
    <View className="overflow-hidden rounded-full" style={{ height, backgroundColor: withAlpha(colors.foreground, 0.1) }}>
      <View className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, backgroundColor: color ?? colors.accent }} />
    </View>
  );
}

/** A checkbox square: filled in `color` with a check (popping in) when ticked. */
export function CheckBox({ checked, color, mark = '#ffffff', size = 24 }: { checked: boolean; color: string; mark?: string; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      className="items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        backgroundColor: checked ? color : 'transparent',
        borderWidth: checked ? 0 : 1.5,
        borderColor: withAlpha(colors.foreground, 0.3),
      }}
    >
      {checked ? (
        <Animated.View entering={ZoomIn.duration(220)}>
          <CheckIcon color={mark} size={Math.round(size * 0.75)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A task to tick: the box, the name and its details are one target.

    With `onOpen` (the Shed Log's tasks), only the box ticks it off (a padded target, easy to hit)
    and the name and its line open the task's screen. */
export function TaskCheck({
  checked,
  label,
  color,
  meta,
  badge,
  mark,
  onToggle,
  onOpen,
}: {
  checked: boolean;
  label: string;
  color: string;
  mark?: string;
  meta?: (string | false | null | undefined)[];
  badge?: string;
  onToggle: () => void;
  /** Tapping the name opens the task instead of ticking it. */
  onOpen?: () => void;
}) {
  const { colors } = useAppTheme();
  const details = (meta ?? []).filter(Boolean).join(' · ');
  const text = (
    <View className="flex-1">
      <Text
        className="font-ui text-[15px]"
        style={{ color: checked ? colors.muted : colors.foreground, textDecorationLine: checked ? 'line-through' : 'none' }}
      >
        {label || 'Untitled task'}
        {badge ? (
          <Text className="font-ui-semibold text-[11px] font-semibold" style={{ color: colors.muted, textDecorationLine: 'none' }}>
            {`  ${badge}`}
          </Text>
        ) : null}
      </Text>
      {details ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {details}
        </Text>
      ) : null}
    </View>
  );
  if (onOpen) {
    return (
      <View className="flex-row items-start">
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`${label || 'Task'} done`}
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
          className="py-1 pr-3"
        >
          <CheckBox checked={checked} color={color} mark={mark} />
        </Pressable>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${label || 'the task'}`} accessibilityHint="Its notes, recordings and time" className="flex-1 flex-row py-1">
          {text}
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label || 'Task'}
      className="flex-row items-start gap-3 py-1"
    >
      <CheckBox checked={checked} color={color} mark={mark} />
      {text}
    </Pressable>
  );
}

/** A small button on the faint fill (or the accent tint with `tint`, the accent with `primary`). */
export function SmallButton({
  label,
  onPress,
  Icon,
  tint,
  primary,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  Icon?: (p: IconProps) => ReactNode;
  tint?: boolean;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { colors, derived } = useAppTheme();
  const bg = primary ? colors.accent : tint ? withAlpha(colors.accent, 0.12) : derived.fill;
  const fg = primary ? colors['accent-foreground'] : tint ? colors.accent : danger ? colors.danger : colors.foreground;
  return (
    // Rounded clip around it: Android doesn't round off the ripple itself (`ui.tsx`'s `Button`).
    <View className="overflow-hidden rounded-lg">
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
        className="h-9 flex-row items-center justify-center gap-1.5 px-3"
        style={{ backgroundColor: bg, opacity: disabled ? 0.45 : 1 }}
      >
        {Icon ? <Icon color={fg} size={16} /> : null}
        <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: fg, flexShrink: 1 }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

/** A small round icon button (⋮, ×, play) with no fill until pressed. */
export function GhostIcon({ Icon, label, onPress, color, size = 18 }: { Icon: (p: IconProps) => ReactNode; label: string; onPress: () => void; color?: string; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 w-9 items-center justify-center overflow-hidden rounded-full"
    >
      <Icon color={color ?? colors.muted} size={size} />
    </Pressable>
  );
}

/** A text box on the faint fill. */
export function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
  onSubmit,
  label,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
  label?: string;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      autoFocus={autoFocus}
      accessibilityLabel={label ?? placeholder}
      onSubmitEditing={onSubmit}
      submitBehavior={onSubmit ? 'submit' : undefined}
      returnKeyType={onSubmit ? 'done' : undefined}
      className="font-ui rounded-lg px-3 text-[15px]"
      style={{
        backgroundColor: derived.fill,
        color: colors.foreground,
        minHeight: multiline ? 72 : 44,
        paddingVertical: 10,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

/** A small muted label over a control. */
export function Label({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** Quiet text. */
export function Muted({ children, center }: { children: ReactNode; center?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <Text className={`font-ui text-sm leading-5 ${center ? 'text-center' : ''}`} style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** A choice pill (lit in the accent when picked). */
export function ChoicePill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      android_ripple={{ color: on ? colors['accent-hover'] : colors['surface-hover'] }}
      className="h-9 items-center justify-center overflow-hidden rounded-full px-3.5"
      style={{ backgroundColor: on ? colors.accent : derived.fill }}
    >
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: on ? colors['accent-foreground'] : colors.foreground, fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "1:05:09", "23:10". */
export function formatStopwatch(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

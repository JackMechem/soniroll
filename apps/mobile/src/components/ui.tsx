import type { NavLinkInfo } from '@jam-practice/core/navLinks';
import { Stack, useRouter } from 'expo-router';
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { CheckIcon, ChevronRightIcon, ClearIcon, NAV_LINK_ICONS, SearchIcon, type IconProps } from '@/components/icons';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';
import { withAccidentals } from '@/components/Accidentals';
import { HeaderTitle } from '@/components/HeaderTitle';

/**
 * The app's basic pieces, styled like the website after its UX refresh: filled cards (no thin
 * borders), a faint fill on rows and secondary buttons, the web's corner scale (controls
 * `rounded-lg`, cards `rounded-xl`), colour from the theme only, and each tool's icon in its
 * category colour. Reuse these before styling a new card, row or button by hand.
 */

/** A big page title with an optional line under it (a tab's top screen, like the web's page heads). */
export function PageTitle({ title, detail, right }: { title: string; detail?: string; right?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-end gap-3">
      <View className="flex-1">
        <Text className="font-ui-extrabold text-[28px] font-extrabold leading-tight tracking-tight" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text className="font-ui mt-0.5 text-sm" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A card: a filled panel with a title row (and an optional link on the right) above its content.
    `plain` leaves the frame off, for content made of its own tiles. */
export function Card({
  title,
  detail,
  action,
  plain,
  children,
}: {
  title?: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
  plain?: boolean;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View className={plain ? 'gap-2.5' : 'overflow-hidden rounded-xl'} style={plain ? undefined : { backgroundColor: colors.surface }}>
      {title ? (
        <View className={`flex-row items-center gap-2 ${plain ? 'px-1' : 'h-12 px-4'}`}>
          <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
            {title}
          </Text>
          {detail ? (
            <Text numberOfLines={1} className="font-ui flex-1 text-xs" style={{ color: colors.muted }}>
              {withAccidentals(detail)}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          {action ? (
            <Pressable onPress={action.onPress} hitSlop={10} className="flex-row items-center gap-0.5" accessibilityRole="link">
              <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                {action.label}
              </Text>
              <ChevronRightIcon color={colors.muted} size={15} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View className={plain ? '' : title ? 'gap-3 px-4 pb-4' : 'gap-3 p-4'}>{children}</View>
    </View>
  );
}

/** A tappable row inside a card: an icon tile, a title and an optional detail, and a chevron or
    something of its own on the right. Rows sit on the faint fill, a little apart. `plain` leaves
    the fill off — for rows directly inside a card (no card-in-card), spaced rather than filled. */
export function ListRow({
  icon,
  title,
  detail,
  right,
  onPress,
  plain,
  style,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors['surface-hover'] }}
      className={`min-h-[52px] flex-row items-center gap-3 overflow-hidden rounded-lg py-2 ${plain ? '-mx-2 px-2' : 'px-3'}`}
      style={[{ backgroundColor: plain ? 'transparent' : derived.fill }, style]}
    >
      {icon}
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {withAccidentals(detail)}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRightIcon color={colors.muted} size={18} /> : null)}
    </Pressable>
  );
}

/** An icon on a tile tinted with its colour (a tool's category colour, or the accent). */
export function IconTile({ Icon, color, size = 36 }: { Icon: ComponentType<IconProps>; color?: string; size?: number }) {
  const { colors } = useAppTheme();
  const c = color ?? colors.accent;
  return (
    <View className="items-center justify-center rounded-lg" style={{ width: size, height: size, backgroundColor: withAlpha(c, 0.14) }}>
      <Icon color={c} size={Math.round(size * 0.52)} />
    </View>
  );
}

/** A tool's own icon tile, in its category colour. */
export function ToolIcon({ tool, size }: { tool: NavLinkInfo; size?: number }) {
  const { derived } = useAppTheme();
  const Icon = NAV_LINK_ICONS[tool.href];
  if (!Icon) return null;
  return <IconTile Icon={Icon} color={derived.category[tool.category]} size={size} />;
}

/** Buttons. `primary` is the accent; `secondary` the faint fill. `pill` makes it fully round (the big
    main buttons: Start, Record). */
export function Button({
  label,
  onPress,
  kind = 'primary',
  pill,
  Icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  pill?: boolean;
  Icon?: ComponentType<IconProps>;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, derived } = useAppTheme();
  const primary = kind === 'primary';
  const fg = primary ? colors['accent-foreground'] : colors.foreground;
  return (
    // The ripple is drawn with the button's background, which Android doesn't round off: the
    // wrapper's rounded clip does (it was a square box behind a rounded button).
    <View className={`overflow-hidden ${pill ? 'rounded-full' : 'rounded-lg'}`} style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
        className="h-11 flex-row items-center justify-center gap-1.5 px-4"
        style={{ backgroundColor: primary ? colors.accent : derived.fill, opacity: disabled ? 0.5 : 1 }}
      >
        {Icon ? <Icon color={fg} size={18} /> : null}
        <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: fg }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

/** A round icon-only button on the faint fill (top bars: settings, close), or on the accent with
    `primary` (a page's main action, like adding a tune). */
export function IconButton({
  Icon,
  label,
  onPress,
  size = 40,
  primary,
  color,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  size?: number;
  primary?: boolean;
  /** The icon's colour (e.g. `danger` for a delete button); the text colour by default. */
  color?: string;
}) {
  const { colors, derived } = useAppTheme();
  return (
    // Round clip around it: Android doesn't round off the ripple itself (see `Button`).
    <View className="overflow-hidden rounded-full">
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole="button"
        hitSlop={6}
        // Not `borderless`: on Android a borderless ripple replaces the button's background colour.
        android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
        className="items-center justify-center"
        style={{ width: size, height: size, backgroundColor: primary ? colors.accent : derived.fill }}
      >
        <Icon color={color ?? (primary ? colors['accent-foreground'] : colors.foreground)} size={Math.round(size * 0.55)} />
      </Pressable>
    </View>
  );
}

/** A search box on the faint fill, with a clear button once something's typed. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="h-11 flex-row items-center gap-2 rounded-lg pl-3" style={{ backgroundColor: derived.fill }}>
      <SearchIcon color={colors.muted} size={18} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        className="font-ui flex-1 text-[15px]"
        style={{ color: colors.foreground, paddingVertical: 8 }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear search" className="h-11 w-11 items-center justify-center">
          <ClearIcon color={colors.muted} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A small label chip on the faint fill ("in B♭", "160 BPM"). */
export function Chip({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: derived.fill }}>
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: muted ? colors.muted : colors.foreground }}>
        {children}
      </Text>
    </View>
  );
}

/** Quiet text for an empty card. */
export function EmptyText({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

/** The one empty state: an icon on a tinted tile, a one-line title, one short line, and the action
    that fills it — on the surface colour, like a card. Use it for every empty list or screen. */
export function EmptyState({
  Icon,
  title,
  body,
  action,
  secondary,
}: {
  Icon?: ComponentType<IconProps>;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; Icon?: ComponentType<IconProps> };
  secondary?: { label: string; onPress: () => void };
}) {
  const { colors } = useAppTheme();
  return (
    <View className="items-center gap-3 rounded-xl px-5 py-7" style={{ backgroundColor: colors.surface }}>
      {Icon ? <IconTile Icon={Icon} size={44} /> : null}
      <View className="items-center gap-1">
        <Text className="font-ui-semibold text-center text-base font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {body ? (
          <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
            {body}
          </Text>
        ) : null}
      </View>
      {action || secondary ? (
        // Stacked, the main action on top: two side by side only fit when their labels are short,
        // so some empty states had them in a row and others wrapped.
        <View className="items-center gap-2">
          {action ? <Button label={action.label} Icon={action.Icon} onPress={action.onPress} /> : null}
          {secondary ? <Button label={secondary.label} kind="secondary" onPress={secondary.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The one sort control: small pills, the current one filled. Keep the options in a fixed order
    (most useful first — usually Recent, then A–Z). */
export function SortControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Sort" className="flex-row gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <View key={o.value} className="overflow-hidden rounded-full">
            <Pressable
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              android_ripple={{ color: on ? colors['accent-hover'] : colors['surface-hover'] }}
              className="h-9 justify-center px-3.5"
              // The accent when picked, like every other selected toggle.
              style={{ backgroundColor: on ? colors.accent : derived.fill }}
            >
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: on ? colors['accent-foreground'] : colors.foreground }}>
                {o.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** Whether a scrolling page has moved off its top — for a hairline (or the header's shadow) under a
    header once content slides beneath it. Spread `onScroll` and `scrollEventThrottle` on the
    `ScrollView`/`FlatList`. */
export function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const now = e.nativeEvent.contentOffset.y > 2;
    if (now !== scrolled) setScrolled(now);
  };
  return { scrolled, onScroll, scrollEventThrottle: 16 };
}

/** A section's heading inside a page or card: the name, an optional count after a dot ("Tunes I
    Know · 12"), an optional one-line `detail` under it (what the section is for), and something on
    the right (a link, a sort control). */
export function SectionHeader({ title, count, detail, right }: { title: string; count?: number; detail?: string; right?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="min-h-[36px] flex-row items-center gap-2 px-1">
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {title}
          {count !== undefined ? <Text className="font-ui text-[15px]" style={{ color: colors.muted }}>{` · ${count}`}</Text> : null}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {withAccidentals(detail)}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/**
 * The one sign-in gate, for anything that needs an account while you're signed out: `EmptyState`'s
 * look (an icon tile, a title, one line) with an optional short checklist of what you get, then
 * **Sign in** and **Create an account** (both open the Account screen, on the matching side). No
 * second headline or label repeating the screen's title — the header already says where you are.
 * Wrap it in `SignInGateScreen` when it's the whole screen.
 */
export function SignInGate({
  Icon,
  title,
  body,
  points,
}: {
  Icon?: ComponentType<IconProps>;
  title: string;
  body?: string;
  points?: string[];
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <View className="items-center gap-4 rounded-xl px-5 py-7" style={{ backgroundColor: colors.surface }}>
      {Icon ? <IconTile Icon={Icon} size={44} /> : null}
      <View className="items-center gap-1">
        <Text className="font-ui-semibold text-center text-base font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {body ? (
          <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
            {body}
          </Text>
        ) : null}
      </View>
      {points?.length ? (
        <View className="gap-2 self-stretch">
          {points.map((p) => (
            <View key={p} className="flex-row items-center gap-2.5">
              <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
                <CheckIcon color={colors.accent} size={13} />
              </View>
              <Text className="font-ui flex-1 text-sm leading-5" style={{ color: colors.foreground }}>
                {p}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {/* Stacked like `EmptyState`'s two buttons, so every empty card reads the same. */}
      <View className="items-center gap-2">
        <Button label="Sign in" onPress={() => router.push('/profile')} />
        <Button label="Create an account" kind="secondary" onPress={() => router.push({ pathname: '/profile', params: { flow: 'signUp' } })} />
      </View>
    </View>
  );
}

/** `SignInGate` as a whole screen: on the page background, with the page's padding, scrolling if
    the phone is small. `bottom` is the bottom padding (`useTabBarSpace()` on a main screen).
    `header`: the header's title while signed out — set on a screen that names a routine, note or
    person in its header, so that (and its Edit, Share or ⋮ buttons) never stay up from before
    signing out. */
export function SignInGateScreen({ bottom = 48, header, ...gate }: Parameters<typeof SignInGate>[0] & { bottom?: number; header?: string }) {
  const { colors } = useAppTheme();
  return (
    <>
      {header ? (
        <Stack.Screen options={{ title: header, headerTitle: ({ children }) => <HeaderTitle>{children}</HeaderTitle>, headerRight: () => null }} />
      ) : null}
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: bottom }}>
        <SignInGate {...gate} />
      </ScrollView>
    </>
  );
}

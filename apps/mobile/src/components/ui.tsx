import type { NavLinkInfo } from '@jam-practice/core/navLinks';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { ChevronRightIcon, ClearIcon, NAV_LINK_ICONS, SearchIcon, type IconProps } from '@/components/icons';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

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
              {detail}
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
    something of its own on the right. Rows sit on the faint fill, a little apart. */
export function ListRow({
  icon,
  title,
  detail,
  right,
  onPress,
  style,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors['surface-hover'] }}
      className="min-h-[52px] flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
      style={[{ backgroundColor: derived.fill }, style]}
    >
      {icon}
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            {detail}
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className={`h-11 flex-row items-center justify-center gap-1.5 overflow-hidden px-4 ${pill ? 'rounded-full' : 'rounded-lg'}`}
      style={[{ backgroundColor: primary ? colors.accent : derived.fill, opacity: disabled ? 0.5 : 1 }, style]}
    >
      {Icon ? <Icon color={fg} size={18} /> : null}
      <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
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
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
  size?: number;
  primary?: boolean;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      // Not `borderless`: on Android a borderless ripple replaces the button's background colour.
      android_ripple={{ color: primary ? colors['accent-hover'] : colors['surface-hover'] }}
      className="items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: primary ? colors.accent : derived.fill }}
    >
      <Icon color={primary ? colors['accent-foreground'] : colors.foreground} size={Math.round(size * 0.55)} />
    </Pressable>
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

import {
  Children,
  Fragment,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckIcon, ChevronRightIcon, CloseIcon, SlidersIcon, type IconProps } from '@/components/icons';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { usePop } from '@/components/tool/reward';
import { MoreIcon } from '@/components/tool/toolIcons';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * A tool's options as **setting chips** under its main display, like the website
 * (`apps/web/components/SettingsBar.tsx`): each chip shows the setting's current value and opens a
 * bottom sheet to change it. One sheet at a time; tapping outside, × or Back closes it.
 */

/** Every tool screen's scroll content, top-anchored: a 16dp gutter, starting 20dp under the
    header. Most tools use `ToolFrame` instead (the fixed footer with the chips); kept for screens
    that only scroll. */
export const TOOL_CONTENT = { flexGrow: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24, gap: 24 } as const;

/** Its children with fragments opened up and empty slots (`null`, `false`) dropped, each with a
    key of its own (they're rendered as a list). */
function flattenChildren(children: ReactNode, prefix = ''): ReactElement[] {
  const out: ReactElement[] = [];
  Children.toArray(children).forEach((child, i) => {
    if (!isValidElement(child)) return;
    const key = `${prefix}${child.key ?? i}`;
    if (child.type === Fragment) out.push(...flattenChildren((child.props as { children?: ReactNode }).children, `${key}/`));
    else out.push(cloneElement(child, { key }));
  });
  return out;
}

/** Whether a chip sits in a `SettingsBar` cell (then it fills the cell). */
const ChipGridContext = createContext(false);

/**
 * A tool's setting chips as one compact strip: a single row of cells on the surface colour, split
 * by hairlines, each showing its value with its icon and name small under it; a cell's width
 * follows its value. At most four show (put the most-used first): with more than four, the first
 * three and one "N more" cell (`MoreOptionsChip`). A tool that builds its own `MoreOptionsChip`
 * keeps it as it is. (It was a two-column grid of 56-dp chips, which with the big Start button
 * pushed tool screens into scrolling; Jack: everything on a tool should always be visible.)
 */
export function SettingsBar({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const { colors, derived } = useAppTheme();
  let items = flattenChildren(children);
  const hasMore = items.some((c) => c.type === MoreOptionsChip);
  if (!hasMore && items.length > max) {
    items = [...items.slice(0, max - 1), <MoreOptionsChip key="more">{items.slice(max - 1)}</MoreOptionsChip>];
  }
  return (
    <ChipGridContext.Provider value>
      <View className="w-full flex-row overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
        {items.map((child, i) => (
          <View
            key={child.key ?? i}
            style={{
              // The "N more" cell keeps its (short) size, so the settings' own values get the rest of
              // the row.
              ...(child.type === MoreOptionsChip
                ? { flexGrow: 0, flexShrink: 0 }
                : { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }),
              borderLeftWidth: i > 0 ? 1 : 0,
              borderLeftColor: derived.hairline,
            }}
          >
            {child}
          </View>
        ))}
      </View>
    </ChipGridContext.Provider>
  );
}

/** A setting as a cell of the strip: the value (popping when it changes), then its icon and name
    small under it; a toggle's switch as a small disc before them. */
function StripCell({
  Icon,
  label,
  value,
  pop,
  toggle,
  onPress,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  value?: string;
  pop?: ReturnType<typeof usePop>;
  toggle?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  // The strip shows a value's main part ("Woodblock" of "Woodblock · 35%"); the rest is in the
  // sheet (and the accessibility label), so four cells fit across a phone without cutting words.
  const shown = value?.split(' · ')[0];
  return (
    <View className="h-[52px] flex-row items-center" style={{ opacity: toggle && !toggle.checked ? 0.7 : 1 }}>
      {toggle ? (
        <Pressable
          onPress={() => toggle.onChange(!toggle.checked)}
          disabled={toggle.disabled}
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityState={{ checked: toggle.checked, disabled: toggle.disabled }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 2 }}
          className="h-[52px] items-center justify-center pl-2.5"
        >
          <View
            className="h-6 w-6 items-center justify-center rounded-full"
            style={toggle.checked ? { backgroundColor: colors.accent } : { borderWidth: 2, borderColor: withAlpha(colors.foreground, 0.35) }}
          >
            {toggle.checked ? <CheckIcon color={colors['accent-foreground']} size={14} /> : null}
          </View>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : label}
        android_ripple={{ color: colors['surface-hover'] }}
        // Grows from its content's width (not `flex-1`, whose zero basis made every cell the same
        // width, cutting a long value off while a short one had room to spare).
        className="h-[52px] justify-center px-2"
        style={{ flexGrow: 1, flexShrink: 1, ...(toggle ? { paddingLeft: 8 } : null) }}
      >
        <Animated.View style={pop}>
          <Text numberOfLines={1} className="font-ui-bold text-[15px] font-bold" style={{ color: colors.foreground }}>
            {shown || label}
          </Text>
        </Animated.View>
        <View className="flex-row items-center gap-1">
          <Icon color={colors.muted} size={12} />
          <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.muted, flexShrink: 1 }}>
            {label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** The bottom sheet a chip opens: the title and a close button, then its controls, which scroll on
    their own if they're long. Floats a little in from the screen's edges, over a dimmed page. */
export function ToolSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Android draws edge to edge, so nothing lifts the sheet for the keyboard there (iOS uses the
  // KeyboardAvoidingView below): sit it on top of the keyboard, whose height leaves out the
  // gesture bar under it. Only a real keyboard counts — a sliver of "keyboard" with nothing
  // typed (seen on Android 17) floated every sheet up the screen.
  const keyboard = useKeyboardHeight();
  const lift = Platform.OS === 'android' && keyboard > MIN_KEYBOARD ? keyboard : 0;
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  // 80% of the screen, but never so tall that, lifted over the keyboard, its header slides up
  // under the status bar: capped to the room between the status bar and the keyboard, the
  // header stays put and the body scrolls.
  const { height: screenHeight } = useWindowDimensions();
  const bottom = insets.bottom + 12 + lift;
  // (On iOS the KeyboardAvoidingView takes the keyboard's room instead of `lift`.)
  const covered = Platform.OS === 'ios' ? keyboard : 0;
  const maxHeight = Math.max(160, Math.min(screenHeight * 0.8, screenHeight - insets.top - 12 - bottom - covered));
  return (
    // The Modal fades the backdrop in and `SheetSlide` slides the sheet up. The sheet sits in the
    // normal layout (a column that ends at the bottom), not absolutely positioned, and slides with
    // React Native's own Animated: on Jack's Android 17 phone a Reanimated entering animation plus
    // absolute positioning left the sheet floating mid-screen with none of its buttons working.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* A Modal is outside the app's own gesture root; sliders in here need one of their own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.overlay, 0.6) }]} onPress={onClose} accessibilityLabel="Close" />
          <SheetSlide
            style={{
              marginHorizontal: 12,
              marginBottom: bottom,
              maxHeight,
              borderRadius: 24,
              overflow: 'hidden',
              backgroundColor: colors.surface,
              elevation: 16,
            }}
          >
            <View className="flex-row items-center gap-2 pb-2 pl-5 pr-3 pt-4">
              <Text numberOfLines={1} className="font-ui-semibold flex-1 text-base font-semibold" style={{ color: colors.foreground }}>
                {title}
              </Text>
              <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" className="h-10 w-10 items-center justify-center rounded-full">
                <CloseIcon color={colors.muted} size={18} />
              </Pressable>
            </View>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              // Android's bar hugged the sheet's rounded edge; the cut-off content shows it scrolls.
              showsVerticalScrollIndicator={false}
              // Sized to its content as that changes: on Android a sheet whose content grew after it
              // opened (a spinner becoming a button) kept its first height and cut the rest off. The
              // sheet's maxHeight still caps it, and then it scrolls.
              style={contentHeight ? { height: contentHeight } : undefined}
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 20,
              }}
            >
              <View style={{ gap: 16 }}>{visible ? children : null}</View>
            </ScrollView>
          </SheetSlide>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Less than this isn't a keyboard (dp). */
const MIN_KEYBOARD = 150;

/** The sheet sliding up as it mounts (React Native's Animated, on the native thread). */
export function SheetSlide({ style, children }: { style: ViewStyle; children: ReactNode }) {
  const [offset] = useState(() => new RNAnimated.Value(48));
  useEffect(() => {
    RNAnimated.timing(offset, { toValue: 0, duration: 220, easing: RNEasing.out(RNEasing.cubic), useNativeDriver: true }).start();
  }, [offset]);
  return <RNAnimated.View style={[style, { transform: [{ translateY: offset }] }]}>{children}</RNAnimated.View>;
}

/** How a `SettingChip` draws itself: as a chip on the page (normally); as a row in the "More
    options" list (tapping it picks it); or only its sheet, opened from that list. */
type ChipMode =
  | { mode: 'chip' }
  | { mode: 'row'; pick: (label: string, onOpenChange?: (open: boolean) => void) => void }
  | { mode: 'sheet'; active: string | null; close: () => void };
const ChipModeContext = createContext<ChipMode>({ mode: 'chip' });

/**
 * One setting chip: a chunky pill with the setting's icon on an accent-tinted disc (like
 * `IconTile`), its value big and its name small under it; the value pops when it changes. Tapping
 * it opens its sheet. Give every chip a short value (even a summary like "Piano · in turn"), so
 * chips read alike.
 *
 * With `toggle`, it's a split chip for a setting that's switched on and off as a whole: the round
 * disc on the left is the switch (a tick on the accent when on, an empty ring when off) and
 * toggles it straight away; the rest of the chip (name, value, a sliders mark) opens the sheet.
 * Dimmed while off. A toggle with nothing else to set (no children) has no sheet: the whole chip
 * is the switch, so it never has two different tap targets.
 */
export function SettingChip({
  Icon,
  label,
  value,
  title,
  toggle,
  open: openProp,
  onOpenChange,
  children,
}: {
  Icon: ComponentType<IconProps>;
  /** The setting's name, under the value ("Time"); with no value, the chip's only text. */
  label: string;
  /** The current value ("7/8"). */
  value?: string;
  /** The sheet's heading (defaults to `label`). */
  title?: string;
  toggle?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  };
  /** Control the sheet from outside (e.g. an Edit button elsewhere opening it). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const chipMode = useContext(ChipModeContext);
  const inGrid = useContext(ChipGridContext);
  const [openState, setOpenState] = useState(false);
  // Under "More options" a controlled chip (`open`) still follows its owner (who may close it to
  // open another sheet); otherwise it's open while it's the one picked from the list.
  const open = chipMode.mode === 'sheet' ? (openProp ?? chipMode.active === label) : (openProp ?? openState);
  const setOpen = (next: boolean) => {
    if (chipMode.mode === 'sheet') {
      if (!next) chipMode.close();
      onOpenChange?.(next);
      return;
    }
    onOpenChange?.(next);
    if (openProp === undefined) setOpenState(next);
  };
  const pop = usePop(`${value ?? ''}|${toggle?.checked ?? ''}`);
  const hasValue = value !== undefined && value !== '';
  // Just a switch: tapping anywhere on it flips it.
  const switchOnly = !!toggle && (children === undefined || children === null);
  const press = switchOnly ? () => toggle.onChange(!toggle.checked) : () => setOpen(true);

  const sheet = switchOnly ? null : (
    <ToolSheet visible={open} onClose={() => setOpen(false)} title={title ?? label}>
      {children}
    </ToolSheet>
  );
  // Listed under "More options": its sheet lives outside that list (so it can open once the list
  // closes); the list shows it as a row.
  if (chipMode.mode === 'sheet') return sheet;
  if (chipMode.mode === 'row') {
    return <ChipListRow Icon={Icon} label={label} value={value} toggle={toggle} onPress={switchOnly ? press : () => chipMode.pick(label, onOpenChange)} />;
  }

  if (inGrid) {
    return (
      <>
        <StripCell Icon={Icon} label={label} value={hasValue ? value : undefined} pop={pop} toggle={toggle} onPress={press} />
        {sheet}
      </>
    );
  }

  const text = hasValue ? (
    <View style={{ flexShrink: 1 }}>
      <Animated.View style={pop}>
        <Text numberOfLines={1} className="font-ui-extrabold text-base font-extrabold" style={{ color: colors.foreground }}>
          {value}
        </Text>
      </Animated.View>
      <Text numberOfLines={1} className="font-ui-semibold text-[11px] font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
    </View>
  ) : (
    <Text numberOfLines={1} className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground, flexShrink: 1 }}>
      {label}
    </Text>
  );

  // In a grid cell the chip fills it (content on the left); on its own it hugs its content.
  const fill = inGrid ? { alignSelf: 'stretch' as const } : { maxWidth: '100%' as const };

  const chip = toggle ? (
    // A split chip: the round disc on the left is the switch (filled with a tick when on, an empty
    // ring when off); the rest of the chip opens the sheet.
    <View
      className="h-14 flex-row items-center overflow-hidden rounded-full"
      style={{ ...fill, backgroundColor: colors.surface, opacity: toggle.checked ? 1 : 0.75 }}
    >
      <Pressable
        onPress={() => toggle.onChange(!toggle.checked)}
        disabled={toggle.disabled}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: toggle.checked, disabled: toggle.disabled }}
        hitSlop={{ top: 6, bottom: 6, left: 6 }}
        className="h-14 items-center justify-center pl-2.5 pr-1"
      >
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={toggle.checked ? { backgroundColor: colors.accent } : { borderWidth: 2, borderColor: withAlpha(colors.foreground, 0.35) }}
        >
          {toggle.checked ? <CheckIcon color={colors['accent-foreground']} size={18} /> : null}
        </View>
      </Pressable>
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={switchOnly ? `${label}${hasValue ? `: ${value}` : ''}` : `${label} settings${hasValue ? `: ${value}` : ''}`}
        android_ripple={{ color: colors['surface-hover'] }}
        className="h-14 flex-1 flex-row items-center gap-2 pl-1.5 pr-3"
      >
        {text}
        {inGrid ? <View className="flex-1" /> : null}
        {switchOnly ? null : <SlidersIcon color={colors.muted} size={16} />}
      </Pressable>
    </View>
  ) : (
    <Pressable
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={hasValue ? `${label}: ${value}` : label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-14 flex-row items-center gap-2.5 overflow-hidden rounded-full pl-2.5 pr-4"
      style={{ ...fill, backgroundColor: colors.surface }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
        <Icon color={colors.accent} size={18} />
      </View>
      {text}
    </Pressable>
  );

  return (
    <>
      {chip}
      {sheet}
    </>
  );
}

/** A setting as a row in the "More options" list: its icon, name and value, a switch when it has
    one, and a chevron. Tapping the row opens the setting's own sheet. */
function ChipListRow({
  Icon,
  label,
  value,
  toggle,
  onPress,
}: {
  Icon: ComponentType<IconProps>;
  label: string;
  value?: string;
  toggle?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
  onPress: () => void;
}) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="min-h-[56px] flex-row items-center overflow-hidden rounded-lg" style={{ backgroundColor: colors.background }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : label}
        android_ripple={{ color: colors['surface-hover'] }}
        className="min-h-[56px] flex-1 flex-row items-center gap-3 py-2 pl-2 pr-3"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
          <Icon color={colors.accent} size={19} />
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
            {label}
          </Text>
          {value ? (
            <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
              {value}
            </Text>
          ) : null}
        </View>
        {toggle ? null : <ChevronRightIcon color={colors.muted} size={18} />}
      </Pressable>
      {toggle ? (
        <>
          <View className="my-3 w-px self-stretch" style={{ backgroundColor: derived.hairline }} />
          <Pressable
            onPress={() => toggle.onChange(!toggle.checked)}
            disabled={toggle.disabled}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: toggle.checked, disabled: toggle.disabled }}
            className="h-14 items-center justify-center px-3"
          >
            <View
              className="h-7 w-12 justify-center rounded-full"
              style={{ backgroundColor: toggle.checked ? colors.accent : withAlpha(colors.foreground, 0.12) }}
            >
              <View
                className="h-5 w-5 rounded-full"
                style={{
                  marginLeft: toggle.checked ? 24 : 4,
                  backgroundColor: toggle.checked ? colors['accent-foreground'] : withAlpha(colors.foreground, 0.8),
                }}
              />
            </View>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/**
 * For a tool with many settings (Rhythm Section): its `SettingChip`s as children become one "More
 * options" chip that opens a list of them; picking one closes the list and opens that setting's
 * own sheet, as its chip would. Put the three or four most-used chips beside it on the page.
 * (`SettingsBar` makes one by itself when a tool has more than five chips.)
 */
export function MoreOptionsChip({ children, label = 'More options' }: { children: ReactNode; label?: string }) {
  const { colors } = useAppTheme();
  const inGrid = useContext(ChipGridContext);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const count = flattenChildren(children).length;
  const names = flattenChildren(children)
    .map((c) => (isValidElement<{ label?: unknown }>(c) && typeof c.props.label === 'string' ? c.props.label : null))
    .filter((n): n is string => n !== null);
  const pick = (name: string, onOpenChange?: (open: boolean) => void) => {
    setListOpen(false);
    // Let the list's sheet fade out first (iOS won't show a Modal while another is closing).
    setTimeout(() => {
      setActive(name);
      onOpenChange?.(true);
    }, 280);
  };
  const opener = inGrid ? (
    // A plain word under "N more": a list of the names never fit the cell and was always cut off.
    <StripCell Icon={MoreIcon} label="Options" value={count ? `${count} more` : 'More'} onPress={() => setListOpen(true)} />
  ) : (
    <Pressable
      onPress={() => setListOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={names.length ? `${label}: ${names.join(', ')}` : label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-14 flex-row items-center gap-2.5 overflow-hidden rounded-full pl-2.5 pr-4"
      style={{ ...(inGrid ? { alignSelf: 'stretch' as const } : null), backgroundColor: colors.surface }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
        <MoreIcon color={colors.accent} size={18} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} className="font-ui-extrabold text-base font-extrabold" style={{ color: colors.foreground }}>
          {count ? `${count} more` : 'More'}
        </Text>
        <Text numberOfLines={1} className="font-ui-semibold text-[11px] font-semibold" style={{ color: colors.muted }}>
          {names.length ? names.join(', ') : label}
        </Text>
      </View>
    </Pressable>
  );
  return (
    <>
      {opener}
      <ToolSheet visible={listOpen} onClose={() => setListOpen(false)} title={label}>
        <View className="gap-2">
          <ChipModeContext.Provider value={{ mode: 'row', pick }}>{children}</ChipModeContext.Provider>
        </View>
      </ToolSheet>
      <ChipModeContext.Provider value={{ mode: 'sheet', active, close: () => setActive(null) }}>{children}</ChipModeContext.Provider>
    </>
  );
}

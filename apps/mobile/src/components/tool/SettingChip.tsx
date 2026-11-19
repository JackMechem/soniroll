import { useState, type ComponentType, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckIcon, CloseIcon, SlidersIcon, type IconProps } from '@/components/icons';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { GradientFill, usePop } from '@/components/tool/reward';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * A tool's options as **setting chips** under its main display, like the website
 * (`apps/web/components/SettingsBar.tsx`): each chip shows the setting's current value and opens a
 * bottom sheet to change it. One sheet at a time; tapping outside, × or Back closes it.
 */

/** A centred, wrapping row of chips. */
export function SettingsBar({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap justify-center gap-2">{children}</View>;
}

/** The bottom sheet a chip opens: the title and a close button, then its controls, which scroll on
    their own if they're long. Floats a little in from the screen's edges, over a dimmed page. */
export function ToolSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Android draws edge to edge, so nothing lifts the sheet for the keyboard there (iOS uses the
  // KeyboardAvoidingView below): sit it on top of the keyboard, whose height leaves out the
  // gesture bar under it.
  const keyboard = useKeyboardHeight();
  const lift = Platform.OS === 'android' ? keyboard : 0;
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A Modal is outside the app's own gesture root; sliders in here need one of their own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: withAlpha(colors.overlay, 0.6) }} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View
            entering={SlideInDown.duration(240).easing(Easing.out(Easing.cubic))}
            className="overflow-hidden rounded-3xl"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: insets.bottom + 12 + lift,
              maxHeight: '80%',
              backgroundColor: colors.surface,
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: 12 },
              elevation: 16,
            }}
          >
            <View className="flex-row items-center gap-2 pb-2 pl-5 pr-3 pt-4">
              <Text numberOfLines={1} className="font-ui-semibold flex-1 text-base font-semibold" style={{ color: colors.foreground }}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityLabel="Close"
                accessibilityRole="button"
                className="h-10 w-10 items-center justify-center rounded-full"
              >
                <CloseIcon color={colors.muted} size={18} />
              </Pressable>
            </View>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
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
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * One setting chip: a chunky pill with the setting's icon on an accent disc, its value big and its
 * name small under it; the value pops when it changes. Tapping it opens its sheet.
 *
 * With `toggle`, it's a split chip for a setting that's switched on and off as a whole: a switch
 * (with the name and value) that toggles it straight away, and a sliders button that opens the
 * sheet. Dimmed while off.
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
  children: ReactNode;
}) {
  const { colors, derived } = useAppTheme();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (openProp === undefined) setOpenState(next);
  };
  const pop = usePop(`${value ?? ''}|${toggle?.checked ?? ''}`);
  const hasValue = value !== undefined && value !== '';

  const text = hasValue ? (
    <View>
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
    <Text numberOfLines={1} className="font-ui-bold text-sm font-bold" style={{ color: colors.foreground }}>
      {label}
    </Text>
  );

  const chip = toggle ? (
    <View
      className="h-14 flex-row items-stretch overflow-hidden rounded-full"
      style={{
        backgroundColor: colors.surface,
        opacity: toggle.checked ? 1 : 0.7,
      }}
    >
      <Pressable
        onPress={() => toggle.onChange(!toggle.checked)}
        disabled={toggle.disabled}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{
          checked: toggle.checked,
          disabled: toggle.disabled,
        }}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-3 pl-2 pr-4"
      >
        <View
          className="h-9 w-[60px] overflow-hidden rounded-full"
          style={{
            backgroundColor: toggle.checked ? undefined : colors.background,
          }}
        >
          {toggle.checked ? <GradientFill /> : null}
          <View
            className="absolute top-1 h-7 w-7 items-center justify-center rounded-full"
            style={{
              left: toggle.checked ? 28 : 4,
              backgroundColor: toggle.checked ? colors['accent-foreground'] : withAlpha(colors.foreground, 0.8),
            }}
          >
            {toggle.checked ? <CheckIcon color={colors.accent} size={16} /> : null}
          </View>
        </View>
        {text}
      </Pressable>
      <View className="my-2 w-px" style={{ backgroundColor: derived.hairline }} />
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label} settings`}
        android_ripple={{ color: colors['surface-hover'] }}
        className="items-center justify-center pl-3 pr-4"
      >
        <SlidersIcon color={colors.muted} size={18} />
      </Pressable>
    </View>
  ) : (
    <Pressable
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={hasValue ? `${label}: ${value}` : label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-14 flex-row items-center gap-3 overflow-hidden rounded-full pl-1.5 pr-5"
      style={{ backgroundColor: colors.surface }}
    >
      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full">
        <GradientFill />
        <Icon color={colors['accent-foreground']} size={20} />
      </View>
      {text}
    </Pressable>
  );

  return (
    <>
      {chip}
      <ToolSheet visible={open} onClose={() => setOpen(false)} title={title ?? label}>
        {children}
      </ToolSheet>
    </>
  );
}

import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A small, generic dropdown — a pill button showing the current selection, opening a centered
 * modal list of options on tap. Reusable across any future tool that needs this shape, not built
 * one-off for the Metronome's own tempo-note-value picker (its first caller).
 *
 * Deliberately a centered `Modal` + list, not an anchored popover measured off the trigger
 * button's own layout — simpler and more reliable without a real device to iterate the anchor math
 * against, at the cost of not visually "growing out of" the button the way a true popover would.
 */
export function Dropdown<T>({
  value,
  options,
  onChange,
  triggerLabel,
  highlighted,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Shown on the pill instead of the selected option's own label — for a tight spot like a
      screen header, where "Original (Ab)" is too long but "Ab" says enough. */
  triggerLabel?: string;
  /** Accent-filled pill — e.g. the chart viewer's key button while transposed away from the
      original key, so a transposed chart is obvious at a glance. */
  highlighted?: boolean;
}) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
        style={{ backgroundColor: highlighted ? colors.accent : colors.surface }}
      >
        <Text className="text-sm font-bold font-ui-bold" style={{ color: highlighted ? colors['accent-foreground'] : colors.foreground }}>
          {triggerLabel ?? current?.label ?? String(value)}
        </Text>
        <Text className="font-ui" style={{ color: highlighted ? colors['accent-foreground'] : colors.muted }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: `${colors.overlay}99`,
            justifyContent: 'center',
            padding: 32,
          }}
          onPress={() => setOpen(false)}
        >
          {/* A real (no-op) handler, not just stopping propagation via an event object — in RN's
              responder system this is what keeps a tap landing *inside* the panel from also being
              claimed by the backdrop Pressable behind it. */}
          <Pressable
            onPress={() => {}}
            className="rounded-3xl p-2"
            style={{ backgroundColor: colors.background, maxHeight: '70%' }}
          >
            <ScrollView>
              {options.map((option, i) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="rounded-2xl px-4 py-3"
                    style={{ backgroundColor: selected ? colors.accent : 'transparent' }}
                  >
                    <Text
                      className="text-base font-semibold font-ui-semibold"
                      style={{ color: selected ? colors['accent-foreground'] : colors.foreground }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

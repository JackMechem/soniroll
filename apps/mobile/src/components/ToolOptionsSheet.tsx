import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from '@/components/icons';
import { sheetEdge } from '@/components/sheetStyle';
import { useAppTheme } from '@/theme/ThemeProvider';

export type ToolOptionsTab = {
  key: string;
  label: string;
  /** A thunk, not a plain `ReactNode` — called only for whichever tab is actually active, and
      only while the sheet is visible (see this component's own render below). A tool screen
      building this array still re-evaluates on every one of *its own* renders (it's a plain JS
      array literal), but a thunk's body doesn't run until actually invoked, so an inactive tab's
      own expensive work (sorting/filtering a long list, say) never runs at all, and the active
      tab's doesn't run until genuinely needed. Fixes a real, reported bug: a tool with a long list
      behind one of its tabs (Chord Charts' own Library tab, with every imported chart re-sorted
      and re-rendered into JSX on every render) made tapping "Options" itself feel slow — the
      state update that should just reveal the panel also had to finish building that entire list
      first, since a plain `ReactNode` prop is constructed unconditionally. */
  content: () => ReactNode;
};

/**
 * A generic, reusable "everything but the essentials" panel for a tool screen — per a direct
 * request meant to apply to every tool going forward, not just the Metronome: "the mobile app
 * [should] avoid scrolling on main tool pages... the tool should have the most common options
 * built into the main display... everything else will be in a menu that can be opened with a
 * button somewhere and that menu will have tabs for the different sections."
 *
 * A tool screen's own job under this pattern: show only its handful of most-reached-for controls
 * directly (for the Metronome — time signature, tempo, the beat indicator, Start/Stop), sized to
 * fit one screen with no `ScrollView` at all, plus one button that opens this sheet for everything
 * else, grouped into tabs (`ToolOptionsTab[]`, one tab per logical section — "Meter," "Sound,"
 * ...). A tool with only one real options group can pass a single tab; the tab row itself only
 * renders when there's more than one, so that case doesn't show a pointless single-tab row.
 *
 * Deliberately a hand-built `Modal` + `Pressable` backdrop + sliding panel, not a native bottom
 * sheet (`@expo/ui`'s own `BottomSheet`, or React Navigation's `formSheet` presentation) — the same
 * "fully native components tend to look very generic" steer the rest of this app's redesign
 * already followed. Each tab's own content scrolls independently inside the sheet (a `ScrollView`
 * per active tab) — "avoid scrolling" was specifically about the *main* tool page, not about
 * secondary options, which are expected to scroll like any normal settings panel once there's more
 * than a screen's worth.
 */
export function ToolOptionsSheet({
  visible,
  onClose,
  tabs,
  title = 'Options',
}: {
  visible: boolean;
  onClose: () => void;
  tabs: ToolOptionsTab[];
  title?: string;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityLabel="Close options"
        />
        <View
          className="rounded-t-3xl"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '82%',
            ...sheetEdge(colors),
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View className="items-center pb-1 pt-3">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: colors['surface-hover'] }} />
          </View>

          <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
            <Text className="text-lg font-extrabold font-ui-extrabold" style={{ color: colors.foreground }}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surface }}
            >
              <CloseIcon color={colors.muted} size={16} />
            </Pressable>
          </View>

          {tabs.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 0 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
            >
              {tabs.map((tab) => {
                const selected = activeTab?.key === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveKey(tab.key)}
                    className="items-center rounded-full px-4 py-2.5"
                    style={{ backgroundColor: selected ? colors.accent : colors.surface }}
                  >
                    <Text
                      numberOfLines={1}
                      className="text-sm font-bold font-ui-bold"
                      style={{ color: selected ? colors['accent-foreground'] : colors.foreground }}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Gated on `visible` too, not just "there's an active tab" — `Modal` doesn't unmount
                its children while hidden, so without this, a parent re-rendering for an unrelated
                reason while the sheet is closed would still invoke the active tab's thunk. */}
            {visible ? activeTab?.content() : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChordChartIcon, DownloadIcon, FolderPlusIcon } from '@/components/icons';
import { sheetEdge } from '@/components/sheetStyle';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * What the Chord Charts "+" opens: a bottom sheet choosing **Chord chart** or **Playlist**. The
 * sheet itself has no text fields (it's tap-only, so being at the bottom is fine). Choosing a chart
 * hands off to the full-page form (`app/tool/chord-charts-new.tsx`). Choosing a playlist opens a
 * small name dialog pinned near the *top* of the screen, so the keyboard sliding up from the
 * bottom never covers what you're typing into (a bottom-sheet form was reported as annoying for
 * exactly that).
 */
export function ChordChartNewSheet({
  visible,
  onClose,
  onChooseChart,
  onChooseImport,
  onCreatePlaylist,
}: {
  visible: boolean;
  onClose: () => void;
  onChooseChart: () => void;
  /** Adds an "Import charts" row (paste a chart link or playlist). */
  onChooseImport?: () => void;
  onCreatePlaylist: (name: string) => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  function close() {
    setNaming(false);
    setName('');
    onClose();
  }

  function submit() {
    if (!name.trim()) return;
    onCreatePlaylist(name.trim());
    close();
  }

  return (
    <>
      <Modal visible={visible && !naming} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View
          style={{
            ...sheetEdge(colors),
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View className="items-center pt-2.5">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors['surface-hover'] }} />
          </View>
          <Text className="font-ui-bold px-5 pb-2 pt-3 text-lg font-bold" style={{ color: colors.foreground }}>
            Create new
          </Text>
          <ChoiceRow
            icon={<ChordChartIcon color={colors.accent} size={24} />}
            label="Chord chart"
            hint="Build a chart bar by bar"
            onPress={() => {
              close();
              onChooseChart();
            }}
          />
          <ChoiceRow
            icon={<FolderPlusIcon color={colors.accent} size={24} />}
            label="Playlist"
            hint="An empty folder to put charts in"
            onPress={() => setNaming(true)}
          />
          {onChooseImport ? (
            <ChoiceRow
              icon={<DownloadIcon color={colors.accent} size={24} />}
              label="Import charts"
              hint="Paste a chord chart link or a whole playlist"
              onPress={() => {
                close();
                onChooseImport();
              }}
            />
          ) : null}
        </View>
      </Modal>

      <Modal visible={visible && naming} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          style={{ flex: 1, backgroundColor: `${colors.overlay}99`, justifyContent: 'flex-start', paddingTop: insets.top + 72, paddingHorizontal: 20 }}
          onPress={close}
        >
          <Pressable onPress={() => {}} className="gap-3 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
            <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
              New playlist
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Friday gig"
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submit}
              className="font-ui text-base"
              style={{ backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: colors.foreground }}
            />
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={close} className="rounded-xl px-4 py-2.5" style={{ backgroundColor: colors.background }}>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!name.trim()}
                className="rounded-xl px-4 py-2.5"
                style={{ backgroundColor: colors.accent, opacity: name.trim() ? 1 : 0.4 }}
              >
                <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                  Create
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ChoiceRow({ icon, label, hint, onPress }: { icon: React.ReactNode; label: string; hint: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors['surface-hover'] }} className="flex-row items-center gap-4 px-5" style={{ minHeight: 64 }}>
      {icon}
      <View className="flex-1">
        <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
          {label}
        </Text>
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

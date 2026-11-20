import { decodeChartString, looksLikeChartString } from '@jam-practice/core/chartString';
import { parseIrealPlaylist } from '@jam-practice/core/iRealPro';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TrashIcon } from '@/components/icons';
import { withScreenLoader } from '@/components/ScreenLoader';
import { SwitchRow } from '@/components/SwitchRow';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useAppTheme } from '@/theme/ThemeProvider';

/** A soniroll chart link first, quietly falling back to an iReal Pro playlist link — never naming
    iReal Pro anywhere a user can see (same rule as the web app). */
function parsePlaylistInput(text: string) {
  if (looksLikeChartString(text)) return decodeChartString(text);
  try {
    return parseIrealPlaylist(text);
  } catch {
    throw new Error("Couldn't read that — paste a soniroll chord chart link.");
  }
}

/**
 * Importing chord charts, on a page of its own (reached from the Chord Charts tab's +): the paste
 * box at the top, the page padded by the keyboard's real height so neither the box nor the Import
 * button ends up behind it — the bottom sheet this used to be put the field right where the
 * keyboard opens.
 */
function ImportChartsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { importSongs, clearAll, totalSongs } = useChordChartsLibrary(null);
  const [linkText, setLinkText] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function importText(text: string) {
    let playlist;
    try {
      playlist = parsePlaylistInput(text);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't read that." });
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const { added, skipped, updated } = await importSongs(playlist.songs, playlist.name, { replaceExisting });
      const plural = (n: number) => `${n} chart${n === 1 ? '' : 's'}`;
      setStatus({
        kind: 'ok',
        message:
          `Imported ${plural(added)} into "${playlist.name}".` +
          (updated ? ` Updated ${plural(updated)} you already had.` : '') +
          (skipped > 0 ? ` (${skipped} already in your library, left as they were.)` : ''),
      });
      setLinkText('');
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't import that playlist." });
    } finally {
      setImporting(false);
    }
  }

  const canImport = !!linkText.trim() && !importing;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Import charts' }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: (keyboard || insets.bottom + 56) + 24 }}
      >
        <TextInput
          value={linkText}
          onChangeText={setLinkText}
          placeholder="Paste a chord chart link or playlist link"
          placeholderTextColor={colors.muted}
          autoFocus
          multiline
          className="font-ui text-base"
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 14,
            color: colors.foreground,
            minHeight: 110,
            maxHeight: 180,
            textAlignVertical: 'top',
          }}
        />
        <SwitchRow
          label="Update charts you already have"
          checked={replaceExisting}
          onChange={setReplaceExisting}
          hint="When a chart in the link is already in your library (same title, composer and key), replace yours with the one from the link — it stays in the same playlist. Turn this off to only add charts you don't have yet."
        />
        <Pressable
          onPress={() => canImport && void importText(linkText)}
          disabled={!canImport}
          className="items-center rounded-xl py-3"
          style={{ backgroundColor: colors.accent, opacity: canImport ? 1 : 0.4 }}
        >
          <Text className="font-ui-bold text-base font-bold" style={{ color: colors['accent-foreground'] }}>
            {importing ? 'Importing…' : 'Import'}
          </Text>
        </Pressable>
        {status ? (
          <View className="gap-2">
            <Text className="font-ui text-sm" style={{ color: status.kind === 'error' ? colors.danger : colors.foreground }}>
              {status.message}
            </Text>
            {status.kind === 'ok' ? (
              <Pressable onPress={() => router.back()} className="items-center rounded-xl py-2.5" style={{ backgroundColor: colors.surface }}>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  Back to chord charts
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => setConfirmClear(true)}
          disabled={totalSongs === 0}
          className="mt-6 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5"
          style={{ opacity: totalSongs === 0 ? 0.4 : 1 }}
        >
          <TrashIcon color={colors.danger} size={16} />
          <Text className="font-ui-semibold text-sm" style={{ color: colors.danger }}>
            Delete all chord charts
          </Text>
        </Pressable>
      </ScrollView>

      <ConfirmDialog
        visible={confirmClear}
        title="Delete all chord charts?"
        message="This removes every imported or created chart and every playlist. You can re-import a playlist any time."
        confirmLabel="Delete all"
        onConfirm={() => {
          void clearAll();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

export default withScreenLoader(ImportChartsScreen);

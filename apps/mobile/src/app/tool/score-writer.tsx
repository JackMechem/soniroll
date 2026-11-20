import { cleanScore, type Transcription } from '@jam-practice/core/bassTranscription';
import { useConvexAuth } from '@convex-dev/auth/react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DotsVerticalIcon, NAV_LINK_ICONS, PlusIcon, TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SAVE_LABEL, useAutosave } from '@/components/notation/autosave';
import ScoreEditor from '@/components/notation/ScoreEditor';
import { withScreenLoader } from '@/components/ScreenLoader';
import { pickTextFile } from '@/components/scoreWriter/pickTextFile';
import { useBackWithin } from '@/components/scoreWriter/useBackWithin';
import { formatShortDate } from '@/components/tool/ear';
import { ToolHelpButton } from '@/components/tool/ToolIntro';
import { ScoreIcon as EmptyScoreIcon } from '@/components/tool/toolIcons';
import { Button, EmptyState, IconButton, ListRow } from '@/components/ui';
import { newScore, useScore, useScoreActions, useScoreList, type ScoreMeta } from '@/lib/useScores';
import { useAppTheme } from '@/theme/ThemeProvider';

const FILE_FORMAT = 'soniroll.score';
const ScoreIcon = NAV_LINK_ICONS['/score-writer'];

/**
 * Score Writer on the phone — the website's tool (`apps/web/components/scorewriter/ScoreWriter.tsx`):
 * your scores (in your account, the same ones as on the website and in Shed Notes; or on this
 * device when signed out), each opened in the notation editor (`components/notation/ScoreEditor.tsx`)
 * with its clef, key, time and tempo, saved as you write. Import takes a score exported from Score
 * Writer or a bass transcription file. Back from a score returns to the list. The list's header has
 * the tool's ? and New score (the app's round create button); Import sits under the list.
 */
function ScoreWriterScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const [openId, setOpenId] = useState<string | null>(params.id || null);
  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Score Writer' }} />
      {openId ? <ScorePage key={openId} id={openId} onBack={() => setOpenId(null)} /> : <ScoreList onOpen={setOpenId} />}
    </View>
  );
}

function ScoreList({ onOpen }: { onOpen: (id: string) => void }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const scores = useScoreList();
  const { create, remove } = useScoreActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [menu, setMenu] = useState<ScoreMeta | null>(null);
  const [deleting, setDeleting] = useState<ScoreMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function make(data?: Transcription) {
    setError(null);
    try {
      onOpen(await create(data ?? newScore()));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile() {
    setError(null);
    let file: { name: string; text: string } | null;
    try {
      file = await pickTextFile(['application/json', 'text/plain', '*/*']);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (!file) return;
    try {
      const raw = JSON.parse(file.text) as { format?: unknown; score?: unknown; transcription?: unknown };
      const data = raw.format === FILE_FORMAT ? raw.score : (raw.transcription ?? raw);
      await make(cleanScore(data));
    } catch {
      setError("That file isn't a score exported from Score Writer or Rhythm Section's bass players.");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, gap: 12, paddingBottom: insets.bottom + 32 }}>
      {/* The list's own header (an open score's save state and ⋮ leave with it): the tool's ? and
          New score. */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <View className="flex-row items-center gap-2">
              <ToolHelpButton href="/score-writer" />
              <IconButton primary Icon={PlusIcon} label="New score" onPress={() => void make()} />
            </View>
          ),
        }}
      />
      {error ? (
        <Text className="font-ui text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      {!isLoading && !isAuthenticated ? (
        <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
          Signed out, your scores are kept on this phone. Sign in to keep them in your account, on the website too.
        </Text>
      ) : null}

      {scores === undefined ? (
        <View className="items-center py-16">
          <LoadingSpinner />
        </View>
      ) : scores.length === 0 ? (
        <EmptyState
          Icon={EmptyScoreIcon}
          title="No scores yet"
          body="Start one, then tap a length and a note name to add notes."
          action={{ label: 'New score', Icon: PlusIcon, onPress: () => void make() }}
          secondary={{ label: 'Import a file', onPress: () => void importFile() }}
        />
      ) : (
        <View className="gap-2">
          {scores.map((s) => (
            <ListRow
              key={s.id}
              icon={ScoreIcon ? <ScoreIcon color={colors.muted} size={20} /> : null}
              title={s.title}
              detail={`${s.measureCount} ${s.measureCount === 1 ? 'bar' : 'bars'} · ${formatShortDate(s.updatedAt)}`}
              onPress={() => onOpen(s.id)}
              right={
                <Pressable onPress={() => setMenu(s)} hitSlop={8} accessibilityLabel={`Options for ${s.title}`} className="h-9 w-9 items-center justify-center rounded-full">
                  <DotsVerticalIcon color={colors.muted} size={20} />
                </Pressable>
              }
            />
          ))}
          <Button label="Import a file" kind="secondary" onPress={() => void importFile()} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        </View>
      )}

      <ActionSheet
        visible={!!menu}
        title={menu?.title}
        actions={
          menu
            ? [
                { key: 'open', icon: <PlusIcon color={colors.foreground} size={20} />, label: 'Open', onPress: () => onOpen(menu.id) },
                { key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Delete', danger: true, onPress: () => setDeleting(menu) },
              ]
            : []
        }
        onClose={() => setMenu(null)}
      />
      <ConfirmDialog
        visible={!!deleting}
        title={`Delete "${deleting?.title ?? ''}"?`}
        message="The score goes for good, and notes that show it will say it's gone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) void remove(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </ScrollView>
  );
}

function ScorePage({ id, onBack }: { id: string; onBack: () => void }) {
  const { colors } = useAppTheme();
  const score = useScore(id);
  useBackWithin(!score, onBack);
  if (score === undefined) {
    return (
      <View className="items-center py-24">
        <LoadingSpinner />
      </View>
    );
  }
  if (score === null) {
    return (
      <View className="gap-4 p-4">
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          This score isn’t there any more.
        </Text>
        <Button label="All scores" kind="secondary" onPress={onBack} />
      </View>
    );
  }
  return <OpenScore id={id} loaded={score} onBack={onBack} />;
}

function OpenScore({ id, loaded, onBack }: { id: string; loaded: Transcription; onBack: () => void }) {
  const { colors } = useAppTheme();
  // The editor keeps its own copy once open: it starts from the first version loaded, and later
  // updates (our own saves coming back) don't reset it.
  const [initial] = useState(loaded);
  const { save, remove } = useScoreActions();
  const [menu, setMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { change, flush, saveState } = useAutosave((t: Transcription) => save(id, t));
  useBackWithin(true, () => {
    flush();
    onBack();
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View className="flex-row items-center gap-1">
              <Text className="font-ui text-xs" style={{ color: colors.muted }} accessibilityLiveRegion="polite">
                {SAVE_LABEL[saveState]}
              </Text>
              <Pressable onPress={() => setMenu(true)} hitSlop={8} accessibilityLabel="Score options" className="h-9 w-9 items-center justify-center rounded-full">
                <DotsVerticalIcon color={colors.foreground} size={20} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScoreEditor
        initial={initial}
        onChange={change}
        staffControls
        header={(t, setMeta) => (
          <TextInput
            value={t.title}
            onChangeText={(title) => setMeta({ title })}
            accessibilityLabel="Title"
            placeholder="Untitled score"
            placeholderTextColor={colors.muted}
            className="font-ui-bold text-2xl font-bold"
            style={{ color: colors.foreground, paddingVertical: 2 }}
          />
        )}
      />
      <ActionSheet
        visible={menu}
        title="This score"
        actions={[{ key: 'delete', icon: <TrashIcon color={colors.danger} size={20} />, label: 'Delete score', danger: true, onPress: () => setDeleting(true) }]}
        onClose={() => setMenu(false)}
      />
      <ConfirmDialog
        visible={deleting}
        title="Delete this score?"
        message="It goes for good, and notes that show it will say it's gone."
        confirmLabel="Delete"
        onConfirm={() => {
          setDeleting(false);
          void remove(id);
          onBack();
        }}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

export default withScreenLoader(ScoreWriterScreen);

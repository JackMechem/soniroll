import type { Transcription } from '@jam-practice/core/bassTranscription';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SAVE_LABEL, useAutosave } from '@/components/notation/autosave';
import ScoreEditor from '@/components/notation/ScoreEditor';
import { Button } from '@/components/ui';
import { newScore, useScore, useScoreActions } from '@/lib/useScores';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * The notation editor over the whole screen, on a Score Writer score — how notation is written
 * from a note (the website's `ScoreDialog`). `scoreId` null starts a new score, made only once
 * something's written; `onDone` gets its id when it's closed, so the note can show it.
 */
export function ScoreDialog({ scoreId, onDone, onClose }: { scoreId: string | null; onDone: (scoreId: string) => void; onClose: () => void }) {
  const { colors } = useAppTheme();
  const loaded = useScore(scoreId);
  // Back closes it the way Done does (saving, and putting a new score in the note).
  const finishRef = useRef<(() => void) | null>(null);
  return (
    <Modal visible animationType="slide" onRequestClose={() => (finishRef.current ? finishRef.current() : onClose())} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
          {scoreId && loaded === undefined ? (
            <View className="flex-1 items-center justify-center">
              <LoadingSpinner />
            </View>
          ) : scoreId && loaded === null ? (
            <View className="flex-1 items-center justify-center gap-3 p-6">
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                This score was deleted.
              </Text>
              <Button label="Close" kind="secondary" onPress={onClose} />
            </View>
          ) : (
            <Editing scoreId={scoreId} start={loaded ?? null} onDone={onDone} onClose={onClose} finishRef={finishRef} />
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Editing({
  scoreId,
  start,
  onDone,
  onClose,
  finishRef,
}: {
  scoreId: string | null;
  start: Transcription | null;
  onDone: (id: string) => void;
  onClose: () => void;
  finishRef: RefObject<(() => void) | null>;
}) {
  const { colors } = useAppTheme();
  const [initial] = useState(() => start ?? newScore('Notation'));
  const { create, save } = useScoreActions();
  const idRef = useRef<string | null>(scoreId);
  const creating = useRef<Promise<string> | null>(null);
  const { change, flush, saveState } = useAutosave(async (t: Transcription) => {
    if (idRef.current) return save(idRef.current, t);
    // A new score: made on the first save (later saves wait for it).
    creating.current ??= create(t).then((made) => {
      idRef.current = made;
      return made;
    });
    const made = await creating.current;
    if (made) await save(made, t);
  });

  async function finish() {
    flush();
    const made = idRef.current ?? (creating.current ? await creating.current : null);
    if (made) onDone(made);
    onClose();
  }
  useEffect(() => {
    finishRef.current = () => void finish();
  });

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-2">
        <Text className="font-ui-bold flex-1 text-lg font-bold" style={{ color: colors.foreground }}>
          Music notation
        </Text>
        <Text className="font-ui text-xs" style={{ color: colors.muted }} accessibilityLiveRegion="polite">
          {SAVE_LABEL[saveState]}
        </Text>
        <Pressable
          onPress={() => void finish()}
          accessibilityRole="button"
          android_ripple={{ color: colors['accent-hover'] }}
          className="h-9 justify-center overflow-hidden rounded-full px-4"
          style={{ backgroundColor: colors.accent }}
        >
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors['accent-foreground'] }}>
            Done
          </Text>
        </Pressable>
      </View>
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
            className="font-ui-bold text-xl font-bold"
            style={{ color: colors.foreground, paddingVertical: 2 }}
          />
        )}
      />
    </View>
  );
}

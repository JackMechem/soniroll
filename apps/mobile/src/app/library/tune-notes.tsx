import type { Tune } from '@jam-practice/core/types';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

const SAVE_MS = 600;

/**
 * Writing a tune's notes, on a page of its own: the whole space above the keyboard is the text
 * field, cursor at the top, so the keyboard never covers what you're typing (it did when the notes
 * box sat at the bottom of the tune's hub page). Saves shortly after you stop typing and again on
 * leaving; Done (or back) returns to the hub.
 */
function TuneNotesScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { lists, ready } = useTuneLists();

  let found: { list: TuneListId; tune: Tune } | null = null;
  for (const list of ['tunes', 'learn'] as TuneListId[]) {
    const tune = lists[list].tunes.find((t) => t.id === id);
    if (tune) found = { list, tune };
  }

  const [text, setText] = useState<string | null>(null);
  if (found && text === null) setText(found.tune.notes);

  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(notes: string) => void>(() => {});
  useEffect(() => {
    const target = found;
    saveRef.current = (notes) => {
      if (!target) return;
      lists[target.list].setTunes((prev) => prev.map((t) => (t.id === target.tune.id ? { ...t, notes } : t)));
    };
  });
  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      saveRef.current(pending.current);
      pending.current = null;
    }
  }
  useEffect(() => () => flush(), []);

  function onChange(value: string) {
    setText(value);
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_MS);
  }

  if (!ready) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'Notes',
          headerTitle: () => (
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} className="font-ui-bold text-lg font-bold tracking-tight" style={{ color: colors.accent }}>
                Notes
              </Text>
              {found ? (
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {found.tune.name}
                </Text>
              ) : null}
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => {
                flush();
                router.back();
              }}
              className="min-h-10 justify-center rounded-lg px-4 py-2"
              style={{ backgroundColor: colors.accent }}
            >
              <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                Done
              </Text>
            </Pressable>
          ),
        }}
      />
      {found ? (
        <View style={{ flex: 1, padding: 12, paddingBottom: (keyboard || insets.bottom + 56) + 12 }}>
          <TextInput
            value={text ?? ''}
            onChangeText={onChange}
            onBlur={flush}
            autoFocus
            multiline
            placeholder="Form, tricky changes, voicings, recordings to check out…"
            placeholderTextColor={colors.muted}
            className="font-ui text-base"
            style={{
              flex: 1,
              backgroundColor: colors.surface,
              color: colors.foreground,
              borderRadius: 16,
              padding: 14,
              textAlignVertical: 'top',
              lineHeight: 22,
            }}
          />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="font-ui text-center text-sm" style={{ color: colors.muted }}>
            That tune isn&apos;t in your library.
          </Text>
        </View>
      )}
    </View>
  );
}

export default withScreenLoader(TuneNotesScreen);

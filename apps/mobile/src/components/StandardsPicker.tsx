import { nameId, searchStandards, standardToTune, STANDARDS, type Standard } from '@jam-practice/core/standards';
import type { Tune } from '@jam-practice/core/types';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { FullScreenModal } from '@/components/FullScreenModal';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { useSyncedTunes } from '@/lib/useSyncedTunes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';
import { prettyKeyName } from '@/lib/keyNames';
import { withAccidentals } from '@/components/Accidentals';

const MAX_ROWS = 60;

/**
 * The native sibling of `apps/web/components/StandardsPicker.tsx` — a full-screen modal (web's own
 * is a centered overlay; there's no room for that shape on a phone) searching the shared
 * ~630-song `@jam-practice/core/standards` library, with the same "type something that doesn't
 * match → create a custom tune with that name" fallback. Same optional `tunes`/`setTunes` override
 * shape as web: omitted, it falls back to Jam Practice's own `useSyncedTunes()`; passed explicitly
 * by `TuneListManager.tsx` so the account page's Tunes/Tunes to Learn tabs can add into whichever
 * list they're managing instead.
 */
export function StandardsPicker({
  onClose,
  onCreateCustom,
  tunes: tunesOverride,
  setTunes: setTunesOverride,
}: {
  onClose: () => void;
  onCreateCustom: (name: string) => void;
  tunes?: Tune[];
  setTunes?: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
}) {
  const { colors } = useAppTheme();
  const [ownTunes, setOwnTunes] = useSyncedTunes();
  const tunes = tunesOverride ?? ownTunes;
  const setTunes = setTunesOverride ?? setOwnTunes;
  const [query, setQuery] = useState('');

  const added = useMemo(() => new Set(tunes.map((t) => nameId(t.name))), [tunes]);
  const results = useMemo(() => searchStandards(query), [query]);
  const shown = results.slice(0, MAX_ROWS);
  const typed = query.trim();
  const canCreate = typed !== '' && !STANDARDS.some((s) => nameId(s.name) === nameId(typed));

  function add(standard: Standard) {
    setTunes((prev) => {
      if (prev.some((t) => nameId(t.name) === nameId(standard.name))) return prev;
      return [...prev, standardToTune(standard)];
    });
  }

  return (
    <FullScreenModal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
          <View
            className="flex-row items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: colors['surface-hover'] }}
          >
            <SearchIcon color={colors.muted} size={18} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${STANDARDS.length} jazz standards…`}
              placeholderTextColor={colors.muted}
              className="min-w-0 flex-1 text-base font-ui"
              style={{ color: colors.foreground }}
            />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surface }}
            >
              <CloseIcon color={colors.foreground} size={16} />
            </Pressable>
          </View>

          <FlatList
            data={shown}
            keyExtractor={(s) => s.name}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 8, paddingBottom: 24 }}
            ListEmptyComponent={
              canCreate ? null : (
                <Text className="px-4 py-6 text-center text-sm font-ui" style={{ color: colors.muted }}>
                  No standards match &ldquo;{typed}&rdquo;
                </Text>
              )
            }
            ListFooterComponent={
              canCreate ? (
                <Pressable
                  onPress={() => onCreateCustom(typed)}
                  className="flex-row items-center gap-3 rounded-xl px-4 py-3"
                >
                  <View className="h-7 w-7 items-center justify-center rounded" style={{ backgroundColor: colors.accent }}>
                    <PlusIcon color={colors['accent-foreground']} size={16} />
                  </View>
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-ui" style={{ color: colors.foreground }}>
                    Create custom tune &ldquo;{typed}&rdquo;
                  </Text>
                </Pressable>
              ) : results.length > shown.length ? (
                <Text className="px-4 py-3 text-center text-sm font-ui" style={{ color: colors.muted }}>
                  {results.length - shown.length} more — keep typing to narrow it down
                </Text>
              ) : null
            }
            renderItem={({ item: standard }) => {
              const isAdded = added.has(nameId(standard.name));
              return (
                <Pressable
                  onPress={() => add(standard)}
                  className="flex-row items-center gap-3 rounded-xl px-4 py-3"
                >
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-ui-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                      {standard.name}
                    </Text>
                    <Text numberOfLines={1} className="text-xs font-ui" style={{ color: colors.muted }}>
                      {standard.composer} · {withAccidentals(prettyKeyName(standard.key))} · {standard.bpm} BPM
                      {standard.timeSignature !== '4/4' ? ` · ${standard.timeSignature}` : ''}
                    </Text>
                  </View>
                  {isAdded ? (
                    <View className="flex-row items-center gap-1.5">
                      <CheckIcon color={colors.accent} size={16} />
                      <Text className="text-sm font-ui" style={{ color: colors.accent }}>
                        Added
                      </Text>
                    </View>
                  ) : (
                    <View className="h-7 w-7 items-center justify-center rounded" style={{ backgroundColor: colors['surface-hover'] }}>
                      <PlusIcon color={colors.foreground} size={16} />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />

          <View className="border-t px-4 py-3" style={{ borderColor: colors['surface-hover'] }}>
            <Text className="text-xs font-ui" style={{ color: colors.muted }}>
              {tunes.length} in your list · Tap to add
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </FullScreenModal>
  );
}

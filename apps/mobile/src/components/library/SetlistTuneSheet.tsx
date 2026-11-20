import { KEY_NAMES } from '@jam-practice/core/iRealPro';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetEdge } from '@/components/sheetStyle';
import type { SetlistOverride } from '@/lib/useSetlists';
import { useAppTheme } from '@/theme/ThemeProvider';

const MIN_BPM = 30;
const MAX_BPM = 400;

/**
 * Key and tempo for one tune *in one setlist* — a bottom sheet with the 12 keys (plus "Default",
 * the chart's/tune's own key) and a tempo stepper (plus "Default"). Nothing typed, so no keyboard
 * covering the sheet. Saving never changes the tune itself, only the setlist's `overrides`.
 */
export function SetlistTuneSheet({
  visible,
  tuneName,
  minor,
  defaultKey,
  defaultTempo,
  value,
  onSave,
  onClose,
}: {
  visible: boolean;
  tuneName: string;
  minor: boolean;
  /** Shown on the "Default" key button, e.g. "Em". */
  defaultKey: string | null;
  defaultTempo: number | null;
  value: SetlistOverride | undefined;
  onSave: (next: SetlistOverride | null) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [key, setKey] = useState<string | undefined>(value?.key);
  const [tempo, setTempo] = useState<number | undefined>(value?.tempo);
  const [seenFor, setSeenFor] = useState<string | null>(null);

  // Reset to the tune's current values each time the sheet opens for a tune.
  const openKey = visible ? tuneName : null;
  if (openKey !== seenFor) {
    setSeenFor(openKey);
    setKey(value?.key);
    setTempo(value?.tempo);
  }

  const shownTempo = tempo ?? defaultTempo ?? 120;
  const bump = (d: number) => setTempo(Math.max(MIN_BPM, Math.min(MAX_BPM, shownTempo + d)));

  function save() {
    const next: SetlistOverride = {};
    if (key) next.key = key;
    if (tempo != null && tempo !== defaultTempo) next.tempo = tempo;
    onSave(Object.keys(next).length ? next : null);
    onClose();
  }

  const pill = (selected: boolean) => ({ backgroundColor: selected ? colors.accent : colors.background });
  const pillText = (selected: boolean) => ({ color: selected ? colors['accent-foreground'] : colors.foreground });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={{ ...sheetEdge(colors), backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 12, maxHeight: height * 0.85 }}>
        <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
          <View className="flex-1">
            <Text numberOfLines={1} className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
              {tuneName}
            </Text>
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              Key and tempo in this setlist only — the tune itself doesn&apos;t change.
            </Text>
          </View>
          <Pressable onPress={save} className="min-h-10 justify-center rounded-lg px-4 py-2" style={{ backgroundColor: colors.accent }}>
            <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
              Done
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 18 }}>
          <View className="gap-2">
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
              Key
            </Text>
            <Pressable onPress={() => setKey(undefined)} className="items-center rounded-xl py-2.5" style={pill(!key)}>
              <Text className="font-ui-semibold text-sm font-semibold" style={pillText(!key)}>
                Default{defaultKey ? ` (${defaultKey})` : ''}
              </Text>
            </Pressable>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {KEY_NAMES.map((k) => (
                <Pressable key={k} onPress={() => setKey(k)} className="items-center rounded-xl py-2.5" style={{ ...pill(key === k), width: '22.5%' }}>
                  <Text className="font-ui-bold text-base font-bold" style={pillText(key === k)}>
                    {k}
                    {minor ? 'm' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
              Tempo
            </Text>
            <View className="flex-row items-center gap-2">
              {[-5, -1].map((d) => (
                <Pressable key={d} onPress={() => bump(d)} className="h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: colors.background }}>
                  <Text className="font-ui-bold text-base font-bold" style={{ color: colors.foreground }}>
                    {d}
                  </Text>
                </Pressable>
              ))}
              <View className="flex-1 items-center">
                <Text className="font-ui-extrabold text-3xl font-extrabold tabular-nums" style={{ color: tempo != null ? colors.accent : colors.foreground }}>
                  {shownTempo}
                </Text>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  BPM
                </Text>
              </View>
              {[1, 5].map((d) => (
                <Pressable key={d} onPress={() => bump(d)} className="h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: colors.background }}>
                  <Text className="font-ui-bold text-base font-bold" style={{ color: colors.foreground }}>
                    +{d}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setTempo(undefined)} className="items-center rounded-xl py-2.5" style={pill(tempo == null)}>
              <Text className="font-ui-semibold text-sm font-semibold" style={pillText(tempo == null)}>
                Default{defaultTempo ? ` (${defaultTempo} BPM)` : ''}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { NoteDocIcon } from '@/components/shedNotes/icons';
import { Button } from '@/components/ui';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

const POINTS = ['Markdown notes in folders', 'Link notes with [[double brackets]], see what links back', 'Music notation from Score Writer, pictures and files', 'Attach notes to Shed Log routines and your tunes', 'The same notes on the website'];

/** Shed Notes signed out (the website's `GatedShedNotes`): notes are kept in your account, so this
    says what they are, and Sign in opens the Account screen. */
export function ShedNotesGate() {
  const { colors } = useAppTheme();
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 48, gap: 20 }} style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center gap-2">
        <NoteDocIcon color={colors.muted} size={16} />
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
          Shed Notes
        </Text>
      </View>
      <Text className="font-ui-extrabold text-3xl font-extrabold leading-tight" style={{ color: colors.foreground }}>
        Notes for your practice, linked together.
      </Text>
      <View className="gap-2.5 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
        {POINTS.map((p) => (
          <View key={p} className="flex-row items-center gap-2.5">
            <View className="h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
              <CheckIcon color={colors.accent} size={14} />
            </View>
            <Text className="font-ui flex-1 text-[15px]" style={{ color: colors.foreground }}>
              {p}
            </Text>
          </View>
        ))}
      </View>
      <View className="gap-3">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          Shed Notes are free with an account.
        </Text>
        <Button label="Sign in" pill onPress={() => router.push('/profile')} />
      </View>
    </ScrollView>
  );
}

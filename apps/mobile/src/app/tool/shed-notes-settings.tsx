import { useConvexAuth } from '@convex-dev/auth/react';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InfoButton } from '@/components/InfoButton';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from '@/components/icons';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { RuleIcon as MinusIcon } from '@/components/shedNotes/icons';
import { MONO } from '@/components/shedNotes/NoteMarkdown';
import { ShedNotesGate } from '@/components/shedNotes/ShedNotesGate';
import { SwitchRow } from '@/components/SwitchRow';
import { Card } from '@/components/ui';
import { useNotesConfig } from '@/lib/useShedNotes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * Shed Notes settings on the phone. They're one JSON file in your account (the website's settings
 * file, `packages/core/shedNotesConfig.ts`), so they're the same everywhere: the settings that
 * matter on a phone (text size, spellcheck) as controls, and the whole file below to edit by hand
 * (folded away under "Settings file (advanced)" until opened, or open while it doesn't parse).
 * Vim keys, keyboard shortcuts, live preview and line numbers only do something on the website.
 */
function SettingsScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const cfg = useNotesConfig();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <ShedNotesGate />;
  if (!cfg.ready) return <ScreenSpinner />;
  return <Settings cfg={cfg} />;
}

export default withScreenLoader(SettingsScreen);

function Settings({ cfg }: { cfg: ReturnType<typeof useNotesConfig> }) {
  const { colors, derived } = useAppTheme();
  const insets = useSafeAreaInsets();
  const size = cfg.config.fontSize;
  const setSize = (n: number) => cfg.setValue('fontSize', Math.max(12, Math.min(28, n)));
  const [fileOpen, setFileOpen] = useState(false);
  const showFile = fileOpen || cfg.broken;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 16, paddingBottom: insets.bottom + 48 }}>
      <Stack.Screen options={{ title: 'Shed Notes settings' }} />
      {cfg.broken ? (
        <Text className="font-ui text-sm leading-5" style={{ color: colors.danger }}>
          The settings file isn&apos;t valid JSON right now, so these can&apos;t change it. Fix it below (the last good settings stay in use meanwhile).
        </Text>
      ) : null}
      <Card>
        <View className="flex-row items-center gap-2">
          <Text className="font-ui-semibold flex-1 text-sm font-semibold" style={{ color: colors.foreground }}>
            Text size
          </Text>
          <StepButton label="Smaller" Icon={MinusIcon} disabled={cfg.broken || size <= 12} onPress={() => setSize(size - 1)} />
          <Text className="font-ui-bold w-10 text-center text-base font-bold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
            {size}
          </Text>
          <StepButton label="Bigger" Icon={PlusIcon} disabled={cfg.broken || size >= 28} onPress={() => setSize(size + 1)} />
        </View>
        <SwitchRow label="Spellcheck" checked={cfg.config.spellcheck} disabled={cfg.broken} onChange={(on) => cfg.setValue('spellcheck', on)} hint="Underlines misspelled words and suggests fixes while you write (the keyboard's own spellcheck)." />
        <Text className="font-ui text-xs leading-5" style={{ color: colors.muted }}>
          Vim keys, keyboard shortcuts, live preview, line numbers and word suggestions are for the website — they&apos;re in the same file.
        </Text>
      </Card>

      <View className="gap-2">
        <View className="flex-row items-center gap-1.5">
          <Pressable onPress={() => setFileOpen((o) => !o)} disabled={cfg.broken} accessibilityRole="button" accessibilityState={{ expanded: showFile }} hitSlop={8} className="flex-row items-center gap-1.5">
            {showFile ? <ChevronDownIcon color={colors.muted} size={20} /> : <ChevronRightIcon color={colors.muted} size={20} />}
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
              Settings file (advanced)
            </Text>
          </Pressable>
          <InfoButton title="Settings file" text="Every Shed Notes setting, as one JSON file in your account. Saved as you type; while it doesn't parse, the last version that did stays in use. The website's Settings → JSON tab has a reference of every setting and command." size={16} />
        </View>
        {showFile ? (
          <TextInput
            value={cfg.text}
            onChangeText={cfg.setText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
            accessibilityLabel="Settings file"
            className="font-ui"
            style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color: colors.foreground, backgroundColor: derived.fill, borderRadius: 12, padding: 12, minHeight: 320 }}
          />
        ) : null}
        {showFile && cfg.errors.length ? (
          <View className="gap-1">
            {cfg.errors.map((e, i) => (
              <Text key={i} className="font-ui text-xs" style={{ color: cfg.broken ? colors.danger : colors.muted }}>
                {e}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function StepButton({ label, Icon, disabled, onPress }: { label: string; Icon: typeof PlusIcon; disabled: boolean; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-10 w-10 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: derived.fill, opacity: disabled ? 0.4 : 1 }}
    >
      <Icon color={colors.foreground} size={20} />
    </Pressable>
  );
}

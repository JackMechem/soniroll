import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordQualityText } from '@/components/ChordQualityText';
import { BackspaceIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '9'];

/**
 * Guess the Chord's answer keyboard, fixed to the bottom of the screen — the mobile take on web's
 * text field + `ChordSymbolKeypad`: every key of a chord symbol (roots, accidentals, extensions,
 * the iReal-style quality symbols shown as their formatted glyphs, sus/add/alt and `/` for a slash
 * bass), so the phone's own keyboard never pops up over the round. Keys append the plain
 * iReal-style text the grader (`parseChordInput`) reads; backspace (hold to clear), "I don't know"
 * and Submit sit on the bottom row.
 */
export function ChordAnswerKeyboard({
  onInsert,
  onBackspace,
  onClear,
  onGiveUp,
  onSubmit,
}: {
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onGiveUp: () => void;
  onSubmit: () => void;
}) {
  const { colors } = useAppTheme();
  const text = (t: string, size = 18) => (
    <Text className="font-ui-semibold font-semibold" style={{ fontSize: size, color: colors.foreground }}>
      {t}
    </Text>
  );
  const quality = (q: string) => <ChordQualityText quality={q} style={{ fontSize: 20, color: colors.foreground }} />;

  return (
    <View style={{ gap: 6, padding: 6, backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
      <View className="flex-row" style={{ gap: 5 }}>
        {ROOTS.map((r) => (
          <Key key={r} onPress={() => onInsert(r)}>
            {text(r, 19)}
          </Key>
        ))}
        <Key onPress={() => onInsert('b')} label="Flat">
          {quality('b')}
        </Key>
        <Key onPress={() => onInsert('#')} label="Sharp">
          {quality('#')}
        </Key>
      </View>
      <View className="flex-row" style={{ gap: 5 }}>
        {DIGITS.map((d) => (
          <Key key={d} onPress={() => onInsert(d)}>
            {text(d)}
          </Key>
        ))}
        <Key onPress={() => onInsert('/')} label="Slash (bass note)">
          {text('/', 19)}
        </Key>
      </View>
      <View className="flex-row" style={{ gap: 5 }}>
        <Key onPress={() => onInsert('-')} label="Minor">
          {quality('-')}
        </Key>
        <Key onPress={() => onInsert('^')} label="Major 7">
          {quality('^')}
        </Key>
        <Key onPress={() => onInsert('o')} label="Diminished">
          {quality('o')}
        </Key>
        <Key onPress={() => onInsert('h')} label="Half-diminished">
          {quality('h')}
        </Key>
        <Key onPress={() => onInsert('+')} label="Augmented">
          {quality('+')}
        </Key>
        <Key onPress={() => onInsert('sus')}>{text('sus', 15)}</Key>
        <Key onPress={() => onInsert('add')}>{text('add', 15)}</Key>
        <Key onPress={() => onInsert('alt')}>{text('alt', 15)}</Key>
      </View>
      <View className="flex-row" style={{ gap: 5 }}>
        <Key flex={2.2} onPress={onGiveUp}>
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            I don&apos;t know
          </Text>
        </Key>
        <Key flex={1.2} onPress={onBackspace} onLongPress={onClear} label="Backspace (hold to clear)">
          <BackspaceIcon color={colors.foreground} size={20} />
        </Key>
        <Pressable
          onPress={onSubmit}
          accessibilityLabel="Submit answer"
          className="items-center justify-center rounded-lg"
          style={{ flex: 2.6, height: 46, backgroundColor: colors.accent }}
        >
          <Text className="font-ui-bold text-base font-bold" style={{ color: colors['accent-foreground'] }}>
            Submit
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Key({
  children,
  onPress,
  onLongPress,
  flex = 1,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  flex?: number;
  label?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="items-center justify-center rounded-lg"
      style={{ flex, height: 46, backgroundColor: colors.background }}
    >
      {children}
    </Pressable>
  );
}

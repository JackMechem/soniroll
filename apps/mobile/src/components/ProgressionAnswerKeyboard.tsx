import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordQualityText } from '@/components/ChordQualityText';
import { BackspaceIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

const UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '9'];

/**
 * Guess the Progression's answer keyboard, fixed to the bottom of the screen — laid out exactly
 * like the chart editor's (`ChartEditorKeyboard`): same panel, key sizes and rows (roots + ♭ ♯ −,
 * digits + ° ø Δ, sus/add/alt/+/space/backspace), with the bar-tools row swapped for "I don't
 * know" and a big Submit in place of Next. In numeral mode the roots row becomes two rows —
 * I–VII (major) with ♭ and i–vii (minor) with ♯ — and − moves down beside space. **space** goes
 * to the next chord. `onInsert`'s `newChord` marks keys that start a chord (a numeral, a root, a
 * numeral's ♭/♯) so the caller adds the separating space itself.
 */
export function ProgressionAnswerKeyboard({
  mode,
  onInsert,
  onBackspace,
  onClear,
  onGiveUp,
  onSubmit,
}: {
  mode: 'numerals' | 'chords';
  onInsert: (text: string, newChord: boolean) => void;
  onBackspace: () => void;
  onClear: () => void;
  onGiveUp: () => void;
  onSubmit: () => void;
}) {
  const { colors } = useAppTheme();
  const numerals = mode === 'numerals';
  const text = (t: string, size = 18) => (
    <Text className="font-ui-semibold font-semibold" style={{ fontSize: size, color: colors.foreground }}>
      {t}
    </Text>
  );
  const quality = (q: string) => <ChordQualityText quality={q} style={{ fontSize: 20, color: colors.foreground }} />;

  return (
    <View style={{ gap: 6, padding: 6, backgroundColor: colors.surface }}>
      {numerals ? (
        <>
          <View className="flex-row" style={{ gap: 5 }}>
            {UPPER.map((n) => (
              <Key key={n} onPress={() => onInsert(n, true)} accessibilityLabel={`${n}, major`}>
                {text(n, 16)}
              </Key>
            ))}
            <Key onPress={() => onInsert('b', true)} accessibilityLabel="Flat (before a numeral)">
              {quality('b')}
            </Key>
          </View>
          <View className="flex-row" style={{ gap: 5 }}>
            {LOWER.map((n) => (
              <Key key={n} onPress={() => onInsert(n, true)} accessibilityLabel={`${n}, minor`}>
                {text(n, 16)}
              </Key>
            ))}
            <Key onPress={() => onInsert('#', true)} accessibilityLabel="Sharp (before a numeral)">
              {quality('#')}
            </Key>
          </View>
        </>
      ) : (
        <View className="flex-row" style={{ gap: 5 }}>
          {ROOTS.map((r) => (
            <Key key={r} onPress={() => onInsert(r, true)}>
              {text(r, 19)}
            </Key>
          ))}
          <Key onPress={() => onInsert('b', false)}>{quality('b')}</Key>
          <Key onPress={() => onInsert('#', false)}>{quality('#')}</Key>
          <Key onPress={() => onInsert('-', false)}>{quality('-')}</Key>
        </View>
      )}

      <View className="flex-row" style={{ gap: 5 }}>
        {DIGITS.map((d) => (
          <Key key={d} onPress={() => onInsert(d, false)}>
            {text(d)}
          </Key>
        ))}
        <Key onPress={() => onInsert('o', false)} accessibilityLabel="Diminished">
          {quality('o')}
        </Key>
        <Key onPress={() => onInsert('h', false)} accessibilityLabel="Half-diminished">
          {quality('h')}
        </Key>
        <Key onPress={() => onInsert('^', false)} accessibilityLabel="Major 7">
          {quality('^')}
        </Key>
      </View>

      <View className="flex-row" style={{ gap: 5 }}>
        <Key onPress={() => onInsert('sus', false)}>{text('sus', 15)}</Key>
        <Key onPress={() => onInsert('add', false)}>{text('add', 15)}</Key>
        {numerals ? (
          <Key onPress={() => onInsert('-', false)} accessibilityLabel="Minor">
            {quality('-')}
          </Key>
        ) : (
          <Key onPress={() => onInsert('alt', false)}>{text('alt', 15)}</Key>
        )}
        <Key onPress={() => onInsert('+', false)} accessibilityLabel="Augmented">
          {quality('+')}
        </Key>
        <Key flex={3.4} onPress={() => onInsert(' ', false)} accessibilityLabel="Space — next chord">
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            space
          </Text>
        </Key>
        <Key flex={1.4} onPress={onBackspace} onLongPress={onClear} accessibilityLabel="Backspace (hold to clear)">
          <BackspaceIcon color={colors.foreground} size={20} />
        </Key>
      </View>

      <View className="flex-row" style={{ gap: 5 }}>
        <Pressable
          onPress={onGiveUp}
          android_ripple={{ color: colors['surface-hover'] }}
          className="items-center justify-center rounded-lg"
          style={{ flex: 3, height: 46, backgroundColor: colors.background }}
        >
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            I don&apos;t know
          </Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          accessibilityLabel="Submit answer"
          className="items-center justify-center rounded-lg"
          style={{ flex: 2, height: 46, backgroundColor: colors.accent }}
        >
          <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
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
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  flex?: number;
  accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors['surface-hover'] }}
      className="items-center justify-center rounded-lg"
      style={{ flex, height: 44, backgroundColor: colors.background }}
    >
      {children}
    </Pressable>
  );
}

import { ROOT_NAMES, prettyNote } from '@jam-practice/core/rootlessVoicings';
import { isDarkColors } from '@jam-practice/core/themes';
import { Pressable, Text, View } from 'react-native';

import { useGradeColors } from '@/components/tool/ear';
import { mix } from '@/components/tool/reward';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Find the Root's Pick mode: the 12 roots laid out like a piano (the website's `RootKey` grid), white
 * keys along the bottom and the black keys above, each between its two white neighbours. A wrong
 * pick turns red; once the round is answered, every right root turns green (7♭9 has four).
 */

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
/** The black keys' place on a 14-column grid (each key two columns wide, like the web's). */
const BLACK_KEYS: { pc: number; col: number }[] = [
  { pc: 1, col: 2 },
  { pc: 3, col: 4 },
  { pc: 6, col: 8 },
  { pc: 8, col: 10 },
  { pc: 10, col: 12 },
];

const GAP = 4;
const BLACK_HEIGHT = 46;
const WHITE_HEIGHT = 58;

export type KeyState = 'right' | 'wrong' | null;

export function RootKeys({
  keyState,
  keyLabel,
  disabled,
  onPick,
}: {
  keyState: (pc: number) => KeyState;
  /** Overrides a key's usual name (the answer's own spelling once it's revealed). */
  keyLabel: (pc: number) => string | undefined;
  disabled: boolean;
  onPick: (pc: number) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Pick the root"
      className="w-full rounded-lg"
      style={{ maxWidth: 384, padding: GAP, gap: GAP, backgroundColor: withAlpha(colors.foreground, 0.1) }}
    >
      <View style={{ height: BLACK_HEIGHT }}>
        {BLACK_KEYS.map(({ pc, col }) => (
          <View
            key={pc}
            style={{ position: 'absolute', top: 0, bottom: 0, left: `${((col - 1) / 14) * 100}%`, width: `${(2 / 14) * 100}%`, paddingHorizontal: GAP / 2 }}
          >
            <RootKey pc={pc} black state={keyState(pc)} label={keyLabel(pc)} disabled={disabled} onPick={onPick} />
          </View>
        ))}
      </View>
      <View className="flex-row" style={{ height: WHITE_HEIGHT, gap: GAP }}>
        {WHITE_KEYS.map((pc) => (
          <View key={pc} className="flex-1">
            <RootKey pc={pc} state={keyState(pc)} label={keyLabel(pc)} disabled={disabled} onPick={onPick} />
          </View>
        ))}
      </View>
    </View>
  );
}

function RootKey({
  pc,
  black = false,
  state,
  label,
  disabled,
  onPick,
}: {
  pc: number;
  black?: boolean;
  state: KeyState;
  label?: string;
  disabled: boolean;
  onPick: (pc: number) => void;
}) {
  const { colors } = useAppTheme();
  const gradeColor = useGradeColors();
  const dark = isDarkColors(colors);
  const name = label ?? prettyNote(ROOT_NAMES[pc]);
  const color = state === 'right' ? gradeColor.correct : state === 'wrong' ? gradeColor.incorrect : null;
  // Like a real piano in both themes: the black keys are the darker ones (the text colour on a
  // light theme, the surface on a dark one) and the white keys the lighter ones.
  const keyFill = black ? (dark ? colors.surface : colors.foreground) : dark ? withAlpha(colors.foreground, 0.9) : colors.surface;
  const keyText = black ? (dark ? colors.foreground : colors.background) : dark ? colors.background : colors.foreground;
  return (
    <Pressable
      onPress={() => onPick(pc)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled }}
      android_ripple={{ color: withAlpha(black && !dark ? colors.background : colors.foreground, 0.15) }}
      className="flex-1 items-center justify-center overflow-hidden rounded-md"
      style={{
        backgroundColor: color ? mix(color, colors.surface, 0.18) : keyFill,
        borderWidth: 2,
        borderColor: color ?? 'transparent',
        opacity: disabled && !color ? 0.6 : 1,
      }}
    >
      <Text numberOfLines={1} className={`font-ui-semibold font-semibold ${black ? 'text-[13px]' : 'text-sm'}`} style={{ color: color ?? keyText }}>
        {name}
      </Text>
    </Pressable>
  );
}

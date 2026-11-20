import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordQualityText } from '@/components/ChordQualityText';
import { BackspaceIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The chart editor's own keyboard, fixed to the bottom of the screen — modeled on iReal Pro's
 * editor keyboard: everything a chord symbol needs (roots, accidentals, extensions, quality
 * symbols, and a **space** key to put a second chord in the same bar) plus a row of bar tools
 * (section, repeat barlines, numbered ending, coda, segno, "%" repeat bar, D.C./D.S. direction)
 * and a big Next key. Purely presentational: every key fires a callback; the editor screen owns
 * the actual bar state. Bar-tool keys show as "on" (accent) when the active bar has that marking.
 */
export type BarTool = 'section' | 'startRepeat' | 'endRepeat' | 'ending' | 'coda' | 'segno' | 'repeatBar' | 'directive';

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '9'];

export function ChartEditorKeyboard({
  onInsert,
  onBackspace,
  onClear,
  onTool,
  toolState,
  onNext,
}: {
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onTool: (tool: BarTool) => void;
  /** What each bar-tool key should display for the active bar (label when on, or null when off). */
  toolState: Record<BarTool, string | null>;
  onNext: () => void;
}) {
  const { colors } = useAppTheme();
  const text = (t: string, size = 18) => (
    <Text className="font-ui-semibold font-semibold" style={{ fontSize: size, color: colors.foreground }}>
      {t}
    </Text>
  );
  const quality = (q: string) => <ChordQualityText quality={q} style={{ fontSize: 20, color: colors.foreground }} />;

  return (
    <View style={{ gap: 6, padding: 6, backgroundColor: colors.surface }}>
      <View className="flex-row" style={{ gap: 5 }}>
        {ROOTS.map((r) => (
          <Key key={r} onPress={() => onInsert(r)}>
            {text(r, 19)}
          </Key>
        ))}
        <Key onPress={() => onInsert('b')}>{quality('b')}</Key>
        <Key onPress={() => onInsert('#')}>{quality('#')}</Key>
        <Key onPress={() => onInsert('-')}>{quality('-')}</Key>
      </View>

      <View className="flex-row" style={{ gap: 5 }}>
        {DIGITS.map((d) => (
          <Key key={d} onPress={() => onInsert(d)}>
            {text(d)}
          </Key>
        ))}
        <Key onPress={() => onInsert('o')}>{quality('o')}</Key>
        <Key onPress={() => onInsert('h')}>{quality('h')}</Key>
        <Key onPress={() => onInsert('^')}>{quality('^')}</Key>
      </View>

      <View className="flex-row" style={{ gap: 5 }}>
        <Key onPress={() => onInsert('sus')}>{text('sus', 15)}</Key>
        <Key onPress={() => onInsert('add')}>{text('add', 15)}</Key>
        <Key onPress={() => onInsert('alt')}>{text('alt', 15)}</Key>
        <Key onPress={() => onInsert('+')}>{quality('+')}</Key>
        <Key onPress={() => onInsert('/')}>{text('/', 19)}</Key>
        <Key flex={2.4} onPress={() => onInsert(' ')} accessibilityLabel="Space — next chord in this bar">
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            space
          </Text>
        </Key>
        <Key flex={1.4} onPress={onBackspace} onLongPress={onClear} accessibilityLabel="Backspace (hold to clear the bar)">
          <BackspaceIcon color={colors.foreground} size={20} />
        </Key>
      </View>

      <View className="flex-row" style={{ gap: 5 }}>
        <ToolKey label={toolState.section ?? 'A'} caption="section" on={!!toolState.section} onPress={() => onTool('section')} boxed />
        <ToolKey label="‖:" caption="repeat" on={!!toolState.startRepeat} onPress={() => onTool('startRepeat')} />
        <ToolKey label=":‖" caption="repeat" on={!!toolState.endRepeat} onPress={() => onTool('endRepeat')} />
        <ToolKey label={toolState.ending ?? '1.'} caption="ending" on={!!toolState.ending} onPress={() => onTool('ending')} />
        <ToolKey glyph={''} caption="coda" on={!!toolState.coda} onPress={() => onTool('coda')} />
        <ToolKey glyph={''} caption="segno" on={!!toolState.segno} onPress={() => onTool('segno')} />
        <ToolKey glyph={''} caption="repeat bar" on={!!toolState.repeatBar} onPress={() => onTool('repeatBar')} />
        <ToolKey label={toolState.directive ? toolState.directive.split(' ')[0] : 'D.C.'} caption={toolState.directive ? toolState.directive.replace(/^\S+\s*/, '') || 'fine' : 'direction'} on={!!toolState.directive} onPress={() => onTool('directive')} />
        <Pressable
          onPress={onNext}
          accessibilityLabel="Next bar"
          className="items-center justify-center rounded-lg"
          style={{ flex: 1.8, height: 46, backgroundColor: colors.accent }}
        >
          <Text className="font-ui-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
            Next
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

function ToolKey({
  label,
  glyph,
  caption,
  on,
  boxed,
  onPress,
}: {
  label?: string;
  glyph?: string;
  caption: string;
  on: boolean;
  boxed?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const fg = on ? colors['accent-foreground'] : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={caption}
      accessibilityState={{ selected: on }}
      className="items-center justify-center rounded-lg"
      style={{ flex: 1, height: 46, backgroundColor: on ? colors.accent : colors.background }}
    >
      {glyph ? (
        <Text style={{ fontFamily: 'Petaluma', fontSize: 18, lineHeight: 22, color: fg }}>{glyph}</Text>
      ) : boxed ? (
        <View style={{ borderWidth: 1.5, borderColor: fg, borderRadius: 3, paddingHorizontal: 3 }}>
          <Text numberOfLines={1} className="font-ui-bold text-xs font-bold" style={{ color: fg }}>
            {label}
          </Text>
        </View>
      ) : (
        <Text numberOfLines={1} className="font-ui-bold text-sm font-bold" style={{ color: fg }}>
          {label}
        </Text>
      )}
      <Text numberOfLines={1} style={{ fontSize: 8, color: on ? colors['accent-foreground'] : colors.muted }} className="font-ui">
        {caption}
      </Text>
    </Pressable>
  );
}

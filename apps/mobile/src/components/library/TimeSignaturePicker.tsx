import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

const COMMON = ['4/4', '3/4', '2/4', '2/2', '6/8', '5/4', '7/8', '12/8'];
const UNITS = [1, 2, 4, 8, 16, 32];

function parse(value: string): { top: number; bottom: number } {
  const [t, b] = value.split('/').map((n) => Number(n));
  return { top: Number.isFinite(t) && t > 0 ? t : 4, bottom: UNITS.includes(b) ? b : 4 };
}

/** A time signature drawn the way it's printed on a score: one number stacked over the other. */
function Fraction({ value, color, size = 17 }: { value: string; color: string; size?: number }) {
  const { top, bottom } = parse(value);
  return (
    <View className="items-center">
      <Text className="font-ui-extrabold font-extrabold" style={{ color, fontSize: size, lineHeight: size * 1.05 }}>
        {top}
      </Text>
      <View style={{ height: 1.5, width: size * 1.1, backgroundColor: color, opacity: 0.5 }} />
      <Text className="font-ui-extrabold font-extrabold" style={{ color, fontSize: size, lineHeight: size * 1.05 }}>
        {bottom}
      </Text>
    </View>
  );
}

/**
 * Picking a tune's time signature by tapping it rather than typing "4/4": the common ones as
 * buttons showing a real stacked time signature, plus "Other" for anything else, with steppers for
 * beats per bar and the beat unit (which only steps through real note values — 2, 4, 8, 16…).
 */
export function TimeSignaturePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { colors } = useAppTheme();
  const isCommon = COMMON.includes(value);
  const [custom, setCustom] = useState(!isCommon);
  const { top, bottom } = parse(value);

  function set(nextTop: number, nextBottom: number) {
    onChange(`${Math.min(32, Math.max(1, nextTop))}/${nextBottom}`);
  }
  function stepUnit(dir: 1 | -1) {
    const i = UNITS.indexOf(bottom);
    const next = UNITS[Math.min(UNITS.length - 1, Math.max(0, i + dir))];
    set(top, next);
  }

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {COMMON.map((sig) => {
          const on = !custom && value === sig;
          return (
            <Pressable
              key={sig}
              onPress={() => {
                setCustom(false);
                onChange(sig);
              }}
              accessibilityLabel={`${sig} time`}
              accessibilityState={{ selected: on }}
              className="items-center justify-center rounded-xl"
              style={{ width: 56, height: 60, backgroundColor: on ? colors.accent : colors.surface }}
            >
              <Fraction value={sig} color={on ? colors['accent-foreground'] : colors.foreground} />
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setCustom(true)}
          accessibilityState={{ selected: custom }}
          className="items-center justify-center rounded-xl px-3"
          style={{ height: 60, backgroundColor: custom ? colors.accent : colors.surface }}
        >
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: custom ? colors['accent-foreground'] : colors.foreground }}>
            Other
          </Text>
        </Pressable>
      </View>

      {custom ? (
        <View className="flex-row items-center gap-4 rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
          <Fraction value={`${top}/${bottom}`} color={colors.accent} size={26} />
          <View className="flex-1 gap-2">
            <StepRow label="Beats per bar" value={String(top)} onMinus={() => set(top - 1, bottom)} onPlus={() => set(top + 1, bottom)} />
            <StepRow label="Beat unit" value={String(bottom)} onMinus={() => stepUnit(-1)} onPlus={() => stepUnit(1)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StepRow({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const { colors } = useAppTheme();
  const btn = (text: string, onPress: () => void) => (
    <Pressable onPress={onPress} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.background }}>
      <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
        {text}
      </Text>
    </Pressable>
  );
  return (
    <View className="flex-row items-center gap-2">
      <Text className="font-ui flex-1 text-sm" style={{ color: colors.muted }}>
        {label}
      </Text>
      {btn('−', onMinus)}
      <Text className="font-ui-bold w-7 text-center text-base font-bold tabular-nums" style={{ color: colors.foreground }}>
        {value}
      </Text>
      {btn('+', onPlus)}
    </View>
  );
}

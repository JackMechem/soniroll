import { PART_DEFAULT, partDbLabel } from '@jam-practice/core/drumKit';
import { Pressable, Text } from 'react-native';

import { Field, ValueBadge } from '@/components/tool/ear';
import { Slider } from '@/components/tool/Slider';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Rhythm Section's mixer controls in a sheet (the website's `LevelRow` and `PartFader`): a part's
 * level with its slider, or — while that part is off — a way to turn it on.
 */

/** One mixer channel: name, level and slider; `value` null while the part is off. */
export function LevelRow({
  label,
  value,
  onChange,
  offLabel,
  onTurnOn,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  offLabel?: string;
  onTurnOn?: () => void;
}) {
  const { colors } = useAppTheme();
  const aside =
    value === null ? (
      onTurnOn ? (
        <Pressable onPress={onTurnOn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${label}: ${offLabel ?? 'Turn on'}`}>
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.accent }}>
            {offLabel ?? 'Turn on'}
          </Text>
        </Pressable>
      ) : (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          {offLabel ?? 'Off'}
        </Text>
      )
    ) : (
      <ValueBadge>{Math.round(value * 100)}%</ValueBadge>
    );
  return (
    <Field label={label} aside={aside}>
      <Slider label={`${label} level`} value={value ?? 0} disabled={value === null} onChange={(v) => onChange(Math.round(v * 100) / 100)} />
    </Field>
  );
}

/** One kit part's fader, in dB from the recording's own level (0.5 = as recorded). */
export function PartFader({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const { colors } = useAppTheme();
  const reset =
    Math.abs(value - PART_DEFAULT) >= 0.005 ? (
      <Pressable onPress={() => onChange(PART_DEFAULT)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Reset ${label}`}>
        <Text className="font-ui-semibold mr-2 text-xs font-semibold" style={{ color: colors.accent }}>
          Reset
        </Text>
      </Pressable>
    ) : null;
  return (
    <Field
      label={label}
      aside={
        <>
          {reset}
          <ValueBadge>{partDbLabel(value)}</ValueBadge>
        </>
      }
    >
      <Slider label={`${label} level`} value={value} onChange={(v) => onChange(Math.round(v * 100) / 100)} />
    </Field>
  );
}

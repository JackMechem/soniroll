import { ActivityIndicator, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The native sibling of `apps/web/components/LoadingSpinner.tsx` — same `size`/`inline`/
 * `showLabel` shape (a loading indicator for a spot specific enough to name what's loading, not
 * just that something is), but a plain native `ActivityIndicator` rather than a hand-animated row
 * of beat-indicator-styled dots — the platform's own spinner already reads as "native" here the
 * way the web version's custom animation was built to read as "on-brand," so there was nothing to
 * gain by reimplementing the CSS keyframe version on top of Reanimated for this.
 */
export function LoadingSpinner({
  size = 'md',
  inline = false,
  showLabel = false,
  label = 'Loading…',
}: {
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;
  showLabel?: boolean;
  label?: string;
}) {
  const { colors } = useAppTheme();
  const indicatorSize = size === 'sm' ? 'small' : 'large';

  const spinner = <ActivityIndicator size={indicatorSize} color={colors.accent} />;

  if (!showLabel) return spinner;

  return (
    <View
      className={inline ? 'flex-row items-center gap-2' : 'items-center gap-2'}
      accessibilityRole="progressbar"
    >
      {spinner}
      <Text className="text-sm font-ui" style={{ color: colors.muted }}>
        {label}
      </Text>
    </View>
  );
}

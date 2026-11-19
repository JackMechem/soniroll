import { Text } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The native sibling of `apps/web/components/Hint.tsx` — an option/setting description. Always
 * rendered (no "?"-toggle visibility gate the web version's `CollapsiblePanel`/`OptionsCard` have):
 * mobile's `ToolOptionsSheet` tabs are already short, focused lists rather than a dense settings
 * panel, so there's no clutter problem here worth a separate toggle for.
 */
export function Hint({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
      {children}
    </Text>
  );
}

import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { ArrowLeftIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The back button in every screen header (`_layout.tsx`'s `screenOptions.headerLeft`): a round
 * button on the faint fill, like the app's other icon buttons (`IconButton` in `ui.tsx`). Nothing
 * on a screen with no history to go back to.
 */
export function HeaderBackButton() {
  const router = useRouter();
  const { colors, derived } = useAppTheme();

  if (!router.canGoBack()) return null;

  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityLabel="Go back"
      accessibilityRole="button"
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: derived.fill, marginRight: 12 }}
    >
      <ArrowLeftIcon color={colors.foreground} size={18} />
    </Pressable>
  );
}

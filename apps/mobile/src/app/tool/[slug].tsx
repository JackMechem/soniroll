import { NAV_LINKS_DATA } from '@jam-practice/core/navLinks';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

/**
 * A generic stand-in for every tool, reached by tapping any row in `/menu` or the sidebar —
 * nothing from `apps/web`'s own ~16 tool components has been ported natively yet. One dynamic
 * route rather than 16 near-identical stub files, looked up by slug
 * (`@jam-practice/core/navLinks`'s own `hrefToSlug`/`href` pairing) so adding a real screen for a
 * tool later is just adding a differently-named route that shadows this fallback for that one
 * slug — nothing here needs to change when that happens.
 */
function ToolPlaceholder() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const tool = NAV_LINKS_DATA.find((link) => link.href === `/${slug}`);
  const { colors } = useAppTheme();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: tool?.label ?? 'Not found' }} />
      <SafeAreaView className="flex-1 gap-4 p-6" edges={['bottom']}>
        {tool ? (
          <>
            <Text className="mt-2 text-2xl font-bold font-ui-bold" style={{ color: colors.foreground }}>
              {tool.label}
            </Text>
            <Text className="text-base leading-6 font-ui" style={{ color: colors.muted }}>
              {tool.description}
            </Text>
            <View className="gap-1 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
              <Text className="font-bold font-ui-bold" style={{ color: colors.accent }}>
                Not migrated yet
              </Text>
              <Text className="text-sm leading-5 font-ui" style={{ color: colors.muted }}>
                This tool still only exists in the web app. It&apos;ll get a real native screen in
                a later pass of the migration.
              </Text>
            </View>
          </>
        ) : (
          <Text className="font-ui" style={{ color: colors.muted }}>
            Nothing here — &ldquo;{slug}&rdquo; isn&apos;t a known tool.
          </Text>
        )}
      </SafeAreaView>
    </View>
  );
}

export default withScreenLoader(ToolPlaceholder);

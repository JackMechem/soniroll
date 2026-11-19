import { NAV_LINKS_DATA } from '@jam-practice/core/navLinks';
import { Text, View } from 'react-native';

import { NAV_LINK_ICONS } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

const TOOL_BY_LABEL = new Map(NAV_LINKS_DATA.map((l) => [l.label, l]));

/**
 * Every screen header's title, like the website's phone top bar: the name in the text colour and,
 * on a tool's screen, the tool's icon in its category colour before it (looked up by the title,
 * as the web does). One line, cut off with … if it's long.
 */
export function HeaderTitle({ children }: { children?: string }) {
  const { colors, derived } = useAppTheme();
  if (!children) return null;
  const tool = TOOL_BY_LABEL.get(children);
  const Icon = tool ? NAV_LINK_ICONS[tool.href] : undefined;
  return (
    <View className="flex-row items-center gap-2" style={{ flexShrink: 1 }}>
      {tool && Icon ? <Icon color={derived.category[tool.category]} size={20} /> : null}
      <Text numberOfLines={1} className="font-ui-semibold text-[17px] font-semibold" style={{ color: colors.foreground, flexShrink: 1 }}>
        {children}
      </Text>
    </View>
  );
}

import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ChevronRightIcon, SetlistIcon } from '@/components/icons';
import type { Setlist } from '@/lib/useSetlists';
import { useAppTheme } from '@/theme/ThemeProvider';

export const SETLIST_ROW_H = 60;

/** One setlist in a list — name, tune count, shared — opening its page. */
export function SetlistRow({ setlist }: { setlist: Setlist }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const n = setlist.tuneIds.length;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/library/setlist', params: { id: setlist.id } })}
      android_ripple={{ color: colors['surface-hover'] }}
      className="flex-row items-center gap-3 rounded-xl px-4"
      style={{ height: SETLIST_ROW_H, backgroundColor: colors.surface, marginBottom: 6 }}
    >
      <SetlistIcon color={colors.accent} size={22} />
      <View className="flex-1">
        <Text numberOfLines={1} className="font-ui-bold text-base font-bold" style={{ color: colors.foreground }}>
          {setlist.name}
        </Text>
        <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
          {`${n} tune${n === 1 ? '' : 's'}${setlist.shareId ? ' · shared' : ''}`}
        </Text>
      </View>
      <ChevronRightIcon color={colors.muted} size={22} />
    </Pressable>
  );
}

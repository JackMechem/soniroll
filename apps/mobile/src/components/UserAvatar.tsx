import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { ProfileIcon } from '@/components/icons';
import { useAppTheme } from '@/theme/ThemeProvider';

const DIM: Record<Size, number> = { sm: 32, md: 44, lg: 64, xl: 96 };
const ICON_SIZE: Record<Size, number> = { sm: 16, md: 20, lg: 28, xl: 40 };

type Size = 'sm' | 'md' | 'lg' | 'xl';

/** The native sibling of `apps/web/components/UserAvatar.tsx` — a profile picture, or (without one)
    a filled circle with the person's first letter (`name`; a person icon if there's no name), reused everywhere an avatar shows (so far: the account
    page's own Profile tab). `expo-image` instead of plain RN `Image` for its own disk/memory
    caching of a remote, Convex-storage-hosted URL — the same reasoning web's own doc comment
    gives for reaching for the platform's own image handling rather than adding ceremony. */
export function UserAvatar({
  url,
  name,
  size = 'md',
}: {
  url: string | null | undefined;
  /** Their username or name, for the letter shown without a picture. */
  name?: string | null;
  size?: Size;
}) {
  const { colors, derived } = useAppTheme();
  const initial = name?.replace(/^@/, '').charAt(0).toUpperCase();
  const dim = DIM[size];

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: colors.surface,
        }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: derived.fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initial ? (
        <Text className="font-ui-semibold font-semibold" style={{ color: colors.muted, fontSize: Math.round(dim * 0.4) }}>
          {initial}
        </Text>
      ) : (
        <ProfileIcon color={colors.muted} size={ICON_SIZE[size]} />
      )}
    </View>
  );
}

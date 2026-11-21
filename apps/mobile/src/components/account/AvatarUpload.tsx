import { api } from '@jam-practice/convex/_generated/api';
import { useMutation } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';

const AVATAR_SIZE = 400;
const JPEG_QUALITY = 0.85;

/**
 * The native sibling of `apps/web/components/AvatarUpload.tsx` — same two-step Convex upload flow
 * (`generateAvatarUploadUrl` → `fetch` POST the processed image straight to that one-time URL →
 * `setAvatar` attaches the resulting `storageId`), but the crop/resize step reaches for Expo's own
 * platform facilities instead of a `<canvas>`: `expo-image-picker`'s own `allowsEditing`/`aspect:
 * [1, 1]` gives a native square-crop UI at pick time (iOS always crops to a square once editing is
 * on; Android follows the `aspect` hint), then `expo-image-manipulator` resizes+compresses that
 * already-square result down to a fixed `AVATAR_SIZE` JPEG before it's ever uploaded — same "reach
 * for the platform first" habit the web version's own doc comment already states, just a different
 * platform's own tools.
 */
export function AvatarUpload({ avatarUrl, name }: { avatarUrl: string | null; name?: string | null }) {
  const { colors } = useAppTheme();
  const generateUploadUrl = useMutation(api.profiles.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.profiles.setAvatar);
  const removeAvatar = useMutation(api.profiles.removeAvatar);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access was denied — enable it in Settings to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const context = ImageManipulator.manipulate(result.assets[0].uri);
      const rendered = await context.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE }).renderAsync();
      const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

      const uploadUrl = await generateUploadUrl();
      const response = await fetch(saved.uri);
      const blob = await response.blob();
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error('Upload failed.');
      const { storageId } = await uploadRes.json();
      await setAvatar({ storageId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that picture.");
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    setError(null);
    setUploading(true);
    try {
      await removeAvatar();
    } catch {
      setError("Couldn't remove your picture.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <View className="flex-row items-center gap-4">
      <UserAvatar url={avatarUrl} name={name} size="lg" />
      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => void onPick()}
            disabled={uploading}
            className="rounded-xl px-3 py-2"
            style={{ backgroundColor: colors.background, opacity: uploading ? 0.5 : 1 }}
          >
            <Text className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
              {avatarUrl ? 'Change picture' : 'Upload picture'}
            </Text>
          </Pressable>
          {avatarUrl ? (
            <Pressable
              onPress={() => void onRemove()}
              disabled={uploading}
              accessibilityLabel="Remove picture"
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{ opacity: uploading ? 0.5 : 1 }}
            >
              <TrashIcon color={colors.muted} size={16} />
            </Pressable>
          ) : null}
          {uploading ? <LoadingSpinner size="sm" /> : null}
        </View>
        {error ? (
          <Text className="text-xs font-ui" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

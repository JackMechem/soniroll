import { useConvexAuth } from '@convex-dev/auth/react';
import { fileDetail } from '@jam-practice/core/files';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FileRow, useFileActions } from '@/components/files/FileParts';
import { UploadIcon } from '@/components/files/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useTuneIndex } from '@/components/recordings/RecordingParts';
import { useDeviceUrls } from '@/lib/deviceFiles';
import { type StoredEntry, filesApi, pickFiles, useFileUploader, useSaveTarget } from '@/lib/files';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * A tune's files (PDFs, lead sheets, pictures, audio — uploads attached to it, here or from the
 * Files tab): open one in the viewer, its ⋮ menu (long press too), and "Add a file", which uploads
 * straight onto the tune. Signed out it says files need an account. The website's tune page has
 * the same card.
 */
export function TuneFiles({ tuneId }: { tuneId: string }) {
  const { colors } = useAppTheme();
  const { isAuthenticated } = useConvexAuth();
  const storage = useQuery(filesApi.storage, isAuthenticated ? {} : 'skip');
  const { byId } = useTuneIndex();
  const actions = useFileActions({ tuneName: (id) => byId.get(id)?.tune.name });
  const target = useSaveTarget();
  const uploader = useFileUploader(target, tuneId);
  const withUrls = useDeviceUrls(storage?.items);
  const files = useMemo<StoredEntry[]>(() => (withUrls ?? []).filter((i) => i.kind === 'file' && i.tuneId === tuneId), [withUrls, tuneId]);
  const paid = !!storage?.hasPlan;

  async function add() {
    uploader.clearError();
    const picked = await pickFiles([], true);
    if (picked.length) await uploader.uploadAll(picked);
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center px-1">
        <Text className="font-ui-bold text-lg font-bold" style={{ color: colors.foreground }}>
          Files
        </Text>
        {files.length > 0 ? (
          <Text className="font-ui ml-auto text-sm tabular-nums" style={{ color: colors.muted }}>
            {files.length}
          </Text>
        ) : null}
      </View>
      {!isAuthenticated ? (
        <View className="rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Sign in to keep PDFs, lead sheets and other files with this tune.
          </Text>
        </View>
      ) : storage === undefined ? (
        <View className="items-center py-6">
          <LoadingSpinner />
        </View>
      ) : (
        <>
          {files.map((item) => (
            <FileRow key={item.id} item={item} paid={paid} detail={fileDetail(item)} onOpen={() => actions.openFile(item)} onMenu={() => actions.openMenu(item)} />
          ))}
          {uploader.progress ? (
            <View className="flex-row items-center gap-2 px-1">
              <LoadingSpinner size="sm" />
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                Saving {uploader.progress.total > 1 ? `${Math.min(uploader.progress.done + 1, uploader.progress.total)} of ${uploader.progress.total}` : 'your file'}…
              </Text>
            </View>
          ) : null}
          {actions.status ? (
            <View className="flex-row items-center gap-2 px-1">
              <LoadingSpinner size="sm" />
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                {actions.status}
              </Text>
            </View>
          ) : null}
          {[uploader.error, actions.error].filter(Boolean).map((text) => (
            <Text key={text} className="font-ui px-1 text-sm" style={{ color: colors.danger }}>
              {text}
            </Text>
          ))}
          {/* Empty, it reads like the tune page's Chord chart section: a line, then the button. */}
          <View className={files.length ? 'rounded-2xl p-2' : 'gap-3 rounded-2xl p-4'} style={{ backgroundColor: colors.surface }}>
            {files.length ? null : (
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                No files yet.
              </Text>
            )}
            <Pressable
              onPress={() => void add()}
              disabled={!!uploader.progress}
              accessibilityRole="button"
              android_ripple={{ color: colors['surface-hover'] }}
              className="flex-row items-center justify-center gap-1.5 overflow-hidden rounded-xl py-2.5"
              style={{ backgroundColor: colors.background }}
            >
              <UploadIcon color={colors.foreground} size={16} />
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                Add a file
              </Text>
            </Pressable>
          </View>
        </>
      )}
      {actions.elements}
    </View>
  );
}

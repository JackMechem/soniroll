import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { keyColor } from '@jam-practice/core/accentColors';
import type { FileKind } from '@jam-practice/core/files';
import type { ComponentProps, ComponentType } from 'react';

import type { IconProps } from '@/components/icons';
import { IconTile } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Icons for files, from the same pack as `components/icons.tsx` (every name checked against the
    installed glyph map). */
function mci(name: ComponentProps<typeof MaterialCommunityIcons>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}

export const UploadIcon = mci('upload');
export const CloudIcon = mci('cloud-outline');
export const PhoneIcon = mci('cellphone');
export const OpenElsewhereIcon = mci('open-in-new');
export const SendIcon = mci('export-variant');
export const PdfFileIcon = mci('file-pdf-box');
export const ImageFileIcon = mci('file-image-outline');
export const AudioFileIcon = mci('file-music-outline');
export const VideoFileIcon = mci('file-video-outline');
export const DocumentFileIcon = mci('file-document-outline');
export const NotationFileIcon = mci('music-box-outline');
export const PlainFileIcon = mci('file-outline');
export const RecordingFileIcon = mci('microphone');

export const KIND_ICON: Record<FileKind, ComponentType<IconProps>> = {
  pdf: PdfFileIcon,
  image: ImageFileIcon,
  audio: AudioFileIcon,
  video: VideoFileIcon,
  notation: NotationFileIcon,
  document: DocumentFileIcon,
  other: PlainFileIcon,
};

/** Each kind's colour: the accent turned round the colour wheel (the website's `--key-N`), so it
    follows the theme. Anything else is muted. */
const KIND_HUE: Partial<Record<FileKind, number>> = { pdf: 0, image: 2, audio: 4, video: 6, notation: 8, document: 10 };

/** A file's type as an icon on a tile in its colour. `recording` shows the mic for a soniroll
    recording. */
export function FileTypeIcon({ kind, recording, size = 36 }: { kind: FileKind; recording?: boolean; size?: number }) {
  const { colors } = useAppTheme();
  const Icon = recording && kind === 'audio' ? RecordingFileIcon : KIND_ICON[kind];
  const hue = KIND_HUE[kind];
  return <IconTile Icon={Icon} color={hue === undefined ? colors.muted : keyColor(colors.accent, hue)} size={size} />;
}

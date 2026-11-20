import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { IconProps } from '@/components/icons';

/** Shed Notes' own icons (the formatting bar, folders, files) — MaterialCommunityIcons, like the
    app's shared set in `components/icons.tsx`. Every name checked against the package's glyph map. */
function mci(name: ComponentProps<typeof MaterialCommunityIcons>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}

export const NoteDocIcon = mci('file-document-outline');
export const NotePlusIcon = mci('file-document-plus-outline');
export const BoldIcon = mci('format-bold');
export const ItalicIcon = mci('format-italic');
export const StrikeIcon = mci('format-strikethrough-variant');
export const H1Icon = mci('format-header-1');
export const H2Icon = mci('format-header-2');
export const H3Icon = mci('format-header-3');
export const BulletIcon = mci('format-list-bulleted');
export const NumberedIcon = mci('format-list-numbered');
export const ChecklistIcon = mci('checkbox-marked-outline');
export const QuoteIcon = mci('format-quote-close');
export const TableIcon = mci('table');
export const CodeIcon = mci('code-tags');
export const ImageIcon = mci('image-outline');
export const FolderClosedIcon = mci('folder-outline');
export const FolderOpenIcon = mci('folder-open-outline');
export const TagIcon = mci('pound');
export const KeyboardHideIcon = mci('keyboard-close');
export const EyeIcon = mci('eye-outline');
export const EditNoteIcon = mci('text-box-edit-outline');
export const ShareAddIcon = mci('account-plus-outline');
export const ImportIcon = mci('import');
export const GearIcon = mci('cog-outline');
export const FileIcon = mci('file-outline');
export const OpenIcon = mci('open-in-new');
export const RuleIcon = mci('minus');
export const ScoreNoteIcon = mci('music-clef-treble');
export const UndoIcon = mci('undo');
export const RedoIcon = mci('redo');
export const TemplatesIcon = mci('file-document-multiple-outline');
export const CopyIcon = mci('content-copy');
export const PdfIcon = mci('file-pdf-box');
export const PeopleIcon = mci('account-multiple-outline');
export const BoxCheckedIcon = mci('checkbox-marked');
export const BoxEmptyIcon = mci('checkbox-blank-outline');
export const IndentIcon = mci('format-indent-increase');
export const OutdentIcon = mci('format-indent-decrease');

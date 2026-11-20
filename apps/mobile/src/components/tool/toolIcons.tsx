import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { IconProps } from '@/components/icons';

/**
 * Icons the tool screens need that `components/icons.tsx` doesn't have (kept here so the tool kit
 * doesn't edit the app-wide icon file). Same `{ color, size }` shape. Every name was checked
 * against the installed `MaterialCommunityIcons.json` glyph map.
 */
function mci(name: ComponentProps<typeof MaterialCommunityIcons>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}

/** The header's "?" (what this tool is and how its options work). */
export const HelpIcon = mci('help-circle-outline');
/** "More options". */
export const MoreIcon = mci('dots-horizontal');
/** The ear trainers' "Sound & display" chip (the tone and how answers show). */
export const ToneIcon = mci('tune-variant');
/** A register / octave range. */
export const RegisterIcon = mci('arrow-expand-vertical');
/** A voicing (which notes of a chord are played). */
export const VoicingIcon = mci('layers-outline');
/** A playback mode (what happens after an exercise). */
export const PlaybackIcon = mci('playlist-music');
/** A teacher adding a student. */
export const AddStudentIcon = mci('account-plus');
/** A student joining a teacher. */
export const JoinIcon = mci('link-variant');
/** Shed Notes' templates. */
export const TemplateIcon = mci('text-box-outline');
/** A note (Shed Notes). */
export const NoteTextIcon = mci('note-text-outline');
/** A score (Score Writer). */
export const ScoreIcon = mci('music-box-outline');

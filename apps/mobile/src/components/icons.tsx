import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ComponentType } from 'react';

/**
 * Per a direct request — "can you use an actual icon pack? alot of the icons are just kinda
 * sketch" — every icon in this app switched from hand-drawn `react-native-svg` paths (ported 1:1
 * from `apps/web/components/tools.tsx`'s own hand-drawn SVGs) to `@expo/vector-icons`
 * (`MaterialCommunityIcons`, plus `FontAwesome5` for the one icon — a real drum kit — that family
 * doesn't have a good glyph for). Every exported component keeps its *original* name and exact
 * `{color, size}` signature (`StarIcon` also keeps its own `filled` prop), so every call site
 * across the app needed zero changes — this is purely an internal swap of how each icon renders,
 * not a new API to adopt. Every glyph name below was checked directly against the installed
 * package's own real glyph-map JSON (`MaterialCommunityIcons.json`/`FontAwesome5Free.json`), not
 * guessed from memory — a wrong name would otherwise render nothing (or a fallback "?" box)
 * silently, with no type error to catch it (`name` is a wide string-literal union, but a typo
 * that happens to collide with a *different* real glyph would type-check fine while rendering the
 * wrong icon).
 */
export type IconProps = { color: string; size?: number };

function mci(name: ComponentProps<typeof MaterialCommunityIcons>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}

function fa5(name: ComponentProps<typeof FontAwesome5>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <FontAwesome5 name={name} size={size * 0.85} color={color} />;
  };
}

export const MetronomeIcon = mci('metronome');
export const BassIcon = mci('music-clef-bass');
export const NoteIcon = mci('music-note');
export const StopwatchIcon = mci('timer-outline');
export const TunerIcon = mci('tune');
export const WaveIcon = mci('waveform');
export const MetricModulationIcon = mci('metronome-tick');
export const TempoTrainerIcon = mci('speedometer');
export const ChordChartIcon = mci('file-music-outline');
export const RecordIcon = mci('record-circle');
export const DrumIcon = fa5('drum');
export const UsersIcon = mci('account-group');
export const EarIcon = mci('ear-hearing');
export const ScaleIcon = mci('stairs');
export const IntervalIcon = mci('ruler');
export const ChordIcon = mci('piano');
export const ShuffleIcon = mci('shuffle');
export const BookIcon = mci('book-music');
export const ToolsIcon = mci('view-grid-outline');
// Setting chips (the website's MeterIcon, NoteIcon and SpeakerIcon).
export const MeterIcon = mci('fraction-one-half');
export const SubdivisionChipIcon = mci('music-note-eighth');
export const SpeakerIcon = mci('volume-high');
export const SectionsIcon = mci('format-list-numbered');
export const RootlessIcon = mci('piano-off');
export const TargetIcon = mci('bullseye');
export const LibraryIcon = mci('bookshelf');
export const SearchIcon = mci('magnify');
export const MenuIcon = mci('menu');
export const CloseIcon = mci('close');
export const HomeIcon = mci('home');
export const SlidersIcon = mci('tune-vertical');
export const ProfileIcon = mci('account-circle');
export const ThemeIcon = mci('palette-outline');
export const ArrowLeftIcon = mci('arrow-left');
export const PlusIcon = mci('plus');
export const TrashIcon = mci('trash-can-outline');
export const CheckIcon = mci('check');
export const PlayIcon = mci('play');
export const PauseIcon = mci('pause');
export const StopIcon = mci('stop');
export const SkipForwardIcon = mci('skip-next');
export const PencilIcon = mci('pencil-outline');
export const BackspaceIcon = mci('backspace-outline');
export const EyeOffIcon = mci('eye-off-outline');
export const DownloadIcon = mci('download');
export const ChevronDownIcon = mci('chevron-down');
export const ChevronRightIcon = mci('chevron-right');
export const ChevronLeftIcon = mci('chevron-left');
export const InfoIcon = mci('information-outline');
export const ArrowUpIcon = mci('arrow-up');
export const ArrowDownIcon = mci('arrow-down');
export const ToTopIcon = mci('format-vertical-align-top');
export const DragIcon = mci('drag-horizontal-variant');
export const SlidesIcon = mci('play-box-multiple-outline');
export const SetlistIcon = mci('playlist-music-outline');
export const AccountEditIcon = mci('account-edit-outline');
export const MusicNoteIcon = mci('music-note-outline');
export const StarOutlineIcon = mci('star-outline');
export const PostIcon = mci('post-outline');
export const LockIcon = mci('lock-outline');
export const LogoutIcon = mci('logout');
export const DangerIcon = mci('alert-octagon-outline');
export const LinkIcon = mci('link-variant');
export const FeedIcon = mci('view-dashboard-outline');
export const FollowersIcon = mci('account-multiple-outline');
export const ShareIcon = mci('share-variant-outline');
export const DotsVerticalIcon = mci('dots-vertical');
export const FolderMoveIcon = mci('folder-move-outline');
export const FolderIcon = mci('folder-music-outline');
export const FolderPlusIcon = mci('folder-plus-outline');
export const HistoryIcon = mci('history');
export const ClearIcon = mci('close-circle');
export const RepeatIcon = mci('repeat');
export const FlagIcon = mci('flag-outline');
export const ExpandHeightIcon = mci('arrow-expand-vertical');
export const ShrinkHeightIcon = mci('arrow-collapse-vertical');
export const Rewind5Icon = mci('rewind-5');
export const Forward5Icon = mci('fast-forward-5');
export const FileMusicIcon = mci('file-music-outline');
export const MicrophoneIcon = mci('microphone');
export const UnlinkIcon = mci('link-variant-off');
export const ProgressionIcon = mci('stairs-up');
export const LessonsIcon = mci('school');
export const CalendarCheckIcon = mci('calendar-check-outline');

export function StarIcon({ color, size = 18, filled }: IconProps & { filled?: boolean }) {
  return <MaterialCommunityIcons name={filled ? 'star' : 'star-outline'} size={size} color={color} />;
}

export function HeartIcon({ color, size = 18, filled }: IconProps & { filled?: boolean }) {
  return <MaterialCommunityIcons name={filled ? 'heart' : 'heart-outline'} size={size} color={color} />;
}

/** href -> icon component, mirroring apps/web/components/tools.tsx's NAV_LINK_ICONS. */
export const NAV_LINK_ICONS: Record<string, ComponentType<IconProps>> = {
  '/jam-practice': ShuffleIcon,
  '/note-trainer': NoteIcon,
  '/rhythm-section': BassIcon,
  '/find-the-root': RootlessIcon,
  '/time-test': TargetIcon,
  '/scale-trainer': ScaleIcon,
  '/interval-trainer': IntervalIcon,
  '/guess-the-interval': EarIcon,
  '/guess-the-chord': ChordIcon,
  '/guess-the-progression': ProgressionIcon,
  '/practice-timer': StopwatchIcon,
  '/shed-log': CalendarCheckIcon,
  '/lessons': LessonsIcon,
  '/metronome': MetronomeIcon,
  '/random-metric-modulation': MetricModulationIcon,
  '/tempo-trainer': TempoTrainerIcon,
  '/tuner': TunerIcon,
  '/slow-downer': WaveIcon,
  '/chord-charts': ChordChartIcon,
  '/tunes': MusicNoteIcon,
  '/recorder': RecordIcon,
  '/random-sticking-warmup': DrumIcon,
  '/syncopation': DrumIcon,
  '/community': UsersIcon,
};

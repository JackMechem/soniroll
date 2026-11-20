import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { api } from '@jam-practice/convex/_generated/api';
import { MONTH_NAMES, WEEKDAY_NAMES, WEEKDAY_SHORT, formatShortDate, formatTime, toDateKey } from '@jam-practice/core/practiceLog';
import type { FunctionReturnType } from 'convex/server';
import { useRouter } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';

import { CheckIcon, ChordChartIcon, LessonsIcon, type IconProps } from '@/components/icons';
import { useTabBarSpace } from '@/components/FloatingTabBar';
import { Button, SignInGateScreen } from '@/components/ui';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';
import { useGradeColors } from '@/components/tool/ear';

/**
 * Pieces of the Lessons screens on the phone (the website's `components/lessons/parts.tsx`): the
 * item type, date and time words (plain string work — `Intl` is slow on Hermes), people's badges,
 * small labels, the kind filter, and the signed-out page.
 */

// ---------------------------------------------------------------- data

export type LessonSession = NonNullable<FunctionReturnType<typeof api.lessons.session>>;
export type LessonItem = LessonSession['items'][number];
export type LessonKind = LessonItem['kind'];
export type Submission = NonNullable<LessonItem['submission']>;

export const KIND_LABEL: Record<LessonKind, string> = { note: 'Lesson notes', file: 'File', chart: 'Chord chart', assignment: 'Assignment', routine: 'Routine' };
const KIND_FILTERS: { id: LessonKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'assignment', label: 'Assignments' },
  { id: 'routine', label: 'Routines' },
  { id: 'note', label: 'Notes' },
  { id: 'chart', label: 'Charts' },
  { id: 'file', label: 'Files' },
];

/** The website's address: invite and booking links are web pages anyone can open. */
export const SITE = 'https://www.soniroll.com';
export const inviteUrl = (code: string) => `${SITE}/lessons/join?invite=${code}`;
export const offerUrl = (token: string) => `${SITE}/lessons/book?offer=${token}`;

/** Pulls an invite code out of a pasted link (`…/lessons/join?invite=…`) or takes a bare code. */
export function inviteCodeFrom(text: string): string | null {
  const s = text.trim();
  const m = /[?&]invite=([A-Za-z0-9]+)/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9]{8,64}$/.test(s) ? s : null;
}

/** Opens the share sheet with a link (copy, a message, email…). */
export async function shareLink(title: string, url: string) {
  try {
    await Share.share({ message: `${title} — ${url}`, url, title });
  } catch {
    // Dismissed.
  }
}

/** Convex errors arrive wrapped ("[Request ID …] Server Error Uncaught Error: …") — just the message. */
export function errorText(e: unknown, fallback: string) {
  if (!(e instanceof Error)) return fallback;
  return e.message.replace(/^[\s\S]*Uncaught Error: /, '').split('\n')[0] || fallback;
}

/** This phone's time zone. */
export function localTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------- dates and times

/** "4:00 PM" (or 16:00 with the 24-hour clock), local. */
export function timeLabel(ms: number) {
  const d = new Date(ms);
  return formatTime(d.getHours() * 60 + d.getMinutes());
}

/** "Tue, Oct 21". */
export function dayLabel(ms: number) {
  const d = new Date(ms);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${formatShortDate(toDateKey(d))}`;
}

/** "Tuesday, October 21". */
export function longDayLabel(ms: number) {
  const d = new Date(ms);
  return `${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

/** "Tue, Oct 21" from a YYYY-MM-DD. */
export function dateKeyLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return dayLabel(new Date(y, (m || 1) - 1, d || 1, 12).getTime());
}

/** "October 2026". */
export function monthLabel(ms: number) {
  const d = new Date(ms);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** A lesson made for a whole day starts at midnight and has no end. */
export function isTimed(start: number, end?: number | null) {
  const d = new Date(start);
  return d.getHours() !== 0 || d.getMinutes() !== 0 || !!end;
}

/** "4:00 PM – 5:00 PM". */
export function timeRange(start: number, end?: number | null) {
  return `${timeLabel(start)}${end ? ` – ${timeLabel(end)}` : ''}`;
}

/** "Tue, Oct 21, 2026 · 4:00 PM – 5:00 PM" (no time for a whole-day lesson). */
export function sessionWhen(start: number, end?: number | null) {
  return `${dayLabel(start)}, ${new Date(start).getFullYear()}${isTimed(start, end) ? ` · ${timeRange(start, end)}` : ''}`;
}

/** "Tue, Oct 21 · 4:00 PM – 5:00 PM". */
export function slotLabel(s: { start: number; end: number }) {
  return `${dayLabel(s.start)} · ${timeRange(s.start, s.end)}`;
}

function dayDiff(ms: number, now: number) {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(ms);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago", else "Oct 21". */
export function relWhen(ms: number, now: number) {
  const d = dayDiff(ms, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 14) return `In ${d} days`;
  if (d < -1 && d > -14) return `${-d} days ago`;
  return formatShortDate(toDateKey(new Date(ms)));
}

/** "today", "yesterday", "5 days ago", else "Oct 21". */
export function ago(ms: number, now: number) {
  const days = Math.floor((now - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatShortDate(toDateKey(new Date(ms)));
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- icons

type McName = ComponentProps<typeof MaterialCommunityIcons>['name'];
function mci(name: McName) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}
export const NotesIcon = mci('note-text-outline');
export const FileIcon = mci('file-outline');
export const AssignmentIcon = mci('clipboard-check-outline');
export const BookingIcon = mci('calendar-clock-outline');
export const MaterialsIcon = mci('folder-multiple-outline');
export const ImageIcon = mci('image-outline');
export const VideoIcon = mci('video-outline');
export const AudioIcon = mci('music-box-outline');
export const OpenIcon = mci('open-in-new');
export const InviteIcon = mci('account-plus-outline');
export const JoinIcon = mci('ticket-outline');
export const LeaveIcon = mci('exit-run');

export const KIND_ICON: Record<LessonKind, (p: IconProps) => ReactNode> = {
  note: NotesIcon,
  file: FileIcon,
  chart: ChordChartIcon,
  assignment: AssignmentIcon,
  routine: LessonsIcon,
};

// ---------------------------------------------------------------- small pieces

/** Someone's picture, or their first letter on a tile. */
export function PersonBadge({ url, name, size = 'md' }: { url: string | null | undefined; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const { colors, derived } = useAppTheme();
  if (url) return <UserAvatar url={url} size={size} />;
  const dim = size === 'lg' ? 64 : size === 'sm' ? 32 : 44;
  return (
    <View className="items-center justify-center rounded-full" style={{ width: dim, height: dim, backgroundColor: derived.fill }}>
      <Text className="font-ui-semibold font-semibold" style={{ color: colors.muted, fontSize: Math.round(dim * 0.38) }}>
        {name.replace(/^@/, '').charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export type Tone = 'accent' | 'muted' | 'warn' | 'danger' | 'success';

/** The colour for a tone (labels, ticks, status dots). */
export function useToneColor() {
  const { colors } = useAppTheme();
  const grade = useGradeColors();
  return (tone: Tone) =>
    tone === 'accent' ? colors.accent : tone === 'warn' ? grade.partial : tone === 'danger' ? colors.danger : tone === 'success' ? grade.correct : colors.muted;
}

/** A small tinted label ("Booked", "2 to review", "Overdue · Tue, Oct 21"). */
export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  const { colors, derived } = useAppTheme();
  const color = useToneColor()(tone);
  return (
    <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: tone === 'muted' ? derived.fill : withAlpha(color, 0.14) }}>
      <Text className="font-ui-semibold text-[11px] font-semibold" style={{ color: tone === 'muted' ? colors.muted : color }}>
        {children}
      </Text>
    </View>
  );
}

/** A lesson's day as a small calendar tile: weekday, date, month. */
export function DateTile({ ms, tone = 'plain' }: { ms: number; tone?: 'accent' | 'plain' | 'muted' }) {
  const { colors } = useAppTheme();
  const d = new Date(ms);
  return (
    <View className="w-11 items-center rounded-lg py-1" style={{ backgroundColor: colors.background }}>
      <Text className="font-ui text-[10px]" style={{ color: colors.muted }}>
        {WEEKDAY_SHORT[d.getDay()]}
      </Text>
      <Text
        className="font-ui-bold text-base font-bold"
        style={{ color: tone === 'accent' ? colors.accent : tone === 'muted' ? colors.muted : colors.foreground, fontVariant: ['tabular-nums'] }}
      >
        {d.getDate()}
      </Text>
      <Text className="font-ui text-[10px]" style={{ color: colors.muted }}>
        {MONTH_NAMES[d.getMonth()].slice(0, 3)}
      </Text>
    </View>
  );
}

/** A tick box for an assignment the student ticks off. */
export function Tick({ checked, onPress, disabled, label }: { checked: boolean; onPress?: () => void; disabled?: boolean; label: string }) {
  const { colors } = useAppTheme();
  const success = useGradeColors().correct;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: disabled || !onPress }}
      accessibilityLabel={label}
      className="h-6 w-6 items-center justify-center rounded-md"
      style={{ backgroundColor: checked ? success : 'transparent', borderWidth: checked ? 0 : 1.5, borderColor: withAlpha(colors.foreground, 0.3) }}
    >
      {checked ? <CheckIcon color="#ffffff" size={17} /> : null}
    </Pressable>
  );
}

/** All / Assignments / Routines / … as a sideways row of chips with counts (kinds with none hide). */
export function KindFilter({ items, value, onChange }: { items: { kind: LessonKind }[]; value: LessonKind | 'all'; onChange: (v: LessonKind | 'all') => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {KIND_FILTERS.map((f) => {
        const n = f.id === 'all' ? items.length : items.filter((i) => i.kind === f.id).length;
        if (f.id !== 'all' && n === 0) return null;
        const on = value === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            android_ripple={{ color: colors['surface-hover'] }}
            className="h-9 flex-row items-center gap-1.5 overflow-hidden rounded-lg px-3"
            style={{ backgroundColor: on ? withAlpha(colors.accent, 0.15) : derived.fill }}
          >
            <Text className="font-ui-semibold text-[13px] font-semibold" style={{ color: on ? colors.accent : colors.foreground }}>
              {f.label}
            </Text>
            <Text className="font-ui text-xs" style={{ color: on ? colors.accent : colors.muted, fontVariant: ['tabular-nums'] }}>
              {n}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Open assignments first (soonest due), then everything else newest first. */
export function sortItems<T extends { kind: string; done: boolean; dueDate: string | null; createdAt: number }>(list: T[]): T[] {
  const open = list.filter((i) => i.kind === 'assignment' && !i.done).sort((a, b) => ((a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : (a.dueDate ?? '9999') > (b.dueDate ?? '9999') ? 1 : 0));
  const rest = list.filter((i) => !(i.kind === 'assignment' && !i.done)).sort((a, b) => b.createdAt - a.createdAt);
  return [...open, ...rest];
}

/** A screen's scrolling body on the background, with room at the bottom. */
export function LessonsScroll({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  const { colors } = useAppTheme();
  const bottom = useTabBarSpace(64);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottom, gap }}
    >
      {children}
    </ScrollView>
  );
}

/** A person's page head: their picture, a big name, a line under it, and buttons on the right. */
export function PersonHead({ url, name, title, detail, right }: { url: string | null | undefined; name: string; title: string; detail?: string; right?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-3">
      <PersonBadge url={url} name={name} size="md" />
      <View className="flex-1">
        <Text numberOfLines={2} className="font-ui-extrabold text-2xl font-extrabold leading-tight" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={2} className="font-ui text-[13px]" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A "nothing here" box with an optional action — on the surface colour like `EmptyState` (no
    dashed border). For a whole empty screen with an icon, use `EmptyState` itself. */
export function EmptyBox({ title, body, action }: { title?: string; body: string; action?: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="items-center gap-1.5 rounded-xl p-5" style={{ backgroundColor: colors.surface }}>
      {title ? (
        <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
          {title}
        </Text>
      ) : null}
      <Text className="font-ui text-center text-sm leading-5" style={{ color: colors.muted }}>
        {body}
      </Text>
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}

/** A screen for something that isn't there (or isn't yours): a line and a way back to Lessons. */
export function NotFound({ title, body }: { title: string; body: string }) {
  const router = useRouter();
  return (
    <LessonsScroll>
      <View className="pt-6">
        <EmptyBox title={title} body={body} action={<Button label="Lessons" kind="secondary" onPress={() => router.replace('/tool/lessons')} />} />
      </View>
    </LessonsScroll>
  );
}

/** A form's error line. */
export function ErrorLine({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  if (!children) return null;
  return (
    <Text className="font-ui text-sm" style={{ color: colors.danger }}>
      {children}
    </Text>
  );
}

/** A form field's label, with something small after it ("(optional)"). */
export function FieldLabel({ children, aside }: { children: ReactNode; aside?: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
      {children}
      {aside ? <Text className="font-ui text-xs">{` ${aside}`}</Text> : null}
    </Text>
  );
}

/** Lessons signed out (the website's): what it is for both sides, as the app's one sign-in gate. */
export function LessonsGate() {
  return (
    <SignInGateScreen
      Icon={LessonsIcon}
      title="Lessons, for teachers and students"
      body="A page for each student, with everything from their lessons. Free with an account."
      points={["Teach: notes, files, charts, assignments and routines", "See each student's practice, day by day", "Learn: open your teacher's link and it's all here"]}
    />
  );
}

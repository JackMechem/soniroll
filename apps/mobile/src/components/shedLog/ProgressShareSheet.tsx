import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addDays,
  dayReportCard,
  fromDateKey,
  goalOn,
  minutesOn,
  progressCard,
  todayKey,
  type PracticeLogData,
  type ProgressCardKind,
  type ProgressCardRange,
} from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type Svg from 'react-native-svg';

import { ChevronLeftIcon, ChevronRightIcon, ShareIcon, UsersIcon } from '@/components/icons';
import { ProgressCardView, cardHeadline, shareProgressCard } from '@/components/shedLog/ProgressCard';
import { ChoicePill, Field, GhostIcon, Muted } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { Button } from '@/components/ui';
import type { ProgressShareRequest } from '@/lib/progressShare';
import { useAppTheme } from '@/theme/ThemeProvider';

const KIND_OPTIONS: { value: ProgressCardKind; label: string }[] = [
  { value: 'streak', label: 'Streak' },
  { value: 'hours', label: 'Hours' },
  { value: 'year', label: 'Days' },
  // Not "Day": beside "Days" it read as the same thing (the website's wording).
  { value: 'day', label: 'Report' },
];

const RANGE_OPTIONS: { value: ProgressCardRange; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, '').split('\n')[0] : fallback);

/**
 * "Share your progress" on the phone (the website's `ProgressShareDialog`): pick a card — Streak,
 * Hours, Days (each for a week, month or year) or a day's Report — see it, send it as an image
 * through the system share sheet (Instagram, a chat, Save to photos…), or post it to Community with
 * a caption (`communityTunes.create`, kind "milestone": the same post the website makes; needs a
 * public profile). Mounted once in `ShedLogGlobal` and opened with `openProgressShare`.
 */
export function ProgressShareSheet({ data, request, onClose }: { data: PracticeLogData; request: ProgressShareRequest | null; onClose: () => void }) {
  const today = todayKey();
  const title = request?.celebrate ? (minutesOn(data, today) >= goalOn(data, today) ? 'Day complete!' : 'All tasks done!') : 'Share your progress';
  return (
    <ToolSheet visible={request !== null} onClose={onClose} title={title}>
      {/* Keyed by the request, so each opening starts from what was asked for. */}
      {request ? <ShareBody key={request.id} data={data} request={request} onClose={onClose} /> : null}
    </ToolSheet>
  );
}

function ShareBody({ data, request, onClose }: { data: PracticeLogData; request: ProgressShareRequest; onClose: () => void }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getMine, isAuthenticated ? {} : 'skip');
  const create = useMutation(api.communityTunes.create);
  const username = profile?.username || null;
  const canPost = isAuthenticated && !!profile?.isPublic && !!profile.username;

  const today = todayKey();
  // A 0-day streak card isn't much to share: open on Hours instead.
  const [kind, setKind] = useState<ProgressCardKind>(() =>
    request.kind === 'streak' && progressCard(data, today, 'streak').streak === 0 ? 'hours' : request.kind,
  );
  const [range, setRange] = useState<ProgressCardRange>('year');
  const [date, setDate] = useState(request.date && request.date <= today ? request.date : today);
  const card = useMemo(() => (kind === 'day' ? dayReportCard(data, date) : progressCard(data, today, kind, range)), [data, kind, range, date, today]);
  const head = cardHeadline(card);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<'post' | 'share' | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const svg = useRef<Svg>(null);

  const change = (fn: () => void) => {
    fn();
    setPosted(null);
    setNote(null);
  };

  async function shareImage() {
    setBusy('share');
    setNote(null);
    try {
      await shareProgressCard(svg.current, card);
    } catch (e) {
      setNote(errorText(e, "Couldn't share the image."));
    } finally {
      setBusy(null);
    }
  }

  async function post() {
    setBusy('post');
    setNote(null);
    try {
      const id = await create({ title: head.title, description: caption.trim(), tunes: [], kind: 'milestone', payload: card });
      setPosted(id);
      setCaption('');
    } catch (e) {
      setNote(errorText(e, "Couldn't post."));
    } finally {
      setBusy(null);
    }
  }

  const d = fromDateKey(date);

  return (
    <View style={{ gap: 16 }}>
      {request.celebrate ? <Muted>Every task done today. Here&apos;s your report to save or share.</Muted> : null}
      <View className="gap-2">
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel="Card">
          {KIND_OPTIONS.map((o) => (
            <ChoicePill key={o.value} label={o.label} on={kind === o.value} onPress={() => change(() => setKind(o.value))} />
          ))}
        </View>
        {kind === 'day' ? (
          <View className="flex-row items-center gap-1">
            <GhostIcon Icon={ChevronLeftIcon} label="Day before" onPress={() => change(() => setDate(addDays(date, -1)))} color={colors.foreground} />
            <Text numberOfLines={1} className="font-ui-semibold flex-1 text-center text-sm font-semibold" style={{ color: colors.foreground }}>
              {date === today ? 'Today' : `${WEEKDAY_NAMES[d.getDay()].slice(0, 3)}, ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`}
            </Text>
            {date < today ? (
              <GhostIcon Icon={ChevronRightIcon} label="Day after" onPress={() => change(() => setDate(addDays(date, 1)))} color={colors.foreground} />
            ) : (
              <View className="h-9 w-9" />
            )}
          </View>
        ) : kind === 'streak' ? null : (
          // A streak has no period (it's today's run of days).
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel="Range">
            {RANGE_OPTIONS.map((o) => (
              <ChoicePill key={o.value} label={o.label} on={range === o.value} onPress={() => change(() => setRange(o.value))} />
            ))}
          </View>
        )}
      </View>

      <View className="items-center" onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
        {width ? <ProgressCardView card={card} username={username} width={Math.min(width, 300)} svgRef={svg} /> : <View style={{ height: 375 }} />}
      </View>

      <Button label={busy === 'share' ? 'Making the image…' : 'Share image'} Icon={ShareIcon} onPress={() => void shareImage()} disabled={busy !== null} />

      <View className="gap-2" style={{ borderTopWidth: 1, borderColor: colors['surface-hover'], paddingTop: 16 }}>
        <View className="flex-row items-center gap-1.5">
          <UsersIcon color={colors.muted} size={16} />
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            Post to Community
          </Text>
        </View>
        {isAuthenticated && profile === undefined ? null : !canPost ? (
          <Muted>{isAuthenticated ? 'To post to Community, make your profile public in your account.' : 'Sign in to post to Community.'}</Muted>
        ) : posted ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Muted>Posted!</Muted>
            <Button
              label="View post"
              kind="secondary"
              onPress={() => {
                onClose();
                router.push({ pathname: '/post/[id]', params: { id: posted } });
              }}
            />
          </View>
        ) : (
          <>
            <Field value={caption} onChangeText={setCaption} placeholder="Say something (optional) — what's been working, what's next" multiline />
            <Button label={busy === 'post' ? 'Posting…' : 'Post'} kind="secondary" onPress={() => void post()} disabled={busy !== null} />
          </>
        )}
      </View>
      {note ? <Muted>{note}</Muted> : null}
    </View>
  );
}

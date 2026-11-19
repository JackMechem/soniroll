import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { googleCalendarUrl, zoneName, type Slot } from '@jam-practice/core/lessonSchedule';
import { useAction, useQuery } from 'convex/react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { CheckIcon } from '@/components/icons';
import { openUrl } from '@/components/lessons/files';
import { BookingIcon, EMAIL_RE, EmptyBox, ErrorLine, FieldLabel, LessonsScroll, PersonBadge, errorText, localTz, slotLabel } from '@/components/lessons/parts';
import { SlotGrid, lessonEvent } from '@/components/lessons/schedule';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Field, SmallButton } from '@/components/shedLog/parts';
import { useGradeColors } from '@/components/tool/ear';
import { Button } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * The times a teacher offered (`?offer=<token>`, the website's `/lessons/book`): pick one and it's
 * booked — the link is the key, so it works signed out too (with an email for the confirmation if
 * the teacher had none). Then the time, Google Calendar, and a way to your lessons.
 */
function BookScreen() {
  const { colors } = useAppTheme();
  const success = useGradeColors().correct;
  const router = useRouter();
  const { offer: token } = useLocalSearchParams<{ offer: string }>();
  const { isAuthenticated } = useConvexAuth();
  const offer = useQuery(api.lessonSchedule.offer, token ? { token } : 'skip');
  const book = useAction(api.lessonSchedule.bookOffer);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ slot: Slot; emailed: boolean } | null>(null);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await book({ token, start: picked.start, tz: localTz(), email: email.trim() || undefined });
      setBooked({ slot: picked, emailed: res.emailed });
    } catch (e) {
      setError(errorText(e, "Couldn't book that time."));
    } finally {
      setBusy(false);
    }
  }

  if (offer === undefined && token) return <ScreenSpinner />;
  if (!offer)
    return (
      <LessonsScroll>
        <Stack.Screen options={{ title: 'Pick a lesson time' }} />
        <View className="pt-6">
          <EmptyBox title="This link doesn't work" body="Ask your teacher to send you new lesson times." />
        </View>
      </LessonsScroll>
    );

  const done = booked ?? (offer.booking && offer.booking.status === 'confirmed' ? { slot: offer.booking, emailed: false } : null);
  const openLessons = () =>
    offer.joined
      ? router.replace({ pathname: '/tool/lessons-teacher', params: { id: offer.lessonId } })
      : offer.inviteCode
        ? router.replace({ pathname: '/tool/lessons-join', params: { invite: offer.inviteCode } })
        : router.replace('/tool/lessons');

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Pick a lesson time' }} />
      <LessonsScroll gap={20}>
        {done ? (
          <View className="gap-4 rounded-xl p-5" style={{ backgroundColor: colors.surface }}>
            <View className="gap-1">
              <View className="flex-row items-center gap-2">
                <CheckIcon color={success} size={22} />
                <Text className="font-ui-bold text-2xl font-bold" style={{ color: colors.foreground }}>
                  {booked ? "You're booked!" : 'This lesson is booked'}
                </Text>
              </View>
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                With {offer.teacher.name}
              </Text>
            </View>
            <Text className="font-ui-semibold rounded-lg px-4 py-3 text-base font-semibold" style={{ color: colors.foreground, backgroundColor: colors.background }}>
              {slotLabel(done.slot)}
            </Text>
            {booked ? (
              <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                {booked.emailed ? 'A confirmation with a calendar invite is on its way to your inbox.' : `${offer.teacher.name} has been told.`}
              </Text>
            ) : null}
            <View className="self-start">
              <SmallButton
                Icon={BookingIcon}
                label="Add to Google Calendar"
                onPress={() => openUrl(googleCalendarUrl(lessonEvent({ id: offer.booking?.id ?? `${token}-${done.slot.start}`, ...done.slot }, offer.teacher.name)))}
              />
            </View>
            {!offer.isTeacher ? <Button label={offer.joined ? `Open ${offer.teacher.name}'s lessons` : 'See your lessons'} onPress={openLessons} /> : null}
          </View>
        ) : (
          <View className="gap-5 rounded-xl p-5" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center gap-3">
              <PersonBadge url={offer.teacher.avatarUrl} name={offer.teacher.name} size="md" />
              <View className="flex-1">
                <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground }}>
                  Pick a lesson time
                </Text>
                <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                  {offer.teacher.name} offered {offer.studentName} {offer.slots.length === 1 ? 'this time' : 'these times'}
                </Text>
              </View>
            </View>
            {offer.isTeacher ? (
              <Text className="font-ui rounded-lg p-3 text-sm" style={{ color: colors.foreground, backgroundColor: colors.background }}>
                This is your own offer — send the link to {offer.studentName}.
              </Text>
            ) : null}
            {offer.message ? (
              <View className="gap-1 py-0.5 pl-3" style={{ borderLeftWidth: 2, borderColor: colors.accent }}>
                <Text className="font-ui text-sm" style={{ color: colors.foreground }}>
                  {offer.message}
                </Text>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  — {offer.teacher.name}
                </Text>
              </View>
            ) : null}
            {offer.status === 'withdrawn' ? (
              <EmptyBox body={`${offer.teacher.name} took these times back. Ask them for new ones.`} />
            ) : (
              <>
                <View className="gap-2">
                  <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                    Times in your time zone ({zoneName(localTz())})
                  </Text>
                  <SlotGrid slots={offer.slots} selected={picked ? [picked.start] : []} onToggle={(s) => setPicked((p) => (p?.start === s.start ? null : s))} emptyText="No times here." />
                  {offer.slots.every((s) => s.taken) ? <ErrorLine>All of these times have passed or been taken — ask {offer.teacher.name} for new ones.</ErrorLine> : null}
                </View>
                {!isAuthenticated && !offer.hasEmail ? (
                  <View className="gap-1.5">
                    <FieldLabel aside="(for the confirmation and calendar invite)">Your email</FieldLabel>
                    <Field value={email} onChangeText={setEmail} placeholder="you@example.com" />
                  </View>
                ) : null}
                <ErrorLine>{error}</ErrorLine>
                <Button
                  pill
                  label={busy ? 'Booking…' : picked ? `Book ${slotLabel(picked)}` : 'Pick a time'}
                  disabled={!picked || busy || offer.isTeacher || (!!email.trim() && !EMAIL_RE.test(email.trim()))}
                  onPress={() => void confirm()}
                />
              </>
            )}
          </View>
        )}
      </LessonsScroll>
    </View>
  );
}

export default withScreenLoader(BookScreen);

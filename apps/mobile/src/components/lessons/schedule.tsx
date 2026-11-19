import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { LESSON_LENGTHS, durationLabel, googleCalendarUrl, zoneName, type LessonEvent, type Slot } from '@jam-practice/core/lessonSchedule';
import { addDays, toDateKey } from '@jam-practice/core/practiceLog';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckIcon, CloseIcon, LinkIcon, PlusIcon } from '@/components/icons';
import { openUrl } from '@/components/lessons/files';
import {
  Badge,
  BookingIcon,
  DateTile,
  EMAIL_RE,
  EmptyBox,
  ErrorLine,
  FieldLabel,
  errorText,
  localTz,
  longDayLabel,
  offerUrl,
  plural,
  relWhen,
  shareLink,
  slotLabel,
  timeLabel,
  timeRange,
} from '@/components/lessons/parts';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { DateInput, TimeInput } from '@/components/shedLog/inputs';
import { ChoicePill, Field, Section, SmallButton } from '@/components/shedLog/parts';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useGradeColors } from '@/components/tool/ear';
import { Button } from '@/components/ui';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Booking lessons on the phone (the website's `components/lessons/schedule.tsx`): a pair's Booking
 * card (requests, booked times, offers, past lessons), accepting / declining / cancelling with a
 * message, offering times (teacher), requesting one (student), and the Lessons screen's "Needs you".
 * Calendar: "Google Calendar" opens the event in the browser. The website's .ics download is left
 * out — the app has no way to hand a file to the calendar yet (the emails carry the .ics anyway).
 */

export const bookRoute = (offer: string) => ({ pathname: '/tool/lessons-book' as const, params: { offer } });

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Times grouped by day as tappable chips. `selected` holds slot starts. */
export function SlotGrid({
  slots,
  selected,
  onToggle,
  emptyText = 'No open times.',
  maxDays,
  readOnly,
}: {
  slots: (Slot & { taken?: boolean })[];
  selected: number[];
  onToggle: (s: Slot) => void;
  emptyText?: string;
  maxDays?: number;
  readOnly?: boolean;
}) {
  const { colors, derived } = useAppTheme();
  const [showAll, setShowAll] = useState(false);
  const days = useMemo(() => {
    const out: { key: string; label: string; slots: (Slot & { taken?: boolean })[] }[] = [];
    for (const s of slots) {
      const k = dayKey(s.start);
      if (out[out.length - 1]?.key !== k) out.push({ key: k, label: longDayLabel(s.start), slots: [] });
      out[out.length - 1].slots.push(s);
    }
    return out;
  }, [slots]);
  if (days.length === 0) return <EmptyBox body={emptyText} />;
  const shown = maxDays && !showAll ? days.slice(0, maxDays) : days;
  return (
    <View className="gap-3">
      {shown.map((d) => (
        <View key={d.key} className="gap-1.5">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            {d.label}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {d.slots.map((s) => {
              const on = selected.includes(s.start);
              const off = !!s.taken;
              return (
                <Pressable
                  key={s.start}
                  disabled={off || readOnly}
                  onPress={() => onToggle(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: off }}
                  className="h-9 items-center justify-center rounded-lg px-3"
                  style={{ backgroundColor: on ? colors.accent : derived.fill, opacity: off ? 0.45 : 1 }}
                >
                  <Text
                    className="font-ui-semibold text-sm font-semibold"
                    style={{ color: on ? colors['accent-foreground'] : off ? colors.muted : colors.foreground, fontVariant: ['tabular-nums'], textDecorationLine: off ? 'line-through' : 'none' }}
                  >
                    {timeLabel(s.start)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {maxDays && days.length > maxDays ? (
        <Pressable onPress={() => setShowAll((v) => !v)} className="self-start py-1">
          <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
            {showAll ? 'Show fewer days' : `Show ${days.length - maxDays} more days`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function lessonEvent(b: { id: string; start: number; end: number }, other: string): LessonEvent {
  return { uid: `${b.id}@sheddex.com`, slot: { start: b.start, end: b.end }, title: `Lesson with ${other}`, description: `Lesson with ${other} (soniroll).` };
}

type Booking = {
  id: Id<'lessonBookings'>;
  lessonId: Id<'lessonStudents'>;
  start: number;
  end: number;
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled';
  source: 'request' | 'offer';
  note: string | null;
  reply: string | null;
  cancelledBy: 'teacher' | 'student' | null;
};

/** One lesson (or request) as a row: date tile, time, who, and what you can do with it. */
function BookingRow({ b, role, other, now, onOpen }: { b: Booking; role: 'teacher' | 'student'; other: string; now: number; onOpen?: () => void }) {
  const { colors } = useAppTheme();
  const grade = useGradeColors();
  const [dialog, setDialog] = useState<null | 'accept' | 'decline' | 'cancel'>(null);
  const live = b.start <= now && b.end > now;
  return (
    <View className="gap-2 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
      <Pressable onPress={onOpen} disabled={!onOpen} className="flex-row items-center gap-3">
        <DateTile ms={b.start} tone={b.status === 'confirmed' ? 'plain' : 'muted'} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {timeRange(b.start, b.end)}
            <Text className="font-ui text-sm" style={{ color: colors.muted }}>{` · ${durationLabel(b)}`}</Text>
          </Text>
          <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
            <Text style={{ color: colors.foreground }}>{other}</Text>
            {' · '}
            {live ? <Text style={{ color: grade.correct }}>Now</Text> : relWhen(b.start, now)}
          </Text>
        </View>
        {b.status === 'requested' ? <Badge tone="warn">{role === 'teacher' ? 'Requested' : 'Waiting'}</Badge> : null}
      </Pressable>
      {b.note ? (
        <Text className="font-ui pl-2 text-xs italic" style={{ color: colors.muted, borderLeftWidth: 2, borderColor: colors['surface-hover'] }}>
          “{b.note}”
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {b.status === 'requested' && role === 'teacher' ? (
          <>
            <SmallButton primary Icon={CheckIcon} label="Accept" onPress={() => setDialog('accept')} />
            <SmallButton label="Decline" onPress={() => setDialog('decline')} />
          </>
        ) : null}
        {b.status === 'requested' && role === 'student' ? <SmallButton label="Withdraw request" onPress={() => setDialog('cancel')} /> : null}
        {b.status === 'confirmed' ? (
          <>
            <SmallButton label="Google Calendar" Icon={BookingIcon} onPress={() => openUrl(googleCalendarUrl(lessonEvent(b, other)))} />
            {b.start > now ? <SmallButton danger label="Cancel" onPress={() => setDialog('cancel')} /> : null}
          </>
        ) : null}
      </View>
      <ToolSheet visible={!!dialog} onClose={() => setDialog(null)} title={dialogTitle(dialog, b, other)}>
        {dialog ? <BookingForm b={b} kind={dialog} other={other} onClose={() => setDialog(null)} /> : null}
      </ToolSheet>
    </View>
  );
}

function dialogTitle(kind: 'accept' | 'decline' | 'cancel' | null, b: Booking, other: string) {
  if (kind === 'accept') return `Accept ${other}'s request?`;
  if (kind === 'decline') return `Decline ${other}'s request?`;
  if (kind === 'cancel') return b.status === 'requested' ? 'Withdraw your request?' : `Cancel the lesson with ${other}?`;
  return '';
}

/** Accept / decline / cancel, with an optional message that goes in the email. */
function BookingForm({ b, kind, other, onClose }: { b: Booking; kind: 'accept' | 'decline' | 'cancel'; other: string; onClose: () => void }) {
  const { colors } = useAppTheme();
  const respond = useAction(api.lessonSchedule.respond);
  const cancel = useAction(api.lessonSchedule.cancel);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === 'accept' ? 'Accept and email them' : kind === 'decline' ? 'Decline' : b.status === 'requested' ? 'Withdraw' : 'Cancel lesson';
  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'cancel') await cancel({ bookingId: b.id, reason: msg.trim() || undefined });
      else await respond({ bookingId: b.id, accept: kind === 'accept', reply: msg.trim() || undefined });
      onClose();
    } catch (e) {
      setError(errorText(e, 'Something went wrong.'));
      setBusy(false);
    }
  }
  return (
    <>
      <Text className="font-ui-semibold rounded-lg px-3 py-2.5 text-sm font-semibold" style={{ color: colors.foreground, backgroundColor: colors.background }}>
        {slotLabel(b)}
      </Text>
      <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
        {kind === 'accept'
          ? `${other} gets an email with a calendar invite, and so do you.`
          : kind === 'decline'
            ? `${other} gets an email and can pick another time.`
            : `${other} gets an email${b.status === 'confirmed' ? ' (and a calendar update that removes it)' : ''}.`}
      </Text>
      <View className="gap-1.5">
        <FieldLabel aside="(optional, goes in the email)">A message</FieldLabel>
        <Field
          value={msg}
          onChangeText={setMsg}
          multiline
          placeholder={kind === 'accept' ? 'See you then! Bring your metronome.' : kind === 'decline' ? "Sorry, I'm away that week — how about Thursday?" : 'Something came up, sorry!'}
          label="A message"
        />
      </View>
      <ErrorLine>{error}</ErrorLine>
      <View className="flex-row justify-end gap-2">
        <Button label="Back" kind="secondary" onPress={onClose} />
        <Button
          label={busy ? 'Sending…' : label}
          disabled={busy}
          onPress={() => void go()}
          style={kind === 'accept' ? undefined : { backgroundColor: colors.danger }}
        />
      </View>
    </>
  );
}

/** A pair's Booking card (teacher's student screen, student's teacher screen): requests, booked
    times, offers, recent declines and cancels, past lessons, and Offer times / Request a lesson. */
export function ScheduleCard({ lessonId, now }: { lessonId: Id<'lessonStudents'>; now: number }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const data = useQuery(api.lessonSchedule.forLesson, { lessonId });
  const withdraw = useMutation(api.lessonSchedule.withdrawOffer);
  const [dialog, setDialog] = useState<null | 'offer' | 'request'>(null);
  const [showPast, setShowPast] = useState(false);

  if (data === undefined)
    return (
      <View className="items-center rounded-xl p-6" style={{ backgroundColor: colors.surface }}>
        <LoadingSpinner />
      </View>
    );
  if (!data) return null;
  const teacher = data.role === 'teacher';
  const other = teacher ? data.studentName : data.teacher.name;
  const requests = data.upcoming.filter((b) => b.status === 'requested');
  const booked = data.upcoming.filter((b) => b.status === 'confirmed');

  return (
    <Section
      icon={<BookingIcon color={colors.muted} size={16} />}
      title="Booking"
      action={
        teacher ? (
          <SmallButton primary Icon={PlusIcon} label="Offer times" onPress={() => setDialog('offer')} />
        ) : data.canRequest ? (
          <SmallButton primary Icon={PlusIcon} label="Request a lesson" onPress={() => setDialog('request')} />
        ) : undefined
      }
    >
      <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
        {requests.length > 0 ? (
          <View className="gap-1.5">
            <FieldLabel>{teacher ? 'Asked for' : 'Your requests'}</FieldLabel>
            {requests.map((b) => (
              <BookingRow key={b.id} b={b} role={data.role} other={other} now={now} />
            ))}
          </View>
        ) : null}
        {booked.length > 0 ? (
          <View className="gap-1.5">
            <FieldLabel>Booked times</FieldLabel>
            {booked.map((b) => (
              <BookingRow key={b.id} b={b} role={data.role} other={other} now={now} />
            ))}
          </View>
        ) : requests.length === 0 && data.offers.length === 0 ? (
          <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
            {teacher
              ? `Nothing booked. Offer ${other} a few times — they pick one from an email, and it's booked.`
              : data.canRequest
                ? `Nothing booked. Request one of ${other}'s open times.`
                : `Nothing booked yet. When ${other} offers you times, they show up here.`}
          </Text>
        ) : null}
        {data.offers.length > 0 ? (
          <View className="gap-1.5">
            <FieldLabel>{teacher ? 'Times you offered' : 'Times offered to you'}</FieldLabel>
            {data.offers.map((o) => (
              <View key={o.id} className="gap-2 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  {plural(o.slots.length, 'time')}
                  <Text className="font-ui text-sm" style={{ color: colors.muted }}>{` · first ${slotLabel(o.slots[0])}`}</Text>
                </Text>
                {teacher ? (
                  <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                    {o.sentAt && o.email ? `Emailed to ${o.email}` : 'Not emailed — send them the link'}
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-2">
                  {teacher ? (
                    <>
                      <SmallButton Icon={LinkIcon} label="Share link" onPress={() => void shareLink('Pick a lesson time', offerUrl(o.token))} />
                      <SmallButton label="Take back" onPress={() => void withdraw({ offerId: o.id })} />
                    </>
                  ) : (
                    <SmallButton primary label="Pick a time" onPress={() => router.push(bookRoute(o.token))} />
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {data.recent.length > 0 ? (
          <View className="gap-1">
            {data.recent.map((b) => (
              <Text key={b.id} className="font-ui text-xs" style={{ color: colors.muted, textDecorationLine: 'line-through' }}>
                {slotLabel(b)} — {b.status === 'declined' ? 'declined' : `cancelled${b.cancelledBy ? ` by ${b.cancelledBy === data.role ? 'you' : other}` : ''}`}
              </Text>
            ))}
          </View>
        ) : null}
        {data.past.length > 0 ? (
          <View className="gap-1">
            <Pressable onPress={() => setShowPast((v) => !v)} className="self-start py-1">
              <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                {showPast ? 'Hide past lessons' : 'Past lessons'}
              </Text>
            </Pressable>
            {showPast
              ? data.past.map((b) => (
                  <Text key={b.id} className="font-ui text-xs" style={{ color: colors.muted }}>
                    {slotLabel(b)}
                  </Text>
                ))
              : null}
          </View>
        ) : null}
        {teacher && !data.hasAvailability ? (
          <Pressable onPress={() => router.push('/tool/lessons-settings')} className="py-1">
            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
              Set your teaching hours so students can request lessons →
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ToolSheet visible={dialog === 'offer'} onClose={() => setDialog(null)} title={`Offer ${data.studentName} lesson times`}>
        {dialog === 'offer' ? <OfferTimesForm lessonId={lessonId} name={data.studentName} defaultEmail={data.studentEmail ?? ''} now={now} onClose={() => setDialog(null)} /> : null}
      </ToolSheet>
      <ToolSheet visible={dialog === 'request'} onClose={() => setDialog(null)} title={`Request a lesson with ${data.teacher.name}`}>
        {dialog === 'request' ? <RequestLessonForm lessonId={lessonId} teacherName={data.teacher.name} onClose={() => setDialog(null)} /> : null}
      </ToolSheet>
    </Section>
  );
}

/** Offer a student some times: tap them from your hours or add your own, then email the link. */
function OfferTimesForm({ lessonId, name, defaultEmail, now, onClose }: { lessonId: Id<'lessonStudents'>; name: string; defaultEmail: string; now: number; onClose: () => void }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [lengthMin, setLengthMin] = useState<number | null>(null);
  const free = useQuery(api.lessonSchedule.freeSlots, { lessonId, ...(lengthMin ? { lengthMin } : {}) });
  const offer = useAction(api.lessonSchedule.offerTimes);
  const [picked, setPicked] = useState<Slot[]>([]);
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; sentTo: string | null; emailFailed: boolean } | null>(null);
  const [customDate, setCustomDate] = useState(() => addDays(toDateKey(new Date(now)), 1));
  const [customTime, setCustomTime] = useState<string | null>('17:00');
  const len = lengthMin ?? free?.lengthMin ?? 60;

  function toggle(s: Slot) {
    setPicked((p) => (p.some((x) => x.start === s.start) ? p.filter((x) => x.start !== s.start) : [...p, s].sort((a, b) => a.start - b.start)));
  }
  function addCustom() {
    if (!customTime) return;
    const [y, m, d] = customDate.split('-').map(Number);
    const [hh, mm] = customTime.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm).getTime();
    if (!picked.some((x) => x.start === start)) setPicked((p) => [...p, { start, end: start + len * 60_000 }].sort((a, b) => a.start - b.start));
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      setDone(await offer({ lessonId, slots: picked, message, email: email.trim() || undefined, tz: localTz() }));
    } catch (e) {
      setError(errorText(e, "Couldn't offer those times."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const link = offerUrl(done.token);
    return (
      <>
        <Text className="font-ui text-sm leading-5" style={{ color: done.emailFailed ? colors.danger : colors.foreground }}>
          {done.sentTo && !done.emailFailed
            ? `Emailed to ${done.sentTo}. ${name} picks one and it's booked — you'll both get a calendar invite.`
            : done.emailFailed
              ? "The email didn't go out — send them the link instead."
              : `Send ${name} this link — they pick a time and it's booked.`}
        </Text>
        <View className="flex-row items-center gap-2 rounded-lg py-1 pl-3 pr-1" style={{ backgroundColor: colors.background }}>
          <Text numberOfLines={1} selectable className="font-ui flex-1 text-xs" style={{ color: colors.foreground }}>
            {link}
          </Text>
          <SmallButton primary label="Share" onPress={() => void shareLink('Pick a lesson time', link)} />
        </View>
        <View className="flex-row justify-end">
          <Button label="Done" onPress={onClose} />
        </View>
      </>
    );
  }

  return (
    <>
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        Pick a few times — {name} chooses one.
      </Text>
      <View className="gap-1.5">
        <FieldLabel>Length</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {LESSON_LENGTHS.map((m) => (
            <ChoicePill key={m} label={`${m} min`} on={len === m} onPress={() => setLengthMin(m)} />
          ))}
        </View>
      </View>
      {free === undefined ? (
        <LoadingSpinner />
      ) : free && free.slots.length > 0 ? (
        <SlotGrid slots={free.slots} selected={picked.map((p) => p.start)} onToggle={toggle} maxDays={5} />
      ) : (
        <EmptyBox
          body="No open times from your hours. Set your teaching hours, or add times below."
          action={
            <SmallButton
              label="Teaching hours"
              onPress={() => {
                onClose();
                router.push('/tool/lessons-settings');
              }}
            />
          }
        />
      )}
      <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
        <FieldLabel>Another time</FieldLabel>
        <DateInput value={customDate} onChange={setCustomDate} />
        <TimeInput value={customTime} onChange={setCustomTime} />
        <View className="self-start">
          <SmallButton Icon={PlusIcon} label="Add this time" onPress={addCustom} disabled={!customTime} />
        </View>
      </View>
      {picked.length > 0 ? (
        <View className="gap-1.5">
          <FieldLabel>{`Offering ${plural(picked.length, 'time')} (${zoneName(localTz())})`}</FieldLabel>
          <View className="flex-row flex-wrap gap-1.5">
            {picked.map((s) => (
              <Pressable
                key={s.start}
                onPress={() => toggle(s)}
                accessibilityLabel={`Remove ${slotLabel(s)}`}
                className="h-8 flex-row items-center gap-1 rounded-lg pl-2.5 pr-1.5"
                style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}
              >
                <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
                  {slotLabel(s)}
                </Text>
                <CloseIcon color={colors.accent} size={14} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View className="gap-1.5">
        <FieldLabel aside="(leave empty to just get a link)">Email it to</FieldLabel>
        <Field value={email} onChangeText={setEmail} placeholder={`${name}'s email`} />
        {email.trim() && !EMAIL_RE.test(email.trim()) ? <ErrorLine>That doesn&apos;t look like an email address.</ErrorLine> : null}
      </View>
      <View className="gap-1.5">
        <FieldLabel aside="(optional)">A note</FieldLabel>
        <Field value={message} onChangeText={setMessage} multiline placeholder="Here are a few times for next week." label="A note" />
      </View>
      <ErrorLine>{error}</ErrorLine>
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" kind="secondary" onPress={onClose} />
        <Button
          label={busy ? 'Sending…' : email.trim() ? 'Email these times' : 'Make the link'}
          disabled={picked.length === 0 || busy || (!!email.trim() && !EMAIL_RE.test(email.trim()))}
          onPress={() => void send()}
        />
      </View>
    </>
  );
}

/** A student asks for one of the teacher's open times. */
function RequestLessonForm({ lessonId, teacherName, onClose }: { lessonId: Id<'lessonStudents'>; teacherName: string; onClose: () => void }) {
  const { colors } = useAppTheme();
  const free = useQuery(api.lessonSchedule.freeSlots, { lessonId });
  const request = useAction(api.lessonSchedule.requestLesson);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await request({ lessonId, slot: { start: picked.start, end: picked.end }, note, tz: localTz() });
      setSent(true);
    } catch (e) {
      setError(errorText(e, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }

  if (sent && picked)
    return (
      <>
        <Text className="font-ui-semibold rounded-lg px-3 py-2.5 text-sm font-semibold" style={{ color: colors.foreground, backgroundColor: colors.background }}>
          {slotLabel(picked)}
        </Text>
        <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
          Request sent. {teacherName} gets an email to accept it. When they do, you&apos;ll get a confirmation with a calendar invite.
        </Text>
        <View className="flex-row justify-end">
          <Button label="Done" onPress={onClose} />
        </View>
      </>
    );

  return (
    <>
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {free ? `${free.lengthMin}-minute lessons · ` : ''}times in your time zone ({zoneName(localTz())})
      </Text>
      {free === undefined ? (
        <LoadingSpinner />
      ) : (
        <SlotGrid
          slots={free?.slots ?? []}
          selected={picked ? [picked.start] : []}
          onToggle={(s) => setPicked((p) => (p?.start === s.start ? null : s))}
          emptyText={`${teacherName} has no open times right now.`}
          maxDays={7}
        />
      )}
      <View className="gap-1.5">
        <FieldLabel aside="(optional)">A note</FieldLabel>
        <Field value={note} onChangeText={setNote} multiline placeholder="I'd like to work on the bridge of Stella." label="A note" />
      </View>
      <ErrorLine>{error}</ErrorLine>
      {picked ? (
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          {slotLabel(picked)}
        </Text>
      ) : null}
      <View className="flex-row justify-end gap-2">
        <Button label="Cancel" kind="secondary" onPress={onClose} />
        <Button label={busy ? 'Sending…' : 'Send request'} disabled={!picked || busy} onPress={() => void send()} />
      </View>
    </>
  );
}

/** The Lessons screen's "Needs you": requests to answer (teaching) and times you've been offered
    (learning). Nothing when there's nothing to do. */
export function ScheduleOverview({ now }: { now: number }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const data = useQuery(api.lessonSchedule.overview, {});
  if (!data) return null;
  const requests = data.asTeacher.filter((b) => b.status === 'requested');
  if (requests.length === 0 && data.offers.length === 0) return null;
  return (
    <Section icon={<View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.accent }} />} title="Needs you">
      <View className="gap-1.5 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
        {requests.map((b) => (
          <BookingRow key={b.id} b={b} role="teacher" other={b.studentName} now={now} onOpen={() => router.push({ pathname: '/tool/lessons-student', params: { id: b.lessonId } })} />
        ))}
        {data.offers.map((o) => (
          <View key={o.id} className="flex-row items-center gap-3 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
            <BookingIcon color={colors.muted} size={18} />
            <Text className="font-ui flex-1 text-sm" style={{ color: colors.foreground }}>
              <Text className="font-ui-semibold font-semibold">{o.teacher.name}</Text> offered you {plural(o.count, 'lesson time')}
            </Text>
            <SmallButton primary label="Pick a time" onPress={() => router.push(bookRoute(o.token))} />
          </View>
        ))}
      </View>
    </Section>
  );
}

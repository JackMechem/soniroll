import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '@jam-practice/convex/_generated/api';
import { FEATURE_INFO, type LessonFeatures } from '@jam-practice/core/lessonFiles';
import {
  DEFAULT_AVAILABILITY,
  LESSON_LENGTHS,
  WEEKDAYS,
  cleanAvailability,
  hhmmOf,
  minutesOf,
  openSlots,
  zoneName,
  type Availability,
  type WeeklyWindow,
} from '@jam-practice/core/lessonSchedule';
import { addDays, formatTime, toDateKey } from '@jam-practice/core/practiceLog';
import { useMutation, useQuery } from 'convex/react';
import { Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Dropdown } from '@/components/Dropdown';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { BookingIcon, ErrorLine, LessonsGate, LessonsScroll, dateKeyLabel, errorText, localTz } from '@/components/lessons/parts';
import { SlotGrid } from '@/components/lessons/schedule';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { DateInput } from '@/components/shedLog/inputs';
import { ChoicePill, Section, SmallButton } from '@/components/shedLog/parts';
import { SwitchRow } from '@/components/SwitchRow';
import { useGradeColors } from '@/components/tool/ear';
import { Button } from '@/components/ui';
import { useNowCoarse } from '@/lib/useClock';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** Monday first, the way most weeks are planned. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const LAST = 23 * 60 + 45;

/** Time zones to pick from (Hermes has no `Intl.supportedValuesOf`): the common ones, plus this
    phone's and the saved one. */
const ZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/St_Johns',
  'America/Mexico_City',
  'America/Bogota',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

/**
 * Lesson settings (the website's `/lessons/settings`): which parts of Lessons you use, for all your
 * students (they save at once), then — while booking is on — your teaching hours: ranges per
 * weekday in your time zone, lesson length, a break after each lesson, notice, how far ahead,
 * days off and whether students can request times, with a preview of the next open times.
 */
function SettingsScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <ScreenSpinner />;
  if (!isAuthenticated) return <LessonsGate />;
  return <SettingsLoader />;
}

export default withScreenLoader(SettingsScreen);

function SettingsLoader() {
  const saved = useQuery(api.lessonSchedule.myAvailability, {});
  const features = useQuery(api.lessons.myFeatures, {});
  if (saved === undefined || !features) return <ScreenSpinner />;
  return <Settings initial={saved ? cleanAvailability(saved, saved.timeZone) : { ...DEFAULT_AVAILABILITY, timeZone: localTz() }} features={features} />;
}

function Settings({ initial, features }: { initial: Availability; features: LessonFeatures }) {
  const { colors } = useAppTheme();
  const success = useGradeColors().correct;
  const now = useNowCoarse();
  const save = useMutation(api.lessonSchedule.saveAvailability);
  const setFeatures = useMutation(api.lessons.setFeatures);
  const [draft, setDraft] = useState<Availability>(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dayOff, setDayOff] = useState(() => addDays(toDateKey(new Date(now)), 7));
  const preview = useMemo(() => {
    try {
      // Two weeks is plenty for a preview of four days (each time is a few `Intl` calls, slow on Hermes).
      return openSlots({ ...draft, aheadDays: Math.min(draft.aheadDays, 14) }, [], now).slice(0, 40);
    } catch {
      return [];
    }
  }, [draft, now]);
  const zones = useMemo(() => [...new Set([draft.timeZone, localTz(), ...ZONES])], [draft.timeZone]);
  const zoneLabel = useMemo(() => zoneName(draft.timeZone), [draft.timeZone]);

  function patch(p: Partial<Availability>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    setStatus(null);
  }
  const windows = draft.windows;
  const setWindows = (w: WeeklyWindow[]) => patch({ windows: w });
  const dayWindows = (wd: number) => windows.map((w, i) => ({ w, i })).filter((x) => x.w.weekday === wd);

  function addRange(wd: number) {
    const mine = dayWindows(wd).map((x) => x.w);
    const last = mine[mine.length - 1];
    const start = last ? Math.min(minutesOf(last.end) + 60, 21 * 60) : 15 * 60;
    setWindows([...windows, { weekday: wd, start: hhmmOf(start), end: hhmmOf(Math.min(start + 3 * 60, LAST)) }]);
  }
  function copyToWeekdays(wd: number) {
    const mine = dayWindows(wd).map((x) => x.w);
    const others = [1, 2, 3, 4, 5].filter((d) => d !== wd);
    setWindows([...windows.filter((w) => !others.includes(w.weekday)), ...others.flatMap((d) => mine.map((w) => ({ ...w, weekday: d })))]);
  }

  async function submit() {
    const bad = draft.windows.find((w) => minutesOf(w.end) <= minutesOf(w.start));
    if (bad) {
      setStatus({ ok: false, text: `On ${WEEKDAYS[bad.weekday]}, a range ends before it starts.` });
      return;
    }
    setBusy(true);
    try {
      await save(draft);
      setDirty(false);
      setStatus({ ok: true, text: 'Saved.' });
    } catch (e) {
      setStatus({ ok: false, text: errorText(e, "Couldn't save.") });
    } finally {
      setBusy(false);
    }
  }

  const hours = windows.reduce((n, w) => n + (minutesOf(w.end) - minutesOf(w.start)) / 60, 0);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Lesson settings' }} />
      <LessonsScroll gap={20}>
        <Section title="Features">
          <View className="gap-4 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
            {FEATURE_INFO.map((f) => (
              <SwitchRow key={f.id} label={f.label} checked={features[f.id]} hint={f.text} onChange={(on) => void setFeatures({ features: { [f.id]: on } })} />
            ))}
            <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
              For all your students. Turning one off hides it for you and them — nothing is deleted. Routines that are off leave their Shed Logs; the days they logged stay.
            </Text>
          </View>
        </Section>

        {!features.scheduling ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            Lesson booking is off — turn it on above to set your teaching hours.
          </Text>
        ) : (
          <>
            <Section
              icon={<BookingIcon color={colors.muted} size={16} />}
              title="Teaching hours"
              count={windows.length ? `${Math.round(hours * 10) / 10} h a week` : undefined}
              action={<SmallButton primary label={busy ? 'Saving…' : dirty ? 'Save' : 'Saved'} disabled={!dirty || busy} onPress={() => void submit()} />}
            >
              {status ? (
                <Text className="font-ui text-sm" style={{ color: status.ok ? success : colors.danger }}>
                  {status.text}
                </Text>
              ) : null}
              <Text className="font-ui -mt-1 px-0.5 text-xs" style={{ color: colors.muted }}>
                When you usually teach — students request lessons from these times. In {draft.timeZone.replace(/_/g, ' ')} ({zoneLabel}).
              </Text>
              <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
                {WEEK.map((wd, idx) => {
                  const mine = dayWindows(wd);
                  return (
                    <View key={wd} className="gap-2 px-4 py-3" style={idx ? { borderTopWidth: 1, borderColor: colors['surface-hover'] } : undefined}>
                      <View className="flex-row items-center gap-3">
                        <Text className="font-ui-semibold flex-1 text-[15px] font-semibold" style={{ color: mine.length ? colors.foreground : colors.muted }}>
                          {WEEKDAYS[wd]}
                        </Text>
                        {!mine.length ? (
                          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                            Not teaching
                          </Text>
                        ) : null}
                        <Switch
                          value={mine.length > 0}
                          onValueChange={(on) => (on ? addRange(wd) : setWindows(windows.filter((w) => w.weekday !== wd)))}
                          accessibilityLabel={`Teach on ${WEEKDAYS[wd]}`}
                          trackColor={{ true: withAlpha(colors.accent, 0.45), false: withAlpha(colors.foreground, 0.15) }}
                          thumbColor={mine.length > 0 ? colors.accent : colors.muted}
                        />
                      </View>
                      {mine.map(({ w, i }) => (
                        <View key={i} className="flex-row items-center gap-2">
                          <TimeStep value={w.start} label={`${WEEKDAYS[wd]} from`} onChange={(v) => setWindows(windows.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
                            –
                          </Text>
                          <TimeStep value={w.end} label={`${WEEKDAYS[wd]} until`} onChange={(v) => setWindows(windows.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                          <Pressable onPress={() => setWindows(windows.filter((_, j) => j !== i))} accessibilityLabel="Remove these hours" hitSlop={6} className="h-9 w-8 items-center justify-center">
                            <CloseIcon color={colors.muted} size={18} />
                          </Pressable>
                        </View>
                      ))}
                      {mine.length > 0 ? (
                        <View className="flex-row gap-4">
                          <Pressable onPress={() => addRange(wd)} className="flex-row items-center gap-1 py-1">
                            <PlusIcon color={colors.muted} size={15} />
                            <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                              Add hours
                            </Text>
                          </Pressable>
                          {wd >= 1 && wd <= 5 ? (
                            <Pressable onPress={() => copyToWeekdays(wd)} className="py-1">
                              <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                                Copy to Mon–Fri
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Section>

            <Section title="Booking rules">
              <View className="gap-4 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
                <Pills label="Lesson length" value={draft.lengthMin} options={LESSON_LENGTHS.map((m) => ({ value: m, label: `${m} min` }))} onChange={(lengthMin) => patch({ lengthMin })} />
                <Pills label="Break after each lesson" value={draft.bufferMin} options={[0, 5, 10, 15, 30, 45, 60].map((m) => ({ value: m, label: m ? `${m} min` : 'None' }))} onChange={(bufferMin) => patch({ bufferMin })} />
                <Pills
                  label="Minimum notice"
                  value={draft.noticeHours}
                  options={[0, 2, 6, 12, 24, 48, 72, 168].map((h) => ({ value: h, label: h === 0 ? 'None' : h < 24 ? `${h} h` : h === 168 ? '1 week' : `${h / 24} day${h === 24 ? '' : 's'}` }))}
                  onChange={(noticeHours) => patch({ noticeHours })}
                />
                <Pills
                  label="Book up to"
                  value={draft.aheadDays}
                  options={[7, 14, 21, 28, 42, 60, 90].map((d) => ({ value: d, label: d % 7 === 0 ? `${d / 7} week${d === 7 ? '' : 's'}` : `${d} days` }))}
                  onChange={(aheadDays) => patch({ aheadDays })}
                />
                <View className="gap-1.5">
                  <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                    Time zone
                  </Text>
                  <View className="self-start">
                    <Dropdown value={draft.timeZone} options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} onChange={(timeZone) => patch({ timeZone })} />
                  </View>
                </View>
                <SwitchRow
                  label="Let students request lessons from these hours"
                  checked={draft.allowRequests}
                  onChange={(allowRequests) => patch({ allowRequests })}
                  hint="You accept or decline each request. Off: you can still offer times by email."
                />
              </View>
            </Section>

            <Section title="Days off">
              <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  Holidays, gigs, time away — nobody can book these days.
                </Text>
                <DateInput value={dayOff} onChange={setDayOff} />
                <View className="self-start">
                  <SmallButton
                    Icon={PlusIcon}
                    label="Add day off"
                    disabled={draft.blockedDates.includes(dayOff)}
                    onPress={() => patch({ blockedDates: [...draft.blockedDates, dayOff].sort() })}
                  />
                </View>
                {draft.blockedDates.length > 0 ? (
                  <View className="flex-row flex-wrap gap-1.5">
                    {draft.blockedDates.map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => patch({ blockedDates: draft.blockedDates.filter((x) => x !== d) })}
                        accessibilityLabel={`Remove ${dateKeyLabel(d)}`}
                        className="h-8 flex-row items-center gap-1 rounded-lg pl-2.5 pr-1.5"
                        style={{ backgroundColor: colors.background }}
                      >
                        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
                          {dateKeyLabel(d)}
                        </Text>
                        <CloseIcon color={colors.muted} size={14} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </Section>

            <Section title="What students see">
              <View className="gap-3 rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
                <Text className="font-ui text-xs" style={{ color: colors.muted }}>
                  The next open times before any lessons are booked, in this phone&apos;s time zone.{draft.allowRequests ? '' : ' Requests are off.'}
                </Text>
                <SlotGrid slots={preview} selected={[]} onToggle={() => {}} readOnly emptyText="Add some weekly hours to open times." maxDays={4} />
              </View>
            </Section>
            <ErrorLine>{status && !status.ok ? status.text : null}</ErrorLine>
            <Button label={busy ? 'Saving…' : dirty ? 'Save teaching hours' : 'Saved'} disabled={!dirty || busy} onPress={() => void submit()} />
          </>
        )}
      </LessonsScroll>
    </View>
  );
}

/** A time of day, stepped by 15 minutes. */
function TimeStep({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { colors, derived } = useAppTheme();
  const mins = Number.isFinite(minutesOf(value)) ? minutesOf(value) : 0;
  const step = (d: number) => onChange(hhmmOf(Math.max(0, Math.min(LAST, Math.round((mins + d) / 15) * 15))));
  return (
    <View className="flex-1 flex-row items-center overflow-hidden rounded-lg" style={{ backgroundColor: derived.fill }} accessibilityLabel={label}>
      <StepButton label={`${label}: 15 minutes earlier`} onPress={() => step(-15)}>
        −
      </StepButton>
      <Text className="font-ui-semibold flex-1 text-center text-sm font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
        {formatTime(mins)}
      </Text>
      <StepButton label={`${label}: 15 minutes later`} onPress={() => step(15)}>
        +
      </StepButton>
    </View>
  );
}

function StepButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button" android_ripple={{ color: colors['surface-hover'] }} className="h-10 w-9 items-center justify-center">
      <Text className="font-ui-semibold text-lg font-semibold" style={{ color: colors.foreground }}>
        {children}
      </Text>
    </Pressable>
  );
}

function Pills<T extends number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((o) => (
          <ChoicePill key={o.value} label={o.label} on={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

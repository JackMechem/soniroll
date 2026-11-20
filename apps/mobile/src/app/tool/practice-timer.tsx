import { describeSession, newSegment, type PracticeSession } from '@jam-practice/core/practiceTimer';
import { Stack } from 'expo-router';
import { Fragment, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, SpeakerIcon, StopIcon, StopwatchIcon, TrashIcon, type IconProps } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { blankDraft, draftFromSession, PracticeSessionEditor, type Draft } from '@/components/PracticeSessionEditor';
import { PracticeTimerRing } from '@/components/PracticeTimerRing';
import { SwitchRow } from '@/components/SwitchRow';
import { BigButton, StepperPill } from '@/components/tool/meter';
import { PillButton } from '@/components/tool/rhythm';
import { SettingChip, SettingsBar, TOOL_CONTENT } from '@/components/tool/SettingChip';
import { Card, EmptyState } from '@/components/ui';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { getSnapshot, pause, resume, skip, start, stop, subscribe, type EngineState } from '@/lib/practiceTimerEngine';
import { usePracticeSessions, type SessionInput } from '@/lib/usePracticeSessions';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';

const SOUND_SETTINGS_KEY = 'jam-practice-timer-sound-settings';
const DEFAULT_SOUND_SETTINGS = { soundEnabled: true, alarmMode: false, fullScreenAlert: false };

/**
 * The Practice Timer, laid out like the website's (`apps/web/components/PracticeTimer.tsx`).
 * Running: what's playing ("Now running", the step's name, the ring, what's next) and round
 * Pause/Resume/Continue, Skip and Stop buttons. Stopped: what it is (and that its time goes into
 * the Shed Log), a quick timer (minutes and Start — a plain countdown, not saved, like the
 * website's), the Sound chip, then your saved sessions in a card (start, edit, delete each, and
 * New) or an empty state offering a new one. Saved sessions
 * sync to the same Convex `practiceSessions` table the website uses (`lib/usePracticeSessions.ts`,
 * with an offline `AsyncStorage` fallback); notifications and the alarm live in
 * `lib/practiceTimerEngine.ts`. The session editor takes the whole screen (the website opens it in
 * a popover; on a phone a long form with a keyboard is better as its own page).
 */
function PracticeTimerScreen() {
  const { colors } = useAppTheme();
  const { sessions, loading, createSession, updateSession, deleteSession } = usePracticeSessions();
  const engineState = useSyncExternalStore(subscribe, getSnapshot) as EngineState | null;
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
  const { soundEnabled, alarmMode, fullScreenAlert } = settings;
  const [draft, setDraft] = useState<Draft | null>(null);
  // The quick timer's length: a plain countdown, no session needed. Not saved (as on the website).
  const [quickMinutes, setQuickMinutes] = useState(10);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startSession(session: PracticeSession) {
    start(session, soundEnabled, alarmMode, fullScreenAlert);
  }

  // Full-screen alert only means anything while alarm mode is also on — turning alarm mode off
  // turns this back off too, rather than leaving it toggled on but dormant.
  function setAlarmMode(next: boolean) {
    updateSettings(next ? { alarmMode: next } : { alarmMode: next, fullScreenAlert: false });
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const name = draft.name.trim() || 'Untitled session';
      if (draft.id === null) {
        const input: SessionInput =
          draft.type === 'custom'
            ? { name, type: 'custom', segments: draft.segments }
            : { name, type: 'pomodoro', pomodoro: draft.pomodoro };
        await createSession(input);
      } else {
        const session: PracticeSession =
          draft.type === 'custom'
            ? { id: draft.id, name, type: 'custom', segments: draft.segments, updatedAt: 0 }
            : { id: draft.id, name, type: 'pomodoro', pomodoro: draft.pomodoro, updatedAt: 0 };
        await updateSession(session);
      }
      setDraft(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingId) return;
    await deleteSession(deletingId);
    setDeletingId(null);
  }

  // Saved settings not read yet — a spinner rather than defaults that then jump to the real values.
  if (!settingsReady) return <ScreenSpinner />;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Practice Timer' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        {draft ? (
          <PracticeSessionEditor draft={draft} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} saving={saving} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={TOOL_CONTENT}>
            {engineState ? (
              <RunningView engineState={engineState} />
            ) : (
              <QuickTimer
                minutes={quickMinutes}
                onChange={setQuickMinutes}
                onStart={() =>
                  startSession({
                    id: 'quick-timer',
                    name: '',
                    type: 'custom',
                    segments: [{ ...newSegment(), title: `${quickMinutes} min timer`, minutes: quickMinutes }],
                    updatedAt: 0,
                  })
                }
              />
            )}

            <SettingsBar>
              <SettingChip Icon={SpeakerIcon} label="Sound" value={soundEnabled ? (alarmMode ? 'Alarm' : 'Chime') : 'Off'}>
                <SwitchRow
                  label="Sound feedback"
                  checked={soundEnabled}
                  onChange={(v) => updateSettings({ soundEnabled: v })}
                  hint="Plays a chime and a quick vibration each time a segment ends, a notification sound, and a repeating chime + vibration while an alarm is holding."
                />
                <SwitchRow
                  label="Alarm mode"
                  checked={alarmMode}
                  onChange={setAlarmMode}
                  hint="Instead of moving on automatically, holds at the end of each segment and keeps chiming/vibrating until you dismiss it — from here, the running timer's own controls, or the widget while it's running."
                />
                <SwitchRow
                  label="Full-screen alert"
                  checked={fullScreenAlert}
                  onChange={(v) => updateSettings({ fullScreenAlert: v })}
                  disabled={!alarmMode}
                  hint="Also shows a full-screen prompt when the alarm goes off, wherever you are in the app — not just a chime. Only applies while alarm mode is on."
                />
                <ReliabilityHints />
              </SettingChip>
            </SettingsBar>

            {!engineState ? (
              <SavedSessions
                sessions={sessions}
                loading={loading}
                onStart={startSession}
                onEdit={(s) => setDraft(draftFromSession(s))}
                onDelete={(id) => setDeletingId(id)}
                onNew={() => setDraft(blankDraft())}
              />
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>

      <ConfirmDialog
        visible={deletingId !== null}
        title="Delete session?"
        message="This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </View>
  );
}

function RunningView({ engineState }: { engineState: EngineState }) {
  const { colors } = useAppTheme();
  const { alarming, paused, next, index } = engineState;
  return (
    <View className="items-center gap-5">
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: alarming ? colors.danger : colors.muted }}>
        {alarming ? "Time's up" : paused ? 'Paused' : 'Now running'}
      </Text>
      <Text className="font-ui-semibold text-center text-3xl font-semibold tracking-tight" style={{ color: colors.foreground }}>
        {engineState.current.title}
      </Text>
      <PracticeTimerRing
        startedAt={engineState.startedAt}
        durationMs={engineState.durationMs}
        paused={paused}
        remainingMsAtPause={engineState.remainingMsAtPause}
        alarming={alarming}
      />
      {next ? (
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Next: {next.title}
        </Text>
      ) : index > 0 ? (
        // Only for a session with steps before this one; a single timer has nothing to add.
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          Last step of this session.
        </Text>
      ) : null}
      {/* Round buttons like the Start that began the run: the main one (Pause, Resume or Continue)
          is filled. Skip only shows when there's a next step. */}
      <View className="flex-row flex-wrap items-center justify-center gap-3">
        {alarming ? (
          <PillButton primary label="Continue" Icon={PlayIcon} onPress={skip} />
        ) : paused ? (
          <PillButton primary label="Resume" Icon={PlayIcon} onPress={resume} />
        ) : (
          <PillButton primary label="Pause" Icon={PauseIcon} onPress={pause} />
        )}
        {!alarming && next ? <PillButton label="Skip" onPress={skip} /> : null}
        <PillButton danger label="Stop" Icon={StopIcon} onPress={stop} />
      </View>
    </View>
  );
}

/** Stopped: what the tool is, then the quick timer — minutes and the big Start. */
function QuickTimer({ minutes, onChange, onStart }: { minutes: number; onChange: (n: number) => void; onStart: () => void }) {
  const { colors } = useAppTheme();
  return (
    <View className="items-center gap-5">
      <Text className="font-ui max-w-xs text-center text-sm leading-5" style={{ color: colors.muted }}>
        Time your practice: one countdown, or a saved session of steps. Signed in, the time goes into your Shed Log.
      </Text>
      <View className="items-center gap-2">
        <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
          Quick timer
        </Text>
        <StepperPill value={minutes} onChange={(n) => onChange(Math.min(180, Math.max(1, n)))} min={1} max={180} unit={['minute', 'minutes']} label="Quick timer minutes" onPage />
      </View>
      <BigButton label="Start" onPress={onStart} icon={<PlayIcon color={colors['accent-foreground']} size={18} />} />
    </View>
  );
}

/** Stopped: the saved sessions in a card (start, edit, delete each; New), or an empty state. */
function SavedSessions({
  sessions,
  loading,
  onStart,
  onEdit,
  onDelete,
  onNew,
}: {
  sessions: PracticeSession[];
  loading: boolean;
  onStart: (session: PracticeSession) => void;
  onEdit: (session: PracticeSession) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const { colors, derived } = useAppTheme();
  if (loading) return <LoadingSpinner />;
  if (sessions.length === 0) {
    return (
      <EmptyState
        Icon={StopwatchIcon}
        title="No saved sessions yet"
        body="Chain timers back to back, or run a Pomodoro."
        action={{ label: 'New session', Icon: PlusIcon, onPress: onNew }}
      />
    );
  }
  return (
    <Card title="Saved sessions" action={{ label: 'New', onPress: onNew }}>
      <View className="-mx-4 -mb-1">
        {sessions.map((session, i) => {
          const name = session.name || 'Untitled session';
          return (
            <Fragment key={session.id}>
              {i > 0 ? <View className="mx-4 h-px" style={{ backgroundColor: derived.hairline }} /> : null}
              <View className="flex-row items-center gap-1 py-1.5 pl-4 pr-2">
                <Pressable onPress={() => onStart(session)} accessibilityRole="button" accessibilityLabel={`Start ${name}`} className="min-w-0 flex-1 py-1">
                  <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
                    {name}
                  </Text>
                  <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                    {describeSession(session)}
                  </Text>
                </Pressable>
                <RowIconButton Icon={PlayIcon} color={colors.accent} label={`Start ${name}`} onPress={() => onStart(session)} />
                <RowIconButton Icon={PencilIcon} color={colors.muted} label={`Edit ${name}`} onPress={() => onEdit(session)} />
                <RowIconButton Icon={TrashIcon} color={colors.muted} label={`Delete ${name}`} onPress={() => onDelete(session.id)} />
              </View>
            </Fragment>
          );
        })}
      </View>
    </Card>
  );
}

function RowIconButton({ Icon, color, label, onPress }: { Icon: React.ComponentType<IconProps>; color: string; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg"
    >
      <Icon color={color} size={19} />
    </Pressable>
  );
}

/** Two nudges toward reliability fixes this app can't apply from JS alone, both Android-only:
    1. **Exact alarms** — `SCHEDULE_EXACT_ALARM` is only a request on Android 12+; the user grants
       "Alarms & reminders" by hand. `android.settings.REQUEST_SCHEDULE_EXACT_ALARM` opens that
       screen for this app (no `package:` URI needed, so `Linking.sendIntent` can fire it); it
       doesn't exist below API 31, hence the catch.
    2. **Battery optimization** — a phone's "sleeping apps" policy can still delay a correctly
       scheduled notification. There's no standard intent for it without a `package:` URI, so this
       opens the app's settings page and says what to look for. */
function ReliabilityHints() {
  const { colors } = useAppTheme();
  if (Platform.OS !== 'android') return null;
  return (
    <View className="gap-3 rounded-lg p-3" style={{ backgroundColor: colors.background }}>
      <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
        If notifications or the sound feel inconsistent, two phone settings outside this app are the usual cause.
      </Text>
      <ReliabilityRow
        title="Alarms & reminders"
        text="Lets segment-end notifications fire at the exact time instead of being delayed."
        action="Allow exact alarms"
        onPress={() => {
          Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() => {
            // Not available below Android 12 — nothing to open, nothing to do.
          });
        }}
      />
      <ReliabilityRow
        title="Battery"
        text={'Open this app’s settings, then look for "Battery" → "Unrestricted" (wording varies by phone).'}
        action="Open app settings"
        onPress={() => void Linking.openSettings()}
      />
    </View>
  );
}

function ReliabilityRow({ title, text, action, onPress }: { title: string; text: string; action: string; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <View className="gap-1">
      <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
        {title}
      </Text>
      <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
        {text}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        android_ripple={{ color: colors['surface-hover'] }}
        className="mt-1 h-9 justify-center self-start overflow-hidden rounded-lg px-3"
        style={{ backgroundColor: derived.fill }}
      >
        <Text className="font-ui-semibold text-xs font-semibold" style={{ color: colors.accent }}>
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

export default withScreenLoader(PracticeTimerScreen);

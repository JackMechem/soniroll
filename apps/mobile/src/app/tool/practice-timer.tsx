import { describeSession, newSegment, type PracticeSession } from '@jam-practice/core/practiceTimer';
import { Stack } from 'expo-router';
import { Fragment, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, SpeakerIcon, StopIcon, StopwatchIcon, ToolsIcon, TrashIcon, type IconProps } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { blankDraft, draftFromSession, PracticeSessionEditor, type Draft } from '@/components/PracticeSessionEditor';
import { PracticeTimerRing } from '@/components/PracticeTimerRing';
import { SwitchRow } from '@/components/SwitchRow';
import { BigButton, StepButton } from '@/components/tool/meter';
import { SettingChip, SettingsBar } from '@/components/tool/SettingChip';
import { ToolFrame } from '@/components/tool/ToolFrame';
import { Card, EmptyState } from '@/components/ui';
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY } from '@/lib/practiceTimerSound';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { getSnapshot, pause, resume, skip, start, stop, subscribe, type EngineState } from '@/lib/practiceTimerEngine';
import { usePracticeSessions, type SessionInput } from '@/lib/usePracticeSessions';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { useKeepAwakeWhile } from '@/lib/useKeepAwake';
import { TextInput } from '@/components/ThemedTextInput';


/**
 * The Practice Timer, laid out like the website's (`apps/web/components/PracticeTimer.tsx`).
 * On `ToolFrame`. Running: what's playing ("Now running", the step's name, the ring, what's next)
 * in the middle; Pause/Resume/Continue, Skip and Stop in the footer over the Sound chip. Stopped:
 * a quick timer (minutes between round − / +; Start in the footer — a plain countdown, not saved,
 * like the website's), then your saved sessions in a card (start, edit, delete each, and New) or
 * an empty state offering a new one. What the tool is (and that its time goes into the Shed Log)
 * is in the intro (`introNotes.ts`). Saved sessions
 * sync to the same Convex `practiceSessions` table the website uses (`lib/usePracticeSessions.ts`,
 * with an offline `AsyncStorage` fallback); notifications and the alarm live in
 * `lib/practiceTimerEngine.ts`. The session editor takes the whole screen (the website opens it in
 * a popover; on a phone a long form with a keyboard is better as its own page). A step can have a
 * tool (picked in the editor; a Shed Log task's first attached tool) that opens when the step
 * starts, wherever you are (`lib/useOpenStepTools.ts`), unless the Tools chip turns that off.
 */
function PracticeTimerScreen() {
  const { colors } = useAppTheme();
  const { sessions, loading, createSession, updateSession, deleteSession } = usePracticeSessions();
  const engineState = useSyncExternalStore(subscribe, getSnapshot) as EngineState | null;
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
  const { soundEnabled, alarmMode, fullScreenAlert, openTools } = settings;
  const [draft, setDraft] = useState<Draft | null>(null);
  // The quick timer's length: a plain countdown, no session needed. Not saved (as on the website).
  const [quickMinutes, setQuickMinutes] = useState(10);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The screen stays on while a timer counts (not while it's paused).
  useKeepAwakeWhile(engineState !== null && !engineState.paused);

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

  const startQuick = () =>
    startSession({
      id: 'quick-timer',
      name: '',
      type: 'custom',
      segments: [{ ...newSegment(), title: `${quickMinutes} min timer`, minutes: quickMinutes }],
      updatedAt: 0,
    });

  const dialogs = (
    <ConfirmDialog
      visible={deletingId !== null}
      title="Delete session?"
      message="This can't be undone."
      confirmLabel="Delete"
      onConfirm={confirmDelete}
      onCancel={() => setDeletingId(null)}
    />
  );

  // The session editor takes the whole screen (a long form with a keyboard).
  if (draft) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'Practice Timer' }} />
        <SafeAreaView className="flex-1" edges={['bottom']}>
          <PracticeSessionEditor draft={draft} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} saving={saving} />
        </SafeAreaView>
        {dialogs}
      </View>
    );
  }

  return (
    <ToolFrame
      title="Practice Timer"
      action={
        engineState ? (
          <RunningControls engineState={engineState} />
        ) : (
          <BigButton label="Start" onPress={startQuick} icon={<PlayIcon color={colors['accent-foreground']} size={18} />} />
        )
      }
      chips={
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
          <SettingChip
            Icon={ToolsIcon}
            label="Tools"
            value={openTools ? 'Open on start' : 'Off'}
            toggle={{ checked: openTools, onChange: (v) => updateSettings({ openTools: v }) }}
          >
            <SwitchRow
              label="Open each step's tool"
              checked={openTools}
              onChange={(v) => updateSettings({ openTools: v })}
              hint="When a step with a tool starts, that tool opens, wherever you are in the app. Pick a step's tool in the session editor; a Shed Log task's tool (the first one attached) opens when it starts too."
            />
          </SettingChip>
        </SettingsBar>
      }
      gap={24}
    >
      {engineState ? (
        <RunningView engineState={engineState} />
      ) : (
        <>
          <QuickTimer minutes={quickMinutes} onChange={setQuickMinutes} />
          <View className="w-full">
            <SavedSessions
              sessions={sessions}
              loading={loading}
              onStart={startSession}
              onEdit={(s) => setDraft(draftFromSession(s))}
              onDelete={(id) => setDeletingId(id)}
              onNew={() => setDraft(blankDraft())}
            />
          </View>
        </>
      )}
      {dialogs}
    </ToolFrame>
  );
}

/** Running: what's playing ("Now running", the step's name, the ring, what's next). Its buttons
    are in the footer (`RunningControls`). */
function RunningView({ engineState }: { engineState: EngineState }) {
  const { colors } = useAppTheme();
  const { alarming, paused, next, index } = engineState;
  return (
    <View className="items-center gap-4">
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
    </View>
  );
}

/** The running timer's buttons, in the footer: the main one (Pause, Resume or Continue) filled,
    then Skip (only when there's a next step) and Stop. */
function RunningControls({ engineState }: { engineState: EngineState }) {
  const { colors } = useAppTheme();
  const { alarming, paused, next } = engineState;
  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        {alarming ? (
          <BigButton label="Continue" onPress={skip} icon={<PlayIcon color={colors['accent-foreground']} size={18} />} />
        ) : paused ? (
          <BigButton label="Resume" onPress={resume} icon={<PlayIcon color={colors['accent-foreground']} size={18} />} />
        ) : (
          <BigButton label="Pause" onPress={pause} icon={<PauseIcon color={colors['accent-foreground']} size={18} />} />
        )}
      </View>
      {!alarming && next ? (
        <View className="flex-1">
          <BigButton label="Skip" secondary onPress={skip} />
        </View>
      ) : null}
      <View className="flex-1">
        <BigButton label="Stop" secondary onPress={stop} icon={<StopIcon color={colors.danger} size={18} />} />
      </View>
    </View>
  );
}

/** Stopped: the quick timer's length — a plain countdown, not saved — as a big number between
    round − / + buttons (Start is in the footer). The number can be typed. */
function QuickTimer({ minutes, onChange }: { minutes: number; onChange: (n: number) => void }) {
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const set = (n: number) => onChange(Math.min(180, Math.max(1, Math.round(n))));
  const commit = () => {
    if (draft !== null && draft.trim() !== '') {
      const n = Number(draft);
      if (Number.isFinite(n)) set(n);
    }
    setDraft(null);
  };
  return (
    <View className="items-center gap-1">
      <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        Quick timer
      </Text>
      <View className="flex-row items-center gap-3">
        <StepButton label="Fewer minutes" onPress={() => set(minutes - 1)} disabled={minutes <= 1}>
          −
        </StepButton>
        <TextInput
          value={draft ?? String(minutes)}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          selectTextOnFocus
          keyboardType="number-pad"
          returnKeyType="done"
          accessibilityLabel="Quick timer minutes"
          className="font-ui-bold w-32 text-center text-6xl font-bold tracking-tight"
          style={{ color: colors.foreground, padding: 0, fontVariant: ['tabular-nums'] }}
        />
        <StepButton label="More minutes" onPress={() => set(minutes + 1)} disabled={minutes >= 180}>
          +
        </StepButton>
      </View>
      <Text className="font-ui text-sm" style={{ color: colors.muted }}>
        {minutes === 1 ? 'minute' : 'minutes'}
      </Text>
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

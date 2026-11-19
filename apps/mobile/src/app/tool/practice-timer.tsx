import { describeSession, type PracticeSession } from '@jam-practice/core/practiceTimer';
import { Stack } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SkipForwardIcon,
  SlidersIcon,
  StopIcon,
  StopwatchIcon,
  TrashIcon,
} from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { blankDraft, draftFromSession, PracticeSessionEditor, type Draft } from '@/components/PracticeSessionEditor';
import { PracticeTimerRing } from '@/components/PracticeTimerRing';
import { SwitchRow } from '@/components/SwitchRow';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import { useSyncedSettings } from '@/lib/useSyncedSettings';
import { getSnapshot, pause, resume, skip, start, stop, subscribe, type EngineState } from '@/lib/practiceTimerEngine';
import { usePracticeSessions, type SessionInput } from '@/lib/usePracticeSessions';
import { useAppTheme } from '@/theme/ThemeProvider';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';

const SOUND_SETTINGS_KEY = 'jam-practice-timer-sound-settings';
const DEFAULT_SOUND_SETTINGS = { soundEnabled: true, alarmMode: false, fullScreenAlert: false };

/**
 * Native port of `apps/web/components/PracticeTimer.tsx`. Saved sessions sync to the *same*
 * Convex `practiceSessions` table web uses (`lib/usePracticeSessions.ts`), with this app's own
 * offline-first `AsyncStorage` fallback layered on top for the signed-out/offline case (see that
 * hook's own doc comment). Notifications and the repeating-vibration alarm are handled entirely by
 * `lib/practiceTimerEngine.ts` — this screen just reflects whatever it reports.
 *
 * Follows the same screen shape Metronome established: a running session's main display (the
 * ring, current/next step, transport controls) fits one screen with no scrolling, with a Sound
 * options button in the same top-right spot. The *idle* view — a library of saved sessions to
 * pick from — is inherently a variable-length list, so unlike Metronome's own always-small control
 * set, it scrolls like any normal list once there's more than a screen's worth; that's the session
 * editor's own content area too.
 */
function PracticeTimerScreen() {
  const { colors } = useAppTheme();
  const { sessions, loading, createSession, updateSession, deleteSession } = usePracticeSessions();
  const engineState = useSyncExternalStore(subscribe, getSnapshot) as EngineState | null;
  const [settings, updateSettings, settingsReady] = useSyncedSettings(SOUND_SETTINGS_KEY, DEFAULT_SOUND_SETTINGS);
  const { soundEnabled, alarmMode, fullScreenAlert } = settings;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
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
      {draft ? (
        <SafeAreaView className="flex-1" edges={['bottom']}>
          <PracticeSessionEditor
            draft={draft}
            onChange={setDraft}
            onSave={saveDraft}
            onCancel={() => setDraft(null)}
            saving={saving}
          />
        </SafeAreaView>
      ) : (
        <SafeAreaView className="flex-1" edges={['bottom']}>
          <View className="flex-1 px-6 py-4">
            <View className="flex-row justify-end">
              <Pressable
                onPress={() => setOptionsOpen(true)}
                hitSlop={8}
                accessibilityLabel="Options"
                className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
                style={{ backgroundColor: colors.surface }}
              >
                <SlidersIcon color={colors.foreground} size={18} />
                <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.foreground }}>
                  Options
                </Text>
              </Pressable>
            </View>

            {engineState ? (
              <RunningView engineState={engineState} />
            ) : (
              <LibraryView
                sessions={sessions}
                loading={loading}
                onStart={startSession}
                onEdit={(s) => setDraft(draftFromSession(s))}
                onDelete={(id) => setDeletingId(id)}
                onNew={() => setDraft(blankDraft())}
              />
            )}
          </View>
        </SafeAreaView>
      )}

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Practice Timer options"
        tabs={[
          {
            key: 'sound',
            label: 'Sound',
            content: () => (
              <>
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
              </>
            ),
          },
        ]}
      />

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
  return (
    <View className="flex-1 items-center justify-center gap-6">
      <Text
        className="text-xs font-bold font-ui-bold"
        style={{ color: engineState.alarming ? colors.danger : colors.muted }}
      >
        {engineState.alarming ? "Time's up" : engineState.paused ? 'Paused' : 'Now running'}
      </Text>
      <Text
        className="max-w-[300px] text-center text-2xl font-extrabold font-ui-extrabold"
        style={{ color: colors.foreground }}
      >
        {engineState.current.title}
      </Text>
      <PracticeTimerRing
        startedAt={engineState.startedAt}
        durationMs={engineState.durationMs}
        paused={engineState.paused}
        remainingMsAtPause={engineState.remainingMsAtPause}
        alarming={engineState.alarming}
      />
      <Text className="text-sm font-ui" style={{ color: colors.muted }}>
        {engineState.next ? `Next: ${engineState.next.title}` : 'Last step of this session.'}
      </Text>
      <View className="flex-row flex-wrap items-center justify-center gap-3">
        {engineState.alarming ? (
          <TransportButton onPress={skip} label="Continue" accent>
            <PlayIcon color={colors['accent-foreground']} size={16} />
          </TransportButton>
        ) : engineState.paused ? (
          <TransportButton onPress={resume} label="Resume" accent>
            <PlayIcon color={colors['accent-foreground']} size={16} />
          </TransportButton>
        ) : (
          <TransportButton onPress={pause} label="Pause">
            <PauseIcon color={colors.foreground} size={16} />
          </TransportButton>
        )}
        {!engineState.alarming ? (
          <TransportButton onPress={skip} label="Skip">
            <SkipForwardIcon color={colors.foreground} size={16} />
          </TransportButton>
        ) : null}
        <TransportButton onPress={stop} label="Stop" danger>
          <StopIcon color={colors.danger} size={16} />
        </TransportButton>
      </View>
    </View>
  );
}

function TransportButton({
  onPress,
  label,
  accent,
  danger,
  children,
}: {
  onPress: () => void;
  label: string;
  accent?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1.5 rounded-full px-5 py-2.5"
      style={{ backgroundColor: accent ? colors.accent : colors.surface }}
    >
      {children}
      <Text
        className="text-sm font-bold font-ui-bold"
        style={{ color: accent ? colors['accent-foreground'] : danger ? colors.danger : colors.foreground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LibraryView({
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
  const { colors } = useAppTheme();
  return (
    <View className="flex-1 items-center">
      <View className="items-center gap-3 pt-6">
        <StopwatchIcon color={colors.muted} size={40} />
        {loading ? (
          <LoadingSpinner />
        ) : sessions.length === 0 ? (
          <Text className="max-w-[260px] text-center font-ui" style={{ color: colors.muted }}>
            Create a session to get started — chain timers back to back, or run a Pomodoro.
          </Text>
        ) : (
          <Text className="font-ui" style={{ color: colors.muted }}>
            Pick a saved session to start it, or create a new one.
          </Text>
        )}
      </View>

      <ScrollView className="w-full" contentContainerStyle={{ paddingVertical: 12, gap: 2 }}>
        {sessions.map((session, i) => (
          <View
            key={session.id}
            className="flex-row items-center gap-2 py-2.5"
            style={{
              borderBottomWidth: i < sessions.length - 1 ? 1 : 0,
              borderBottomColor: colors['surface-hover'],
            }}
          >
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
                {session.name || 'Untitled session'}
              </Text>
              <Text numberOfLines={1} className="text-xs font-ui" style={{ color: colors.muted }}>
                {describeSession(session)}
              </Text>
            </View>
            <LibraryButton onPress={() => onStart(session)} label={`Start ${session.name || 'session'}`}>
              <PlayIcon color={colors.accent} size={16} />
            </LibraryButton>
            <LibraryButton onPress={() => onEdit(session)} label={`Edit ${session.name || 'session'}`}>
              <PencilIcon color={colors.muted} size={16} />
            </LibraryButton>
            <LibraryButton onPress={() => onDelete(session.id)} label={`Delete ${session.name || 'session'}`}>
              <TrashIcon color={colors.muted} size={16} />
            </LibraryButton>
          </View>
        ))}
      </ScrollView>

      <Pressable
        onPress={onNew}
        className="flex-row items-center gap-1.5 rounded-full px-6 py-3"
        style={{ backgroundColor: colors.accent }}
      >
        <PlusIcon color={colors['accent-foreground']} size={16} />
        <Text className="text-sm font-bold font-ui-bold" style={{ color: colors['accent-foreground'] }}>
          New session
        </Text>
      </Pressable>
    </View>
  );
}

/** Two nudges toward reliability fixes this app genuinely can't apply from JS alone — both real,
    commonly-reported Android limitations, not things the `'practice-timer'` HIGH-importance
    channel or a correctly-`channelId`'d schedule can fully override on their own:
    1. **Exact alarms** — `SCHEDULE_EXACT_ALARM` is declared in the manifest, but on Android 12+
       that's only ever a *request*; actually using it for precise scheduling needs the user to
       grant "Alarms & reminders" by hand in system settings, the same as this app's own
       notification permission needs a runtime grant. `android.settings.
       REQUEST_SCHEDULE_EXACT_ALARM` is a real, standard intent that jumps straight to that screen
       for *this* app specifically — unlike battery optimization below, it needs no `package:` data
       URI, so `Linking.sendIntent` (no native module needed) can fire it directly. Wrapped in a
       try/catch since the action doesn't exist at all below API 31.
    2. **Battery optimization** — a device's own "sleeping apps" policy can still delay or drop a
       correctly-scheduled notification regardless of exact-alarm access. There's no single
       standard intent for *this* one that doesn't also need a `package:` data URI (which
       `Linking.sendIntent` can't set), so this just opens the app's own settings page
       (`Linking.openSettings()`) and spells out which setting to look for once there.
    Both Android-only — iOS has no equivalent concept for either. */
function ReliabilityHints() {
  const { colors } = useAppTheme();
  if (Platform.OS !== 'android') return null;
  return (
    <View className="gap-2 rounded-xl p-3" style={{ backgroundColor: colors.background }}>
      <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
        If notifications or the sound feel inconsistent, two phone settings outside this app&apos;s
        own control are the usual cause.
      </Text>
      <View className="gap-1">
        <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
          Alarms &amp; reminders
        </Text>
        <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
          Lets segment-end notifications fire at the exact time instead of being delayed.
        </Text>
        <Pressable
          onPress={() => {
            Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() => {
              // Not available below Android 12 — nothing to open, nothing to do.
            });
          }}
          className="self-start rounded-lg px-3 py-1.5"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.accent }}>
            Allow exact alarms
          </Text>
        </Pressable>
      </View>
      <View className="gap-1">
        <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.foreground }}>
          Battery
        </Text>
        <Text className="text-xs leading-4 font-ui" style={{ color: colors.muted }}>
          Open this app&apos;s settings, then look for &quot;Battery&quot; →
          &quot;Unrestricted&quot; (wording varies by phone).
        </Text>
        <Pressable
          onPress={() => void Linking.openSettings()}
          className="self-start rounded-lg px-3 py-1.5"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.accent }}>
            Open app settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function LibraryButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      className="h-8 w-8 shrink-0 items-center justify-center rounded-full"
    >
      {children}
    </Pressable>
  );
}

export default withScreenLoader(PracticeTimerScreen);

"use client";

import { useState, useSyncExternalStore } from "react";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import Hint from "@/components/Hint";
import LoadingSpinner from "@/components/LoadingSpinner";
import NumberField from "@/components/NumberField";
import PanelsToggle from "@/components/PanelsToggle";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import PomodoroEditor, { normalizePomodoro } from "@/components/PomodoroEditor";
import ToolLayout from "@/components/ToolLayout";
import { toolPresets } from "@/lib/toolPresets";
import PracticeTimerRing from "@/components/PracticeTimerRing";
import {
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SpeakerIcon,
  StopIcon,
  StopwatchIcon,
  TrashIcon,
} from "@/components/tools";
import {
  DEFAULT_POMODORO,
  PomodoroConfig,
  PracticeSession,
  Segment,
  describeSession,
  newSegment,
} from "@/lib/practiceTimer";
import {
  getServerSnapshot,
  getSnapshot,
  pause,
  resume,
  skip,
  start,
  stop,
  subscribe,
} from "@/lib/practiceTimerEngine";
import { SessionInput, usePracticeSessions } from "@/lib/usePracticeSessions";
import { TONES } from "@/lib/tones";
import { DEFAULT_SOUND_SETTINGS, SOUND_SETTINGS_KEY } from "@/lib/practiceTimerSound";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

const PANEL_IDS = ["practice-timer-editor", "practice-timer-sound"];
const TONE_OPTIONS = TONES.map((t) => ({ value: t.id, label: t.label }));

/** The session editor's own working copy — always keeps both `segments` and `pomodoro` around
    regardless of `type`, so switching the type toggle back and forth in the editor doesn't throw
    away whichever half isn't currently shown. */
type Draft = {
  /** `null` means this is a brand-new, never-saved session — Save creates instead of updates. */
  id: string | null;
  name: string;
  type: "custom" | "pomodoro";
  segments: Segment[];
  pomodoro: PomodoroConfig;
};

function draftFromSession(session: PracticeSession): Draft {
  return {
    id: session.id,
    name: session.name,
    type: session.type,
    segments: session.type === "custom" ? session.segments : [newSegment()],
    pomodoro: session.type === "pomodoro" ? session.pomodoro : { ...DEFAULT_POMODORO },
  };
}

function blankDraft(): Draft {
  return {
    id: null,
    name: "",
    type: "custom",
    segments: [newSegment()],
    pomodoro: { ...DEFAULT_POMODORO },
  };
}

export default function PracticeTimer() {
  const { sessions, loading, createSession, updateSession, deleteSession } = usePracticeSessions();
  const engineState = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [settings, updateSoundSettings] = useSyncedSettings(
    SOUND_SETTINGS_KEY,
    DEFAULT_SOUND_SETTINGS,
  );
  const { soundEnabled, toneId, alarmMode, fullScreenAlert } = settings;
  const [draft, setDraft] = useState<Draft | null>(null);
  // The session editor is the "New session" chip's popover; an Edit button on a saved session
  // opens it too. Closing it keeps an unsaved draft (Save / Cancel are what end it).
  const [editorOpen, setEditorOpen] = useState(false);
  function closeEditor() {
    setDraft(null);
    setEditorOpen(false);
  }
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startSession(session: PracticeSession) {
    start(session, soundEnabled, toneId, alarmMode, fullScreenAlert);
  }

  // Full-screen alert only means anything while alarm mode is also on (there's no "alarming, held
  // and waiting" moment to interrupt for otherwise — a non-alarm-mode transition has already
  // silently happened by the time anything could show) — turning alarm mode off turns this back
  // off too, rather than leaving it toggled on but dormant.
  const setAlarmMode = (alarmMode: boolean) =>
    updateSoundSettings(alarmMode ? { alarmMode } : { alarmMode, fullScreenAlert: false });

  function updateDraft(patch: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateSegment(index: number, patch: Partial<Segment>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const segments = prev.segments.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, segments };
    });
  }

  function moveSegment(index: number, dir: -1 | 1) {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + dir;
      if (target < 0 || target >= prev.segments.length) return prev;
      const segments = [...prev.segments];
      [segments[index], segments[target]] = [segments[target], segments[index]];
      return { ...prev, segments };
    });
  }

  function removeSegment(index: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const segments = prev.segments.filter((_, i) => i !== index);
      return { ...prev, segments: segments.length > 0 ? segments : [newSegment()] };
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim() || "Untitled session";
    if (draft.id === null) {
      const input: SessionInput =
        draft.type === "custom"
          ? { name, type: "custom", segments: draft.segments }
          : { name, type: "pomodoro", pomodoro: normalizePomodoro(draft.pomodoro) };
      await createSession(input);
    } else {
      const session: PracticeSession =
        draft.type === "custom"
          ? { id: draft.id, name, type: "custom", segments: draft.segments, updatedAt: 0 }
          : { id: draft.id, name, type: "pomodoro", pomodoro: normalizePomodoro(draft.pomodoro), updatedAt: 0 };
      await updateSession(session);
    }
    closeEditor();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    await deleteSession(deletingId);
    setDeletingId(null);
  }

  return (
    <ToolLayout
      title="Practice Timer"
      presets={toolPresets("practice-timer", settings, updateSoundSettings)}
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />

          <CollapsiblePanel
              id="practice-timer-editor"
              title={draft?.id ? "Edit session" : "New session"}
              icon={draft?.id ? PencilIcon : PlusIcon}
              summary={draft && !editorOpen ? "Unsaved" : undefined}
              wide
              open={editorOpen}
              onOpenChange={(open) => {
                if (open && !draft) setDraft(blankDraft());
                setEditorOpen(open);
              }}
            >
              {draft && (
              <>
              <label className="flex flex-col gap-1 text-left text-sm">
                <span className="font-medium text-muted">Name</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  placeholder="e.g. Morning warmup"
                  className="w-full rounded-lg bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-accent"
                />
              </label>

              <div className="flex gap-2">
                {(["custom", "pomodoro"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateDraft({ type })}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      draft.type === type
                        ? "bg-accent text-accent-foreground"
                        : "bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    {type === "custom" ? "Custom" : "Pomodoro"}
                  </button>
                ))}
              </div>
              <Hint>
                Custom chains named timers back to back, in order. Pomodoro alternates work
                intervals with breaks automatically, with a longer break every few cycles.
              </Hint>

              {draft.type === "custom" ? (
                <div className="flex flex-col gap-2">
                  {draft.segments.map((segment, i) => (
                    <div key={segment.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={segment.title}
                        onChange={(e) => updateSegment(i, { title: e.target.value })}
                        placeholder="e.g. Scales"
                        className="min-w-0 flex-1 rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent"
                      />
                      <NumberField
                        value={Math.round(segment.minutes)}
                        min={1}
                        max={180}
                        onChange={(minutes) => updateSegment(i, { minutes })}
                        label={`${segment.title || "Segment"} minutes`}
                        className="w-16 shrink-0 rounded-lg bg-background px-2 py-2 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent"
                      />
                      <span className="shrink-0 text-xs text-muted">min</span>
                      <button
                        type="button"
                        onClick={() => moveSegment(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        title="Move up"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSegment(i, 1)}
                        disabled={i === draft.segments.length - 1}
                        aria-label="Move down"
                        title="Move down"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSegment(i)}
                        aria-label="Remove segment"
                        title="Remove"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-danger"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateDraft({ segments: [...draft.segments, newSegment()] })}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-background px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                  >
                    <PlusIcon className="h-4 w-4" /> Add segment
                  </button>
                </div>
              ) : (
                <PomodoroEditor config={draft.pomodoro} onChange={(pomodoro) => updateDraft({ pomodoro })} />
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveDraft}
                  className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="flex-1 rounded-lg bg-background px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
              </>
              )}
            </CollapsiblePanel>

          <CollapsiblePanel id="practice-timer-sound" title="Sound" icon={SpeakerIcon} summary={soundEnabled ? (alarmMode ? "Alarm" : "Chime") : "Off"}>
            <SwitchRow
              label="Sound feedback"
              checked={soundEnabled}
              onChange={(soundEnabled) => updateSoundSettings({ soundEnabled })}
              hint="Plays a short two-note chime each time a segment ends and the next one begins."
            />
            {soundEnabled && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-muted">Tone</span>
                <Select
                  value={toneId}
                  onChange={(toneId) => updateSoundSettings({ toneId })}
                  options={TONE_OPTIONS}
                  className="min-w-32"
                />
              </label>
            )}
            <SwitchRow
              label="Alarm mode"
              checked={alarmMode}
              onChange={setAlarmMode}
              hint="Instead of moving on automatically, holds at the end of each segment and keeps beeping until you dismiss it — from here, the running timer's own controls, or the sidebar widget while it's running."
            />
            <SwitchRow
              label="Full-screen alert"
              checked={fullScreenAlert}
              onChange={(fullScreenAlert) => updateSoundSettings({ fullScreenAlert })}
              disabled={!alarmMode}
              hint="Also shows a full-screen prompt when the alarm goes off, wherever you are in the app — not just a sound. Only applies while alarm mode is on."
            />
          </CollapsiblePanel>
        </>
      }
    >
      {engineState ? (
        <div className="flex flex-col items-center gap-5">
          <p
            className={`text-sm font-medium ${
              engineState.alarming ? "animate-pulse text-danger" : "text-muted"
            }`}
          >
            {engineState.alarming ? "Time's up" : engineState.paused ? "Paused" : "Now running"}
          </p>
          <h2 className="break-words text-3xl font-bold sm:text-4xl">
            {engineState.current.title}
          </h2>
          <PracticeTimerRing
            startedAt={engineState.startedAt}
            durationMs={engineState.durationMs}
            paused={engineState.paused}
            remainingMsAtPause={engineState.remainingMsAtPause}
            alarming={engineState.alarming}
          />
          {engineState.next ? (
            <p className="text-sm text-muted">Next: {engineState.next.title}</p>
          ) : (
            <p className="text-sm text-muted">Last step of this session.</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {engineState.alarming ? (
              <button
                type="button"
                onClick={skip}
                className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                <PlayIcon className="h-4 w-4" /> Continue
              </button>
            ) : engineState.paused ? (
              <button
                type="button"
                onClick={resume}
                className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                <PlayIcon className="h-4 w-4" /> Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={pause}
                className="flex items-center gap-1.5 rounded-full bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-hover"
              >
                <PauseIcon className="h-4 w-4" /> Pause
              </button>
            )}
            {!engineState.alarming && (
              <button
                type="button"
                onClick={skip}
                className="rounded-full bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-hover"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-1.5 rounded-full bg-surface px-5 py-2.5 text-sm font-medium text-danger hover:bg-surface-hover"
            >
              <StopIcon className="h-4 w-4" /> Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <StopwatchIcon className="h-12 w-12 text-muted" />
          {loading ? (
            <LoadingSpinner />
          ) : sessions.length === 0 ? (
            <p className="max-w-xs text-muted">
              Use New session below to chain timers back to back, or run a Pomodoro.
            </p>
          ) : (
            <>
              <p className="text-muted">Pick a saved session to start it, or make a new one below.</p>
              <div className="flex w-full max-w-sm flex-col">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-2 border-b border-surface-hover py-2.5 text-left last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {session.name || "Untitled session"}
                      </p>
                      <p className="truncate text-xs text-muted">{describeSession(session)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startSession(session)}
                      aria-label={`Start ${session.name || "session"}`}
                      title="Start"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-accent transition-colors hover:bg-surface-hover"
                    >
                      <PlayIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(draftFromSession(session));
                        setEditorOpen(true);
                      }}
                      aria-label={`Edit ${session.name || "session"}`}
                      title="Edit"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(session.id)}
                      aria-label={`Delete ${session.name || "session"}`}
                      title="Delete"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete session?"
          message="This can't be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </ToolLayout>
  );
}

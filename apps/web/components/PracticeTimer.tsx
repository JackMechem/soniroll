"use client";

import { useState, useSyncExternalStore } from "react";
import CollapsiblePanel, { HintsButton } from "@/components/CollapsiblePanel";
import { SettingChip } from "@/components/SettingsBar";
import { HintsContext } from "@/lib/hints";
import { PANEL_DEFAULTS, panelKey, useHints } from "@/lib/panels";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import ConfirmDialog from "@/components/ConfirmDialog";
import Hint from "@/components/Hint";
import LoadingSpinner from "@/components/LoadingSpinner";
import NumberField from "@/components/NumberField";
import PanelsToggle from "@/components/PanelsToggle";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import PomodoroEditor, { normalizePomodoro } from "@/components/PomodoroEditor";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import ToolLayout from "@/components/ToolLayout";
import { BIG_PRIMARY } from "@/components/MeterFields";
import KeyHint from "@/components/KeyHint";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { RewardProvider } from "@/components/reward/Reward";
import { useSiteSettings } from "@/lib/siteSettings";
import { toolPresets } from "@/lib/toolPresets";
import PracticeTimerRing from "@/components/PracticeTimerRing";
import {
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SpeakerIcon,
  StopIcon,
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
  const [{ rewardChips }] = useSiteSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  // The session editor is the "New session" chip's popover; an Edit button on a saved session
  // opens it too. Closing it keeps an unsaved draft (Save / Cancel are what end it).
  const [editorOpen, setEditorOpen] = useState(false);
  // Whether the draft has been changed since it was opened. An untouched one is dropped when the
  // editor closes, so the chip only says "Draft" when there's really something unsaved.
  const [draftTouched, setDraftTouched] = useState(false);
  function closeEditor() {
    setDraft(null);
    setDraftTouched(false);
    setEditorOpen(false);
    setNameMissing(false);
  }
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Set when Save is pressed with no name: we ask for one instead of saving "Untitled session".
  const [nameMissing, setNameMissing] = useState(false);
  // The editor popover's "?" (option descriptions), remembered like a panel's.
  const [editorPanel, updateEditorPanel] = usePersistedSettings(
    panelKey("practice-timer-editor"),
    PANEL_DEFAULTS,
  );
  const [editorHints, toggleEditorHints] = useHints(
    editorPanel.showHints,
    editorPanel.hints,
    updateEditorPanel,
  );
  // The quick timer's length: a plain countdown, no session needed. Not saved.
  const [quickMinutes, setQuickMinutes] = useState(10);

  // Space starts the quick timer, then pauses and resumes (and dismisses the alarm), like every
  // other tool's Space.
  useSpaceToggle(() => {
    if (!engineState) startQuickTimer();
    else if (engineState.alarming) skip();
    else if (engineState.paused) resume();
    else pause();
  });

  function startSession(session: PracticeSession) {
    start(session, soundEnabled, toneId, alarmMode, fullScreenAlert);
  }

  function startQuickTimer() {
    startSession({
      id: "quick-timer",
      name: "",
      type: "custom",
      segments: [{ ...newSegment(), title: `${quickMinutes} min timer`, minutes: quickMinutes }],
      updatedAt: 0,
    });
  }

  /** Runs what's in the editor right now, without saving it. */
  function startDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    startSession(
      draft.type === "custom"
        ? {
            id: draft.id ?? "unsaved-session",
            name,
            type: "custom",
            segments: draft.segments.map((seg, i) => ({
              ...seg,
              title: seg.title.trim() || (draft.segments.length === 1 ? "Timer" : `Part ${i + 1}`),
            })),
            updatedAt: 0,
          }
        : { id: draft.id ?? "unsaved-session", name, type: "pomodoro", pomodoro: normalizePomodoro(draft.pomodoro), updatedAt: 0 },
    );
    setEditorOpen(false);
  }

  // Full-screen alert only means anything while alarm mode is also on (there's no "alarming, held
  // and waiting" moment to interrupt for otherwise — a non-alarm-mode transition has already
  // silently happened by the time anything could show) — turning alarm mode off turns this back
  // off too, rather than leaving it toggled on but dormant.
  const setAlarmMode = (alarmMode: boolean) =>
    updateSoundSettings(alarmMode ? { alarmMode } : { alarmMode, fullScreenAlert: false });

  function updateDraft(patch: Partial<Draft>) {
    setDraftTouched(true);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateSegment(index: number, patch: Partial<Segment>) {
    setDraftTouched(true);
    setDraft((prev) => {
      if (!prev) return prev;
      const segments = prev.segments.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, segments };
    });
  }

  function moveSegment(index: number, dir: -1 | 1) {
    setDraftTouched(true);
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
    setDraftTouched(true);
    setDraft((prev) => {
      if (!prev) return prev;
      const segments = prev.segments.filter((_, i) => i !== index);
      return { ...prev, segments: segments.length > 0 ? segments : [newSegment()] };
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setNameMissing(true);
      return;
    }
    setNameMissing(false);
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
        // The same round option chips as the other tools (ToolLayout only gives them to tools on
        // the Shed Log's Log button, and this one logs itself).
        <OptionChipLook on={rewardChips}>
          <PanelsToggle ids={PANEL_IDS} />

          {/* "New session" is an action, not a setting, so it's a plain button rather than a
              value chip; the session editor is still its popover. */}
          <SettingChip
              icon={draft?.id ? PencilIcon : PlusIcon}
              label={draft?.id ? "Edit session" : "New session"}
              wide
              open={editorOpen}
              onOpenChange={(open) => {
                if (open && !draft) {
                  setDraft(blankDraft());
                  setDraftTouched(false);
                }
                if (!open && !draftTouched) closeEditor();
                else setEditorOpen(open);
              }}
              headerExtra={<HintsButton on={editorHints} onToggle={toggleEditorHints} />}
              trigger={{
                className:
                  "flex h-10 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover",
                content: (
                  <>
                    {draft?.id ? <PencilIcon className="h-4 w-4 text-accent" /> : <PlusIcon className="h-4 w-4 text-accent" />}
                    {draft?.id ? "Edit session" : "New session"}
                    {draft && draftTouched && !editorOpen && <span className="text-muted">· Draft, not saved</span>}
                  </>
                ),
              }}
            >
              <HintsContext.Provider value={editorHints}>
              {draft && (
              <>
              <label className="flex flex-col gap-1 text-left text-sm">
                <span className="text-xs font-medium text-muted">Name</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => {
                    updateDraft({ name: e.target.value });
                    if (e.target.value.trim()) setNameMissing(false);
                  }}
                  placeholder="e.g. Morning warmup"
                  aria-invalid={nameMissing}
                  autoFocus={nameMissing}
                  className={`w-full h-9 rounded-md bg-foreground/[0.05] px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40 ${nameMissing ? "ring-2 ring-danger/50" : ""}`}
                />
                {nameMissing && (
                  <span className="text-xs text-danger">Give it a name to save it, or press Start now to just run it.</span>
                )}
              </label>

              <Segmented
                label="Session type"
                value={draft.type}
                onChange={(type) => updateDraft({ type })}
                options={[
                  { value: "custom", label: "Custom" },
                  { value: "pomodoro", label: "Pomodoro" },
                ]}
              />
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
                        className="min-w-0 flex-1 h-9 rounded-md bg-foreground/[0.05] px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <NumberField
                        value={Math.round(segment.minutes)}
                        min={1}
                        max={180}
                        onChange={(minutes) => updateSegment(i, { minutes })}
                        label={`${segment.title || "Segment"} minutes`}
                        className="h-9 w-16 shrink-0 rounded-md bg-foreground/[0.05] px-2 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <span className="shrink-0 text-xs text-muted">min</span>
                      <button
                        type="button"
                        onClick={() => moveSegment(i, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                        title="Move up"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSegment(i, 1)}
                        disabled={i === draft.segments.length - 1}
                        aria-label="Move down"
                        title="Move down"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSegment(i)}
                        aria-label="Remove segment"
                        title="Remove"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateDraft({ segments: [...draft.segments, newSegment()] })}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-foreground/20 px-3 text-sm font-medium text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
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
                  className="h-9 flex-1 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={startDraft}
                  title="Run it now without saving"
                  className="h-9 flex-1 whitespace-nowrap rounded-md bg-foreground/[0.05] px-2 text-sm font-medium transition-colors hover:bg-surface-hover"
                >
                  Start now
                </button>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="h-9 flex-1 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
              </>
              )}
              </HintsContext.Provider>
            </SettingChip>

          <CollapsiblePanel id="practice-timer-sound" title="Sound" icon={SpeakerIcon} summary={soundEnabled ? (alarmMode ? "Alarm" : "Chime") : "Off"}>
            <SwitchRow
              label="Sound feedback"
              checked={soundEnabled}
              onChange={(soundEnabled) => updateSoundSettings({ soundEnabled })}
              hint="Plays a short two-note chime each time a segment ends and the next one begins."
            />
            {soundEnabled && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">Tone</span>
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
        </OptionChipLook>
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
          <h2 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">
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
          ) : engineState.index > 0 ? (
            // Only for a session with steps before this one; a single timer has nothing to add.
            <p className="text-sm text-muted">Last step of this session.</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {engineState.alarming ? (
              <button
                type="button"
                onClick={skip}
                className="flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                <PlayIcon className="h-4 w-4" /> Continue
              </button>
            ) : engineState.paused ? (
              <button
                type="button"
                onClick={resume}
                className="flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                <PlayIcon className="h-4 w-4" /> Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={pause}
                className="flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
              >
                <PauseIcon className="h-4 w-4" /> Pause
              </button>
            )}
            {!engineState.alarming && (
              <button
                type="button"
                onClick={skip}
                className="h-10 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium transition-colors hover:bg-surface-hover"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={stop}
              className="flex h-10 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium text-danger transition-colors hover:bg-surface-hover"
            >
              <StopIcon className="h-4 w-4" /> Stop
            </button>
          </div>
          <KeyHint>
            Press <KeyHint.Key>Space</KeyHint.Key> to {engineState.alarming ? "continue" : engineState.paused ? "resume" : "pause"}
          </KeyHint>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-3 text-center">
          {/* The quick way: one plain countdown, nothing to build or save. Its Start is the page's
              main button, the same round pill as other tools'. */}
          <div className="flex w-full max-w-sm flex-col items-center gap-4 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Quick timer</span>
              <NumberField
                value={quickMinutes}
                min={1}
                max={180}
                onChange={setQuickMinutes}
                label="Quick timer minutes"
                className="h-9 w-14 shrink-0 rounded-md bg-foreground/[0.05] px-2 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent/40"
              />
              <span className="text-sm text-muted">min</span>
            </div>
            <button type="button" onClick={startQuickTimer} className={BIG_PRIMARY}>
              <PlayIcon className="h-4 w-4" /> Start
            </button>
            <KeyHint>
              Press <KeyHint.Key>Space</KeyHint.Key> to start
            </KeyHint>
          </div>
          {loading ? (
            <LoadingSpinner />
          ) : sessions.length === 0 ? (
            <p className="w-full max-w-sm text-sm text-muted">
              To chain timers back to back or run a Pomodoro, use New session below.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">Pick a saved session to start it, or make a new one below.</p>
              <div className="flex w-full max-w-sm flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-1 py-2 pl-3 pr-2 text-left"
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
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent transition-colors hover:bg-surface-hover"
                    >
                      <PlayIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(draftFromSession(session));
                        setDraftTouched(false);
                        setEditorOpen(true);
                      }}
                      aria-label={`Edit ${session.name || "session"}`}
                      title="Edit"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(session.id)}
                      aria-label={`Delete ${session.name || "session"}`}
                      title="Delete"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
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

function OptionChipLook({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? (
    <RewardProvider href="/practice-timer" color="var(--accent)">
      {children}
    </RewardProvider>
  ) : (
    <>{children}</>
  );
}

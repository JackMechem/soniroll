"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PageShell } from "@/components/library/shared";
import PageBar from "@/components/PageBar";
import { useLeaveGuard } from "@/components/library/useLeaveGuard";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { AttachmentList } from "@/components/practicelog/Attachments";
import { RoutineIconButton } from "@/components/practicelog/RoutineIcon";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, TrashIcon, findToolLink } from "@/components/tools";
import {
  type Repeat,
  type RepeatFreq,
  type Routine,
  type RoutineTask,
  type Weekday,
  ROUTINE_COLORS,
  WEEKDAY_LETTER,
  WEEKDAY_NAMES,
  addMonths,
  describeRepeat,
  formatMinutesShort,
  formatTime,
  isDateKey,
  newRoutine,
  newSubtask,
  newTask,
  parseTime,
  scheduleTasks,
  todayKey,
  totalMinutes,
  weekdayOf,
} from "@/lib/practiceLog";
import { usePracticeLog } from "@/lib/usePracticeLog";

const noopSubscribe = () => () => {};
const LABEL = "text-xs font-medium text-muted";
const SHED_LOG_ICON = findToolLink("/shed-log")?.icon;
/** The pages above the editor in the header bar's trail. */
const ROUTINES_CRUMBS = [
  { label: "Shed Log", href: "/shed-log" },
  { label: "Routines", href: "/shed-log/routines" },
];
const INPUT = "h-9 min-w-0 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";
/** A task's small "+ Subtask" / "+ Notes" buttons, filled like the Attach button beside them. */
const SMALL_ADD = "flex h-6 items-center gap-1 rounded-md bg-foreground/[0.05] px-2 text-xs font-medium transition-colors hover:bg-surface-hover pointer-coarse:h-8";
const TEXTAREA = "resize-y rounded-md bg-foreground/[0.05] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** `/shed-log/routine/edit?id=…` (or `?date=…` for a new one starting that day). */
/** Names for `ROUTINE_COLORS`, in the same order, for screen readers and tooltips. */
const COLOR_NAMES = ["Indigo", "Green", "Amber", "Red", "Pink", "Cyan", "Violet", "Lime"];

export default function RoutineEditorPage({ id, date }: { id?: string; date?: string }) {
  const log = usePracticeLog();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // A new routine keeps one id while the page is open: a fresh one on every render remounted the
  // editor (its `key`) whenever the log changed — a sync wiped what you'd typed, and saving lost
  // the leave guard's way out.
  const [draftId] = useState(() => newRoutine(todayKey(), 0).id);
  if (!log.ready || !mounted) {
    return (
      <PageShell>
        <PageBar crumbs={[...ROUTINES_CRUMBS, { label: id ? "Edit routine" : "New routine" }]} icon={SHED_LOG_ICON} />
        <LoadingSpinner />
      </PageShell>
    );
  }
  const existing = id ? log.data.routines.find((r) => r.id === id) : undefined;
  if (id && !existing) {
    return (
      <PageShell>
        <PageBar crumbs={[...ROUTINES_CRUMBS, { label: "Edit routine" }]} icon={SHED_LOG_ICON} />
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">That routine doesn&apos;t exist anymore.</p>
      </PageShell>
    );
  }
  const initial = existing ?? { ...newRoutine(isDateKey(date) ? date : todayKey(), log.data.routines.length % ROUTINE_COLORS.length), id: draftId };
  return <Editor key={initial.id} initial={initial} isNew={!existing} log={log} returnDate={isDateKey(date) ? date : undefined} />;
}

const FREQS: { value: RepeatFreq; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
const UNIT: Record<RepeatFreq, string> = { once: "", daily: "day", weekly: "week", monthly: "month" };

function Editor({ initial, isNew, log, returnDate }: { initial: Routine; isNew: boolean; log: ReturnType<typeof usePracticeLog>; returnDate?: string }) {
  const router = useRouter();
  const [r, setR] = useState<Routine>(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The task just added with "Add a task": its name box gets the focus, so you can type straight away.
  const [added, setAdded] = useState<string | null>(null);
  // Tasks whose notes box was opened with "+ Notes" (one that has notes always shows it).
  const [notesOpen, setNotesOpen] = useState<ReadonlySet<string>>(() => new Set());
  const set = (patch: Partial<Routine>) => setR((prev) => ({ ...prev, ...patch }));
  const setRepeat = (patch: Partial<Repeat>) => setR((prev) => ({ ...prev, repeat: { ...prev.repeat, ...patch } }));
  const setTask = (i: number, patch: Partial<RoutineTask>) => setR((prev) => ({ ...prev, tasks: prev.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const moveTask = (i: number, dir: -1 | 1) =>
    setR((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.tasks.length) return prev;
      const tasks = [...prev.tasks];
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return { ...prev, tasks };
    });

  // Leaving with unsaved changes (Back, Cancel, the browser's Back, a link) asks first.
  const [start] = useState(initial); // as it was when the page opened (a sync can change `initial`)
  const dirty = JSON.stringify(r) !== JSON.stringify(start);
  const { requestLeave, leave, dialog: leaveDialog } = useLeaveGuard(dirty, "Your changes to this routine haven't been saved.", () => router.push("/shed-log"));
  const cancel = () => requestLeave(() => router.back());

  const done = () => router.push(isNew ? `/shed-log${returnDate ? `?date=${returnDate}` : ""}` : `/shed-log/routine?id=${encodeURIComponent(r.id)}`);

  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  function save() {
    if (!r.name.trim()) {
      setError("Give the routine a name.");
      nameRef.current?.focus();
      return;
    }
    if (r.repeat.end && r.repeat.end < r.repeat.start) {
      setError("It ends before it starts.");
      // Saved from the bottom bar on a phone, the message at the top is out of sight.
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    // A task row left empty (no name, notes, subtasks or attachments) is dropped, not saved as
    // "Untitled task".
    const tasks = r.tasks
      .filter((t) => t.title.trim() || t.notes.trim() || (t.subtasks ?? []).some((x) => x.title.trim()) || t.attachments.length > 0)
      .map((t) => ({ ...t, title: t.title.trim(), subtasks: (t.subtasks ?? []).filter((x) => x.title.trim()).map((x) => ({ ...x, title: x.title.trim() })) }));
    log.saveRoutine({ ...r, name: r.name.trim(), tasks });
    leave(done);
  }

  const color = ROUTINE_COLORS[r.color % ROUTINE_COLORS.length];
  const schedule = scheduleTasks(r);
  const weekdays = r.repeat.weekdays.length ? r.repeat.weekdays : [weekdayOf(r.repeat.start)];

  return (
    <PageShell>
      {/* The trail's links ask first when there are unsaved changes (`useLeaveGuard`). Cancel and
          Save are in the bar stuck to the bottom (below), in reach however far down the form you
          are. */}
      <PageBar
        crumbs={
          isNew
            ? [...ROUTINES_CRUMBS, { label: "New routine" }]
            : [...ROUTINES_CRUMBS, { label: start.name || "Untitled routine", href: `/shed-log/routine?id=${encodeURIComponent(start.id)}` }, { label: "Edit" }]
        }
        icon={SHED_LOG_ICON}
      />
      {error && <p ref={errorRef} className="max-w-3xl rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">{error}</p>}

      <Card title="Routine">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="routine-name" className={LABEL}>Name</label>
          <div className="flex items-center gap-2">
            {/* The icon: tap it to pick another (a popover). */}
            <RoutineIconButton value={r.icon} color={r.color} onChange={(icon) => set({ icon })} />
            <input
              id="routine-name"
              ref={nameRef}
              autoFocus={isNew}
              aria-invalid={error === "Give the routine a name." || undefined}
              value={r.name}
              onChange={(e) => {
                set({ name: e.target.value });
                setError(null);
              }}
              placeholder="e.g. Morning warm-up"
              className={`${INPUT} flex-1 aria-[invalid]:ring-2 aria-[invalid]:ring-danger/60`}
            />
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>What it&apos;s for (optional)</span>
          <textarea
            value={r.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={2}
            className={TEXTAREA}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Color</span>
          <div className="flex flex-wrap items-center gap-2 max-sm:gap-4">
            {ROUTINE_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: i })}
                aria-label={COLOR_NAMES[i] ?? `Color ${i + 1}`}
                title={COLOR_NAMES[i]}
                aria-pressed={r.color === i}
                className={`relative h-7 w-7 rounded-full before:absolute before:-inset-2 ${r.color === i ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card title="When">
        <Segmented label="Repeats" value={r.repeat.freq} onChange={(freq) => setRepeat({ freq })} options={FREQS} />
        {r.repeat.freq !== "once" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Every</span>
            <Stepper value={r.repeat.interval} min={1} max={12} onChange={(interval) => setRepeat({ interval })} />
            <span className="text-muted">
              {UNIT[r.repeat.freq]}
              {r.repeat.interval === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {r.repeat.freq === "weekly" && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
            {WEEKDAY_LETTER.map((letter, i) => {
              const on = weekdays.includes(i as Weekday);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_NAMES[i]}
                  title={WEEKDAY_NAMES[i]}
                  onClick={() => {
                    const next = on ? weekdays.filter((d) => d !== i) : [...weekdays, i as Weekday];
                    if (next.length) setRepeat({ weekdays: next.sort() as Weekday[] });
                  }}
                  className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${on ? "text-white" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"}`}
                  style={on ? { background: color } : undefined}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={LABEL}>{r.repeat.freq === "once" ? "On" : "Starts"}</span>
            <input
              type="date"
              value={r.repeat.start}
              onChange={(e) => isDateKey(e.target.value) && setRepeat({ start: e.target.value })}
              className={INPUT}
            />
          </label>
          {r.repeat.freq !== "once" && (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className={LABEL}>Ends</span>
              <Segmented
                label="Ends"
                value={r.repeat.end ? "date" : "never"}
                onChange={(v) => setRepeat({ end: v === "never" ? null : (r.repeat.end ?? addMonths(r.repeat.start, 1)) })}
                options={[
                  { value: "never", label: "Never" },
                  { value: "date", label: "On a date" },
                ]}
              />
              {r.repeat.end && (
                <input
                  type="date"
                  value={r.repeat.end}
                  min={r.repeat.start}
                  onChange={(e) => isDateKey(e.target.value) && setRepeat({ end: e.target.value })}
                  className={`${INPUT} mt-1`}
                />
              )}
            </div>
          )}
        </div>
        <TimeField label="Start time" value={r.startTime} onChange={(startTime) => set({ startTime })} emptyLabel="Any time" />
        <p className="text-sm text-muted">{describeRepeat(r.repeat)}{r.repeat.freq !== "once" && !r.repeat.end ? ", until you delete it" : ""}{parseTime(r.startTime) !== null ? `, at ${formatTime(parseTime(r.startTime)!)}` : ""}.</p>
      </Card>

      <Card title="Tasks" detail={r.tasks.length ? formatMinutesShort(totalMinutes(r)) : undefined}>
        <ol className="flex flex-col gap-3">
          {r.tasks.map((task, i) => {
            // Move up / down and remove: beside the name from sm; on phones on the minutes row, so
            // the name gets the whole width.
            const controls = (
              <>
                <IconButton label="Move up" disabled={i === 0} onClick={() => moveTask(i, -1)}>
                  <ChevronLeftIcon className="h-4 w-4 rotate-90" />
                </IconButton>
                <IconButton label="Move down" disabled={i === r.tasks.length - 1} onClick={() => moveTask(i, 1)}>
                  <ChevronRightIcon className="h-4 w-4 rotate-90" />
                </IconButton>
                <IconButton label="Remove task" onClick={() => set({ tasks: r.tasks.filter((_, j) => j !== i) })}>
                  <TrashIcon className="h-4 w-4" />
                </IconButton>
              </>
            );
            return (
            <li key={task.id} className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm font-medium tabular-nums text-muted">{i + 1}</span>
                <input
                  value={task.title}
                  autoFocus={task.id === added}
                  onChange={(e) => setTask(i, { title: e.target.value })}
                  onKeyDown={(e) => {
                    // Enter starts the next task (a new row right under this one), like the Shed
                    // Log's own add-task field, instead of doing nothing.
                    if (e.key !== "Enter" || e.nativeEvent.isComposing || !task.title.trim()) return;
                    e.preventDefault();
                    const next = newTask();
                    setAdded(next.id);
                    setR((prev) => {
                      const at = prev.tasks.findIndex((t) => t.id === task.id) + 1;
                      return { ...prev, tasks: [...prev.tasks.slice(0, at), next, ...prev.tasks.slice(at)] };
                    });
                  }}
                  enterKeyHint="next"
                  placeholder="Task — e.g. Scales in all 12 keys"
                  aria-label={`Task ${i + 1}`}
                  className={`${INPUT} flex-1`}
                />
                <div className="flex shrink-0 max-sm:hidden">{controls}</div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7 text-sm">
                <div className="flex items-center gap-2">
                  <Stepper value={task.minutes} min={0} max={600} step={task.minutes < 5 ? 1 : 5} onChange={(minutes) => setTask(i, { minutes })} />
                  <span className="text-muted">min</span>
                </div>
                <div className="-mr-1 ml-auto flex shrink-0 sm:hidden">{controls}</div>
                <TimeField
                  label="At"
                  value={task.time}
                  onChange={(time) => setTask(i, { time })}
                  emptyLabel={schedule[i]?.start !== null && schedule[i]?.start !== undefined ? `Follows on · ${formatTime(schedule[i].start!)}` : "Follows on"}
                  inline
                />
              </div>
              {(task.notes || notesOpen.has(task.id)) && (
                <div className="pl-7">
                  <textarea
                    value={task.notes}
                    onChange={(e) => setTask(i, { notes: e.target.value })}
                    autoFocus={!task.notes}
                    rows={2}
                    placeholder="Notes: what to focus on"
                    aria-label="Notes (optional)"
                    className={`${TEXTAREA} w-full py-1.5`}
                  />
                </div>
              )}
              {(task.subtasks ?? []).length > 0 && (
                <div className="flex flex-col gap-1 pl-7">
                  {(task.subtasks ?? []).map((sub, j) => (
                    <div key={sub.id} className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-sm border-[1.5px] border-foreground/25" />
                      <input
                        value={sub.title}
                        onChange={(e) => setTask(i, { subtasks: (task.subtasks ?? []).map((x, k) => (k === j ? { ...x, title: e.target.value } : x)) })}
                        placeholder="Subtask"
                        className="h-8 min-w-0 flex-1 rounded-md bg-foreground/[0.05] px-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <IconButton label="Remove subtask" onClick={() => setTask(i, { subtasks: (task.subtasks ?? []).filter((_, k) => k !== j) })}>
                        <CloseIcon className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
              {/* The extras, in one row of small filled buttons: a subtask, notes (hidden until
                  asked for, so an empty box doesn't make every task tall) and attachments. */}
              <div className="flex flex-wrap items-center gap-1.5 pl-7">
                <button type="button" onClick={() => setTask(i, { subtasks: [...(task.subtasks ?? []), newSubtask()] })} className={SMALL_ADD}>
                  <PlusIcon className="h-3.5 w-3.5" /> Subtask
                </button>
                {!task.notes && !notesOpen.has(task.id) && (
                  <button type="button" onClick={() => setNotesOpen((open) => new Set(open).add(task.id))} className={SMALL_ADD}>
                    <PlusIcon className="h-3.5 w-3.5" /> Notes
                  </button>
                )}
                <AttachmentList items={task.attachments} onChange={(attachments) => setTask(i, { attachments })} compact />
              </div>
            </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => {
            const task = newTask();
            setAdded(task.id);
            set({ tasks: [...r.tasks, task] });
          }}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-foreground/20 text-sm font-medium text-muted hover:border-foreground/40 hover:text-foreground"
        >
          <PlusIcon className="h-4 w-4" /> Add a task
        </button>
        <p className="text-xs text-muted">
          A task without its own time follows the one before it{r.startTime ? ", starting from the routine's start time" : ""}. Start the routine on its day to run the tasks on the Practice Timer — each one is checked off as its time runs out.
        </p>
      </Card>

      <Card title="Attached">
        <AttachmentList items={r.attachments} onChange={(attachments) => set({ attachments })} />
      </Card>

      {!isNew && (
        <button type="button" onClick={() => setConfirmDelete(true)} className="flex h-9 items-center gap-1.5 self-start rounded-md bg-foreground/[0.05] px-3 text-sm font-medium text-danger hover:bg-surface-hover">
          <TrashIcon className="h-4 w-4" /> Delete routine
        </button>
      )}
      {/* Cancel and Save stay in reach at the bottom while you scroll the form (on a phone, two
          big buttons; wider, a pair on the right). */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-16 flex gap-2 border-t border-foreground/10 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur sm:-mx-6 sm:justify-end sm:px-6 lg:-mx-8 lg:px-8">
        <button type="button" onClick={cancel} className="h-11 flex-1 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover sm:h-9 sm:flex-none">
          Cancel
        </button>
        <button type="button" onClick={save} className="h-11 flex-1 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover sm:h-9 sm:flex-none">
          Save
        </button>
      </div>
      {leaveDialog}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this routine?"
          message="It comes off the calendar, along with what you checked off and noted for it. Recordings you made for it stay on their days."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            log.deleteRoutine(r.id);
            leave(() => router.push("/shed-log/routines"));
          }}
        />
      )}
    </PageShell>
  );
}

function Card({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return (
    // Capped (left-aligned) so the fields stay easy to scan on a wide screen.
    <section className="w-full max-w-3xl rounded-lg bg-surface">
      <div className="flex h-11 items-center justify-between gap-2 px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {detail && <span className="text-xs tabular-nums text-muted">{detail}</span>}
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="relative flex h-8 w-8 items-center pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

function Stepper({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md bg-background max-sm:h-10">
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label="Less" className="h-full w-8 text-muted hover:bg-surface-hover hover:text-foreground">
        −
      </button>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        className="w-10 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
      />
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label="More" className="h-full w-8 text-muted hover:bg-surface-hover hover:text-foreground">
        +
      </button>
    </div>
  );
}

/** A time of day, or none ("Any time" / "Follows on"). */
function TimeField({ label, value, onChange, emptyLabel, inline = false }: { label: string; value: string | null; onChange: (v: string | null) => void; emptyLabel: string; inline?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${inline ? "" : "flex-wrap"}`}>
      <span className={inline ? "text-muted" : LABEL}>{label}</span>
      {value ? (
        <>
          <input type="time" value={value} onChange={(e) => onChange(e.target.value || null)} aria-label={label} className="h-8 rounded-md bg-foreground/[0.05] px-2 text-sm outline-none focus:ring-2 focus:ring-accent/40" />
          <button type="button" onClick={() => onChange(null)} aria-label="Clear the time" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => onChange("08:00")} className="h-8 rounded-md bg-foreground/[0.05] px-2.5 text-sm text-muted hover:bg-surface-hover hover:text-foreground">
          {emptyLabel} · Set a time
        </button>
      )}
    </div>
  );
}

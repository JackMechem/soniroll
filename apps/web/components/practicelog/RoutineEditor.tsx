"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { BackButton, PageShell } from "@/components/library/shared";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { AttachmentList } from "@/components/practicelog/Attachments";
import RoutineIcon, { RoutineIconPicker } from "@/components/practicelog/RoutineIcon";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon, TrashIcon } from "@/components/tools";
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
const INPUT = "h-9 min-w-0 rounded-md bg-foreground/[0.05] px-3 text-sm outline-none focus:ring-2 focus:ring-accent/40";
const TEXTAREA = "resize-y rounded-md bg-foreground/[0.05] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

/** `/shed-log/routine/edit?id=…` (or `?date=…` for a new one starting that day). */
export default function RoutineEditorPage({ id, date }: { id?: string; date?: string }) {
  const log = usePracticeLog();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!log.ready || !mounted) {
    return (
      <PageShell>
        <LoadingSpinner />
      </PageShell>
    );
  }
  const existing = id ? log.data.routines.find((r) => r.id === id) : undefined;
  if (id && !existing) {
    return (
      <PageShell>
        <BackButton href="/shed-log" label="Shed Log" />
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted">That routine doesn&apos;t exist anymore.</p>
      </PageShell>
    );
  }
  const initial = existing ?? newRoutine(isDateKey(date) ? date : todayKey(), log.data.routines.length % ROUTINE_COLORS.length);
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

  const done = () => router.push(isNew ? `/shed-log${returnDate ? `?date=${returnDate}` : ""}` : `/shed-log/routine?id=${encodeURIComponent(r.id)}`);

  function save() {
    if (!r.name.trim()) {
      setError("Give the routine a name.");
      return;
    }
    if (r.repeat.end && r.repeat.end < r.repeat.start) {
      setError("It ends before it starts.");
      return;
    }
    const tasks = r.tasks
      .filter((t) => t.title.trim() || t.minutes > 0)
      .map((t) => ({ ...t, title: t.title.trim(), subtasks: (t.subtasks ?? []).filter((x) => x.title.trim()).map((x) => ({ ...x, title: x.title.trim() })) }));
    log.saveRoutine({ ...r, name: r.name.trim(), tasks });
    done();
  }

  const color = ROUTINE_COLORS[r.color % ROUTINE_COLORS.length];
  const schedule = scheduleTasks(r);
  const weekdays = r.repeat.weekdays.length ? r.repeat.weekdays : [weekdayOf(r.repeat.start)];

  return (
    <PageShell>
      <div className="flex flex-col gap-3 border-b border-foreground/10 pb-6">
        <BackButton onClick={() => router.back()} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "New routine" : "Edit routine"}</h1>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.back()} className="h-9 rounded-md bg-foreground/[0.05] px-4 text-sm font-medium hover:bg-surface-hover">
              Cancel
            </button>
            <button type="button" onClick={save} className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
              Save
            </button>
          </div>
        </div>
      </div>
      {error && <p className="rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">{error}</p>}

      <Card title="Routine">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Name</span>
          <div className="flex items-center gap-2">
            <RoutineIcon icon={r.icon} color={r.color} size="md" />
            <input
              autoFocus={isNew}
              value={r.name}
              onChange={(e) => {
                set({ name: e.target.value });
                setError(null);
              }}
              placeholder="e.g. Morning warm-up"
              className={`${INPUT} flex-1`}
            />
          </div>
        </label>
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
          <div className="flex flex-wrap items-center gap-2">
            {ROUTINE_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ color: i })}
                aria-label={`Color ${i + 1}`}
                aria-pressed={r.color === i}
                className={`h-7 w-7 rounded-full ${r.color === i ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card title="Icon">
        <RoutineIconPicker value={r.icon} color={r.color} onChange={(icon) => set({ icon })} />
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
                  className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${on ? "border-transparent text-white" : "border-foreground/15 text-muted hover:bg-surface-hover hover:text-foreground"}`}
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
          {r.tasks.map((task, i) => (
            <li key={task.id} className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-sm font-medium tabular-nums text-muted">{i + 1}</span>
                <input
                  value={task.title}
                  onChange={(e) => setTask(i, { title: e.target.value })}
                  placeholder="Task — e.g. Scales in all 12 keys"
                  aria-label={`Task ${i + 1}`}
                  className={`${INPUT} flex-1`}
                />
                <div className="flex shrink-0">
                  <IconButton label="Move up" disabled={i === 0} onClick={() => moveTask(i, -1)}>
                    <ChevronLeftIcon className="h-4 w-4 rotate-90" />
                  </IconButton>
                  <IconButton label="Move down" disabled={i === r.tasks.length - 1} onClick={() => moveTask(i, 1)}>
                    <ChevronRightIcon className="h-4 w-4 rotate-90" />
                  </IconButton>
                  <IconButton label="Remove task" onClick={() => set({ tasks: r.tasks.filter((_, j) => j !== i) })}>
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7 text-sm">
                <div className="flex items-center gap-2">
                  <Stepper value={task.minutes} min={0} max={600} step={task.minutes < 5 ? 1 : 5} onChange={(minutes) => setTask(i, { minutes })} />
                  <span className="text-muted">min</span>
                </div>
                <TimeField
                  label="At"
                  value={task.time}
                  onChange={(time) => setTask(i, { time })}
                  emptyLabel={schedule[i]?.start !== null && schedule[i]?.start !== undefined ? `Follows on · ${formatTime(schedule[i].start!)}` : "Follows on"}
                  inline
                />
              </div>
              <div className="pl-7">
                <textarea
                  value={task.notes}
                  onChange={(e) => setTask(i, { notes: e.target.value })}
                  rows={1}
                  placeholder="Notes (optional) — what to focus on"
                  aria-label="Notes"
                  className={`${TEXTAREA} w-full py-1.5`}
                />
              </div>
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
                <button
                  type="button"
                  onClick={() => setTask(i, { subtasks: [...(task.subtasks ?? []), newSubtask()] })}
                  className="flex items-center gap-1 self-start text-xs font-medium text-muted hover:text-foreground"
                >
                  <PlusIcon className="h-3 w-3" /> Subtask
                </button>
              </div>
              <div className="pl-7">
                <AttachmentList items={task.attachments} onChange={(attachments) => setTask(i, { attachments })} compact />
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => set({ tasks: [...r.tasks, newTask()] })}
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
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this routine?"
          message="It comes off the calendar, along with what you checked off and noted for it. Recordings you made for it stay on their days."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            log.deleteRoutine(r.id);
            router.push("/shed-log/routines");
          }}
        />
      )}
    </PageShell>
  );
}

function Card({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface">
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
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

function Stepper({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md bg-background">
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
          {emptyLabel} · set a time
        </button>
      )}
    </div>
  );
}

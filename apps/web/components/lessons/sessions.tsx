"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import { ChevronRightIcon, ChordChartIcon, DocumentIcon, PlusIcon } from "@/components/tools";
import { CapIcon, ClipboardIcon, Dialog, btnPrimary, dialogFooter, btnSecondary, errorText, field, FileIcon } from "@/components/lessons/parts";
import { lessonHref } from "@/components/lessons/NotesPage";
import { materialsHref } from "@/components/lessons/MaterialsPage";

type Counts = { notes: number; assignments: number; files: number; charts: number; open: number; toReview: number };

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "Tue, Oct 21, 2026 · 4:00 PM" (no time for a lesson made for a whole day at midnight). */
export function sessionWhen(start: number, end?: number | null) {
  const d = new Date(start);
  const timed = d.getHours() !== 0 || d.getMinutes() !== 0 || !!end;
  return `${dayFmt.format(start)}${timed ? ` · ${timeFmt.format(start)}${end ? ` – ${timeFmt.format(end)}` : ""}` : ""}`;
}

/**
 * A student's lessons, newest first, each a card that opens the lesson's page (its notes,
 * assignments, files and charts). The teacher sees every lesson — booked ones are hidden from the
 * student until they start — and can make new ones.
 */
export function SessionList({ lessonId, otherName }: { lessonId: Id<"lessonStudents">; otherName: string }) {
  const data = useQuery(api.lessons.sessions, { lessonId });
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());
  if (data === undefined)
    return (
      <div className="flex justify-center rounded-lg bg-surface p-10">
        <LoadingSpinner size="sm" />
      </div>
    );
  if (!data) return null;
  const teacher = data.role === "teacher";
  const upcoming = data.sessions.filter((s) => (s.end ?? s.start) > now && !s.cancelled).reverse();
  const past = data.sessions.filter((s) => !((s.end ?? s.start) > now && !s.cancelled));
  const months: { key: string; label: string; rows: Row[] }[] = [];
  for (const s of past) {
    const d = new Date(s.start);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (months.at(-1)?.key !== key) months.push({ key, label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }), rows: [] });
    months.at(-1)!.rows.push(s);
  }
  const empty = data.sessions.length === 0 && !data.earlier;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Lessons</h2>
          <p className="text-xs text-muted">
            {data.sessions.length
              ? `${data.sessions.length} lesson${data.sessions.length === 1 ? "" : "s"}${upcoming.length ? ` · next ${relWhen(upcoming[0].start, now).toLowerCase()}` : ""}`
              : "Notes, assignments, files and charts live in each lesson."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {!empty && (
            <Link href={materialsHref(lessonId)} className={btnSecondary}>
              All materials
            </Link>
          )}
          {teacher && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={btnPrimary}
            >
              <PlusIcon className="h-4 w-4" /> New lesson
            </button>
          )}
        </div>
      </div>
      {empty ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-foreground/15 p-6 text-center">
          <p className="text-sm font-medium">No lessons yet</p>
          <p className="max-w-sm text-sm text-muted">
            {teacher
              ? `Make a lesson for ${otherName}, then put its notes, assignments, files and charts in it. Booked lessons get one automatically.`
              : `When ${otherName} adds a lesson, its notes and assignments show up here.`}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface">
          {upcoming.length > 0 && (
            <>
              <ListHeading>Coming up</ListHeading>
              {upcoming.map((s) => (
                <SessionRow key={s.id} s={s} lessonId={lessonId} teacher={teacher} now={now} upcoming />
              ))}
            </>
          )}
          {months.map((m) => (
            <div key={m.key}>
              <ListHeading>{m.label}</ListHeading>
              {m.rows.map((s) => (
                <SessionRow key={s.id} s={s} lessonId={lessonId} teacher={teacher} now={now} />
              ))}
            </div>
          ))}
          {data.earlier && (
            <>
              <ListHeading>Before lessons</ListHeading>
              <Link href={lessonHref(lessonId, "earlier")} className="group flex items-center gap-4 border-t border-foreground/10 px-4 py-3 transition-colors hover:bg-surface-hover">
                <span className="w-11 shrink-0 text-center text-muted">
                  <CapIcon className="mx-auto h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">Added before lessons</span>
                  <Contents c={data.earlier} />
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            </>
          )}
        </div>
      )}
      {creating && <NewLessonDialog lessonId={lessonId} otherName={otherName} onClose={() => setCreating(false)} />}
    </section>
  );
}

type Row = {
  id: Id<"lessonSessions">;
  title: string;
  start: number;
  end: number | null;
  booked: boolean;
  cancelled: boolean;
  hiddenUntil: number | null;
  counts: Counts;
};

function ListHeading({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-foreground/10 px-4 pb-1 pt-3 text-xs font-medium text-muted first:border-t-0">{children}</p>;
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago", else the date. */
export function relWhen(ms: number, now: number) {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(ms);
  b.setHours(0, 0, 0, 0);
  const d = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d > 1 && d < 14) return `In ${d} days`;
  if (d < -1 && d > -14) return `${-d} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** What's in a lesson, as small icon + count pairs. */
function Contents({ c }: { c: Counts }) {
  const parts = [
    { n: c.notes, Icon: DocumentIcon, label: "note" },
    { n: c.assignments, Icon: ClipboardIcon, label: "assignment" },
    { n: c.files, Icon: FileIcon, label: "file" },
    { n: c.charts, Icon: ChordChartIcon, label: "chart" },
  ].filter((p) => p.n > 0);
  if (!parts.length) return <span className="block text-xs italic text-muted">Nothing added yet</span>;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
      {parts.map(({ n, Icon, label }) => (
        <span key={label} className="flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" />
          {n} {label}
          {n === 1 ? "" : "s"}
        </span>
      ))}
    </span>
  );
}

function SessionRow({ s, lessonId, teacher, now, upcoming = false }: { s: Row; lessonId: Id<"lessonStudents">; teacher: boolean; now: number; upcoming?: boolean }) {
  const d = new Date(s.start);
  const d2 = new Date(s.start);
  const timed = d2.getHours() !== 0 || d2.getMinutes() !== 0 || !!s.end;
  return (
    <Link
      href={lessonHref(lessonId, s.id)}
      className="group flex items-center gap-4 border-t border-foreground/10 px-4 py-3 transition-colors hover:bg-surface-hover [p+&]:border-t-0"
    >
      <DateTile d={d} tone={s.cancelled ? "muted" : upcoming ? "accent" : "plain"} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`truncate text-sm font-medium ${s.cancelled ? "text-muted line-through" : ""}`}>{s.title}</span>
          {s.cancelled && <Badge tone="muted">Cancelled</Badge>}
          {s.booked && !s.cancelled && <Badge tone="accent">Booked</Badge>}
          {teacher && s.hiddenUntil && <Badge tone="muted">Hidden until it starts</Badge>}
          {teacher && s.counts.toReview > 0 && <Badge tone="accent">{s.counts.toReview} to review</Badge>}
          {!teacher && s.counts.open > 0 && <Badge tone="warn">{s.counts.open} to do</Badge>}
        </span>
        <span className="block text-xs text-muted">
          <span className="text-foreground/80">{relWhen(s.start, now)}</span>
          {timed ? ` · ${timeFmt.format(s.start)}${s.end ? ` – ${timeFmt.format(s.end)}` : ""}` : ""}
        </span>
        <Contents c={s.counts} />
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

function Badge({ tone, children }: { tone: "accent" | "muted" | "warn"; children: React.ReactNode }) {
  const cls = tone === "accent" ? "border border-accent/30 text-accent" : tone === "warn" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-foreground/[0.05] text-muted";
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

/** A lesson's day as a small calendar tile: weekday, date, month. Upcoming lessons get the accent
    on the date. */
function DateTile({ d, tone }: { d: Date; tone: "accent" | "plain" | "muted" }) {
  return (
    <span className={`flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-md bg-background py-1 leading-none ${tone === "muted" ? "text-muted" : ""}`}>
      <span className="text-[10px] text-muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
      <span className={`text-base font-semibold tabular-nums ${tone === "accent" ? "text-accent" : ""}`}>{d.getDate()}</span>
      <span className="text-[10px] text-muted">{d.toLocaleDateString(undefined, { month: "short" })}</span>
    </span>
  );
}

function localDateKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A new lesson: a title, a day (and time, if you like), and whether the student sees it before it starts. */
export function NewLessonDialog({
  lessonId,
  otherName,
  onClose,
  initial,
  sessionId,
}: {
  lessonId: Id<"lessonStudents">;
  otherName: string;
  onClose: () => void;
  /** Editing an existing lesson. */
  initial?: { title: string; start: number; end: number | null; hidden: boolean };
  sessionId?: Id<"lessonSessions">;
}) {
  const router = useRouter();
  const create = useMutation(api.lessons.createSession);
  const update = useMutation(api.lessons.updateSession);
  const [now] = useState(() => Date.now());
  const startAt = initial?.start ?? now;
  const startDate = new Date(startAt);
  const timed = !!initial && (startDate.getHours() !== 0 || startDate.getMinutes() !== 0);
  const [date, setDate] = useState(localDateKey(startAt));
  const [time, setTime] = useState(timed ? `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}` : "");
  const [length, setLength] = useState(initial?.end ? Math.round((initial.end - initial.start) / 60000) : 60);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = new Date(`${date}T${time || "00:00"}`).getTime();
  const future = Number.isFinite(start) && start > now;
  const autoTitle = `Lesson — ${new Date(Number.isFinite(start) ? start : now).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  async function save() {
    if (!Number.isFinite(start)) return;
    setBusy(true);
    setError(null);
    try {
      const end = time ? start + length * 60000 : undefined;
      if (sessionId) {
        await update({ sessionId, title: title.trim() || autoTitle, start, end: end ?? null, hidden: hidden && future });
        onClose();
      } else {
        const id = await create({ lessonId, title: title.trim() || autoTitle, start, ...(end ? { end } : {}), hidden: hidden && future });
        router.push(lessonHref(lessonId, id));
      }
    } catch (e) {
      setError(errorText(e, "Couldn't save the lesson."));
      setBusy(false);
    }
  }

  return (
    <Dialog title={sessionId ? "Edit lesson" : `New lesson with ${otherName}`} onClose={onClose}>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className={field} autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Day
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>
            Time <span className="font-normal text-muted">(optional)</span>
          </span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </label>
      </div>
      {time && (
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Length
          <Select value={length} onChange={setLength} options={[15, 20, 30, 45, 60, 75, 90, 120].map((m) => ({ value: m, label: `${m} minutes` }))} />
        </div>
      )}
      {future && <SwitchRow label={`Hide it from ${otherName} until it starts`} checked={hidden} onChange={setHidden} />}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className={`${dialogFooter} flex justify-end gap-2`}>
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !Number.isFinite(start)}
          onClick={() => void save()}
          className={btnPrimary}
        >
          {busy ? "Saving…" : sessionId ? "Save" : "Make the lesson"}
        </button>
      </div>
    </Dialog>
  );
}

/** The Lessons page's "Coming up": every upcoming lesson across your students and teachers, soonest
    first, each opening its lesson. A student's lesson that isn't open yet shows its time only. */
export function UpcomingLessons() {
  const data = useQuery(api.lessons.upcomingLessons, {});
  const [now] = useState(() => Date.now());
  if (!data || data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Coming up</h2>
      <div className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
        {data.slice(0, 8).map((l) => {
          const d = new Date(l.start);
          const timed = d.getHours() !== 0 || d.getMinutes() !== 0 || !!l.end;
          const body = (
            <>
              <DateTile d={d} tone="accent" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-medium">{l.title}</span>
                  {l.booked && <Badge tone="accent">Booked</Badge>}
                  {l.role === "teacher" && l.hidden && <Badge tone="muted">Hidden until it starts</Badge>}
                  {l.locked && <Badge tone="muted">Opens when it starts</Badge>}
                </span>
                <span className="block truncate text-xs text-muted">
                  <span className="text-foreground/80">{relWhen(l.start, now)}</span>
                  {timed ? ` · ${timeFmt.format(l.start)}${l.end ? ` – ${timeFmt.format(l.end)}` : ""}` : ""}
                  {` · ${l.role === "teacher" ? "with" : "from"} ${l.with}`}
                </span>
              </span>
            </>
          );
          return l.locked ? (
            <div key={l.id} className="flex items-center gap-4 px-4 py-3">
              {body}
            </div>
          ) : (
            <Link
              key={l.id}
              href={lessonHref(l.lessonId, l.id)}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover"
            >
              {body}
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { ChevronRightIcon } from "@/components/tools";
import { ClipboardIcon, PersonBadge, dateLabel } from "@/components/lessons/parts";
import { lessonHref } from "@/components/lessons/NotesPage";
import { materialsHref } from "@/components/lessons/MaterialsPage";
import { relWhen } from "@/components/lessons/sessions";
import { todayKey } from "@/lib/practiceLog";

type Todo = { key: string; href: string; title: string; detail: string; tone?: "danger" | "accent" };

/** What the dashboard's Lessons card needs, or null while loading and when you have no student
    or teacher (the card then isn't shown). */
export function useLessonsData() {
  const { isAuthenticated } = useConvexAuth();
  const today = todayKey();
  const students = useQuery(api.lessons.students, isAuthenticated ? { today } : "skip");
  const teachers = useQuery(api.lessons.myTeachers, isAuthenticated ? {} : "skip");
  const upcoming = useQuery(api.lessons.upcomingLessons, isAuthenticated ? {} : "skip");
  const overview = useQuery(api.lessonSchedule.overview, isAuthenticated ? {} : "skip");
  if (!isAuthenticated || !students || !teachers || !upcoming) return null;
  if (students.length === 0 && teachers.length === 0) return null;
  return { students, teachers, upcoming, overview };
}

/**
 * The dashboard's Lessons card body: your next lessons and your students / teachers (each goes
 * straight to that person's page), and what needs doing — requests to answer and hand-ins to
 * review when you teach, assignments and offered times when you learn.
 */
export default function LessonsDashboard({ data }: { data: NonNullable<ReturnType<typeof useLessonsData>> }) {
  const { students, teachers, upcoming, overview } = data;
  const today = todayKey();
  const [now] = useState(() => Date.now());

  const todos: Todo[] = [];
  // Teaching: requests to answer, hand-ins to review.
  const requests = overview?.asTeacher.filter((b) => b.status === "requested") ?? [];
  for (const b of requests)
    todos.push({
      key: `r-${b.id}`,
      href: `/lessons/student?id=${b.lessonId}`,
      title: `${b.studentName} asked for a lesson`,
      detail: `${relWhen(b.start, now)} · ${new Date(b.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} — accept or decline`,
      tone: "accent",
    });
  for (const s of students)
    if (s.counts.toReview > 0)
      todos.push({
        key: `h-${s.id}`,
        href: materialsHref(s.id),
        title: `${s.name} handed in ${s.counts.toReview} assignment${s.counts.toReview === 1 ? "" : "s"}`,
        detail: "Review and give feedback",
        tone: "accent",
      });
  // Learning: offered times, assignments to do (soonest due first).
  for (const o of overview?.offers ?? [])
    todos.push({
      key: `o-${o.id}`,
      href: `/lessons/book?offer=${o.token}`,
      title: `${o.teacher.name} offered you lesson times`,
      detail: `Pick one of ${o.count}`,
      tone: "accent",
    });
  const assignments = teachers
    .flatMap((t) => t.items.filter((i) => i.kind === "assignment" && !i.done && (!i.submission || i.submission.status === "changes")).map((i) => ({ i, t })))
    .sort((a, b) => (a.i.dueDate ?? "9999").localeCompare(b.i.dueDate ?? "9999"));
  for (const { i, t } of assignments) {
    const overdue = !!i.dueDate && i.dueDate < today;
    todos.push({
      key: `a-${i.id}`,
      href: lessonHref(t.id, i.sessionId ?? "earlier"),
      title: i.title,
      detail: `${i.submission?.status === "changes" ? "Hand it in again" : "Assignment"} from ${t.teacher.name}${i.dueDate ? ` · ${overdue ? "overdue since" : "due"} ${dateLabel(i.dueDate)}` : ""}`,
      tone: overdue ? "danger" : undefined,
    });
  }

  const next = upcoming.slice(0, 5);
  return (
    <div className="grid items-start gap-4 @3xl:grid-cols-3">
      <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
        <h3 className="text-sm font-semibold text-muted">Coming up</h3>
        {next.length === 0 ? (
          <p className="py-3 text-sm text-muted">No lessons scheduled.</p>
        ) : (
          <ul className="flex flex-col">
            {next.map((l) => {
              const d = new Date(l.start);
              const timed = d.getHours() !== 0 || d.getMinutes() !== 0 || !!l.end;
              const row = (
                <>
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-accent py-1 leading-none text-accent-foreground">
                    <span className="text-[10px] font-bold">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="text-lg font-extrabold tabular-nums">{d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{l.title}</span>
                    <span className="block truncate text-xs text-muted">
                      <span className="font-semibold text-foreground/80">{relWhen(l.start, now)}</span>
                      {timed ? ` · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
                      {` · ${l.role === "teacher" ? "with" : "from"} ${l.with}`}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={l.id} className="border-t border-foreground/5 first:border-t-0">
                  <Link
                    href={l.role === "teacher" ? `/lessons/student?id=${l.lessonId}` : `/lessons/teacher?id=${l.lessonId}`}
                    className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover"
                  >
                    {row}
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
        <h3 className="text-sm font-semibold text-muted">
          {students.length && teachers.length ? "Students & teachers" : students.length ? "Your students" : "Your teachers"}
        </h3>
        <ul className="flex flex-col">
          {[
            ...students.map((s) => ({
              key: s.id,
              href: `/lessons/student?id=${s.id}`,
              name: s.name,
              avatarUrl: s.student?.avatarUrl ?? null,
              line: ["Student", s.nextLesson ? `next ${relWhen(s.nextLesson, now).toLowerCase()}` : null, s.counts.toReview ? `${s.counts.toReview} to review` : null]
                .filter(Boolean)
                .join(" · "),
            })),
            ...teachers.map((t) => {
              const open = t.items.filter((i) => i.kind === "assignment" && !i.done).length;
              const nextL = upcoming.find((l) => l.lessonId === t.id);
              return {
                key: t.id,
                href: `/lessons/teacher?id=${t.id}`,
                name: t.teacher.name,
                avatarUrl: t.teacher.avatarUrl,
                line: ["Your teacher", nextL ? `next ${relWhen(nextL.start, now).toLowerCase()}` : null, open ? `${open} to do` : null].filter(Boolean).join(" · "),
              };
            }),
          ]
            .slice(0, 6)
            .map((p) => (
              <li key={p.key} className="border-t border-foreground/5 first:border-t-0">
                <Link href={p.href} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover">
                  <PersonBadge url={p.avatarUrl} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.line}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
        </ul>
        {students.length + teachers.length > 6 && (
          <Link href="/lessons" className="text-xs font-semibold text-accent hover:underline">
            All {students.length + teachers.length} on the Lessons page
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
        <h3 className="text-sm font-semibold text-muted">To do</h3>
        {todos.length === 0 ? (
          <p className="py-3 text-sm text-muted">You&apos;re all caught up.</p>
        ) : (
          <ul className="flex flex-col">
            {todos.slice(0, 6).map((t) => (
              <li key={t.key} className="border-t border-foreground/5 first:border-t-0">
                <Link href={t.href} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-hover">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      t.tone === "danger" ? "bg-danger/15 text-danger" : t.tone === "accent" ? "bg-accent/15 text-accent" : "bg-background text-muted"
                    }`}
                  >
                    <ClipboardIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{t.title}</span>
                    <span className={`block truncate text-xs ${t.tone === "danger" ? "text-danger" : "text-muted"}`}>{t.detail}</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
            {todos.length > 6 && <li className="pt-1 text-xs text-muted">and {todos.length - 6} more on the Lessons page</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { AddStudentDialog, CapIcon, PersonBadge, dateLabel } from "@/components/lessons/parts";
import { EmptyState, Hero, LibraryPage, Panel, Pill } from "@/components/library/ui";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { ChevronRightIcon, PlusIcon, SlidersIcon } from "@/components/tools";
import { ScheduleOverview } from "@/components/lessons/schedule";
import { UpcomingLessons } from "@/components/lessons/sessions";
import { todayKey } from "@/lib/practiceLog";

/**
 * Lessons (`/lessons`): your students (as a teacher) and your teachers (as a student), both on
 * one page — anyone can be either. Add a student by name to get their invite link; everything
 * you add for them is there when they join.
 */
export default function LessonsPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const today = todayKey();
  const students = useQuery(api.lessons.students, isAuthenticated ? { today } : "skip");
  const teachers = useQuery(api.lessons.myTeachers, isAuthenticated ? {} : "skip");
  const [adding, setAdding] = useState(false);

  if (isLoading) {
    return (
      <LibraryPage>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  }

  if (!isAuthenticated) {
    return (
      <LibraryPage>
        <Hero title="Lessons" icon={CapIcon} subtitle="For teachers and their students.">
          <div className="grid divide-y divide-foreground/10 rounded-lg bg-surface md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="flex flex-col gap-1 p-4 text-sm">
              <p className="font-medium">Teach</p>
              <p className="text-muted">
                Give each student lesson notes, PDFs and images, chord charts, assignments and Shed Log routines — then see how their practice goes, day by day.
              </p>
            </div>
            <div className="flex flex-col gap-1 p-4 text-sm">
              <p className="font-medium">Learn</p>
              <p className="text-muted">
                Open the link your teacher sent you, and everything they&apos;ve given you is here — with their routines already in your Shed Log.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <SignInButtons />
          </div>
        </Hero>
      </LibraryPage>
    );
  }

  const loading = students === undefined || teachers === undefined;
  const openTotal = (teachers ?? []).reduce((n, t) => n + t.items.filter((i) => i.kind === "assignment" && !i.done).length, 0);

  return (
    <LibraryPage>
      <Hero
        title="Lessons"
        icon={CapIcon}
        helpTopic="lessons"
        subtitle={
          loading
            ? "Loading…"
            : [
                students!.length ? `${students!.length} student${students!.length === 1 ? "" : "s"}` : null,
                teachers!.length ? `${teachers!.length} teacher${teachers!.length === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Teach, or learn from a teacher"
        }
        actions={
          <>
            <Pill icon={SlidersIcon} label="Settings" href="/lessons/settings" />
            <Pill primary icon={PlusIcon} label="Add a student" onClick={() => setAdding(true)} />
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <ScheduleOverview />
          <UpcomingLessons />
          {teachers!.length > 0 && (
            <Panel flush title="Your teachers" icon={CapIcon} detail={openTotal ? `${openTotal} assignment${openTotal === 1 ? "" : "s"} to do` : undefined}>
              <div className="flex flex-col divide-y divide-foreground/10">
                {teachers!.map((t) => {
                  const open = t.items.filter((i) => i.kind === "assignment" && !i.done);
                  const latest = [...t.items].sort((a, b) => b.createdAt - a.createdAt)[0];
                  return (
                    <Link
                      key={t.id}
                      href={`/lessons/teacher?id=${t.id}`}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <PersonBadge url={t.teacher.avatarUrl} name={t.teacher.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.teacher.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {open.length
                            ? `${open.length} assignment${open.length === 1 ? "" : "s"} to do`
                            : `${t.items.length} thing${t.items.length === 1 ? "" : "s"} from them`}
                          {latest ? ` · latest: ${latest.title}` : ""}
                        </span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  );
                })}
              </div>
            </Panel>
          )}

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Your students{students!.length > 0 && <span className="font-normal text-muted"> · {students!.length}</span>}
              </h2>
              {students!.length > 0 && (
                <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
                  <PlusIcon className="h-3.5 w-3.5" /> Add a student
                </button>
              )}
            </div>
            {students!.length === 0 ? (
              <div className="rounded-lg border border-dashed border-foreground/15">
                <EmptyState
                  icon={CapIcon}
                  title="Teach with soniroll"
                  body="Add a student to get their invite link. Give them lesson notes, PDFs and images, chord charts, assignments and Shed Log routines — and see how their practice goes."
                  action={<Pill primary icon={PlusIcon} label="Add your first student" onClick={() => setAdding(true)} />}
                />
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
                {students!.map((s) => (
                  <Link
                    key={s.id}
                    href={`/lessons/student?id=${s.id}`}
                    className="group flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-surface-hover md:flex-row md:items-center md:gap-4"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <PersonBadge url={s.student?.avatarUrl} name={s.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {s.joined ? s.student?.name : s.inviteEmail ? `Invited · ${s.inviteEmail}` : "Hasn't joined yet — send their invite link"}
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-11 text-xs text-muted md:shrink-0 md:justify-end md:pl-0">
                      {s.counts.toReview > 0 && <span className="font-medium text-accent">{s.counts.toReview} to review</span>}
                      {s.counts.assignmentsDue > 0 && <span className="font-medium text-danger">{s.counts.assignmentsDue} overdue</span>}
                      {s.joined && <Fact label="This week" value={`${Math.round(s.hoursThisWeek * 10) / 10} h`} />}
                      {s.joined && s.streak > 0 && <Fact label="Streak" value={`${s.streak} day${s.streak === 1 ? "" : "s"}`} />}
                      <Fact
                        label="Last practiced"
                        value={s.lastPracticed ? (s.lastPracticed === today ? "Today" : dateLabel(s.lastPracticed, { month: "short", day: "numeric" })) : "—"}
                      />
                      <Fact label="To do" value={String(s.counts.assignmentsOpen)} />
                      <span>
                        {s.lessons} lesson{s.lessons === 1 ? "" : "s"}
                        {s.nextLesson ? ` · next ${new Date(s.nextLesson).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : ""}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {adding && (
        <AddStudentDialog
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            router.push(`/lessons/student?id=${id}`);
          }}
        />
      )}
    </LibraryPage>
  );
}

/** A small "label value" fact on a student's row. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className="tabular-nums text-foreground/80">{value}</span>
    </span>
  );
}

"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyState, Hero, LibraryPage, Pill } from "@/components/library/ui";
import { ScheduleCard } from "@/components/lessons/schedule";
import { CapIcon, PersonBadge, type LessonItem } from "@/components/lessons/parts";
import { SessionList } from "@/components/lessons/sessions";
import { RoutineRow } from "@/components/lessons/routines";

/**
 * A student's page for one of their teachers (`/lessons/teacher?id=`): their lessons (each opens
 * its notes, assignments, files and charts), the routines the teacher gave them (already in their
 * Shed Log), and booking.
 */
export default function TeacherPage({ id }: { id: string }) {
  const router = useRouter();
  const teachers = useQuery(api.lessons.myTeachers, {});
  const leave = useMutation(api.lessons.leave);
  const [leaving, setLeaving] = useState(false);
  const lesson = teachers?.find((t) => t.id === id);
  const routineItems = ((lesson?.items ?? []) as LessonItem[]).filter((i) => i.kind === "routine");

  if (teachers === undefined) {
    return (
      <LibraryPage>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  }
  if (!lesson) {
    return (
      <LibraryPage>
        <div className="rounded-lg border border-dashed border-foreground/15">
          <EmptyState icon={CapIcon} title="Not found" body="You're not this teacher's student (anymore)." action={<Pill label="Lessons" href="/lessons" />} />
        </div>
      </LibraryPage>
    );
  }

  const open = lesson.items.filter((i) => i.kind === "assignment" && !i.done).length;
  const routines = lesson.items.filter((i) => i.kind === "routine").length;

  return (
    <LibraryPage>
      <Hero
        title={lesson.teacher.name}
        backHref="/lessons"
        backLabel="Lessons"
        leading={<PersonBadge url={lesson.teacher.avatarUrl} name={lesson.teacher.name} size="lg" />}
        subtitle={
          <>
            Your teacher · {open ? `${open} assignment${open === 1 ? "" : "s"} to do` : "nothing due"}
            {routines ? ` · ${routines} routine${routines === 1 ? "" : "s"} in your Shed Log` : ""}
          </>
        }
        actions={
          <>
            <Pill label="Leave" onClick={() => setLeaving(true)} />
          </>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="order-2 flex min-w-0 flex-col gap-6 xl:order-1">
          <SessionList lessonId={lesson.id} otherName={lesson.teacher.name} />
          {routineItems.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="px-1">
                <h2 className="text-sm font-medium">Practice routines</h2>
                <p className="text-xs text-muted">From {lesson.teacher.name} — already in your Shed Log.</p>
              </div>
              <div className="flex flex-col gap-2">
                {routineItems.map((item) => (
                  <RoutineRow key={item.id} item={item} teacher={false} />
                ))}
              </div>
            </section>
          )}
        </section>
        <aside className="order-1 flex flex-col gap-4 xl:sticky xl:top-6 xl:order-2">
          <ScheduleCard lessonId={lesson.id} />
        </aside>
      </div>
      {leaving && (
        <ConfirmDialog
          title={`Leave ${lesson.teacher.name}'s lessons?`}
          message="They stop seeing your practice, their things go from your Lessons, and their routines leave your Shed Log (the days you logged stay). They'd have to send you a new link to rejoin."
          confirmLabel="Leave"
          onConfirm={() => {
            void leave({ id: lesson.id });
            router.push("/lessons");
          }}
          onCancel={() => setLeaving(false)}
        />
      )}
    </LibraryPage>
  );
}

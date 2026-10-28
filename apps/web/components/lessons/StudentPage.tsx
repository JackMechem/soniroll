"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import PromptDialog from "@/components/PromptDialog";
import { menuPosition } from "@/components/library/shared";
import { EmptyState, Hero, LibraryPage, Pill } from "@/components/library/ui";
import { CapIcon, EmailInviteForm, MoreButton, PersonBadge, RoutinePickDialog, dateLabel, type LessonItem } from "@/components/lessons/parts";
import { LinkIcon, PlusIcon, ShareIcon } from "@/components/tools";
import { ScheduleCard } from "@/components/lessons/schedule";
import { SessionList } from "@/components/lessons/sessions";
import { RoutineRow } from "@/components/lessons/routines";
import { todayKey, type Routine } from "@/lib/practiceLog";
import { shareLink } from "@/lib/shareLink";
import { usePracticeLog } from "@/lib/usePracticeLog";
import { siteOrigin } from "@/lib/siteOrigin";

type Adding = { kind: "routine"; replace?: LessonItem };

/**
 * A teacher's page for one student (`/lessons/student?id=`): their invite link until they join,
 * everything you've given them (add notes, files, charts, assignments and routines), and their
 * practice — Shed Log stats and, per routine you assigned, every day of it.
 */
export default function StudentPage({ id }: { id: string }) {
  const router = useRouter();
  const today = todayKey();
  const data = useQuery(api.lessons.student, id ? { id: id as Id<"lessonStudents">, today } : "skip");
  const removeItem = useMutation(api.lessons.removeItem);
  const updateItem = useMutation(api.lessons.updateItem);
  const addItem = useMutation(api.lessons.addItem);
  const rename = useMutation(api.lessons.renameStudent);
  const newLink = useMutation(api.lessons.newInviteLink);
  const removeStudent = useMutation(api.lessons.removeStudent);
  const { data: log } = usePracticeLog();
  const [adding, setAdding] = useState<Adding | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "student" } | { kind: "item"; item: LessonItem } | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <LibraryPage>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  }
  if (!data) {
    return (
      <LibraryPage>
        <div className="rounded-2xl bg-surface">
          <EmptyState icon={CapIcon} title="Student not found" body="They may have been removed." action={<Pill label="Lessons" href="/lessons" />} />
        </div>
      </LibraryPage>
    );
  }

  const lessonId = data.id;
  const features = data.features;
  const routineItems = (data.items as LessonItem[]).filter((i) => i.kind === "routine");
  const inviteUrl = typeof window !== "undefined" ? `${siteOrigin()}/lessons/join?invite=${data.code}` : "";
  const routineSummary = new Map(data.routines.map((r) => [r.itemId, r]));



  async function copyInvite() {
    const res = await shareLink(`Lessons with me on soniroll`, inviteUrl);
    setLinkNote(res === "copied" ? "Link copied." : res === "failed" ? "Couldn't copy — select it and copy it yourself." : null);
  }

  async function assign(routine: Routine, replace?: LessonItem) {
    if (replace) await updateItem({ itemId: replace.id, title: routine.name, routine });
    else await addItem({ lessonId, kind: "routine", title: routine.name, routine });
    setAdding(null);
  }

  const p = data.practice;

  return (
    <LibraryPage>
      <Hero
        title={data.name}
        backHref="/lessons"
        backLabel="Lessons"
        leading={<PersonBadge url={data.student?.avatarUrl} name={data.name} size="lg" />}
        subtitle={
          data.joined
            ? `${data.student?.name}${data.joinedAt ? ` · student since ${new Date(data.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}`
            : "Hasn't joined yet"
        }
        actions={
          <>
            <MoreButton
              label={`Options for ${data.name}`}
              onClick={(e) =>
                setMenu({
                  ...menuPosition(e),
                  items: [
                    { label: "Rename", onSelect: () => setRenaming(true) },
                    { label: "Copy invite link", onSelect: () => void copyInvite() },
                    { label: "Make a new invite link", onSelect: () => void newLink({ id: lessonId }) },
                    { label: "Lesson settings…", onSelect: () => router.push("/lessons/settings") },
                    { label: "Remove student", danger: true, onSelect: () => setConfirm({ kind: "student" }) },
                  ],
                })
              }
            />
          </>
        }
      >
        {!data.joined && (
          <div className="grid gap-4 rounded-2xl bg-background p-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">Email {data.name} their invite</p>
              <EmailInviteForm lessonId={lessonId} name={data.name} initialEmail={data.inviteEmail ?? ""} sentTo={data.inviteEmail} sentAt={data.invitedAt} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">…or send the link yourself</p>
              <p className="text-xs text-muted">
                They sign in (or sign up, free) and join — everything you add here is waiting for them, and your routines go straight into their Shed Log.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2 text-xs">{inviteUrl}</code>
                <Pill icon={ShareIcon} label="Share link" onClick={() => void copyInvite()} />
              </div>
              {linkNote && <p className="text-xs text-muted">{linkNote}</p>}
            </div>
          </div>
        )}
      </Hero>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-6">
          <SessionList lessonId={lessonId} otherName={data.name} />
          {features.routines && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <div>
                  <h2 className="text-lg font-bold">Practice routines</h2>
                  <p className="text-xs text-muted">In {data.name}&apos;s Shed Log, not tied to one lesson. Open one for its practice report.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdding({ kind: "routine" })}
                  className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  <PlusIcon className="h-4 w-4" /> Assign a routine
                </button>
              </div>
              {routineItems.length === 0 ? (
                <p className="rounded-2xl bg-surface p-4 text-sm text-muted">No routines yet. Assign one of yours and see every day of it here.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {routineItems.map((item) => (
                    <RoutineRow
                      key={item.id}
                      item={item}
                      teacher
                      summary={routineSummary.get(item.id)}
                      onEdit={() => setAdding({ kind: "routine", replace: item })}
                      onRemove={() => setConfirm({ kind: "item", item })}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </section>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
          <ScheduleCard lessonId={lessonId} />
          <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <h2 className="font-bold">Practice</h2>
            {!data.joined ? (
              <p className="text-sm text-muted">You&apos;ll see their Shed Log once they join.</p>
            ) : !p ? (
              <p className="text-sm text-muted">No practice logged yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Day streak" value={`🔥 ${p.streak}`} />
                  <Tile label="Best streak" value={String(p.best)} />
                  <Tile label="This week" value={`${Math.round(p.weekHours * 10) / 10} h`} />
                  <Tile label="All time" value={`${Math.round(p.hours)} h`} />
                  <Tile label="Days, last year" value={String(p.days)} />
                  <Tile label="Goal days, last 30" value={String(p.goalDays)} />
                </div>
                <p className="text-xs text-muted">
                  Last practiced {data.lastPracticed ? (data.lastPracticed === today ? "today" : dateLabel(data.lastPracticed)) : "—"}.
                </p>
              </>
            )}
          </section>
          {data.joined && (
            <button type="button" onClick={() => void copyInvite()} className="flex items-center gap-2 self-start text-xs font-semibold text-muted hover:text-foreground">
              <LinkIcon className="h-3.5 w-3.5" /> Copy their invite link
            </button>
          )}
        </aside>
      </div>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {adding?.kind === "routine" && (
        <RoutinePickDialog
          routines={log.routines.filter((r) => !r.assigned)}
          title={adding.replace ? `Replace "${adding.replace.title}"` : "Assign a routine"}
          onPick={(r) => void assign(r, adding.replace)}
          onClose={() => setAdding(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename student"
          initialValue={data.name}
          onSubmit={(name) => {
            void rename({ id: lessonId, name });
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      )}
      {confirm?.kind === "student" && (
        <ConfirmDialog
          title={`Remove ${data.name}?`}
          message="Everything you gave them goes too, and you stop seeing their practice. The routines you assigned leave their Shed Log; their own practice stays theirs."
          confirmLabel="Remove"
          onConfirm={() => {
            void removeStudent({ id: lessonId });
            router.push("/lessons");
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "item" && (
        <ConfirmDialog
          title={`Remove "${confirm.item.title}"?`}
          message={
            confirm.item.kind === "routine" ? "It leaves their Shed Log too (the days they already logged stay in their log)." : "Your student won't see it anymore."
          }
          confirmLabel="Remove"
          onConfirm={() => {
            void removeItem({ itemId: confirm.item.id });
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </LibraryPage>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-2.5">
      <div className="text-lg font-extrabold tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold text-muted">{label}</div>
    </div>
  );
}

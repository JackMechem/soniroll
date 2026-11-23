"use client";

import PageBar from "@/components/PageBar";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import { menuPosition } from "@/components/library/shared";
import { EmptyState, Hero, LibraryPage, Pill } from "@/components/library/ui";
import { CapIcon, ItemCard, ItemDialog, KindFilter, MoreButton, PersonBadge, btnSmall, useSortedItems, type LessonItem } from "@/components/lessons/parts";
import { notesHref } from "@/components/lessons/NotesPage";
import { NewLessonDialog, sessionWhen } from "@/components/lessons/sessions";
import { lessonHref } from "@/components/lessons/NotesPage";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, DocumentIcon, PlusIcon } from "@/components/tools";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

type Adding = { kind: "note" | "assignment" | "file"; item?: LessonItem } | { kind: "chart" };

/**
 * One lesson (`/lessons/lesson?pair=<student id>&id=<lesson id | earlier>`): its notes,
 * assignments, files and chord charts. The teacher adds and edits them, renames or re-dates the
 * lesson, and decides when the student sees it; the student reads and hands in.
 */
export default function LessonPage({ pair, id }: { pair: string; id: string }) {
  const router = useRouter();
  const lessonId = pair as Id<"lessonStudents">;
  const sessionId = id && id !== "earlier" ? (id as Id<"lessonSessions">) : undefined;
  const data = useQuery(api.lessons.session, pair ? { lessonId, ...(sessionId ? { sessionId } : {}) } : "skip");
  const addItem = useMutation(api.lessons.addItem);
  const addChart = useMutation(api.lessons.addChart);
  const removeItem = useMutation(api.lessons.removeItem);
  const setDone = useMutation(api.lessons.setDone);
  const updateSession = useMutation(api.lessons.updateSession);
  const removeSession = useMutation(api.lessons.removeSession);
  const { allSongs } = useChordChartsLibrary(null);
  const list = useQuery(api.lessons.sessions, pair ? { lessonId } : "skip");
  const [filter, setFilter] = useState<LessonItem["kind"] | "all">("all");
  const [adding, setAdding] = useState<Adding | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "lesson" } | { kind: "item"; item: LessonItem } | null>(null);
  const items = useSortedItems(data?.items as LessonItem[] | undefined, filter);

  if (data === undefined)
    return (
      <LibraryPage>
        <PageBar crumbs={[{ label: "Lessons", href: "/lessons" }, { label: "Lesson" }]} icon={CapIcon} />
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  const backHref = data?.role === "student" ? `/lessons/teacher?id=${pair}` : `/lessons/student?id=${pair}`;
  if (!data)
    return (
      <LibraryPage>
        <PageBar crumbs={[{ label: "Lessons", href: "/lessons" }, { label: "Lesson" }]} icon={CapIcon} />
        <div className="rounded-lg border border-dashed border-foreground/15">
          <EmptyState
            icon={CapIcon}
            title="Lesson not found"
            body="It may have been deleted, or it isn't open to you yet."
            action={<Pill label="Lessons" href="/lessons" />}
          />
        </div>
      </LibraryPage>
    );

  const teacher = data.role === "teacher";
  const f = data.features;
  const s = data.session;
  const otherName = teacher ? data.studentName : (data.other?.name ?? "Your teacher");
  const sessionKey = s ? s.id : "earlier";
  const notesLink = (noteId?: string) => notesHref(lessonId, noteId, sessionKey);

  async function newNote() {
    // In a lesson, just "Notes" (the lesson's own name already says which one and when).
    const title = s ? "Notes" : `Lesson — ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    const noteId = await addItem({ lessonId, kind: "note", title, body: "", ...(sessionId ? { sessionId } : {}) });
    router.push(notesLink(noteId));
  }

  function openAddMenu(e: React.MouseEvent) {
    setMenu({
      ...menuPosition(e),
      items: [
        ...(f.assignments ? [{ label: "Assignment", onSelect: () => setAdding({ kind: "assignment" }) }] : []),
        ...(f.notes ? [{ label: "Lesson notes", onSelect: () => void newNote() }] : []),
        ...(f.files ? [{ label: "PDF, image or audio", onSelect: () => setAdding({ kind: "file" }) }] : []),
        ...(f.charts ? [{ label: "Chord chart", onSelect: () => setAdding({ kind: "chart" }) }] : []),
      ],
    });
  }

  function openMore(e: React.MouseEvent) {
    if (!s) return;
    setMenu({
      ...menuPosition(e),
      items: [
        { label: "Edit title and time", onSelect: () => setEditing(true) },
        ...(s.hiddenUntil
          ? [{ label: `Show it to ${otherName} now`, onSelect: () => void updateSession({ sessionId: s.id, hidden: false }) }]
          : s.start > Date.now()
            ? [{ label: `Hide it from ${otherName} until it starts`, onSelect: () => void updateSession({ sessionId: s.id, hidden: true }) }]
            : []),
        { label: "Delete lesson", danger: true, onSelect: () => setConfirm({ kind: "lesson" }) },
      ],
    });
  }

  const title = s ? s.title : "Before lessons";
  const hasNotes = f.notes && data.items.some((i) => i.kind === "note");

  return (
    <LibraryPage>
      <Hero
        title={title}
        icon={CapIcon}
        crumbs={[{ label: "Lessons", href: "/lessons" }, { label: otherName, href: backHref }]}
        leading={<PersonBadge url={data.other?.avatarUrl} name={otherName} size="lg" />}
        // The lesson's name as the page's heading, like a tune's (the crumb is cut short on phones).
        heading={title}
        subtitle={
          <>
            {s ? sessionWhen(s.start, s.end) : "Things added before lessons had their own pages"}
            {` · ${teacher ? `with ${data.studentName}` : `with ${otherName}`}`}
            {s?.booked && " · booked"}
            {s?.cancelled && " · cancelled"}
          </>
        }
        actions={
          <>
            {hasNotes && <Pill icon={DocumentIcon} label="Notes" href={notesLink()} iconOnlyOnPhone />}
            {teacher && <Pill primary icon={PlusIcon} label="Add" onClick={openAddMenu} />}
            {teacher && s && <MoreButton label="Lesson options" onClick={openMore} />}
          </>
        }
      >
        {teacher && s?.hiddenUntil && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <b className="font-medium">{data.studentName} can&apos;t see this yet.</b> <span className="text-muted">It opens for them when the lesson starts — get it ready now.</span>
            </span>
            <button
              type="button"
              onClick={() => void updateSession({ sessionId: s.id, hidden: false })}
              className={btnSmall}
            >
              Show it now
            </button>
          </div>
        )}
      </Hero>

      {s && list && <LessonNav lessonId={lessonId} currentId={s.id} sessions={list.sessions} />}
      {data.items.length > 0 && <KindFilter items={data.items as LessonItem[]} value={filter} onChange={setFilter} />}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/15">
          <EmptyState
            icon={CapIcon}
            title={filter === "all" ? "Nothing in this lesson yet" : "Nothing here"}
            body={
              teacher ? "Add lesson notes, an assignment, a file or a chord chart." : `When ${otherName} adds notes or assignments to this lesson, they show up here.`
            }
            action={teacher ? <Pill primary icon={PlusIcon} label="Add" onClick={openAddMenu} /> : undefined}
          />
        </div>
      ) : (
        <div className="grid items-start gap-3 2xl:grid-cols-2">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              teacher={teacher}
              studentName={data.studentName}
              saveChartsAs={teacher ? undefined : `From ${otherName}`}
              notesHref={item.kind === "note" ? notesLink(item.id) : undefined}
              onToggleDone={!teacher && item.kind === "assignment" && !item.submit ? (done) => void setDone({ itemId: item.id, done }) : undefined}
              onEdit={
                !teacher
                  ? undefined
                  : item.kind === "note"
                    ? () => router.push(notesLink(item.id))
                    : item.kind === "assignment" || item.kind === "file"
                      ? () => setAdding({ kind: item.kind as "assignment" | "file", item })
                      : undefined
              }
              onRemove={teacher ? () => setConfirm({ kind: "item", item }) : undefined}
            />
          ))}
        </div>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {adding && adding.kind !== "chart" && (
        <ItemDialog lessonId={lessonId} sessionId={sessionId} kind={adding.kind} item={"item" in adding ? adding.item : undefined} onClose={() => setAdding(null)} />
      )}
      {adding?.kind === "chart" && (
        <ChartLinkPicker
          songs={allSongs}
          initialQuery=""
          onPick={(songId) => {
            setAdding(null);
            void addChart({ lessonId, songId: songId as Id<"chordChartSongs">, ...(sessionId ? { sessionId } : {}) });
          }}
          onClose={() => setAdding(null)}
        />
      )}
      {editing && s && (
        <NewLessonDialog
          lessonId={lessonId}
          otherName={otherName}
          sessionId={s.id}
          initial={{ title: s.title, start: s.start, end: s.end, hidden: !!s.hiddenUntil }}
          onClose={() => setEditing(false)}
        />
      )}
      {confirm?.kind === "lesson" && s && (
        <ConfirmDialog
          title={`Delete "${s.title}"?`}
          message={`Its notes, assignments (and what ${data.studentName} handed in), files and charts are deleted too.${s.booked && !s.cancelled ? " The booked time stays booked — cancel it from the Lessons card if it's off." : ""}`}
          confirmLabel="Delete"
          onConfirm={() => {
            void removeSession({ sessionId: s.id });
            router.push(backHref);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "item" && (
        <ConfirmDialog
          title={`Remove "${confirm.item.title}"?`}
          message={confirm.item.kind === "assignment" ? "What they handed in for it goes too." : "Your student won't see it anymore."}
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

/** The lessons before and after this one (by date), to step through them. */
function LessonNav({ lessonId, currentId, sessions }: { lessonId: Id<"lessonStudents">; currentId: string; sessions: { id: string; title: string; start: number }[] }) {
  // `sessions` is newest first.
  const i = sessions.findIndex((x) => x.id === currentId);
  if (i < 0) return null;
  const newer = sessions[i - 1];
  const older = sessions[i + 1];
  if (!newer && !older) return null;
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <nav className="-mt-2 flex items-center justify-between gap-2">
      {older ? (
        <Link
          href={lessonHref(lessonId, older.id)}
          className="flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Previous · {older.title} <span className="font-normal">({day(older.start)})</span>
          </span>
        </Link>
      ) : (
        <span />
      )}
      {newer && (
        <Link
          href={lessonHref(lessonId, newer.id)}
          className="flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <span className="truncate">
            Next · {newer.title} <span className="font-normal">({day(newer.start)})</span>
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0" />
        </Link>
      )}
    </nav>
  );
}

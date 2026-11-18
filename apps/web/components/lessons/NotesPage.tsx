"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyState, Pill } from "@/components/library/ui";
import { CapIcon, PersonBadge, btnPrimary } from "@/components/lessons/parts";
import LessonNoteEditor from "@/components/lessons/LessonNoteEditor";
import AttachedNotes from "@/components/shednotes/AttachedNotes";
import { noteSnippet } from "@jam-practice/core/shedNotes";
import { ChevronLeftIcon, NoteIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/tools";

type Note = { id: Id<"lessonItems">; title: string; body: string; createdAt: number; updatedAt: number };

const SAVE_MS = 700;

/** A lesson's notes page; `session` = one lesson's notes (an id, or "earlier"). */
export const notesHref = (lessonId: string, noteId?: string, session?: string) =>
  `/lessons/notes?lesson=${lessonId}${session ? `&session=${session}` : ""}${noteId ? `&note=${noteId}` : ""}`;

/** One lesson's page (`session` an id, or "earlier"). */
export const lessonHref = (lessonId: string, session: string) => `/lessons/lesson?pair=${lessonId}&id=${session}`;

/**
 * A lesson's notes on their own page (`/lessons/notes?lesson=&note=`): a sidebar of every note
 * (search, newest first, grouped by month; "New note" for the teacher) and the open note — a rich
 * text editor with Markdown for the teacher (saved as you type), the same note read-only for the
 * student. On phones the list and the note are separate screens.
 */
export default function NotesPage({ lessonId, noteId, session }: { lessonId: string; noteId?: string; session?: string }) {
  const router = useRouter();
  const sessionArg = session === "earlier" ? null : session ? (session as Id<"lessonSessions">) : undefined;
  const data = useQuery(
    api.lessons.notes,
    lessonId ? { lessonId: lessonId as Id<"lessonStudents">, ...(sessionArg !== undefined ? { sessionId: sessionArg } : {}) } : "skip",
  );
  const href = (id?: string) => notesHref(lessonId, id, session);
  const addItem = useMutation(api.lessons.addItem);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const notes = useMemo(() => (data?.notes ?? []) as Note[], [data]);
  const selected = notes.find((n) => n.id === noteId) ?? null;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q)) : notes), [notes, q]);
  const groups = useMemo(() => {
    const out: { month: string; notes: Note[] }[] = [];
    for (const n of shown) {
      const month = new Date(n.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const last = out[out.length - 1];
      if (last?.month === month) last.notes.push(n);
      else out.push({ month, notes: [n] });
    }
    return out;
  }, [shown]);

  // On a wide screen, open the newest note when none is picked.
  useEffect(() => {
    if (!data || noteId || !notes.length) return;
    if (window.matchMedia("(min-width: 1024px)").matches) router.replace(notesHref(lessonId, notes[0].id, session));
  }, [data, noteId, notes, lessonId, session, router]);

  if (data === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <LoadingSpinner />
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <div className="rounded-lg border border-dashed border-foreground/15">
          <EmptyState icon={CapIcon} title="Notes not found" body="These aren't your lesson notes." action={<Pill label="Lessons" href="/lessons" />} />
        </div>
      </main>
    );
  }

  const teacher = data.role === "teacher";
  const backHref = session ? lessonHref(lessonId, session) : teacher ? `/lessons/student?id=${lessonId}` : `/lessons/teacher?id=${lessonId}`;
  const heading = teacher ? data.studentName : (data.other?.name ?? "Your teacher");

  async function newNote() {
    setCreating(true);
    try {
      const title = `Lesson — ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
      const id = await addItem({ lessonId: lessonId as Id<"lessonStudents">, kind: "note", title, body: "", ...(sessionArg ? { sessionId: sessionArg } : {}) });
      setQuery("");
      router.replace(href(id));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="flex w-full flex-col pt-[calc(env(safe-area-inset-top)+3.5rem)] lg:h-dvh lg:flex-row lg:pt-0">
      {/* The list */}
      <aside className={`${selected ? "hidden lg:flex" : "flex"} w-full shrink-0 flex-col gap-3 border-foreground/10 p-4 lg:h-full lg:w-80 lg:border-r lg:p-5`}>
        <Link
          href={backHref}
          className="-ml-1 inline-flex h-8 items-center gap-0.5 self-start rounded-md pl-1 pr-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          {heading}
        </Link>
        <div className="flex items-center gap-3">
          <PersonBadge url={data.other?.avatarUrl} name={heading} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">{data.session ? data.session.title : "Lesson notes"}</h1>
            <p className="truncate text-xs text-muted">
              {data.session
                ? `${new Date(data.session.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · `
                : session === "earlier"
                  ? "Earlier · "
                  : ""}
              {teacher ? `For ${data.studentName}` : `From ${heading}`} · {notes.length} note{notes.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {teacher && (
          <button
            type="button"
            onClick={() => void newNote()}
            disabled={creating}
            className={`${btnPrimary} w-full`}
          >
            <PlusIcon className="h-4 w-4" />
            New note
          </button>
        )}
        <label className="flex h-9 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <nav className="-mx-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pb-4" aria-label="Notes">
          {notes.length === 0 ? (
            <p className="px-1 text-sm text-muted">{teacher ? "No notes yet — start one for your next lesson." : "No notes yet."}</p>
          ) : shown.length === 0 ? (
            <p className="px-1 text-sm text-muted">No notes match “{query}”.</p>
          ) : (
            groups.map((g) => (
              <div key={g.month} className="flex flex-col gap-1">
                <p className="px-2 text-xs font-medium text-muted">{g.month}</p>
                {g.notes.map((n) => {
                  const active = n.id === selected?.id;
                  const snippet = noteSnippet(n.body, 90);
                  return (
                    <Link
                      key={n.id}
                      href={href(n.id)}
                      replace
                      aria-current={active ? "page" : undefined}
                      className={`flex flex-col rounded-md px-2 py-2 transition-colors ${active ? "bg-surface-hover" : "hover:bg-surface-hover/60"}`}
                    >
                      <span className={`truncate text-sm font-medium ${active ? "text-foreground" : ""}`}>{n.title || "Untitled"}</span>
                      <span className="truncate text-xs text-muted">
                        {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {snippet ? ` · ${snippet}` : ""}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </nav>
        {/* Private Shed Notes attached to these lessons: only the person who attached them sees them. */}
        <section className="flex flex-col gap-2 border-t border-foreground/10 pt-3">
          <h2 className="text-xs font-medium text-muted">Your own notes</h2>
          <AttachedNotes target={{ kind: "lesson", lessonId }} label={`Lessons with ${heading}`} newTitle={`Lessons with ${heading}`} cardClassName="bg-surface" buttonClassName="rounded-md bg-foreground/[0.05] px-2.5 py-1 text-xs font-medium hover:bg-surface-hover" />
        </section>
      </aside>

      {/* The note */}
      <section className={`${selected ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col lg:h-full lg:overflow-y-auto`}>
        {selected ? (
          <NoteView
            lessonId={lessonId}
            key={selected.id}
            note={selected}
            teacher={teacher}
            listHref={href()}
            onDeleted={() => router.replace(href(notes.find((n) => n.id !== selected.id)?.id))}
          />
        ) : (
          <div className="m-auto w-full max-w-md p-8">
            <div className="rounded-lg border border-dashed border-foreground/15">
            <EmptyState
              icon={NoteIcon}
              title={notes.length ? "Pick a note" : teacher ? "No notes yet" : "No notes yet"}
              body={
                teacher
                  ? "Write what you worked on and what to practice next. Headings, lists, checklists and links all work — type Markdown or use the toolbar."
                  : `Notes ${heading} writes for you show up here.`
              }
              action={teacher ? <Pill primary icon={PlusIcon} label="New note" onClick={() => void newNote()} /> : undefined}
            />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/** One note: the teacher edits its title and text (saved as you type); the student reads it. */
function NoteView({ note, teacher, listHref, onDeleted, lessonId }: { note: Note; teacher: boolean; listHref: string; onDeleted: () => void; lessonId: string }) {
  const update = useMutation(api.lessons.updateItem);
  const remove = useMutation(api.lessons.removeItem);
  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = useRef<{ title?: string; body?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});

  useEffect(() => {
    saveRef.current = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const changes = pending.current;
      if (changes.title === undefined && changes.body === undefined) return;
      pending.current = {};
      setStatus("saving");
      update({ itemId: note.id, ...changes })
        .then(() => setStatus((s) => (s === "saving" ? "saved" : s)))
        .catch(() => setStatus("unsaved"));
    };
  });
  // Save what's left when switching notes or leaving the page.
  useEffect(() => () => saveRef.current(), []);

  function queue(changes: { title?: string; body?: string }) {
    pending.current = { ...pending.current, ...changes };
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveRef.current(), SAVE_MS);
  }

  const created = new Date(note.createdAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-24 pt-2 sm:px-8 lg:pt-10">
      <div className="flex items-center gap-2 lg:hidden">
        <Link
          href={listHref}
          replace
          className="-ml-1 inline-flex h-8 items-center gap-0.5 rounded-md pl-1 pr-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ChevronLeftIcon className="h-4 w-4" /> All notes
        </Link>
      </div>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {teacher ? (
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                queue({ title: e.target.value });
              }}
              onBlur={() => saveRef.current()}
              placeholder="Title"
              aria-label="Note title"
              className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted sm:text-3xl"
            />
          ) : (
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{note.title || "Untitled"}</h2>
          )}
          <p className="mt-1 text-xs text-muted">
            {created}
            {note.updatedAt > note.createdAt + 60000 ? ` · edited ${new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
          </p>
        </div>
        {teacher && (
          <div className="flex shrink-0 items-center gap-2 pt-2">
            <span
              className={`text-xs ${status === "unsaved" ? "text-muted" : status === "saving" ? "text-muted" : "text-emerald-600 dark:text-emerald-400"}`}
              aria-live="polite"
            >
              {status === "saving" ? "Saving…" : status === "unsaved" ? "Editing…" : "Saved"}
            </span>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete note"
              title="Delete note"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>
      <LessonNoteEditor
        lessonId={lessonId}
        markdown={note.body}
        editable={teacher}
        onChange={teacher ? (md) => queue({ body: md }) : undefined}
        placeholder="What you worked on, what to practice next… Type # for a heading, - for a list, [ ] for a checklist."
      />
      {!teacher && !note.body.trim() && <p className="text-sm text-muted">This note is empty.</p>}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${note.title || "Untitled"}"?`}
          message="Your student won't see it anymore. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            pending.current = {};
            void remove({ itemId: note.id });
            setConfirmDelete(false);
            onDeleted();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </article>
  );
}

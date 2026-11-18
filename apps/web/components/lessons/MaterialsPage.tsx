"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyState, Hero, HeroSearch, LibraryPage, Pill } from "@/components/library/ui";
import { CapIcon, ItemCard, ItemDialog, KindFilter, PersonBadge, type LessonItem } from "@/components/lessons/parts";
import { lessonHref, notesHref } from "@/components/lessons/NotesPage";
import { ChevronRightIcon } from "@/components/tools";

/** The "All materials" page for a teacher–student pair. */
export const materialsHref = (lessonId: string) => `/lessons/materials?pair=${lessonId}`;

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * Everything given across all of a pair's lessons in one place (`/lessons/materials?pair=`):
 * notes, assignments, files and charts, grouped by lesson (newest first), with a type filter and
 * search. The teacher can edit and remove here; the student reads and hands in, same as on each
 * lesson's page.
 */
export default function MaterialsPage({ pair }: { pair: string }) {
  const router = useRouter();
  const lessonId = pair as Id<"lessonStudents">;
  const data = useQuery(api.lessons.materials, pair ? { lessonId } : "skip");
  const removeItem = useMutation(api.lessons.removeItem);
  const setDone = useMutation(api.lessons.setDone);
  const [filter, setFilter] = useState<LessonItem["kind"] | "all">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LessonItem | null>(null);
  const [removing, setRemoving] = useState<LessonItem | null>(null);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const items = (data.items as LessonItem[]).filter(
      (i) => (filter === "all" || i.kind === filter) && (!q || `${i.title} ${i.body} ${i.fileName ?? ""} ${i.chart?.title ?? ""}`.toLowerCase().includes(q)),
    );
    const bySession = new Map<string, LessonItem[]>();
    for (const i of items) {
      const k = i.sessionId ?? "earlier";
      bySession.set(k, [...(bySession.get(k) ?? []), i]);
    }
    const sort = (list: LessonItem[]) =>
      [...list].sort((a, b) => {
        // Open assignments first, then newest.
        const ao = a.kind === "assignment" && !a.done ? 0 : 1;
        const bo = b.kind === "assignment" && !b.done ? 0 : 1;
        return ao - bo || b.createdAt - a.createdAt;
      });
    type Group = { key: string; session: (typeof data.sessions)[number] | null; items: LessonItem[] };
    const out: Group[] = data.sessions.filter((s) => bySession.has(s.id)).map((s) => ({ key: s.id, session: s, items: sort(bySession.get(s.id)!) }));
    if (bySession.has("earlier")) out.push({ key: "earlier", session: null, items: sort(bySession.get("earlier")!) });
    return out;
  }, [data, filter, query]);

  if (data === undefined)
    return (
      <LibraryPage>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </LibraryPage>
    );
  if (!data)
    return (
      <LibraryPage>
        <div className="rounded-lg border border-dashed border-foreground/15">
          <EmptyState icon={CapIcon} title="Not found" body="You're not part of these lessons." action={<Pill label="Lessons" href="/lessons" />} />
        </div>
      </LibraryPage>
    );

  const teacher = data.role === "teacher";
  const otherName = teacher ? data.studentName : (data.other?.name ?? "Your teacher");
  const backHref = teacher ? `/lessons/student?id=${pair}` : `/lessons/teacher?id=${pair}`;
  const all = data.items as LessonItem[];
  const open = all.filter((i) => i.kind === "assignment" && !i.done).length;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <LibraryPage>
      <Hero
        title="All materials"
        backHref={backHref}
        backLabel={otherName}
        leading={<PersonBadge url={data.other?.avatarUrl} name={otherName} size="lg" />}
        subtitle={
          <>
            {teacher ? `Everything you've given ${data.studentName}` : `Everything from ${otherName}`} · {all.length} thing{all.length === 1 ? "" : "s"} across{" "}
            {data.sessions.length} lesson{data.sessions.length === 1 ? "" : "s"}
            {open ? ` · ${open} assignment${open === 1 ? "" : "s"} ${teacher ? "open" : "to do"}` : ""}
          </>
        }
      >
        <HeroSearch value={query} onChange={setQuery} placeholder="Search notes, assignments, files and charts" />
      </Hero>

      {all.length > 0 && <KindFilter items={all} value={filter} onChange={setFilter} />}

      {all.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/15">
          <EmptyState
            icon={CapIcon}
            title="Nothing yet"
            body={
              teacher
                ? "Add notes, assignments, files and charts inside a lesson — they all show up here."
                : `When ${otherName} adds things to your lessons, they all show up here.`
            }
          />
        </div>
      ) : shown === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">Nothing matches.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => {
            const sessionKey = g.session ? g.session.id : "earlier";
            return (
              <section key={g.key} className="flex flex-col gap-2">
                <Link href={lessonHref(pair, sessionKey)} className="group flex items-center gap-2 self-start py-0.5">
                  <span className="text-sm font-medium group-hover:underline">{g.session ? g.session.title : "Before lessons"}</span>
                  {g.session && <span className="text-xs text-muted">{dayFmt.format(g.session.start)}</span>}
                  {teacher && g.session?.hidden && (
                    <span className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-muted">Hidden until it starts</span>
                  )}
                  <ChevronRightIcon className="h-3.5 w-3.5 text-muted" />
                </Link>
                <div className="grid items-start gap-3 2xl:grid-cols-2">
                  {g.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      teacher={teacher}
                      studentName={data.studentName}
                      saveChartsAs={teacher ? undefined : `From ${otherName}`}
                      notesHref={item.kind === "note" ? notesHref(pair, item.id, sessionKey) : undefined}
                      onToggleDone={!teacher && item.kind === "assignment" && !item.submit ? (done) => void setDone({ itemId: item.id, done }) : undefined}
                      onEdit={
                        !teacher
                          ? undefined
                          : item.kind === "note"
                            ? () => router.push(notesHref(pair, item.id, sessionKey))
                            : item.kind === "assignment" || item.kind === "file"
                              ? () => setEditing(item)
                              : undefined
                      }
                      onRemove={teacher ? () => setRemoving(item) : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editing && (editing.kind === "assignment" || editing.kind === "file") && (
        <ItemDialog lessonId={lessonId} kind={editing.kind} item={editing} onClose={() => setEditing(null)} />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove "${removing.title}"?`}
          message={removing.kind === "assignment" ? "What they handed in for it goes too." : "Your student won't see it anymore."}
          confirmLabel="Remove"
          onConfirm={() => {
            void removeItem({ itemId: removing.id });
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </LibraryPage>
  );
}

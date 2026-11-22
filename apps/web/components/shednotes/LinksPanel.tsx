"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { findWikiLinks, parseTargetKey, titleKey } from "@jam-practice/core/shedNotes";
import { CalendarIcon, CloseIcon, DocumentIcon, GraduationCapIcon, LinkIcon, NoteIcon } from "@/components/tools";
import type { NoteMeta } from "@/lib/useShedNotes";
import { routineHref, taskHref } from "@/lib/shedLogPages";

/** Where an attachment lives on the site. */
export function targetHref(target: string): string | null {
  const t = parseTargetKey(target);
  if (!t) return null;
  if (t.kind === "tune") return `/tunes/tune?id=${encodeURIComponent(t.tuneId)}`;
  if (t.kind === "lesson") return `/lessons/notes?lesson=${encodeURIComponent(t.lessonId)}`;
  if (t.kind === "routineNotes") return routineHref(t.routineId);
  if (t.kind === "task") return taskHref({ routineId: t.routineId, taskId: t.taskId });
  if (t.kind === "dayTask") return taskHref({ date: t.date, taskId: t.taskId });
  return `/shed-log?date=${t.date}`;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {title}
        {count !== undefined && <span className="tabular-nums">· {count}</span>}
      </h3>
      {children}
    </section>
  );
}

/**
 * Beside a note (below it on phones): what it's attached to in the Shed Log and your tunes, the
 * notes that link here (backlinks), the notes this one links to (forward links; one that doesn't
 * exist yet is made when you open it), and its #tags.
 */
export default function LinksPanel({
  note,
  body,
  notes,
  onOpen,
  onOpenTitle,
  onTag,
}: {
  note: { id: string; title: string; tags: string[]; attached: { target: string; label: string }[] };
  /** The note's text as last saved. */
  body: string;
  notes: NoteMeta[];
  onOpen: (id: string) => void;
  onOpenTitle: (title: string) => void;
  onTag: (tag: string) => void;
}) {
  const detach = useMutation(api.shedNotes.detachNote);
  const key = titleKey(note.title);
  const backlinks = notes.filter((n) => n.id !== note.id && n.links.includes(key));
  const byKey = new Map(notes.map((n) => [titleKey(n.title), n]));
  const seen = new Set<string>();
  const forward = findWikiLinks(body).flatMap((l) => {
    const k = titleKey(l.target);
    if (seen.has(k) || k === key) return [];
    seen.add(k);
    return [{ title: l.target, note: byKey.get(k) ?? null }];
  });

  return (
    <div className="flex flex-col gap-5">
      <Section title="Attached to" count={note.attached.length}>
        {note.attached.length === 0 ? (
          <p className="text-xs text-muted">Attach this note to a routine or a day in the Shed Log (Add notes), a tune, or your lessons.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10 rounded-md bg-foreground/[0.05]">
            {note.attached.map((a) => {
              const href = targetHref(a.target);
              const Icon = a.target.startsWith("tune:") ? NoteIcon : a.target.startsWith("lesson:") ? GraduationCapIcon : CalendarIcon;
              return (
                <li key={a.target} className="group flex items-center gap-2 px-2.5 py-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                  {href ? (
                    <Link href={href} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {a.label}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">{a.label}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void detach({ noteId: note.id as Id<"shedNotes">, target: a.target })}
                    aria-label={`Take off ${a.label}`}
                    title="Take the note off this (the note stays)"
                    className="shrink-0 rounded-md p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Backlinks" count={backlinks.length}>
        {backlinks.length === 0 ? (
          <p className="text-xs text-muted">No notes link here yet. Link to it from another note with [[{note.title}]].</p>
        ) : (
          <ul className="flex flex-col gap-px">
            {backlinks.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onOpen(n.id)} className="flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <DocumentIcon className="h-3.5 w-3.5 shrink-0 text-muted" /> <span className="truncate">{n.title}</span>
                  </span>
                  {n.snippet && <span className="line-clamp-2 text-xs text-muted">{n.snippet}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Links" count={forward.length}>
        {forward.length === 0 ? (
          <p className="text-xs text-muted">Type [[ in the note to link another one.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {forward.map((f) => (
              <li key={f.title}>
                <button
                  type="button"
                  onClick={() => (f.note ? onOpen(f.note.id) : onOpenTitle(f.title))}
                  className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-sm transition-colors hover:bg-surface-hover ${f.note ? "" : "text-muted"}`}
                  title={f.note ? undefined : "No note with this name yet — open it to make it"}
                >
                  <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="truncate">{f.note?.title ?? f.title}</span>
                  {!f.note && <span className="shrink-0 text-xs">(new)</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {note.tags.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1">
            {note.tags.map((t) => (
              <button key={t} type="button" onClick={() => onTag(t)} className="rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground">
                #{t}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

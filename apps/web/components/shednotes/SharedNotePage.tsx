"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { titleKey } from "@jam-practice/core/shedNotes";
import { BackButton } from "@/components/library/shared";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { DocumentIcon, DownloadIcon } from "@/components/tools";
import { getFont } from "@/lib/fonts";
import NoteDocument from "./NoteDocument";
import NotePrint from "./NotePrint";

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-12">{children}</main>;
}

function Message({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <DocumentIcon className="h-5 w-5 text-muted" />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted">{text}</p>
      {children}
    </div>
  );
}

/**
 * A Shed Note opened from its link (`/note/<token>`): read-only, as a page. "Anyone with the link"
 * notes open for everyone; "only people added" notes ask you to sign in, and say so if the note
 * isn't shared with your account. People who can open it in Shed Notes (to edit) get a button.
 * When the note shares the notes it links to (all the way down), those links open them here
 * (`?n=Title`), with a way back to the note the link is for.
 */
export default function SharedNotePage({ token, note }: { token: string; note?: string }) {
  const router = useRouter();
  const shared = useQuery(api.shedNoteShares.byLink, { token, ...(note ? { note } : {}) });
  const [printing, setPrinting] = useState(false);

  if (shared === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      </Shell>
    );
  }
  if (shared.status === "gone") {
    return (
      <Shell>
        <Message title="This note isn't available" text={note ? "It isn't shared through this link, or it was renamed or deleted." : "It isn't shared by link anymore, or the link is wrong."}>
          {note && <BackButton href={`/note/${token}`} label="The shared note" className="ml-0" />}
        </Message>
      </Shell>
    );
  }
  if (shared.status === "sign-in") {
    return (
      <Shell>
        <Message title="Sign in to open this note" text="It's only shared with certain accounts. Sign in with yours to see it.">
          <SignInButtons />
        </Message>
      </Shell>
    );
  }
  if (shared.status === "not-shared") {
    return (
      <Shell>
        <Message title="This note isn't shared with you" text="Its link only works for the accounts it's shared with. Ask whoever sent it to add your username." />
      </Shell>
    );
  }

  if (shared.status !== "ok") return null;
  const font = shared.view?.font ? getFont(shared.view.font).stack : undefined;
  const base = `/note/${token}`;
  const open = new Set(shared.linked);
  // A link to the note the link is for goes back to it; the notes it shares open with `?n=`.
  const linkHref = (target: string) => {
    const key = titleKey(target);
    if (!open.has(key)) return null;
    return shared.parent && key === titleKey(shared.parent.title) ? base : `${base}?n=${encodeURIComponent(target)}`;
  };
  const context = shared.parent ? { token, noteId: shared.id } : { token };
  const updated = new Date(shared.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return (
    <Shell>
      <header className="flex flex-col gap-3 border-b border-foreground/10 pb-6">
        {shared.parent && <BackButton href={base} label={shared.parent.title} />}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <DocumentIcon className="h-4 w-4 text-muted" /> Shed Note · shared by
          {shared.owner ? (
            <Link href={`/u/${shared.owner}`} className="font-medium text-foreground hover:underline">
              @{shared.owner}
            </Link>
          ) : (
            <span>{shared.ownerName}</span>
          )}
          <span>· edited {updated}</span>
        </p>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl" style={font ? { fontFamily: font } : undefined}>
          {shared.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          {shared.role && (
            <Link href={`/shed-notes?id=${encodeURIComponent(shared.id)}`} className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
              {shared.role === "owner" || shared.role === "write" ? "Edit in Shed Notes" : "Open in Shed Notes"}
            </Link>
          )}
          <button type="button" onClick={() => setPrinting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
            <DownloadIcon className="h-4 w-4" /> Save as PDF
          </button>
        </div>
      </header>
      <NoteDocument body={shared.body} context={context} fontFamily={font} linkHref={linkHref} onLink={(href) => router.push(href)} />
      {printing && <NotePrint title={shared.title} body={shared.body} context={context} fontFamily={font} subtitle={`Shared by ${shared.owner ? `@${shared.owner}` : shared.ownerName}`} onClose={() => setPrinting(false)} />}
    </Shell>
  );
}

"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CapIcon, PersonBadge, btnPrimary } from "@/components/lessons/parts";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { CheckIcon } from "@/components/tools";

/**
 * An invite link (`/lessons/join?invite=`): who it's from and what joining means; signed out, sign
 * up or in right here (the page stays); then Join, and you land on your teacher's page with
 * everything they've given you.
 */
export default function JoinPage({ code }: { code: string }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const invite = useQuery(api.lessons.invite, code ? { code } : "skip");
  const join = useMutation(api.lessons.join);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doJoin() {
    setBusy(true);
    setError(null);
    try {
      const id = await join({ code });
      router.push(`/lessons/teacher?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^[\s\S]*Uncaught Error: /, "").split("\n")[0] : "Couldn't join.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-16">
      {invite === undefined || isLoading ? (
        <LoadingSpinner />
      ) : !invite ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CapIcon className="h-6 w-6 text-muted" />
          <h1 className="text-2xl font-semibold tracking-tight">This link doesn&apos;t work anymore</h1>
          <p className="text-sm text-muted">Ask your teacher to send you a new one.</p>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-5 rounded-lg bg-surface p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <PersonBadge url={invite.teacher.avatarUrl} name={invite.teacher.name} size="lg" />
            <div>
              <p className="text-sm text-muted">Lessons on soniroll</p>
              <h1 className="text-xl font-semibold tracking-tight">{invite.teacher.name} invited you to their lessons</h1>
              <p className="mt-1 text-sm text-muted">
                For {invite.studentName}
                {invite.itemCount ? ` · ${invite.itemCount} thing${invite.itemCount === 1 ? "" : "s"} waiting for you` : ""}
              </p>
            </div>
          </div>

          {invite.isTeacher ? (
            <p className="rounded-md bg-foreground/[0.05] p-4 text-sm text-muted">This is the invite link for your student {invite.studentName} — send it to them.</p>
          ) : invite.joinedByMe ? (
            <Link href={`/lessons/teacher?id=${invite.id}`} className={btnPrimary}>
              You&apos;ve joined — open your lessons
            </Link>
          ) : invite.taken ? (
            <p className="rounded-md bg-foreground/[0.05] p-4 text-sm text-muted">Someone has already joined with this link. Ask your teacher for a new one.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 rounded-md bg-foreground/[0.05] p-4 text-left text-sm">
                {[
                  "Their notes, assignments, PDFs, images and chord charts, all in one place",
                  "Their practice routines go straight into your Shed Log",
                  `${invite.teacher.name} sees your practice: your Shed Log stats, and how each routine they gave you goes (tasks, time, notes and recordings on it)`,
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => void doJoin()}
                  disabled={busy}
                  className={btnPrimary}
                >
                  {busy ? "Joining…" : `Join ${invite.teacher.name}'s lessons`}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-muted">Sign up (it&apos;s free) or sign in, then join.</p>
                  <SignInButtons />
                </div>
              )}
              <p className="text-xs text-muted">You can leave any time.</p>
            </>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </main>
  );
}

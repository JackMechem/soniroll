"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Hero, LibraryPage } from "@/components/library/ui";
import { FeedbackIcon } from "@/components/tools";
import FeedbackForm from "@/components/feedback/FeedbackForm";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Sent", cls: "bg-background text-muted" },
  seen: { label: "Seen", cls: "bg-accent/15 text-accent" },
  planned: { label: "Planned", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  closed: { label: "Closed", cls: "bg-background text-muted" },
};
const KIND: Record<string, string> = { bug: "Bug", feature: "Idea", other: "Other", report: "Report" };

/** `/feedback`: send a bug, an idea or anything else — and (signed in) see what you've sent and where it's at. */
export default function FeedbackPage() {
  const { isAuthenticated } = useConvexAuth();
  const mine = useQuery(api.feedback.mine, isAuthenticated ? {} : "skip");
  return (
    <LibraryPage>
      <Hero title="Feedback" icon={FeedbackIcon} subtitle="soniroll is in beta and built by one person — bugs, ideas and complaints all help." />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-lg bg-surface p-5 sm:p-6">
          <FeedbackForm />
        </section>
        {isAuthenticated && (
          <aside className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <h2 className="text-sm font-medium">What you&apos;ve sent</h2>
            {!mine || mine.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {mine.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1 rounded-md bg-background p-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold">
                      {f.number !== null && <span className="font-mono text-foreground">FB-{f.number}</span>}
                      <span className="text-muted">{KIND[f.kind]}</span>
                      <span className={`rounded-sm px-1.5 py-0.5 ${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span>
                      <span className="ml-auto font-normal text-muted">{new Date(f.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    </div>
                    <p className="line-clamp-3 text-sm">{f.target ? `${f.target.label} — ` : ""}{f.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </LibraryPage>
  );
}

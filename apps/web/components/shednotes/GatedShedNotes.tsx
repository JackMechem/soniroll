"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import LoadingSpinner from "@/components/LoadingSpinner";
import PageBar from "@/components/PageBar";
import { SignInButtons } from "@/components/practicelog/ShedLogGate";
import { DocumentIcon } from "@/components/tools";
import ShedNotes from "./ShedNotes";

/** Shed Notes are kept in your account, so signed out this says what they are and how to start.
    Also what a split-screen pane renders (no `initialId` there). */
export default function GatedShedNotes({ initialId }: { initialId?: string }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <PageBar crumbs={[{ label: "Shed Notes" }]} icon={DocumentIcon} helpTopic="shed-notes" />
        <LoadingSpinner />
      </div>
    );
  }
  if (isAuthenticated) return <ShedNotes initialId={initialId} />;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-24">
      {/* The page's name is in the header bar; the pitch's line is a heading of the page. */}
      <PageBar crumbs={[{ label: "Shed Notes" }]} icon={DocumentIcon} helpTopic="shed-notes" />
      <h2 className="text-2xl font-semibold tracking-tight">Notes for your practice, linked together.</h2>
      <p className="text-sm leading-relaxed text-muted">
        Write in markdown, link notes with [[double brackets]] and see what links back, write music notation right in a note, and attach notes to your Shed Log routines and your tunes. Vim keys if you want them.
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Shed Notes are free with an account.</p>
        <SignInButtons />
      </div>
    </main>
  );
}

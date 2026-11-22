"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import Celebrations, { SHARE_PROGRESS_EVENT, useCelebrations } from "@/components/practicelog/Celebrations";
import { ProgressShareDialog } from "@/components/practicelog/Sharing";
import { type ProgressCardKind, todayKey } from "@/lib/practiceLog";
import { useToolTimeTracker } from "@/lib/toolTime";
import { useToolUsageWriter } from "@/lib/toolUsage";
import { usePracticeLog } from "@/lib/usePracticeLog";
import { dayTimerStartedByTask, pauseDayTimer, startDayTimer } from "@/lib/dayStopwatch";
import { getSnapshot as engineState, subscribe as subscribeEngine } from "@/lib/practiceTimerEngine";

/**
 * The Shed Log's app-wide part, mounted once around every page (`AppShell`): it takes in the
 * Practice Timer's steps and the time spent in tools (`useToolTimeTracker`) as they happen,
 * celebrates wherever you are (a check-off note, confetti when the daily goal is hit or a streak
 * is kept), and opens "Share your progress" from a milestone toast on any page.
 */
export default function PracticeLogGlobal() {
  // The Shed Log is for account holders: nothing is timed, logged or celebrated signed out.
  const { isAuthenticated } = useConvexAuth();
  const { data, ready: loaded, syncAssigned } = usePracticeLog({ drainTimer: true });
  const ready = loaded && isAuthenticated;
  // Routines your teachers assigned (Lessons) come into your Shed Log, and stay in step.
  const teachers = useQuery(api.lessons.myTeachers, isAuthenticated ? {} : "skip");
  useEffect(() => {
    if (!ready || teachers === undefined) return;
    syncAssigned(
      teachers.flatMap((t) =>
        t.items.filter((i) => i.kind === "routine" && i.routine).map((i) => ({ itemId: i.id, teacher: t.teacher.name, version: i.updatedAt, routine: i.routine! })),
      ),
    );
  }, [ready, teachers, syncAssigned]);
  useCelebrations(data, ready);
  // The day timer and a Shed Log routine or task on the Practice Timer stay in step (from
  // anywhere): resuming the run restarts the day timer, the way starting it does; pausing or
  // stopping it (or its last step ending) stops the day timer too, if the run is what started it —
  // one you started yourself keeps going. Pausing the day timer pauses the run (`pauseDayPractice`).
  useEffect(() => {
    if (!ready) return;
    const linkOf = () => {
      const run = engineState();
      return run && run.session.type === "custom" ? run.session.link : undefined;
    };
    let wasPaused = engineState()?.paused ?? true;
    let wasLinked = !!linkOf();
    const off = subscribeEngine(() => {
      const run = engineState();
      const paused = run?.paused ?? true;
      const link = linkOf();
      if (wasPaused && !paused && link?.date === todayKey()) startDayTimer(true);
      else if (wasLinked && !wasPaused && (paused || !link) && dayTimerStartedByTask()) pauseDayTimer();
      wasPaused = paused;
      wasLinked = !!link;
    });
    return () => {
      off();
    };
  }, [ready]);
  // Tools always keep their own usage log (signed out too); the Shed Log takes the button-less
  // tools' time automatically only when signed in with "Count time in tools" on.
  useToolUsageWriter();
  useToolTimeTracker(ready && data.prefs.trackTools !== false);
  const [sharing, setSharing] = useState<{ kind: ProgressCardKind; date?: string; celebrate?: boolean } | null>(null);
  useEffect(() => {
    // The detail is a card kind, or `{ kind: "day", date }` for a day's report.
    const open = (e: Event) => {
      const d = (e as CustomEvent).detail as ProgressCardKind | { kind: ProgressCardKind; date?: string; celebrate?: boolean } | undefined;
      setSharing(typeof d === "object" && d ? d : { kind: d ?? "streak" });
    };
    window.addEventListener(SHARE_PROGRESS_EVENT, open);
    return () => window.removeEventListener(SHARE_PROGRESS_EVENT, open);
  }, []);
  return (
    <>
      {/* No toast over "Share your progress" (one sat on its "Post to Community"). */}
      <Celebrations hideToasts={sharing !== null} />
      {sharing && <ProgressShareDialog data={data} initialKind={sharing.kind} initialDate={sharing.date} celebrate={sharing.celebrate} onClose={() => setSharing(null)} />}
    </>
  );
}

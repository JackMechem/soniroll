import { api } from '@jam-practice/convex/_generated/api';
import { setClock24, todayKey } from '@jam-practice/core/practiceLog';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useEffect } from 'react';

import { Celebrations } from '@/components/shedLog/Celebrations';
import { ProgressShareSheet } from '@/components/shedLog/ProgressShareSheet';
import { dayTimerStartedByTask, pauseDayTimer, startDayTimer } from '@/lib/dayStopwatch';
import { onPendingLogEntries, takePendingLogEntries } from '@/lib/practiceLogQueue';
import { closeProgressShare, useProgressShareRequest } from '@/lib/progressShare';
import { getSnapshot as engineState, subscribe as subscribeEngine } from '@/lib/practiceTimerEngine';
import { useCelebrations } from '@/lib/shedLogCelebrations';
import { useToolTimeTracker } from '@/lib/toolTime';
import { useToolUsage } from '@/lib/toolUsage';
import { usePracticeLog } from '@/lib/usePracticeLog';
import { useSyncedSettings } from '@/lib/useSyncedSettings';

/** The website's site settings this uses (Settings → clock, and "Confetti and sparkles"). */
const SITE_SETTINGS_KEY = 'jam-practice-site-settings';
const SITE_DEFAULTS = { clock: '12', celebrations: true };

/**
 * The Shed Log's app-wide part — the native sibling of the website's `PracticeLogGlobal`, mounted
 * once in `app/_layout.tsx`: it takes in the Practice Timer's steps, the day timer's time and
 * tools' logged time as they happen (signed in), keeps routines teachers assigned (Lessons) in
 * step, keeps the day timer in step with a Shed Log run on the Practice Timer, adds up time in
 * tools (`useToolTimeTracker`), celebrates wherever you are, and hosts "Share your progress"
 * (`openProgressShare` from anywhere, a celebration toast's Share among them).
 */
export function ShedLogGlobal() {
  const { isAuthenticated } = useConvexAuth();
  const log = usePracticeLog();
  const ready = log.ready && isAuthenticated;
  const { applyEntries, syncAssigned } = log;
  const [site] = useSyncedSettings(SITE_SETTINGS_KEY, SITE_DEFAULTS);
  useEffect(() => {
    setClock24(site.clock === '24');
  }, [site.clock]);

  // What was queued (the timer, the day timer, a tool's Log) goes in once the log has loaded.
  useEffect(() => {
    if (!ready) return;
    const drain = () => applyEntries(takePendingLogEntries());
    drain();
    return onPendingLogEntries(drain);
  }, [ready, applyEntries]);

  // Routines your teachers assigned (Lessons) come into your Shed Log, and stay in step.
  const teachers = useQuery(api.lessons.myTeachers, isAuthenticated ? {} : 'skip');
  useEffect(() => {
    if (!ready || teachers === undefined) return;
    syncAssigned(
      teachers.flatMap((t) =>
        t.items.filter((i) => i.kind === 'routine' && i.routine).map((i) => ({ itemId: i.id, teacher: t.teacher.name, version: i.updatedAt, routine: i.routine! })),
      ),
    );
  }, [ready, teachers, syncAssigned]);

  // The day timer and a Shed Log routine or task on the Practice Timer stay in step (from
  // anywhere, like the website's `PracticeLogGlobal`): resuming the run restarts the day timer, the
  // way starting it does; pausing or stopping it (or its last step ending, or a plain timer session
  // replacing it) stops the day timer too, if the run is what started it — one you started yourself
  // keeps going. Pausing the day timer pauses the run (`pauseDayPractice`).
  useEffect(() => {
    if (!ready) return;
    const linkOf = () => {
      const run = engineState();
      return run && run.session.type === 'custom' ? run.session.link : undefined;
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

  useCelebrations(log.data, ready, site.celebrations !== false);
  // Tools keep their own usage log (signed out too).
  useToolUsage();
  useToolTimeTracker();
  const sharing = useProgressShareRequest();

  return (
    <>
      <Celebrations />
      {ready ? <ProgressShareSheet data={log.data} request={sharing} onClose={closeProgressShare} /> : null}
    </>
  );
}

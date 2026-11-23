<!-- Moved word for word from the old single PROJECT.md (lines 2676–2982) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Practice Log — now the Shed Log (2026-10-17, web)

`/practice-log` (Practice; `components/PracticeLog.tsx`, `components/practicelog/*`): a practice
calendar. Data is pure in `packages/core/practiceLog.ts` (shim `lib/practiceLog.ts`) and stored as
one synced object, key `jam-practice-practice-log` (`lib/usePracticeLog.ts`): `{routines, days}`.
- **Routines**: name, color, description, optional start time ("HH:MM"), a repeat rule
  (`once`/`daily`/`weekly` with weekdays/`monthly` on the start's day, every N, start, optional
  end — `occursOn`), tasks (title, decimal minutes, optional own time, notes, attachments) and
  attachments. A task without a time follows the one before it (`scheduleTasks`). Editor at
  `/practice-log/routine/edit?id=` (or `?date=` for a new one), page at `/practice-log/routine?id=`
  (schedule, tasks, coming up, every recording of it grouped by day, history), list at
  `/practice-log/routines`.
- **Days** (`YYYY-MM-DD`, local): per routine an `Occurrence` (checked task ids, `spentMs` per task,
  notes, skipped, a start time just for that day), `added` (routines put on just that day), timer
  `sessions`, `extraMinutes` logged by hand, notes, attachments. `pruneDay` drops empty days.
  Minutes practiced (`minutesOn`) = timer time + planned minutes of tasks checked by hand +
  sessions + extra. Streak = consecutive days with any.
- **Calendar**: Month (chips per routine, ✓ when done, minutes, mic count; dots on phones) and
  Week (time grid with each routine's back-to-back tasks as a block, overlaps side by side, an
  "Any time" row, now line). The day panel: routine cards (checklist with times, Start /
  "Continue from…", time one task, ⋮: change the time for the day, skip, check all, remove), Practice
  Timer sessions, other practice ± 5 min, notes, attachments, recordings. Nothing date-dependent
  renders on the server (the visitor's "today" isn't known there).
- **Timer**: a routine runs on the Practice Timer's own engine (`useRoutineTimer` → `start()` with a
  custom session whose segment ids are task ids and `link: {routineId, date}` — new optional field
  on `PracticeSession`'s custom variant), so the sidebar widget, alarm mode and reload survival all
  apply. `lib/practiceTimerEngine.ts` now records every non-break step for the log
  (`recordStep`: done when its time ran out, else the time it ran before Skip/Stop) in localStorage
  `jam-practice-log-pending`; the Practice Log takes them (`takePendingLogEntries`,
  `applyTimerEntries`) once its data has loaded — routine steps check off their task, plain
  Practice Timer sessions become day `sessions`. So time is logged even if the log wasn't open, but
  lands when it's next opened. Under 5 s cut short is ignored. Sound settings moved to
  `lib/practiceTimerSound.ts` (shared). `PracticeTimerRing` gained `size="sm"`.
- **Recordings**: `recordings.logDate`/`routineId` (+ indexes `by_user_logDate`,
  `by_user_routine`; queries `listForLogRange`, `listForRoutine`; `create`/`update` accept them —
  **dev deployed only**). `RecordClip` records with the Recorder's engine (auto gain, no
  metronome) and opens `SaveTakeDialog`, which gained `log` (an "Attached to" choice: the day or one
  of its routines). Signed in only, like the Recorder.
- **Attachments** (`Attachments.tsx`): tunes (either list), setlists, chord charts, tools; stored
  with a label so a deleted item still shows (struck through). On days, routines and tasks.
- `useSyncedSettings` (web) now returns a third value, `ready` (auth settled and the real value
  loaded), used so the log never writes timer entries over defaults.
Verified: a logic script (repeat rules incl. biweekly, every-3-days with an end, monthly on the
31st, DST, task schedule, timer entries, minutes, streak), `tsc` (web, mobile), `eslint`,
`next build`, and in nix Chromium signed out: creating a routine in the editor, the month/week
calendars, checking a task, running the routine (a 3 s task checked itself off when its time ran
out; the sidebar widget showed it), a pending Practice Timer session landing on the day, the
attach picker, notes, the routine/routines pages, dark mode, 390 px with no overflow; no console
errors. **Not verified:** recording/saving a clip and the recordings lists (need a signed-in
account), and anything on the mobile app (listed there, placeholder screen).

**Follow-ups (same day):** routines' "Ends" is a Never / On a date switch ("…until you delete it").
The page is full width on desktop (no max width; the day column grows to 28/32rem at xl/2xl).
**One-off tasks**: `DayLog.tasks: DayTask[]` (title, minutes, optional time, done, notes,
`spentMs`, attachments) — quick-add box in the day panel's Tasks card, `TaskDialog` (day, minutes,
time, notes, attachments; moving to another day), ⋮ (edit / move to the next day / delete), Start
all or time one on the Practice Timer (`startDayTasks`, link `routineId: DAY_TASKS_ID` = "day",
handled in `applyTimerEntries`). They count in `minutesOn`/`dayProgress`, show as a gray chip /
dot in the month view and as blocks (or in "Any time") in the week view. The header's blue button
is a round **+** with a flyout: Task on <day> / Routine.
**Motivation** (`Momentum.tsx`, `Celebrations.tsx`): `prefs` in the log object (`dailyGoal`
minutes, default 30; `sounds`) — a speaker button in the header toggles sounds. Cards: today's goal
ring (green when met, "x min to go" / "Goal smashed! +y bonus", change the goal ±5, today's task
bar); streak with a flame (animated once you've practiced today, orange "keep your N-day streak
alive" nudge when you haven't, best streak — `bestStreak`); this week as bars against a dashed goal
line (green when the goal was hit, % vs last week); lifetime hours with a bar to the next
milestone (`HOUR_MILESTONES`). Month cells are tinted by minutes vs the goal (a heat map) with a
gold star on goal days; the day panel has a progress bar ("All done!" in green). Every check-off
bursts particles from the checkbox (`burstAt`) and plays the next note up a pentatonic ladder (the
pluck tone; it climbs with each task done that day); `useCelebrations` diffs the log (so the timer
checking things off counts too, never on first load) and shows toasts + confetti + a fanfare for a
routine complete, the daily goal, everything done today, the first practice of the day (streak
toast; milestones in `STREAK_MILESTONES` get confetti) and hour milestones. CSS in globals.css
(`log-burst`, `log-check`, `log-toast`, `log-flame`; off under reduced motion). The header line is
a greeting that reflects the day ("3 tasks left today. Keep going.").
Verified in nix Chromium at 2000×1300 dark and 390 wide (seeded a week of history): quick-add,
checking tasks (streak-milestone, routine-complete and goal toasts with confetti), the + flyout,
the task dialog, week view with a day task, no overflow, no console errors; `tsc`, `eslint`,
`next build`. Sounds not heard.

**Sharing routines and progress (same day):**
- **Routine links**: `packages/convex/routines.ts` (`share` — one row per routine in the new
  `sharedRoutines` table, upserted —, `unshare`, `shareFor`, `getShared` open to anyone). The link
  is `/routine/<id>` (`components/practicelog/SharedRoutinePage.tsx`) and always shows the routine
  as it is now (`lib/routines.ts`'s `liveRoutine` reads the owner's `jam-practice-practice-log`
  blob), the stored snapshot only if it was deleted. "Add to my Practice Log" (`AddRoutineButton`,
  works signed out) copies it with new ids starting today (`routineFromPublic`) — tunes / setlists /
  charts attached to it were the sharer's, so they become a "With: …" line in the notes; tool
  attachments stay. Shared shape: `PublicRoutine` (`toPublicRoutine` / `cleanPublicRoutine` — no
  ids, no dates, attachments as names).
- **Community posts**: `communityTunes.kind` now also `"routine"` / `"milestone"`, with
  `payload` (a `PublicRoutine` or a `ProgressCard`, re-read defensively by `payloadOf`) and
  `routineId` (a routine post shows the routine live, like setlist posts). `tunes` is empty for
  both. `postForRoutine` finds your post of a routine. Feed cards show a Routine / Milestone tag and
  the first tasks or the card; the post page shows the routine (+ Add to my Practice Log) or the
  card. The routine page has **Share** (`RoutineShareDialog`: make / share / stop sharing the link,
  post with a caption). The mobile app's post type accepts the new kinds but shows them as plain
  posts (no routine/card rendering there yet).
- **Progress cards** (`ProgressCard.tsx`): a 1200×630 image drawn on a canvas — the same drawing
  is the on-page preview (`ProgressCardView`) and the PNG (`progressCardFile`). Always dark: the
  wordmark, @username and date, a headline (flame + N-day streak / N hours practiced / N days
  practiced in the past year), three stats (best streak, total hours, days in the last year), and
  53 weeks of days as a commit-graph grid (levels 0–4 from minutes vs the daily goal, `dayLevel`;
  GitHub's greens), with a Less–More key. Data: `progressCard(data, today, kind)` — `levels` is a
  string of digits, small enough to post. `ProgressShareDialog`: Streak / Hours / Year, Share image
  (`navigator.share` with the file, else copy the image, else download), Download, Post to
  Community with a caption (needs a public profile). Opened from **Share progress** in the header,
  the share buttons on the streak and lifetime cards, and a **Share** button on streak-milestone
  and hour-milestone toasts (`SHARE_PROGRESS_EVENT`).
- Account deletion deletes `sharedRoutines`. Pushed to the **dev** Convex deployment (one new
  table, `communityTunes` fields optional).
Verified: a logic script (no ids in a shared routine, junk JSON clamped, copying keeps tools and
notes the rest, card levels), signed-out Convex calls (`getShared` of a bad id → null, `share` and
posting refused), `tsc` (web, mobile), `eslint`, `next build`, and in nix Chromium: the three
cards with a seeded year of practice, the share dialogs signed out, a bad `/routine/` link.
**Not verified:** anything signed in — making a link and opening it, posting a routine or a card,
how the posts look in the feed — and the image share sheet on a phone.

**Card ranges and routine icons (same day):** progress cards have a **Week / Month / Year**
range beside the card type (Streak / Hours / **Days**, which replaced "Year"). `ProgressCard` gained
`range`, `start`, `rangeHours`, `rangeDays` and per-day `mins` for week/month (`progressCard(…,
range)`, `cardStart`; cards posted before ranges read as year cards). Week = seven big day squares
with each day's minutes; Month = the calendar month as day squares with the date (and minutes when
there's room); Year = the 53-week graph. Hours and Days headlines say "this week" / "this month" /
"in the past year" (a year Hours card is lifetime hours). **Routine icons:** `Routine.icon` (id,
default "note"; `PublicRoutine` carries it) picked in the editor's Icon card from
`components/practicelog/RoutineIcon.tsx`'s `ROUTINE_ICONS` (27: instruments, practice kinds,
flame/star/heart, morning/evening; a few drawn there, the rest from `tools.tsx`). `RoutineIcon` is
the icon in a circle of the routine's color, shown on the day card, month chips, week blocks, the
"Add … to this day" menu (`ContextMenu`'s `MenuItem` gained an optional `icon`), the routines
list, the routine page, the editor, shared links and posts.

**Missed days and the site built around practice (same day):**
- **Missed**: `isMissed` — a past day with a routine left unfinished (not skipped, not before the
  routine was created) shows red with an X in the month view, its chips get a red X, the week
  view's date goes red ("Missed"), the day card says "Missed". A fully done day stays green.
- **App-wide** (`components/practicelog/PracticeLogGlobal.tsx`, mounted in `AppShell` around
  every app page, tiling too): the only place that drains the timer queue, runs
  `useCelebrations` (so the goal confetti / streak toasts happen on whatever page you're on) and
  hosts "Share your progress" (opened via `SHARE_PROGRESS_EVENT` from anywhere). The Practice Log
  page no longer does these itself. `usePracticeLog`'s freshest value is now module-level, shared
  by every instance (sidebar, dashboard, page, global), so edits from different components can't
  overwrite each other.
- **Time in tools counts** (`lib/toolTime.ts`, `useToolTimeTracker`): on a tool page in a visible
  tab, time accumulates until 15 min with no input; it's queued (`queueLogEntry`, the timer's
  queue) each minute and on leaving/hiding, segment id `tool:<href>`; `applyTimerEntries` merges it
  into one `TimerEntry` (with `tool`) per tool per sitting (30 min). Not counted: Dashboard,
  Community, Tunes, Chord Charts library, the Practice Log and the Practice Timer (logs itself);
  reading a chart (`/chord-charts/view`, `/setlist-charts`) counts as Chord Charts. Pref
  `trackTools` (default on). The Practice Log header's sliders button opens a menu: Sounds on/off,
  Count time in tools on/off. The day panel's "Timed practice" lists tool time with each tool's
  icon. In tiling mode the tool counted is the one the URL was on when the pane opened.
- **Sidebar**: `StreakBadge` by the username (and by "Sign in" when signed out — the log works
  without an account; under the avatar when the sidebar's collapsed): a flame pill with the streak
  (gradient and flickering once you've practiced today, pulsing orange when the streak's at risk)
  and a tiny ring for today's goal; opens the Practice Log.
- **Dashboard** (`Home.tsx`): `TodayPractice` comes first — "Today's practice" with the Momentum
  cards (goal, streak, week, hours; share buttons), "On today" (routines with progress bars and
  Start / Continue on the timer, the day's tasks to tick off with the burst, quick-add) and "Your
  practice" (the last 18 weeks as a grid of days, each linking to that day). The rest of the
  dashboard follows.
- **Landing page**: hero now "Practice every day. Watch it add up." with copy about streaks and
  goals; the setlist float card became a streak card; a new **Practice Log** section (nav link)
  with a routine demo you can tick off for real (`components/landing/PracticeLogPreview.tsx`:
  burst, rising notes, goal ring, streak pill, then the completion toast + confetti via
  `celebrateNow`) and a progress card from a made-up year. The final CTA mentions starting a
  streak. **The landing screenshots (`public/landing/v2/`) still show the old dashboard** — retake
  them (into a new folder, see that section) once the new dashboard has real-looking data.
Verified in nix Chromium (signed out): missed days red/X in month and week; the dashboard with a
seeded history (cards, agenda, heat grid, the sidebar badge with the goal ring), ticking a task
there (streak toast fired from the dashboard), 12 s on the Metronome logged as a Metronome entry on
today; the landing page at 1440 (hero, the new section, ticking the demo → confetti and toast) and
390 wide with no overflow; no console errors. `tsc` (web, mobile), `eslint`, `next build`.

**Desktop layout and the day timer (same day):** on desktop the Practice Log is exactly the window's
height — the day panel is on the **left** and scrolls on its own, the calendar is on the right and
fills the rest (month cells shrink to fit, `lg:min-h-0`); the page only scrolls below ~28rem of
room. **Day timer** (`lib/dayStopwatch.ts`, `components/practicelog/DayTimer.tsx`): a stopwatch
for the whole day, separate from the routine/task timer — Start/Pause on the day panel (today) and
the dashboard; `startRoutine` / `startDayTasks` start it when it isn't running (for today), and it
keeps going when they stop. A module kept in localStorage (`jam-practice-day-stopwatch`), so it
survives pages and reloads; it hands its time to the log every 30 s, on pause and when the tab
hides (`DAY_STOPWATCH_ID` entries → `DayLog.stopwatchMs`), and stops itself at midnight.
`minutesOn` is now max(day timer, timed practice — routine/task timer, Practice Timer sessions,
tool time) + planned minutes of tasks checked by hand + minutes logged by hand, so the overlap is
never counted twice; it takes an optional live (not yet handed over) amount, used by the goal ring,
the day panel header and the sidebar badge, which also shows the running day timer's clock.
Verified in nix Chromium: Start routine started the day timer, it kept running after the routine
was stopped, Pause put 6.3 s on the day next to the task's 3 s; the dashboard and sidebar showed it.

**Subtasks, today-only tasks, logging time, streaks need time (same day):**
- `RoutineTask.subtasks` (checklist items, edited in the routine editor under each task; shared
  links/posts carry their titles); ticked per day in `Occurrence.subDone`. One-off `DayTask`s have
  `subtasks` with their own `done`. `components/practicelog/Subtasks.tsx` renders/edits them.
- `Occurrence.extraTasks`: tasks added to a routine for just one day ("Add a task to this routine,
  just for today" in its card; tagged "Today only", removable, can take subtasks). `tasksOf(routine,
  occ)` = the routine's tasks + those — used by progress, scheduling, the week view, missed days and
  the timer (`startRoutine(…, occ)`).
- **Log time** (`LogTimeDialog.tsx`, the "Logged by hand" card): quick amounts or h/min, on the day
  as a whole (`extraMinutes`) or on a task (its `spentMs`, optionally checking it off). A task
  checked off without time shows "+ Log N min" to log its planned minutes in one tap.
- `minutesOn` now counts **only logged time** (day timer vs. task/timer/tool time, whichever is
  more, + minutes logged by hand) — checking a task off adds nothing by itself — so a day only
  counts toward the streak (and the goal, week, totals) once time is logged for it.
Verified: a logic script (checked-only day = 0 min and breaks the streak, extra tasks in progress
and schedule, subtasks round-trip through sharing), and in nix Chromium: ticking a subtask, adding a
today-only task, the streak staying 0 until time was logged then 1, "+ Log 10 min", the Log time
dialog on a task; `eslint`, `next build`.

**Check-offs log time; the day timer is the day's total; tool time only while running (same day):**
- Checking a task off logs its planned minutes, unchecking takes them back (`setTaskDone` /
  `setDayTaskDone`, which remember the amount in `autoMs`; a task that already has time gets
  nothing more, and unchecking never removes timer / hand-logged time). Used by every checkbox and
  "Check / Uncheck every task" (`setAllTasks`).
- **The day timer is the day's whole practice time.** Everything that wasn't timed by it is added
  onto `stopwatchMs`: check-offs (unless the day timer is running — then that time is already being
  counted, so nothing is added), Log time and the ± 5 min buttons (`addDayTime`), and queued timer /
  tool entries that happened while it wasn't running (each entry is stamped `covered` when queued —
  `setDayTimerCoverage`, registered by `dayStopwatch.ts`). The day timer card shows that total
  ("Practiced today · timer running/paused"); `minutesOn` = max(that, timed parts) + legacy
  `extraMinutes`.
- **Tool time counts only while a tool is running** (`lib/toolTime.ts` rewritten): each tool calls
  `useToolActivity(href, running)` — Metronome, Polyrhythm, Tempo Trainer, Tuner (listening or a
  tone playing), the four trainers + three ear-training tools (a round running), Bass Genius, Slow
  Downer (playing), Recorder (count-in/recording), Random Sticking Warmup, Drum Generator,
  Syncopation; Jam Practice while counting off or a tune is up (visible tab only). Running time
  counts even in a background tab. Reading a chord chart no longer counts (nothing "runs").
Verified in nix Chromium: an open-but-stopped Metronome logged nothing; 8 s running logged 8 s
(entry + day timer); checking a 10-min task took the day timer to 10:08, unchecking back to 0:08.

**Clear a day's time:** the day timer card has a trash button (any day with time) → confirm →
`clearDayTime` drops the day timer, hand-logged minutes, task time (`spentMs`/`autoMs`), Practice
Timer sessions and tool time; checked tasks stay checked. If the day timer is running for that day
it's stopped without keeping its unsaved time (`discardDayTimer`). Checked in nix Chromium.

**Stats as pills (Practice Log page):** the four stat cards are now `MomentumPills` (in
`Momentum.tsx`) — big rounded pills right of the title: today's goal (ring, a check when met;
click → choose the daily goal), the streak (flame; "keep it alive" when today has nothing yet;
click → share), this week (mini bars, green on goal days), total hours (a conic ring toward the
next milestone; click → share), then an eye button to hide them (hidden: a small streak pill with
"Show stats"). Below 2xl, Share progress and Routines are icon-only and the greeting truncates so
the header stays one row; it wraps on phones. The dashboard still uses the big `Momentum` cards.

**All stats popup:** a **Stats** pill after the stat pills opens `StatsDialog.tsx` — the big
`Momentum` cards (goal, streak, week, hours; the goal changeable, share buttons), the last 18 weeks
as a grid of days (`HeatGrid`, now exported from `TodayPractice.tsx`), and this month, best streak,
days practiced and the average practice day. Escape / × / outside click closes it.

**Phone layout of the Practice Log header:** the title and the (smaller, icon-only) buttons share
one line, the greeting sits under the title, and the stat pills are a single row you swipe
sideways (snap scrolling, no scrollbar; they wrap from `sm` up). The calendar's arrows, month and
Month/Week switch fit one line. `Momentum` cards stack in one column on phones (dashboard and the
Stats popup), and the Stats popup uses less padding there.

**Practice Log in the sidebar:** it's no longer listed under Practice; it's its own card right under
Dashboard (`PracticeLogNavCard.tsx`, desktop sidebar and phone menu): the icon, "Practice Log",
today's tasks done, the streak pill, a red dot while the day timer runs, and a bar of today's
minutes against the goal (green once met). Collapsed sidebar: the icon in a goal ring. It still
shows as an ordinary result when searching.

**Dashboard card in the sidebar:** Dashboard is now a card too (`components/DashboardNavCard.tsx`):
the home icon on a dark tile, "Dashboard", and today's date with a greeting — stacked above the
Practice Log card as the two places to start; collapsed, just the icon tile.

**Sidebar library tiles and a Tools heading:** Community, Tunes and Chord Charts are a row of three
tiles (icon over label, highlighted when you're in that section) under the Dashboard and Practice
Log cards — plain rows again while searching or collapsed; a **Tools** heading sits above Favorites
and the tool categories. The account row no longer shows the email under the username.

**Collapsed sidebar redesign:** 68 px wide; the sheddex icon on top (to the landing page), then a
search button, then rounded groups of same-size (40 px) icon buttons — Start (Dashboard tile,
Practice Log goal ring), your library, Favorites (accent tint), and one group per tool category
(its name as the group's tooltip); the current page is accent-tinted. The groups scroll without a
visible scrollbar. The sidebar options (⋮) and an Expand button moved to the bottom, above the
picture, which carries the streak badge on its corner.

**Renamed: the Practice Log is the Shed Log, and it's for account holders.** Shown everywhere as
"Shed Log"; the route moved to `/shed-log` (`/shed-log/routines`, `/shed-log/routine`,
`/shed-log/routine/edit`), with `/practice-log/*` permanently redirecting (`next.config.ts`).
Internal names didn't change (`components/PracticeLog.tsx`, `components/practicelog/*`,
`packages/core/practiceLog.ts`, the synced key `jam-practice-practice-log`). Signed out:
`ShedLogGate` (wraps every `/shed-log` page and the tiling pane via `GatedPracticeLog`) shows what
it is, the landing page's routine demo and sample card, and **Sign up free / Sign in**
(`SignInButtons`, opening the app's `SignInModal` — now exported, with `initialFlow`); the sidebar
card says "Sign in to start yours" (no bar or streak); the dashboard's section is a "Start your
Shed Log" card with the same buttons; the streak badge by the account is hidden; a shared
routine's "Add to my Shed Log" asks you to sign in; and nothing is timed, logged or celebrated
(`PracticeLogGlobal` and the timer drain only run signed in).

**Advanced layouts removed — split screen from the sidebar's right-click menu instead.** The
"Advanced layouts" toggle (both sidebar option menus) and the panes' edge split buttons are gone.
Right-clicking any page in the desktop sidebar (a tool, the Dashboard / Shed Log cards, the library
tiles; expanded or collapsed — one `onContextMenu` on the nav, reading the link under the pointer)
opens a menu: Open / Open in split screen, side by side / Open in split screen, top and bottom
(`openInSplit` in `lib/useTilingLayout.ts`): the first split turns split screen on with the page
you're on and the new one; later ones split the active pane. Closing panes down to one turns split
screen off and goes back to the plain page (also any leftover single-pane layout). The tiling
machinery itself (`TilingLayout`, resizing, focus, the URL following the active pane) is unchanged.

**Shed Log tour:** `components/practicelog/ShedLogTour.tsx` — five slides, each a small picture
(built from the app's own pieces) and one line: plan routines; check off or time it; one timer for
the day; hit your goal, keep the streak; look back and share. Opens by itself the first time the
Shed Log is visited on a device (`jam-practice-shed-log-tour-seen` in localStorage), and from the ?
next to the title. Back / Next / dots, arrow keys, Escape. Checked in nix Chromium (with the
sign-in gate briefly bypassed, then restored): opens on the first visit, not after a reload,
reopens from ?, fits a phone.


## Tool stats, per-tool streaks and the Log button — Metronome pilot (2026-10-18)

Jack asked for every tool to show Shed Log-style stats (its own streak, time actually used),
a button that logs the day's usage into the Shed Log, and the options redesigned to "maximise
dopamine". Decisions he made: **button-only logging** (a tool's time reaches the Shed Log only when
you press Log; the automatic adding is off for those tools), **any real use counts** (≥1 min that
day keeps a tool's streak), options as **pills + reward bits**, and **pilot on the Metronome**
first, then roll out (all tools, including Bass Genius, Drum Generator, Syncopation and the Sticking
Warmup for the stats; those four keep their current options).

- **Usage store** `lib/toolUsage.ts`: synced setting `jam-practice-tool-usage`,
  `{ tools: { [href]: { [day]: [ms, loggedMs] } } }` (one `tools` field because synced settings
  keep only fields named in their defaults; JSON-stringified so days don't hit the field limit).
  Works signed out (device) and in (account). Pure helpers: `toolStreak`, `bestStreak`, `weekOf`,
  `totalMs`, `historyOf`. Written only through `useToolUsageWriter` (mounted in
  `PracticeLogGlobal`), which keeps a ref to the latest value; `recordUsage`/`markLogged` queue
  until it's mounted.
- **`lib/toolTime.ts`**: the tracker now always runs (signed out too). Every running tool's time
  goes to the usage store (flushed every 30 s and on stop/pagehide). The Shed Log queue still gets
  the time automatically for tools **not** in `LOG_BY_BUTTON` (only while signed in with "Count
  time in tools" on, as before). `LOG_BY_BUTTON = {"/metronome"}` for the pilot — adding a tool's
  href there turns on its stats pills, the Log button and the reward look. `useLiveToolTime`
  ticks the not-yet-stored time each second; `logToolToday` queues today's unlogged time as a
  normal `tool:<href>` entry (so the day panel shows it with the tool icon, it adds to the day
  timer/total, and `useCelebrations` fires goal/streak toasts) and marks it logged.
- **`components/toolstats/ToolStats.tsx`**: pills like `MomentumPills` — streak (flame, "keep it
  alive"), today (stopwatch, pulsing dot and "counting…" while running), this week (bars), in total
  (ring toward the next hour milestone; tapping it opens History: streak / best / days used and a
  day-by-day list with a ✓ for days in the Shed Log), and the accent "Log N min · to Shed Log"
  button (burst + toast + two-note chime; "Logged ✓" once nothing's left; signed out it opens the
  sign-in form). `ToolLayout` shows it beside the title from `lg`, and as a swipe row at the top
  of the page below that (Log is third there so it's in view). Renders nothing until loaded.
- **Reward look** `components/reward/Reward.tsx`: `RewardProvider` (from `ToolLayout`, for
  `LOG_BY_BUTTON` tools) in the theme accent (the category colour clashed with the blue Start
  button). Shared components switch on `useReward()`: `SettingChip` (chunky pill, gradient icon,
  value big on top, pop + glow when the value changes — `usePopKey`, not on first render),
  `Segmented` (lit gradient side), `SubdivisionPicker` / `ClickSoundCards` (`RewardCard`s),
  volume and tempo sliders (`.slider-reward`, gradient fill and a glowing thumb) and a ✦
  (`Sparkle`) on round numbers (BPM multiples of 10, volume at 25/50/75/100%). Choices you
  haven't tried get a dot and a burst the first time (`jam-practice-tried-options`; the current
  choice counts as tried). Metronome's Time popover gained "Quick picks" (4/4 3/4 2/4 6/8 5/4 7/8
  9/8 12/8). CSS: `reward-pop`, `reward-glow`, `.slider-reward` (reduced motion off).
- Help: Metronome got "Your stats" and "Log to Shed Log"; the Shed Log's "Count time in tools"
  says the Metronome is the exception. Privacy mentions per-tool daily time.

Verified in nix Chromium, signed out: 4 s of Metronome recorded in the usage store, pills with a
seeded 3-day streak, the History popover, Time/Subdivision/Sound popovers (light, dark, 390 wide,
no overflow, no console errors); a Node script showed a logged entry lands as one Metronome
session that counts toward the day's minutes and the streak, and a second log merges. **Not
verified:** pressing Log signed in (needs an account), audio, hover effects. No version bump yet.

**Hiding the tool stats (same day):** an eye-off button at the end of the pills hides them
(synced setting `jam-practice-tool-stats`, `{ hidden }`, one switch for every tool). Hidden, it
shows a compact "🔥 N · Show stats" pill like the Shed Log's, and the Log button stays, since it's
the only way those tools' time reaches the Shed Log. Checked hide → reload → show at 1440 and 390.

**Rolled out to every tool (same day):** `LOG_BY_BUTTON` now lists all 17 tools that report
running time (everything but the Practice Timer, which logs itself), so every tool page shows the
stats pills and the Log button, and no tool adds time to the Shed Log automatically any more.
`PLAIN_OPTIONS` (Bass Genius, Drum Generator, Syncopation, Random Sticking Warmup) get the stats
but keep their options look. The reward look now also covers: every slider on a reward tool
(`.reward-scope` on the ToolLayout root and on SettingChip popovers styles `input.slider`
there), `SwitchRow` (the row is a tappable card; the switch lights up with a check), split
toggle chips (`SettingChip` `toggle`), `AdvancedSlider` (value in a pill that pops, ✦ on round
numbers or the max), and pools via the new `PoolPill` (Interval Trainer, Guess the
Interval/Chord/Progression, Scale Trainer, Metric Modulation ratios, Slow Downer speed presets).
`SteppedField` deliberately doesn't pop: re-keying it would drop focus while typing. The Log button
is third in the row at every width (long titles like Metric Modulation pushed it off screen).
"Count time in tools" was removed from the Shed Log menu and the account page (it no longer does
anything; the `trackTools` pref stays in the data). Checked all 16 tool pages at 1440 and 390
(stats present, a popover open, no overflow, no page errors), tsc (web + mobile), lint, build.
Not checked: Log signed in, every popover of every tool, audio.


## Week view: popover, click-to-add, a phone layout (2026-10-19, v0.9.4)

Jack asked for the week view to be more interactive, look better and be easier on phones.
- **Popover** (`components/practicelog/WeekPopover.tsx`, `WeekTarget` = a routine on a day, or some
  of a day's own tasks): tapping a block, an "Any time" chip or a phone pill opens it beside what was
  tapped (right if there's room, else left; its top is fitted on screen in a layout effect by setting
  the element's style, so no setState in an effect), and as a bottom sheet below `sm` (the `max-sm:!…`
  classes beat the inline position). It reads live data, so ticking a task there (burst, then
  `log.toggleTask` / `toggleDayTask`, so the celebration notes still play) updates the week behind it.
  Footer: Start / Continue (today only, not skipped), "Don't skip this day" when skipped, Open day
  (switches to Day view). Escape, ×, a click outside and resizing close it. CSS `log-pop`.
- **Grid** (`sm` and up): the day header has minutes and a small bar toward that day's goal
  (`goalOn`, green when met, none for days to come); double-click a day header for Day view. Any-time
  chips fill from the left as tasks are done (`RoutineChip`'s `fill`, which drops the "1/3" text to
  give the name room; the month view doesn't use it). Blocks carry `done/total` and show a thin
  progress line. On a mouse, a dashed "+ 3:00 PM" slot follows the pointer over free time (hour lines
  are `pointer-events-none` so the column is the target); clicking it opens a menu: Task at that time
  (`onAddTask` → the page's `TaskDialog` with `time` filled in), New routine starting this day, Add
  <routine> to this day. A hint shows when nothing in the week has a set time.
- **Phones** (below `sm`): the time grid is hidden (CSS, not unmounted) and the week is a list of
  days: the date (status colours, today in the accent), minutes and goal bar on the left; each routine
  as a two-column pill (icon, name, time if set, a small progress ring / check / red X), the day's
  tasks as one pill, and "Add a task" on empty days.
- **Swipe** left/right on the week (> 60 px, mostly sideways) steps a week (`onStep`). The week title
  is "Oct 18 – 24" within a month, so it fits on a phone (it used to be cut off).
- `WeekView` now takes `log` (not `data`) plus `onStep`, `onOpenDay`, `onAddTask` from `PracticeLog`.
Verified in headless Google Chrome (the Shed Log gate briefly bypassed, then restored; data seeded
in localStorage) at 1440 and 390, dark and light: no horizontal overflow, no page errors other than
the hydration warning the bypass causes; opening the popover and ticking a task (1/3, the day's
minutes went up), the slot ghost and menu, the phone list, the bottom sheet for a routine and for
extra tasks, swiping forward and back, Escape closing it. `tsc`, `pnpm lint`. **Not checked:**
signed in, hover styles, a real phone's touch, sounds, starting a routine from the popover.
Testing note: `/Applications/Chromium.app` here is v100 and can't render Tailwind v4's `bg-x/10`
colours (they come out solid); use Google Chrome (`executablePath`) with playwright-core's `launch`.
Playwright's `reload` hung on this page; seed with `addInitScript` before `goto` instead.


## Scheduling: Set a time, drag onto the grid, a time-grid day view (2026-10-19)

Jack asked for an easy way to give an "any time" routine a time, to drag routines onto a time in
the week view, and for the day view to look like the week view (times, routines, tasks, drag).
- **Set a time** (`components/practicelog/RoutineTime.tsx`, `RoutineTimePicker`): quick picks (8 AM,
  12 PM, 5 PM, 7 PM) and a time field, with "Just this day" (sets `Occurrence.startTime`) or "Every
  time" (sets `Routine.startTime` and drops the day's override); a "once" routine has no switch.
  "Make it any time" clears it (hidden when tasks have their own clock times — `hasFixedTimes`).
  Shown in the week popover (a dashed "Set a time" button for an untimed routine, "Change time"
  in the subtitle otherwise) and on the day panel's `RoutineCard` ("Any time · Set a time"; the ⋮
  item is "Set a time" / "Change the time").
- **Drag** (`useTimeDrag` in `Calendar.tsx`): any-time chips/pills, timed blocks and a day's own tasks
  drag onto a day column (`[data-drop="grid"]`, snapped to 15 min, the grab point kept) or the
  "Any time" row (`[data-drop="any"]`). A dashed preview shows the time. Mouse: after 4 px. Touch:
  press and hold 350 ms (moving first scrolls instead); a non-passive document `touchmove` listener
  stops the page scrolling while a finger drags. Held near the grid's top/bottom edge for 250 ms it
  scrolls (immediate edge scrolling fired while just passing through from the Any time row and
  shifted drops by 15 min). Escape cancels. `justDragged()` (module flag) swallows the click after a
  drop and the week swipe. Routine drops write `Occurrence.startTime` (removed when it equals the
  routine's own time). Dropping on another day moves it: `addToDay` there, and the old day is
  `removeFromDay` (if it was added) or skipped (if it was scheduled). Not allowed: routines that are
  skipped or have tasks with clock times (moving the start wouldn't move them), cross-day moves for a
  routine with ticks or timed work that day (`locked`), or onto a day that already has it. Tasks use
  `moveDayTask` with the new `time`. In the week's Any time row, several tasks share one chip, so
  only a lone task drags from there (each is its own block once timed).
- The free-slot menu also offers "<untimed routine on that day> at 3:00 PM" and "Add <routine> at
  3:00 PM" (adds it and sets the day's time).
- **Day view** is now the same layout as week/month: the day panel on the left and `DayView` (a
  one-column `TimeGrid`, 64 px hours with half-hour lines, the Any time row always shown with big
  pills, no day headers) on the right; arrows step a day; title "Mon, Oct 19" ("Oct 19" on phones).
  `TimeGrid` is the week's old grid pulled out and shared; `dayInfo` builds a day for it. The week
  popover's "Open day" is hidden in day view (`onOpenDay` optional). `DayPanel`'s `wide`/`controls`
  props are no longer used by the page.
Verified in headless nix Chromium (gate briefly bypassed, then restored; data seeded in
localStorage): week 1440 — chip to 3 PM, block 6 → 7:30 PM, a task to tomorrow 10 AM, no popover
after a drop, Set a time → 5 PM, the picker; day 1440 the same drags; day 390 with a simulated
long-press touch drag (CDP touch events) to 1 PM, and a quick swipe not dragging; the card's "Every
time" setting the routine's own time. No overflow or page errors. tsc, lint. **Not checked:**
signed in, a real phone's touch (iOS especially), hover styles; dark mode only seen on the phone
day view (the first runs' seed used the wrong theme key — it's `jam-practice-theme`).

**Follow-ups (2026-10-19):** grid blocks draw the routine cards' rounded left bar (not a flat
inset edge); the calendar popover anchors to the click point (`usePopover`, falling back to the
button's rect for keyboard presses); and on desktop a panel button at the start of the calendar
header hides the day panel (`dayHidden` in the `jam-practice-practice-log-view` settings), giving
the calendar the full width. Phones are unaffected (the button and the hiding are `lg:` only).

**Day timer and task timers stay in step (2026-10-20):** pausing the day timer
(`pauseDayPractice` in `DayTimer.tsx`) also pauses a Practice Timer run linked to the Shed Log
(`session.link`) — before, a task's "Timing" kept going. Resuming such a run from anywhere
restarts the day timer (`PracticeLogGlobal` watches the engine, as starting one already did).
Checked in a harness against the real engine and stopwatch. Not on a phone.

## 2026-11-18: celebrations once a day, one rounding rule (UI/UX audit pass 4)

- Ticking the last task no longer auto-opens the "Day complete!" dialog; the toast keeps its Share
  button (toasts with Share stay 8 s). Each big moment (goal, all done, each routine, streak toast,
  hour milestones) celebrates once per day per browser, remembered in localStorage
  `jam-practice-celebrated`. Wording is "All tasks done" unless the daily goal is met. Toasts hide
  while the share dialog is open.
- Practice minutes are summed first, then rounded, everywhere (`components/practicelog/minutes.ts`:
  `formatPracticed`, `practicedMinutes`; above zero but rounding to 0 shows "<1 min"). Use it for
  any new total so the day panel, header, calendar, Stats and sidebar agree.
- The timer card can't show the timer's own time alone (stored data merges ticked task minutes into
  it), so when stopped it reads "N min · Practiced today" and the button always says "Start timer".
- Routine editor: "Add a task" focuses the new row, empty rows are dropped on Save, leaving with
  edits asks first (`useLeaveGuard`), sticky Save/Cancel at every width. Bug fixed: a new routine
  made a fresh id (the editor's `key`) on every render, so any log sync remounted the editor.
- Not verified: sounds, split-screen panes, other devices.

## UI/UX pass 3 fixes (2026-11-20)

- **Running routine on a phone:** the timer row in `RoutineCard` wraps (`flex-wrap`, text block
  `min-w-[9rem] flex-1`, title `line-clamp-2`, buttons `ml-auto`). At 390 wide the task name gets
  the width, and Pause/Skip/Stop drop to their own line. Before, it read "Scale…".
- **Routine page:** says **"Continue today"** when today's run is part done, and starts from the
  first open timed task, like the card's "Continue from …". Before, it said "Start today" and
  restarted from task 1.
- **Share cards** (`ProgressCard.tsx`, `hoursParts`): under an hour they show minutes ("10 min in
  total", "10 min practiced"), not "0.2 hours". This is web only. The phone app has its own
  `ProgressCard`, which wasn't changed.
- **Small fixes:**
  - The New menu has icons (a checklist for "Task on today", repeat for "Routine").
  - The routine editor's colour swatches are named (Indigo, Green, Amber, Red, Pink, Cyan,
    Violet, Lime) in `aria-label`/`title`.
- **Checked** with a throwaway account (deleted afterwards) in headless Chromium:
  - The running and paused card at 390 dark and 1440 light.
  - The New menu, the Hours and Days share cards, the routine page with 1/3 done, and the
    swatch labels.
- **Not checked:** a narrow split pane.

## 2026-11-22 — The day timer stops with the task that started it

Jack: playing a task and stopping it left the day timer running, which was confusing. (Until now
the day timer was meant to keep going after a routine or task stopped; see "Desktop layout and the
day timer" above.)

- `lib/dayStopwatch.ts` remembers who started it: `startDayTimer(true)` from a routine or task run
  (`startRoutine` / `startDayTasks`, and resuming one) sets `byTask`; the day timer's own Start
  button doesn't (its `onClick` now wraps the call, so the click event isn't taken for `byTask`). An
  already running day timer is left as it was, so one you started yourself stays yours.
- `PracticeLogGlobal` watches the engine: when a run linked to the Shed Log was going and is then
  paused, stopped, finished (its last step ends) or replaced by a plain Practice Timer session, it
  pauses the day timer if `dayTimerStartedByTask()`. Resuming the run starts it again (as before).
  Pausing the day timer still pauses the run.

Verified signed in (throwaway `.test` account, deleted afterwards), headless Chromium, an extra task
timed from the day panel and paused/stopped on the Practice Timer page: task started → day timer
running (by the task); stopped → stopped; paused → stopped; resumed → running; stopped → stopped.
Day timer started by hand first → the task started and stopped → still running. Not verified: a
routine's last step running out on its own (same code path as Stop: the run ends), alarm mode, a phone.

## 2026-11-22 — Routine and task pages: notes, recordings, a side view for notes

Jack: record something attached to a task in a routine (or a task on its own); notes for each task
that are reachable from the routine's "master" note, like links between notes; each routine and
task a page (a dashboard he can configure) with its notes and its recordings embedded; notes in a
side view like Notion's, over the content or pushing it over.

- **Note targets** (`packages/core/shedNotes.ts`): `routineNotes` (`routine:<id>`, a routine's own
  notes, not one day's), `task` (`routine:<id>/task:<task>`) and `dayTask` (`day:<date>/task:<task>`).
  `parseTargetKey` knows them (the server refuses to attach to anything it can't parse);
  `LinksPanel`'s "Attached to" goes to the pages (`lib/shedLogPages.ts`: `routineHref`, `taskHref`);
  the phone app sends them to the Shed Log.
- **Recordings** have an optional `taskId` (schema, `create`, `update`, returned by every list). It's
  only kept with a `logDate` (the day it was recorded on). `SaveTakeDialog`'s `log.task` shows "For
  the task …" and sends `taskId` while the routine choice is still the task's; `onSaved` now gets the
  name too. `RecordClip` takes `task` and `onSaved`.
- **`shedNotes.appendLine`**: adds a line at the end of a note (owner or editor). `NoteSurface` passes
  the saved body as `syncText`, so an open editor takes the line in.
- **`/shed-log/task`** (`TaskPage.tsx`; `?routine=&task=` or `?date=&task=`): title, minutes, the
  routine, days checked off and time practiced; Start (runs just that task on the timer, adding the
  routine to today if it isn't on it); Edit routine. Sections: Notes, Recordings (Record in the
  section's header), Attached, History (routine tasks). A task added to a routine for one day is
  found in the occurrences' `extraTasks`.
- **Routine page** (`RoutinePage.tsx`): the same sections idea: Notes (the routine's own note), Tasks
  (each row now links to its page, with a note icon when it has notes), Attached, Coming up,
  Recordings, History.
- **`PageNotes`**: the page's note written in place (`NoteSurface`, `fill={false}`), ⤢ opens it in
  the side view; other notes attached to it are listed under it. "Start notes" makes one. A task's
  note is titled "<Routine> · <Task>" ("<Task> · <date>" for a day's task) and, when the routine has
  notes, `- [[that title]]` is added to the routine's note; a new routine note starts with "## Tasks"
  and a link to each task note there already. `PageNotesHandle.addLine` puts a recording's embed
  (`![name](file:recording/<id>)`, the player) into the open editor, else `appendLine`, else a new
  note with it.
- **`PageSections`**: a page's sections in your order, some hidden. "Arrange" shows ↑ ↓ and
  hide/show per section. Kept per page in the synced setting `jam-practice-shed-pages` as
  `{ pages: { [targetKey]: { order, hidden } } }` — under one key because a synced setting only
  hands back the keys its defaults have (with `{}` as the defaults nothing came back; found in
  testing).
- **Ways in:** a notes button on each task row of a routine card (beside ▶, on hover on desktop),
  "Notes and recordings" in a day task's ⋮ menu, the routine page's task rows.
- **Side view** (`components/shednotes/NotePeek.tsx`, `lib/notePeek.ts`): replaces `NoteDialog`
  (deleted); attached notes everywhere open in it. Mounted once in `AppShell` after the page: "Beside
  the page" is an in-flow `<aside>` (the page shrinks), "Over the page" a fixed panel with a shadow;
  phones get a full-screen sheet. Width (360–900, the left edge drags) and mode are this device's
  (`jam-practice-note-peek`). Links open in the same view with Back; ⤢ opens Shed Notes; ⋮ has the
  mode and "Take off …" for an attached note. Escape closes (not from the editor with vim on).
  `NoteSurface` is the editor part, shared with the pages; it gained a File button (a recording,
  picture or file from your Files).

Verified signed in (throwaway `.test` accounts, deleted), headless Chromium with a fake mic: made a
routine with two tasks in the editor; started the routine's notes and typed; opened a task's page,
started its notes, recorded a clip from there ("For the task Long tones" in the save dialog), and the
clip's player appeared in the task's note and its Recordings; ⤢ → side view over the page, then
beside it (the page narrowed); the routine's note then had "Morning warm-up · Long tones" linked. A
day task's ⋮ → its page; Arrange (hide Attached, Recordings up) held after a reload. 1440 and 390, no
overflow, no console errors. `tsc` web, mobile, convex; eslint; `convex dev --once`.
Not verified: `pnpm build`; recordings on a plan (online) rather than on the device; the phone's
full-screen side view by touch; two editors on the same note at once (the routine note open on its
page while a task note adds its link: the sync takes it in when nothing typed is waiting); the
desktop app.

### Follow-up (same day): notes only in the side view; pages open in it too; full screen and Back

Jack (with a screenshot of the task page's inline editor): notes shouldn't be editable on the page,
they should always open in the side view (which can go full screen); the task and routine pages
should open in the side view too so the Shed Log stays visible; full screen needs a Back to the
screen you were on.

- **`lib/notePeek.ts`** now holds a `SideItem`: a note, a task (`TaskRef`) or a routine, with a Back
  stack (`followSide` pushes, `sideBack` pops and, with nothing before, closes), `full`, and the
  attached note's `detach`. `openSide` replaces what's open (keeping full screen if it was).
- **`NotePeek.tsx`** (the side view, `role="dialog"` "Side view") draws a note (`NoteSurface`) or the
  page (`TaskPage` / `RoutinePage` with `inPanel`) under a bar with Back, ⤢ full screen / "Exit full
  screen", ⋮ (Open in Shed Notes / Open as a page, over or beside the page, Take off …) and ✕. Full
  screen covers the page from the sidebar's edge (`useSidebarShownWidth`); phones are always full
  screen. Back shows when there's something to go back to, and always in full screen (then it
  closes, back to the page under it). It closes when the route changes (an effect on the pathname:
  closing during render warned "Cannot update a component while rendering").
- **Pages:** `inPanel` drops the page bar (a heading instead) and opens their routine, tasks and
  notes in the view (`followSide`). As pages of their own they get a `BackButton` (history back, or
  the Shed Log / Routines with no history) and their tasks and notes open in the side view.
- **`PageNotes`** no longer has an editor: the attached notes are cards (title, three lines) that
  open in the side view; "Start notes" makes the note and opens it. A recording saved on the page
  goes in with `appendLine` (the open editor takes it in through `syncText`).
- **Shed Log:** a routine card's name and its ⋮ "Open routine" open the routine in the side view; a
  task's notes button and a day task's "Notes and recordings" open the task there.

Verified signed in (throwaway accounts, deleted), headless Chromium 1440: the routine's name → its page
in the side view with the Shed Log beside it; its task → the task page (Back shown); Start notes →
the note in the view, typed; Back → the task page with the note's card showing the text; ⤢ → it
covered from x=244 (the sidebar) on; Back → the routine; Back → closed, still on /shed-log; ⋮ "Open
as a page" → /shed-log/routine, view closed, Back → /shed-log. 390 wide: no overflow. No console
errors after the fix. Not verified: touch on a phone, split screen, the desktop app.

### Follow-up (same day): the name opens the task; the pages show the day; per-day attachments

Jack: tapping anywhere on a task should open it (only the box checks it off); the routine and task
pages should have everything from the day (progress, time…); recordings should play on the task's
page; attach things to a task for just one day there; a task's note should have a "Notes" heading
with "Recordings" under it; the side view's header should show "routine / task", with Back from a
task to its routine.

- **`TaskCheck`** takes `onOpen`: then only the box (a padded button) ticks it, and the name and its
  line open the task. The Shed Log's routine cards and day tasks use it (the side view, with the
  card's date); the card's separate notes button is gone. `RoutineCard` takes `onOpenTask` (the
  routine page opens tasks in the view with it).
- **Day context:** `TaskRef` for a routine task and the side view's routine item carry the `date` they
  were opened from (`?date=` on the task page's URL too); else today.
- **Routine page:** a first section for that day: the day's `RoutineCard` itself (progress, Start /
  Continue / Log time, the running timer, the tasks to tick, its clips and day notes), or "Not on …"
  with "Add it to …".
- **Task page:** a first section for that day: the timer while it runs (`RunningTimer`, pulled out of
  `RoutineCard`), the box (`TaskCheck`) with its minutes and time logged, its subtasks (ticked per day
  for a routine task, on the task for a day task), Time it (not on past days), Log time
  (`LogTimeDialog`). Header Start hides on past days.
- **Per-day attachments:** `Occurrence.taskAttachments[taskId]` (kept by `pruneDay`). The task page's
  Attached shows "Every time" (the routine's, read-only) and "Just for today/<date>" (editable); a day
  task's own attachments are editable there. Routine cards show both under the task, and a tool
  attached for the day opens when the task starts (`startRoutine`).
- **Recordings play:** the task and routine pages' recording queries go through `useDeviceUrls` (a
  recording kept on this device had no URL there, so it showed "kept on Firefox on Linux" instead of a
  player — the routine page's was missing it from before).
- **Note headings:** a new task note starts `## Notes`; recordings go in with `shedNotes.addRecording`
  (`addRecordingToNote` in core): under `## Recordings` at the end of that section, or, without one,
  `## Notes` over the text and `## Recordings` with the players already in the note moved under it.
- **Side view header:** `SideCrumbs` — "Routines / Bass", "Bass / Scales" (the routine opens in the
  view), "Nov 22 / Task". Back on a routine's task with nothing before it goes up to the routine
  (`sideBack`).

Verified signed in (throwaway accounts, deleted), headless Chromium 1440: the name opened the task,
unticked; the card's box ticked it and the page showed it ticked, and unticking on the page unticked
the card; Metronome attached just for today showed on the card's row; a clip recorded on the task's
page had a player there (no "kept on" card); the note read "## Notes / Recordings / the clip"; header
"Bass / Scales", Back → "Routines / Bass"; the routine page's Today had Start routine. `addRecordingToNote`
with a node script (a bare player, text around a player, a new note, a second clip, a later section).
`tsc` web/mobile/convex, eslint, `convex dev --once`. Not verified: a past day's page, subtasks on the
page, the timer block running on the task page, phones by touch.

### Redesign of the routine and task pages (same day)

Jack: the new pages looked sloppy and thrown together. What was wrong (from his screenshot): the
task's name four times and the routine's three; three ways to start (header Start, "Time it", the
timer) beside Edit routine; a different surface per section (card, card, none, labelled card,
dashed box) with "Arrange" floating above them; the note preview reading "Nov 22, 11:53 Nov 22,
11:57" (its players' names); recording cards with the date twice and "Bass / Scales" on that task's
own page; the totals as a tiny line; the full page stretched across the screen.

- **`pageParts.tsx`** — one vocabulary for both pages: `PageTitle` (title, one line of facts, quiet
  Edit/Share), `Stats` (three figures on fills), `FILL` / `ROWS` (a soft `foreground/[0.04]` tint,
  rounded-xl, no borders — it shows the same on the page and in the side view, unlike `bg-surface`),
  `Quiet` (empty states on the same fill), `RecordingList` (one per row, newest first, no place line),
  `NotePreview` (fetches the note: its first written lines — not headings or players — with its
  recordings count and Open; or a "Start notes" empty state).
- **Task page:** title + "10 min · Every Sunday" + Edit; then the **day panel** (one fill): a big
  box with "Done today" / "Not done today yet", time logged and planned, a bar of logged against
  planned, one primary **Start · 10 min** (or the running timer in its place) and Log time, the
  checklist, and Attached (the routine's own chips, then today's with "Attach for today"); then
  Stats (days done, practiced, recordings); then Notes, Recordings (count, Record), History.
- **Routine page:** title + "Every Sunday · 20 min · 2 tasks" + Share/Edit; "Today" with the day's
  card (`RoutineCard embedded`: no icon or name, no minutes or repeat — the title has them — on the
  page's fill), or "It isn't on today" with Add; Stats; Notes, Coming up, Recordings on other days,
  History (rows with x/y and time on the right).
- **`PageSections`:** one header style (semibold, an optional count, actions on the right); "Arrange
  this page" is a quiet button at the end, and arranging shows the sections as a list of rows with
  ↑ ↓ and show/hide, then Done.
- **`RecordingCard`:** `hidePlace`, `className`; the date isn't repeated under a name that has it.
- As pages of their own both sit in a `max-w-2xl` column.

Verified in headless Chromium signed in (throwaway accounts, deleted): the task page empty, with a
note and a recording, light and dark; the routine page in the side view light and dark; the routine
as a page at 1440 and 390 (no overflow); no console errors. Not verified by touch.

### 2026-11-23: the side view is now a pane of split screen

`NotePeek.tsx` and the `SideItem` store are gone: the side view is a pane (`openBeside` in
`lib/useTilingLayout.ts`; `openSide`/`openNotePeek` in `lib/notePeek.ts` turn a task, routine or
note into its address). Task and routine pages no longer take `inPanel`; in a pane the pane's bar
has Back and the trail. Phones: Back is a real history entry. Details in `tiling-split-screen.md`.

## 2026-11-23 — Files on routines and tasks, linked folders and tags, "now practicing" everywhere

Jack: "I want to be able to have a file like a pdf attached to a task on a routine"; "make it so I
can associate a tag or folder with a task / routine"; the current routine/task should be "more
visible and featured" — reachable from anywhere (maybe every tool's header), opening the page the
side view shows, with the routine's/task's files there to open in split view whenever he wants.

### Data (`packages/core/practiceLog.ts`)

- `Attachment` gained three kinds (`FileAttachment`), stored wherever attachments already are (a
  routine, its tasks, a day's tasks, `Occurrence.taskAttachments` for one day, the day itself):
  `{ kind: "file", itemKind: StoredKind, id, label, mimeType? }` (anything on the Files page —
  an upload, a recording, a tune's song, a lesson file…), `{ kind: "folder", path, label }` and
  `{ kind: "fileTag", tag, label }`. References only: taking one off never touches the file; a file
  deleted since shows struck through by its `label`. Old data is unchanged and still valid.
- `isFileAttachment(a)`; `attachmentKey` handles the new kinds (`file:<itemKind>:<id>`,
  `folder:<path>`, `fileTag:<tag lower case>`).
- **Private:** `toPublicRoutine` leaves them out (a shared routine or a Community post never carries
  your files' names); Lessons already copies only tool attachments to a student. `previewSeed` writes
  `attachments: []`, so it's unchanged. Privacy policy: one clause on the Shed Log line.

### Backend (`packages/convex/fileFolders.ts`, dev only)

- `fileFolders.linked({ items: [{kind,id}], folders, tags })` → `{ items, missing, folders: [{path,
  items}], tags: [{tag, items}] }` (each item `OrganizedItem`: folder, tags, `url` null when kept on
  a device). A linked folder includes the folders under it (`deep`); the top level ("") is never
  read. Capped at 100 items / 20 folders / 20 tags. Ownership through `storedItemById`.
- `fileFolders.item({ kind, id })` → one of your items with folder/tags, or null (the file pane).
- Fixed in passing: `files.removeItem` (what the Files page deletes with) left the PDF's
  `pdfMarkups` row behind; it now deletes it like `files.remove`.

### Web

- **Picking** (`components/practicelog/Attachments.tsx`): the attach picker has a **Files** tab
  (signed in): your folders, your tags (with counts) and your files (newest first, search matches
  folders and tags too), plus **Upload and attach** (`useFileUploader` gained an `onSaved` callback
  with the new file's id). `AttachmentPicker only="files"` is the pages' "Add files" dialog.
  `AttachmentList` shows file chips (a PDF chip opens in the side view; folder/tag chips open Files
  on them); `noFiles` hides them and keeps them when the list changes (the task page's Attached
  row, and the routine card's own row on the routine page).
- **Files section** (`components/practicelog/FileAttachments.tsx`, `LinkedFiles`): on the task page
  (first section): the task's own files (every time; added and taken off here — saved on the
  routine's task, on one day's added task, or on a day task) and "Just for today" (the day's).
  On the routine page: the routine's own (editable), then each task's under its name (read-only
  there, the name links to the task). A linked folder/tag shows as a heading (Folder · n / Tag · n,
  ⋮: Open in Files, Unlink) with its files under it, live (files added later appear). Every row
  opens in the side view; its ⋮ (or right-click) has Open in the side view, Open side by side
  (desktop), Open as a page, Show in <folder>, and "Take off (the file stays)". A teacher's routine
  (`assigned`) is read-only here, like its Edit button. The section's count is distinct files.
  The list doesn't go through `useDeviceUrls` on purpose: it only shows names and opens files
  through `/files/view`, which does (loading every device file's blob just to list it would be
  wasteful).
- The editor's per-task and routine Attach got the Files tab for free; `taskTool` (the tool that
  opens when a step starts) still only looks at tools.

### "Now practicing" (`components/practicelog/NowPracticing.tsx`)

- `useNowPracticing()`: the running timer step (a routine task: its task page; a day task: its
  page; a plain Practice Timer session: `/practice-timer`), else today's next task not done (the
  routine whose time it is now first, then routines in order, then day tasks by time), else null.
  Signed in only; nothing before mount (today isn't known on the server).
- **Where it shows:**
  - `PageBar` (every page's desktop header, tools included): a pill on the right before the page's
    buttons — the routine's icon, the task ("Next: Scales" when nothing runs, muted) and the time
    left (tinted with the accent while running, pulsing "Time's up" when alarming). Hidden on the very
    page it opens. Click → `openBeside(taskHref)` (the side view; as a page if it can't).
  - Split screen: that bar is hidden in panes, so `PageBar` portals a compact pill (icon + time) into
    the **main pane's** title slot only (not every pane).
  - Phones: no new chip. The existing timer chip in the top bar (`PracticeTimerWidget bar`) now opens
    the task page in the side view when the run is a routine's; with nothing running it's a small
    round button with the next task's routine icon (not on `/shed-log*` pages). Icon only, so the
    page name keeps its room at 390.
- **The sidebar widget is kept** (it has the pause/skip/stop controls the pill doesn't), but its
  title now opens the task page beside too, like the pill. Why both: the pill answers "what am I on,
  open it" at the top of whatever page you're on and works when nothing runs; the widget is the
  remote control for a running timer. Neither repeats the other's job.
- `RemainingLabel` moved to `components/RemainingLabel.tsx` (shared by the widget and the pill).

### Phone app

- `components/shedLog/LinkedFiles.tsx`: the task and routine screens get a **Files** section (only
  when something's attached) — the same groups as the website, read-only; a file opens in the
  phone's `FileViewer` (PDFs page by page). Lists go through `useDeviceUrls` (the viewer plays from
  the url). `AttachmentChips` skips file kinds (they'd have opened as a chart) and keeps them when
  editing. Adding files on the phone isn't built (the website does it).

### Verified (headless Chromium, dev, the shared `uxpass` account)

At 1440 light: three generated PDFs uploaded on Files (kept on the device, free plan); one moved
into "Taskfiles etudes" and one tagged "taskfiles-gig" (CLI); a routine made in the editor with the
first PDF attached from the task's Attach → Files tab; the task page's Add → the folder and the tag
ticked; the Files section showed all three under their headings; the PDF row → the side view with
the editor (address `/files/view?…`); the sidebar's Metronome → the PDF stayed beside it; a pen
stroke in the side view saved (`pdfMarkups.get` had it); Play stayed inside the side view (no
browser full screen); Start · 10 min on the task, then `/metronome`: the pill read "Etude reading
9:54", clicking it opened the task page in the side view with the running timer and its Files. A
routine card chip on the Shed Log opened the PDF beside. Dark at 1440: task and routine pages, a
file's ⋮ → Open side by side (two panes, the compact pill in the main pane's bar), a PDF on the
Files page (in a folder) → the side view. 390 light and dark: task and routine pages (no overflow),
the phone's next-up chip on the Metronome, which opened the task full screen with Back; a PDF
uploaded and opened from Files → full-screen side view with the editor, Back → Files. No console
errors from this work (one existing hydration warning on the Files page: a spinner `div` inside a
`<p>` in "Backing up"). Everything made was deleted (routine, files; the folder and tag went with
them) except one orphan `pdfMarkups` row from before the `removeItem` fix (375 bytes, its file is
gone). `tsc` web, mobile, desktop, convex (core: only the old `.at()` errors); eslint on every
changed file; `convex dev --once`.

**Not verified:** the phone app at all beyond `tsc`/eslint (not run on the emulator); a file kept
online (only device-kept ones); a recording/song/lesson file attached (same code path); assigned
routines; the pill during an alarm; keyboard focus between the PDF pane and a tool pane with a real
keyboard (the PDF's keys are guarded with `usePaneKeyGuard`); `pnpm build`; the desktop app.

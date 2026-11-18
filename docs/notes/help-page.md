<!-- Moved word for word from the old single PROJECT.md (lines 2983–3084) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Help page (2026-10-17, web)

`/help[?topic=<id>]` (`components/help/HelpPage.tsx`, content in `apps/web/lib/helpContent.ts`):
every tool and feature on the left, grouped (Getting started — Dashboard, Shed Log, Split screen,
Account/sync/themes —, Your library, then the tool categories) with a search box; the picked topic on
the right: what it's for, a screenshot, numbered "How it works" steps, feature chips, tips,
"Open <tool>", Previous / Next (and "Take the quick tour" on the Shed Log topic). The two columns
scroll on their own on desktop; phones show the list, then the topic with an "All topics" back
button. The topic is kept in the address bar with `history.replaceState` (shareable, no history
entries). Reached from a ? button next to the sidebar's ⋮ (desktop and the mobile menu) and Help
in the collapsed sidebar's ⋮ menu; also in the split-screen registry.

Screenshots: `public/help/v1/<shot>-{light,dark}.jpg` (1280×800, the content area only, swapped by
the `.dark` class). Taken with the nix chromium + playwright-core setup against the dev server,
signed out, with seeded demo data (a few tunes, two Shed Log routines with ~4 months of days) and
the Shed Log gate bypassed for that one shot (then restored). The Recorder and pages with no
signed-out content have no screenshot. When retaking them, use a new folder and bump `SHOTS` in
`HelpPage.tsx` (Next caches optimized images by URL). Help text never names the source the
Syncopation exercises were modelled on. Verified: `tsc`, `eslint`, `next build`, and in the
browser at 1440 and 390 wide (sidebar links, topics, search, back button, the tour, no overflow,
no errors).


**Then (same day): options explained, first-visit intros, one title style, part-done days.**
- Every tool topic in `lib/helpContent.ts` has `options` (`HelpOption`: name + what it does), shown
  on the Help page as "The options" (and searchable); "What it does" is now "At a glance".
- **First-visit intro** (`components/help/ToolIntro.tsx`): the topic's screenshot, tagline and
  steps, "Full guide and every option" (→ `/help?topic=`) and "Got it". Opens by itself the first
  time a page is visited on this device (seen ids in localStorage `jam-practice-intros-seen`, read
  through `useSyncExternalStore`; server snapshot = seen, so nothing pops up during SSR) and from a
  ? next to the title (`IntroButton`, `useIntro`). Wired into `ToolLayout` (every tool, found by
  title → `NAV_LINKS` → `topicForHref`) and `PageHeader`'s new `helpTopic` prop (Community, Tunes,
  Chord Charts, My recordings). The Shed Log keeps its own tour, which gained a "Full guide" link.
  Shared bits (`ICON_BY_ID`, `TopicIcon`, `Shot`) moved to `components/help/helpParts.tsx`.
- **Titles like the Shed Log's**: `ToolLayout`'s title is now `text-2xl sm:text-3xl font-extrabold`
  in the foreground colour with the accent icon and the ? (truncates on phones); `PageHeader` shows
  the topic's icon and ? too.
- **Past days in the Shed Log** (`packages/core/practiceLog.ts`: `routineStatus`, `dayStatus`,
  `DayStatus`): green + check when everything planned was done; **yellow + a dash** when some of
  it was (e.g. one routine finished, another not started); red + X when nothing was checked off —
  time logged without checking anything off is still red. Skipping counts as not doing it. Only
  the routine's own start date limits which days count (not when it was created). Month cells, chips/dots,
  the week view's date and the routine card ("Partly done" / "Missed") use it. `isMissed` now
  means "nothing done".
- Screenshots retaken into `public/help/v2/` (`SHOTS = "v2"` in `helpParts.tsx`); the intros are
  pre-marked seen (`jam-practice-intros-seen` = `*`) while taking them.
Verified: `tsc`, `eslint`, `next build`; in nix Chromium: the Metronome intro opens on the first
visit and not after Got it + reload, reopens from ?, Full guide lands on `/help?topic=metronome`
with the options section; Community's intro opens; titles at 1440 and 390 (truncated, no overflow);
seeded past days came out done / partial (2 of 3) / partial (one skipped) / missed / partial (time
only), no errors.


**Daily report card (same day):** a fourth progress-card kind, `"day"` ("Day" in Share your
progress, with ‹ date › instead of the range). `packages/core/practiceLog.ts`: `dayReport(data,
key)` → `DayReport` {minutes, goal, items (every routine task and day task checked off, with its
logged time or else its planned minutes, plus Practice Timer and tool time; up to `REPORT_ITEMS`
= 12, then `more`), achievements (hit the daily goal / twice over, everything done, finished
<routine>, a streak milestone that day, passed N hours in total, longest practice day yet, first
day in the Shed Log)}; `dayReportCard` wraps it in a `ProgressCard` (`report`, streak as of that
day); `cleanProgressCard` accepts and cleans it (posts are milestone posts as before; Convex dev
redeployed). Drawn by `drawDayReport` in `ProgressCard.tsx` (same 1200×630 dark card: the day's
time and goal bar, streak, achievements on the left; "What I worked on" with routine-coloured
dots and times on the right). Opened from "Day report" under the day panel's date (any day up to
today), and from Share on the goal-reached and everything-done toasts (`SHARE_PROGRESS_EVENT`'s
detail can now be `{kind: "day", date}`). Verified in nix Chromium with a seeded day (routine
tasks with logged time, a day task, Metronome time; achievements; the date arrows); no errors.

**Day report made for Instagram (same day):** the day card is now a portrait 1080×1350 (4:5) image
(`REPORT_W`/`REPORT_H`, `cardSize(card)`; drawn at 2× = 2160×2700) with nothing under 30px: date,
the day's time huge, the goal bar ("Daily goal done"), streak and achievements as big pills that
wrap side by side (max 3), then "N things done" with each item's title and time (no routine
names), as many rows as fit plus "+ N more". The preview is `aspect-[4/5]`, max `max-w-sm`.
Other cards are unchanged (1200×630). **Auto popup:** finishing every task for today (the
"Everything done today" moment in `useCelebrations`) opens the share dialog ~2.6 s later on today's
Day card, titled "Day complete!" (`celebrate` flag through `SHARE_PROGRESS_EVENT`'s detail →
`PracticeLogGlobal` → `ProgressShareDialog`). Checked in nix Chromium (dispatching the event signed
out — the real trigger needs a signed-in account), desktop and 390 wide.

**A proper daily-goal setter, and every progress card portrait (same day):**
- `components/practicelog/GoalDialog.tsx` ("Your daily goal"): Same every day / By weekday (seven
  day buttons; 0 = a rest day, "Use X for every day"), a big value with − / +, a 0/5–240 min
  slider, presets (15, 30, 45 min, 1, 1.5, 2 h; Rest day), and the last 30 days as bars with each
  day's goal marked — "You'd have hit it on N of the last M days" and your average practice day
  with "Use it". Saves on Save. Opened from the goal card / goal pill (replacing the ± buttons and
  the presets menu) and "Daily goal…" in the Shed Log's settings menu. Core:
  `PracticeLogPrefs.goalByWeekday?: number[] | null` and `goalOn(data, key)` (that weekday's goal,
  else `dailyGoal`); every place that judged a day against the goal now uses it — calendar
  stars/heat, the ring, week bars (per-day goal marks when they differ), sidebar card, streak
  badge, celebrations, heat grids, progress cards and the day report. A rest day shows "Rest day"
  in the ring. `Momentum`/`MomentumPills`/`StatsDialog` take `onPrefs` (was `onGoalChange`).
- **All progress cards are portrait 1080×1350** (`drawMilestone` for Streak / Hours / Days;
  `cardSize` always returns that; the preview is `aspect-[4/5]` `max-w-sm`): range line, a huge
  headline (flame for a streak), three stat boxes, then the days — seven big tiles for a week, a
  calendar for a month, the year as two stacked blocks of weeks — and a "Less … More" key. Text is
  30px or more (stat labels may shrink to 26px to fit). The landscape drawing is gone. The sample
  card on the signed-out Shed Log page sits in a 17rem column.
Verified in nix Chromium: the goal dialog (both modes, rest day, presets, Save writing
`goalByWeekday: [0, 90, 60, …]`, 390 wide with no overflow); all nine card combinations rendered
and checked; the landing page and the gate page with the portrait sample card; `tsc` (web,
mobile), `eslint`, `next build`, Convex dev push.


## 2026-11-18: intros no longer open by themselves (FB-23)

Jack: "help popups are outdated and annoying, remove them" (screenshot: Community's intro, opened by
itself, showing an old sheddex-era screenshot). `useIntro` (`components/help/ToolIntro.tsx`) now
opens only from the ? next to the title; the first-visit auto-open, its "seen" list
(`jam-practice-intros-seen` in localStorage, now unused) and `resetIntros` are gone, and so are
Settings → Tools → Help's "Explain a page the first time" switch and "Show them again" button (and
`toolIntros` in `SITE_DEFAULTS`; old stored values are just ignored). The intro dialog no longer
shows the topic's screenshot (they were outdated); the Help page still does. Kept the ? intros
themselves (steps + "Full guide") since they only appear when asked for. Verified: tsc, eslint, a
fresh signed-out browser no longer gets a popup on /metronome or /random-metric-modulation.
Not verified: the help screenshots themselves are still old — retaking them is a separate job.

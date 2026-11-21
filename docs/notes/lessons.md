<!-- Moved word for word from the old single PROJECT.md (lines 3310–3666) on 2026-10-18. Older entries give paths relative to apps/web/ (or packages/convex/ for convex/...); see docs/notes/repo-structure.md. -->

### Lessons: teachers and students (2026-10-17, web; backend dev deployed)

`/lessons` (`components/lessons/*`; nav link in Practice tools; help topic `lessons`). Anyone
signed in can be a teacher, a student, or both. Signed out, it explains itself and offers Sign
up / Sign in.

**Backend** (`packages/convex/lessons.ts`; dev only until Jack pushes):
- **Tables:**
  - `lessonStudents`: teacherId, name, `code` (the invite), studentId?, joinedAt?.
  - `lessonItems`: lessonId, kind `note|file|chart|assignment|routine`, title, body, fileId /
    fileName / fileType (Convex storage), `chart` (a copy of an `IRealSong`), `routine` (a full
    `Routine`, cleaned server-side; only tool attachments kept), dueDate, done / doneAt.
- **Teacher:** `students`, `student`, `routineReportFor`; `addStudent`, `renameStudent`,
  `newInviteLink`, `removeStudent` (deletes items and files); `generateUploadUrl`, `addItem`,
  `addChart` (copies one of the teacher's `chordChartSongs` and its bars server-side),
  `updateItem`, `removeItem`.
- **Student:** `invite` (open to anyone with the code), `join` (refuses your own link and links
  someone else already used), `myTeachers`, `setDone`, `leave` (also resets the code).
- **Account deletion** (`deleteLessonsFor`): your students and their things go, and you're
  unlinked from your teachers.
- **Teachers read a joined student's Shed Log** (the `jam-practice-practice-log` blob) for
  `publicPracticeStats`, `lastPracticed`, and `routineReport` for the routines they assigned, plus
  the student's recordings with `routineId = lesson-<item>`. They never see the student's other
  routines or notes. The privacy policy has a "Lessons" section saying exactly this.

**The invite link is `/lessons/join?invite=<code>`**, not `?code=`: Convex Auth's Next.js
middleware treats any `?code=` as an OAuth callback. It tried to sign in with it, left auth
loading forever and signed the user out. Found and fixed while testing.

**Assigned routines in the student's Shed Log** (`packages/core/practiceLog.ts`):
- `Routine.assigned` is `{teacher, itemId, version}`.
- `lessonRoutineId(itemId)` gives `lesson-<itemId>`.
- `reconcileAssigned(data, assigned, today)` does the syncing: adds a routine starting today (or
  the teacher's later start), replaces it when the item's `updatedAt` is newer (keeping its start,
  so past days stay), removes it when the item is deleted or the student leaves, never touches
  days, and returns the same object when nothing changed.
- `PracticeLogGlobal` runs it whenever `lessons.myTeachers` changes (`usePracticeLog().syncAssigned`).
- Assigned routines show "From @teacher" on the day card and routine page, and have no Edit
  button (the teacher's next change would overwrite an edit).
- `routineReport(data, routineId, today, from?)` gives every day the routine was on (scheduled
  or added), newest first: status, tasks (done, minutes logged, planned, subtasks), notes, plus
  totals. `lastPracticed(data, today)` gives the last day with practice.

**Pages:**
- **`LessonsPage`:** "Your teachers" (cards: open assignments, the latest item) and "Your
  students" (cards: joined or not, streak, hours this week, last practiced, open / overdue
  assignments, item and routine counts). "Add a student" (name) takes you to their page.
- **`StudentPage`** (`/lessons/student?id=`, teacher):
  - The header with Add (Assignment / Lesson notes / PDF or image / Chord chart / Shed Log
    routine) and ⋮ (rename, copy link, new link, remove).
  - The invite link with Share until they join.
  - Kind filter chips, then item cards: open assignments first by due date, then newest. A
    routine card has a Practice report row (the last 14 days as ✓ – ✕ dots); "Show days" opens
    `RoutineReportView` (totals, each day with tasks / minutes / subtasks / notes, the
    student's recordings).
  - Side column: Practice stats and the routines you assigned.
  - Editing a routine item = pick a routine again (`updateItem` with `routine`).
- **`TeacherPage`** (`/lessons/teacher?id=`, student): the same cards. Tick assignments; "Save to
  my charts" imports a chart into a playlist "From @teacher"; "Open in your Shed Log"; Leave.
- **`JoinPage`:** who invited you, for which student name, what joining shares (spelled out),
  then sign up / sign in (the modal keeps you on the page) and Join.
- **Files** (≤25 MB; PDF, image, audio): images inline with a lightbox, PDFs Open + Preview
  (iframe), audio a player.

**Verified** against the dev deployment, using Jack's account in the browser and his second dev
account (`@jack2`, through `npx convex run … --identity '{"subject":"<userId>|x",…}'`) in both
directions:
- added one of each item, including real uploads;
- joined, ticked an assignment, a stranger refused;
- joined in the browser as the student: the routine appeared in the Shed Log with its badge;
  ticking a task showed in the teacher's `routineReportFor`; leaving removed it;
- the pages at 1500 and 390 wide, chart and PDF previews, no errors.

The test data was then removed (no `lesson-` routines or occurrences left in Jack's log; today's
time back to what it was; both lesson tables empty). A script checked `reconcileAssigned` and
`routineReport` (statuses, totals, keeping the start, removal keeping days). `tsc` (web, mobile),
`eslint`, `next build`. **Not done:** the mobile app (Lessons is listed there and opens the
placeholder; assigned routines only sync when the web app runs), notifications to students or
teachers, the report UI with several days of real data (the logic is script-tested; the UI was
seen with today only), and the dashboard doesn't mention lessons yet.

### Lesson notes: a notes page with a Markdown rich-text editor (2026-10-17, web)

`/lessons/notes?lesson=<lessonStudents id>&note=<item id>` (`components/lessons/NotesPage.tsx`),
for the teacher (writes) and the student (reads).
- **Sidebar:** back to the student's / teacher's page, "Lesson notes" with the other person, "New
  note" (teacher; titled "Lesson — <date>"), search over title and text, and the notes newest
  first, grouped by month (title, date, a plain-text snippet).
- **Main area:** the open note. Teacher: an editable title, a "Saving… / Saved" status, delete,
  and the editor. Student: read-only.
- **Layout:** on desktop it's full height with the list beside the note; with no note picked the
  newest opens. On phones the list and the note are separate screens ("All notes" goes back).

**Editor** (`components/lessons/RichNote.tsx`): TipTap v3 — `@tiptap/react`, `starter-kit`,
`markdown`, `extension-placeholder`, `extension-task-list` / `task-item`, all pinned to
**3.31.4** (3.32.0 was only 4 days old).
- Notes are stored as **Markdown** in `lessonItems.body` (`contentType: "markdown"` in,
  `editor.getMarkdown()` out), so older plain-text notes load as they are.
- Markdown shortcuts work as you type (`# `, `**…**`, `- `, `1. `, `[ ] `, `> `, three
  backticks, `---`).
- The sticky toolbar has B, I, U, S, H1–H3, bullets, numbers, checklist, quote, inline code,
  code block, link (`PromptDialog`), divider, undo / redo.
- Styles are the `.rich-text` block in globals.css (theme tokens; no typography plugin).
- Autosave: changes are debounced 700 ms (`lessons.updateItem` with title / body), and anything
  pending is flushed on blur, when switching notes and on leaving the page.
- `markdownSnippet()` gives plain text for lists and cards.

**Backend:** `lessons.notes({lessonId})` (role, student name, the other person, the notes; only
for that lesson's teacher or student). `MAX_BODY` is raised to 100,000 characters. Deployed to dev.

**Elsewhere:**
- A note card on the student / teacher pages shows a 3-line plain-text preview and "Open in notes"
  / "Read the notes".
- The student page's Add → Lesson notes creates a note and opens it, and its ✎ opens the notes
  page.
- Both lesson pages have a Notes button in the header.
- The Lessons help topic mentions it.

**Verified** in nix Chromium, signed in to Jack's dev account:
- Typed a heading, bold, a list, a checklist and a quote into a new note. It saved as clean
  Markdown (checked in the database) and rendered back after switching notes.
- @jack2 (via `--identity`) wrote a Markdown note; Jack joined and saw it read-only with no
  toolbar or New note (h2, ordered list, checklist, code, rule and link all rendered).
- The phone list / note screens with no overflow, and no console errors.

The test lessons were removed afterwards. Jack's own "Test" student was left alone.
`tsc`, `eslint`, `next build`.

### Emailing a student their invite link (2026-10-17, web; backend dev deployed)

A teacher can type the student's email and have the invite link emailed to them. "Add a student"
(`AddStudentDialog` in `components/lessons/parts.tsx`) asks for a name, an optional email and an
optional note ("Add and email invite"). On a student's page, the invite box has `EmailInviteForm`
("Email invite", or "Email it again", with "Emailed to … · when"), next to "…or send the link
yourself". On the Lessons page, a card shows "Invited · email" until the student joins.
Backend: the `lessons.emailInvite({id, email, message?})` action (with the internal
`inviteDetails` / `markInvited`). It checks the email address and refuses students who have
already joined. It allows one send a minute per student. It emails HTML plus plain text through
`lib/resend.ts`'s `sendEmail`, with the teacher's name, the note and a button to
`${SITE_URL}/lessons/join?invite=<code>`. It then records `lessonStudents.inviteEmail` /
`invitedAt`, which `students` / `student` return. Nothing else uses the address.
On dev, `SITE_URL` is localhost:3000 and `AUTH_EMAIL_FROM` still says "jackshed
<noreply@jackshed.com>" (the old name). Prod uses its own values. Verified in nix Chromium signed in: a bad address is
rejected; a real invite was sent to Jack's own address and the page showed it; a resend within the
minute got the friendly refusal. The test student was removed afterwards.

### Scheduling lessons (2026-10-17, web; backend dev deployed)

Teachers set their hours, offer times by email, and take requests. Booked lessons are emailed to
both with a calendar invite.
- **Core** (`packages/core/lessonSchedule.ts`, used by both the backend and the site):
  - `Availability` is weekly windows (weekday plus "HH:MM" start/end, in the teacher's IANA
    `timeZone`), `lengthMin`, `bufferMin`, `noticeHours`, `aheadDays`, `blockedDates` and
    `allowRequests`. `cleanAvailability` checks over client data and fills in what's missing.
  - Time-zone maths is plain `Intl` (`wallClock`, `zonedTime`, `dateKeyIn`); it works in
    Convex's runtime.
  - `openSlots(av, busy, now, len?)` gives the slots that fit each window, back to back with the
    buffer between, skipping days off and anything that overlaps busy times (padded by the
    buffer). `isOpenSlot` checks one.
  - `lessonIcs` (PUBLISH or CANCEL, stable UID `<bookingId>@sheddex.com`, SEQUENCE, a 30-minute
    alarm, lines folded) and `googleCalendarUrl` build the calendar entries; `base64Utf8` encodes
    the attachment.
  - Checked by script: Los Angeles before/after the clock change, Kolkata, buffer around a
    booked slot, ICS folding, base64.
- **Backend** (`packages/convex/lessonSchedule.ts`):
  - **Tables:** `lessonAvailability` (one per teacher); `lessonBookings` (status `requested |
    confirmed | declined | cancelled`, source `request | offer`, note / reply, the student's
    `studentTz` / `studentEmail`, `cancelledBy`, `sequence`); `lessonOffers` (a `token`, the
    `slots`, a message and email, status `open | booked | withdrawn`).
  - **Queries:** `myAvailability`, `overview` (Lessons page), `forLesson` (teacher or student),
    `freeSlots` (open slots minus the teacher's booked and requested lessons; the teacher's own
    view ignores notice beyond an hour), and `offer({token})`, which is open to anyone.
  - **Writes:** `saveAvailability`; `offerTimes` (an action: creates the offer and emails the link
    to the given address, else the student's account email, else their invite email; with none
    it just returns the link); `withdrawOffer`; `bookOffer` (no sign-in, re-checks the slot is
    still free); `requestLesson` (student; at most 3 pending, the slot must be open; emails the
    teacher); `respond` (accept emails both with the .ics, decline emails the student);
    `cancel` (either side; emails the other a CANCEL .ics).
  - **Email behaviour:** emails go out after the write and never undo it (`trySend` logs
    failures). Each person gets their own time zone: the teacher's hours zone; the student's
    booking zone, else the teacher's. `sendEmail` (`lib/resend.ts`) gained `attachments`
    (base64; Resend's `content_type`).
  - **First offer:** making an offer before setting hours saves a row with the teacher's browser
    time zone and no windows. Before a fix it saved `allowRequests: false`, and Jack's own dev row
    has that — flip it on the hours page.
  - **Deleting:** removing a student deletes their bookings and offers; account deletion also
    deletes the availability row.
- **Web:**
  - `/lessons/availability` (`AvailabilityPage`): weekly hours per day (switch, ranges, "Copy to
    Mon–Fri"), booking rules, time zone, days off, the requests switch, and a "What students
    see" preview.
  - `/lessons/book?offer=` (`BookPage`): pick a time (in your own time zone) → "You're booked!"
    with Google Calendar and .ics buttons. Signed out with no known address, it asks for an email.
  - `components/lessons/schedule.tsx`: `ScheduleCard` sits on the student page's side column
    and the teacher page (now two columns from xl). It holds requests (Accept / Decline, or
    Withdraw), Coming up (Add to calendar, Cancel), offers (copy link / take back, or Pick a
    time), recently declined or cancelled, and past lessons. It opens `OfferTimesDialog` (open
    slots by day plus your own date/time, a length picker, email, note, or just a link) and
    `RequestLessonDialog`. `ScheduleOverview` on the Lessons page has "Needs you" and "Upcoming
    lessons", plus a "Teaching hours" button. Times show in the viewer's time zone (`slotLabel`).
- Privacy policy and the Lessons help topic mention it.

**Verified** on dev:
- A request was refused for a time not on the grid; a real request was emailed to the teacher;
  that slot then left the student's open times; accepting emailed both (Resend accepted the .ics
  attachment).
- An offer emailed to the student was booked through the real page in nix Chromium, signed out
  (confirmation, calendar buttons, emails sent). The schedule card, Lessons overview, request
  dialog and hours page (1500 wide and 390 wide, no overflow, no errors) were checked.
- Cancelling worked. All the test data (@jack2 as teacher, Jack as student) was removed. Jack's
  own "Test" student's lesson was left alone.

**Not verified:** how the emails and the .ics look in real inboxes (Gmail, Apple Mail), and
importing the .ics into Google Calendar. **Mobile app: not done** (the lessons screens are web
only).

### Lessons organized by lesson; real assignments; feature switches (2026-10-17, web; backend dev deployed)

**A page per lesson.**
- New table `lessonSessions` (a "lesson" in the UI; `lessonStudents` is still the teacher–student
  pair): title, `start`/`end`, optional `bookingId`, `hiddenUntil` (the student sees it from then
  on), `cancelled`.
- `lessonItems.sessionId` puts notes, assignments, files and charts in a lesson. Routines have none
  and stay on the student's page. Items from before this have none and show as a **"Before
  lessons"** pseudo-lesson (`id=earlier`). There's no migration; `moveItem` exists, but no UI uses
  it yet.
- Backend (`lessons.ts`):
  - `sessions({lessonId})`: lessons with counts (the student only sees visible ones).
  - `session({lessonId, sessionId?})`: one lesson and its items.
  - Writes: `createSession` (optionally hidden until it starts), `updateSession` (title / time /
    `hidden`), `removeSession` (deletes its items, hand-ins and files), `moveItem`.
  - `addItem` / `addChart` take `sessionId`. `notes({lessonId, sessionId?})` scopes the notes page
    to one lesson; `null` means "Before lessons".
  - Students never get a hidden lesson's items: `itemsOf` with `student: true`, the notes query,
    and hand-ins all check.
- **Booking:** `sessionForBooking` runs when a booking is confirmed (offer booked or request
  accepted) and makes a "Lesson" hidden until the booked start. `sessionCancelled` deletes it on
  cancel if it's empty, otherwise marks it cancelled. `backfillBookingSessions` (internal, run once
  on dev — it made Jack's Oct 24 lesson) does the same for older bookings. **Run it on prod after
  deploying** (`npx convex run lessons:backfillBookingSessions --prod`).
- Web:
  - `/lessons/lesson?pair=<lessonStudents id>&id=<session id | earlier>` (`LessonPage.tsx`): a
    header (time, "with …", booked / cancelled). For the teacher: Add (assignment / notes / file /
    chart, by feature), ⋮ (edit title and time, show now / hide until it starts, delete), and a
    "can't see this yet — Show it now" bar. Then the kind filter and the item cards.
  - `components/lessons/sessions.tsx`: `SessionList` (Coming up / Earlier lessons cards with
    counts and badges, "Before lessons", New lesson) and `NewLessonDialog` (title, day, optional
    time and length, "Hide it until it starts"; also used for editing).
  - `StudentPage`: lessons, then "Shed Log routines" (assign / report). Add menu: New lesson,
    Shed Log routine, Lesson settings.
  - `TeacherPage` (student side): lessons, then "Practice routines".
  - Both lost their page-wide notes button and item list.
  - `notesHref(lessonId, noteId?, session?)` and `lessonHref(lessonId, session)` are in
    `NotesPage.tsx`.

**Assignments are real assignments.**
- `lessonItems.submit` (`SubmitConfig` in `packages/core/lessonFiles.ts`): file / text / link, plus
  `fileKinds` (audio, video, pdf, image, notation & MIDI, documents, any) and the teacher's own
  `extensions`. No `submit` means "just tick it off", as before.
- New table `lessonSubmissions`, one per assignment (handing in again replaces it): text, links,
  files (`{fileId, name, type, size}`), status `submitted | reviewed | changes`, feedback.
- Mutations:
  - `generateSubmitUploadUrl` (students only).
  - `submitWork`: checks the config. File types are checked against the name and the storage
    content type (`fileAllowed`); up to 5 files of at most 100 MB, up to 5 links (normalized by
    `cleanLink`). Uploads are deleted when it refuses, and files kept from the last hand-in are
    never deleted.
  - `withdrawSubmission` (only before review) and `reviewSubmission` (`changes` re-opens it).
  - `setDone` refuses hand-in assignments. The assignment's `done` follows the hand-in.
  - `students` counts `toReview` ("N to review" on the student cards).
- UI (`components/lessons/assignment.tsx`):
  - `SubmitSettings` in the assignment dialog: "How they hand it in", file-type chips and your
    own extensions.
  - `AssignmentWork` under the card. The student gets the hand-in form (picker `accept` from the
    config, refused types caught before upload), then their hand-in with feedback, "Change your
    hand-in" / "Take it back". The teacher sees what came in (text, links, files previewed —
    video plays too) and feedback with "Mark reviewed" / "Ask for changes".
  - The card's icon and chip show the status (`StatusChip`).

**Feature switches.** `lessonPrefs` (one per teacher) holds `features`: scheduling, notes, files,
charts, assignments, routines (`LessonFeatures`, `FEATURE_INFO`, `cleanFeatures`).
- `myFeatures` / `setFeatures`.
- Off hides that kind for the teacher and their students (`itemsOf` filters it, `addItem` /
  `addChart` refuse it, the notes query returns null). Nothing is deleted.
- Routines switched off leave students' Shed Logs, because `reconcileAssigned` sees them gone.
  The days they logged stay.
- Scheduling off makes `forLesson` / `freeSlots` return null (the card disappears), `overview`
  skips it, and offers, requests and bookings are refused.
- `/lessons/settings` (`LessonSettingsPage.tsx`, the old availability page): Features switches
  (they save at once), then Teaching hours (only while booking is on). `/lessons/availability`
  redirects there, and the Lessons page has a Settings button.

**Verified** on dev (@jack2 as teacher, Jack as student, then removed):
- A hidden lesson and its note are invisible to the student, everywhere.
- A past lesson shows with counts.
- Ticking off a hand-in assignment is refused.
- In nix Chromium, signed in as the student: a .txt was refused by the picker; text + link +
  PDF were handed in and stored (link normalized).
- Feedback with "changes" works.
- Switching assignments off hid the assignment and refused adding one.
- Request → accept made a hidden "Lesson"; cancelling removed it (empty).
- Screenshots: student page, lesson page, assignment dialog, settings (390 px, no overflow).
- `tsc`, `eslint`, `next build`.

**Not verified:** a real audio or video hand-in (only a tiny PDF), and the teacher-side review UI
by click (the review was done by CLI). **Mobile: none of this yet.**

**Lessons in the sidebar (same day):** `/lessons` moved from "Practice tools" to the "Community"
category in `packages/core/navLinks.ts`, listed after Chord Charts. So it's a sidebar card under
Community and Tunes, full width because it's the odd one out (`col-span-2` on a lone last card in
`Sidebar.tsx`). It's also in the collapsed sidebar's library group. On mobile it lists with
Community.

**Clearer lesson pages (same day):**
- **Lesson list** (`SessionList`): one list ordered by date. "Coming up" comes first, soonest
  first (solid date tile). Past lessons follow under month headings, newest first. Each row has
  a weekday / day / month tile, the title, "In 7 days · 7:30 PM – 8:30 PM", the contents as icon
  counts (or "Nothing added yet"), and badges (Booked, Hidden until it starts, N to review, N to
  do).
- **Routines:** `components/lessons/routines.tsx` `RoutineRow` is one compact row (icon, name, how
  often · tasks · minutes; the teacher also sees the last 14 days and days done). Expanding it
  shows the tasks plus the practice report (teacher) or "Open in your Shed Log" (student).
- **Student page:** the "Routines you assigned" side card and the header's Add button are gone
  ("New lesson" and "Assign a routine" sit on their sections; Lesson settings is in the ⋮ menu).
  The booking card is titled **Booking** ("Booked times"), so there's only one "Lessons".
- **Lessons page:** "Needs you" (requests, offers) and **Coming up**. Coming up is
  `lessons.upcomingLessons`: every upcoming lesson across students and teachers. A student's
  still-hidden lesson shows as "Opens when it starts", with no link. Student cards show "N lessons
  · next <date>" (`students` returns `lessons` / `nextLesson`).
- **Lesson page:** Previous / Next links between lessons, by date.
- **Booked lessons:** they're titled "Lesson — Oct 24", using the teacher's time zone. The one
  backfilled earlier is still called "Lesson".

**All materials (same day):** `/lessons/materials?pair=<lessonStudents id>` (`MaterialsPage.tsx`,
`materialsHref`). It's for the teacher and the student, and lists every note, assignment, file and
chart from all of a pair's lessons (routines aren't included).
- Grouped by lesson, newest first, with each heading linking to the lesson. Open assignments come
  first within a lesson.
- A type filter and search (title, text, file name, chart title).
- The same card actions as a lesson page: the teacher edits or removes, the student hands in.
- Backend: `lessons.materials({lessonId})`, the visible lessons plus items; a student never gets a
  hidden lesson's items.
- Linked as "All materials" beside the lesson list on both pages.
- Checked in nix Chromium on Jack's Test student (only viewed): grouping, search, 390 px.

**Lessons on the dashboard (same day):** `components/lessons/LessonsDashboard.tsx`, under Today's
practice in `Home.tsx`. It renders nothing unless you have a student or a teacher (it waits for
`students`, `myTeachers` and `upcomingLessons` before deciding).
- **Title:** "Lessons" in the same style as "Today's practice", with a Lessons → link.
- **Three columns:**
  - **Coming up** — the next 5 lessons. Each row opens that student's or teacher's page.
  - **Your students / Your teachers** — each opens their page, with "next in N days", "N to
    review" or "N to do".
  - **To do** — lesson requests to answer, hand-ins to review, offered times, and assignments to
    hand in (soonest due first, overdue in red, linking to their lesson).
- `relWhen` is now exported from `sessions.tsx`.



### Lesson notes use Shed Notes (2026-10-20)

- The Tiptap `RichNote` is gone (and its `@tiptap/*` packages and the `.rich-text` CSS). Lesson
  notes are written in `components/lessons/LessonNoteEditor.tsx`: the Shed Notes `NoteEditor`
  with the formatting buttons, Notation and the Vim switch for the teacher, and `readOnly` for the
  student (no toolbar, no vim, checkboxes can't be ticked). It uses the reader's own Shed Notes
  settings. The notes are still Markdown in `lessonItems.body`, so nothing was converted.
  Snippets use core `noteSnippet` (♪ for notation).
- Notation is a teacher's Score Writer score in a ```score block. `scores.get` takes an optional
  `lessonId`: someone else's score is returned (with `readOnly`) only if the score's owner is
  that lesson's teacher, the reader is its teacher or student, and a note item of that lesson
  (not in a lesson still hidden from the student — `hiddenSessions`, now exported) contains the
  score's id. The embed hides Edit and "Open in Score Writer" for read-only scores.
- "Your own notes" at the bottom of the notes list: private Shed Notes attached to
  `lesson:<lessonStudents id>` (a new `NoteTarget` kind), for teacher or student; the note's
  Links panel links back to the lesson's notes page.
- Checked in the esbuild harness (fake backend): the teacher's view (toolbar, ticking, the score
  with Edit) and the student's (read-only, the same score, no Edit, ticking blocked); tsc, lint,
  build. **Not checked signed in:** the real notes page, the server's lesson check for scores,
  "Your own notes".

## 2026-11-20 — UI pass 4 fixes (web)

From a reviewer's pass over people, account and first impressions (7/10). Lessons fixes:
- **Student page on phones** (`StudentPage.tsx`): the invite card's grid is
  `grid-cols-[minmax(0,1fr)]` with `min-w-0` children. Before, the truncated invite URL set the
  track's width and the page scrolled sideways (474px at 390). `SessionList`'s header text is
  `flex-1` and its buttons `shrink-0`, so "…live in each lesson" no longer runs under New lesson.
- **Dialogs keep their buttons in view** (`parts.tsx` `Dialog`): the title row is sticky at the top
  and each dialog's action row uses `dialogFooter` (sticky at the bottom; ItemDialog, Add a
  student, New/Edit lesson, the three booking dialogs). Gotcha: a sticky offset inside a padded
  scroll box counts from inside the padding, so it's `-top-5` / `-bottom-5` to sit flush with the
  dialog's edges (with `top-0` content peeked through a 20px band).
- **Assignment pools** (`assignment.tsx` `Toggle`, and the custom file-type chips) are filled pills
  like `PoolPill`: accent when picked, `bg-foreground/[0.05]` when not, no borders.
- **Student-only Lessons page** (`LessonsPage.tsx`): with teachers and no students, the header's
  Add a student is gone and the big "Teach with soniroll" block becomes one line, "Teach too? Add
  a student". The header button only shows once loaded (it used to flash for students). "Your
  students" no longer repeats the count from the subtitle.
- **Lesson item cards** lost their thin border (an overdue one keeps a danger ring); lesson notes
  use the document icon (Shed Notes') instead of the music note, in the item cards, the Notes
  button, lesson rows and the notes page's empty state.
- **Broken invite link** (`JoinPage.tsx`) has a way out: Go to Lessons (signed in) or Go to the
  dashboard.
- The phone crumb on a lesson is "… / Lesson — Nov 20" now (see `PageBar` in `ux-refresh.md`).
Verified in headless Chromium with a throwaway teacher and student (both deleted, with their
lesson and follow rows): the student page at 390 (no overflow), Add a student at 1440×500, New
assignment at 1440×900 and 390 dark (scrolled: buttons stay, nothing peeks), adding an
assignment and notes, the student's Lessons page at 1440 and 390 dark. Not verified: the booking
dialogs (no bookings made), real phones.

/**
 * The changelog shown at /changelog — one entry per version, newest first.
 *
 * **Adding a release** (whenever the version in apps/web/package.json is bumped): put a new entry
 * at the top of RELEASES with the same version, today's date, a short title, and one line per
 * change. Kinds: "new" (a feature), "improved" (a change to something that existed), "fixed" (a
 * bug). `**bold**` works inside a line. Write for the people using the site, not for developers.
 *
 * The admin panel (Admin → Changelog) can correct any entry; those corrections live in Convex
 * (`changelogEdits`) and replace the entry below on the site, so editing this file never undoes
 * them. Keep a version's entry here even after it's been edited there.
 */

export type ChangeKind = "new" | "improved" | "fixed";

export type Change = { kind: ChangeKind; text: string };

export type Release = {
  /** "0.9.1" — must match the version it describes. */
  version: string;
  /** "YYYY-MM-DD". */
  date: string;
  title: string;
  summary?: string;
  changes: Change[];
};

export const CHANGE_KINDS: { kind: ChangeKind; label: string }[] = [
  { kind: "new", label: "New" },
  { kind: "improved", label: "Improved" },
  { kind: "fixed", label: "Fixed" },
];

export const RELEASES: Release[] = [
  {
    version: "0.10.3",
    date: "2026-10-28",
    title: "Shed Notes cursor fixes",
    changes: [
      { kind: "fixed", text: "In Shed Notes, clicking a line puts the cursor on that line, even below tables, notation, scores and pictures (it used to land on the line below)." },
      { kind: "fixed", text: "With vim keys on, **k** and **j** move one line at a time instead of sometimes skipping lines or jumping far up the note." },
      { kind: "fixed", text: "Clicking right on a horizontal rule puts the cursor there." },
    ],
  },
  {
    version: "0.10.2",
    date: "2026-10-28",
    title: "Time Test",
    summary: "A new drum tool that listens to you play along to the click and shows how far off every stroke was.",
    changes: [
      { kind: "new", text: "**Time Test** (under Drums): play along to the click on a practice pad and the mic hears every stroke. While you play you see how early or late each one was; afterwards you get a score, your average push or pull, how consistent you were, your real tempo, a waveform with every stroke marked (play it back with or without the click), where your strokes land, the worst moments, and how each beat and each note of the beat did." },
      { kind: "new", text: "It works out what you're playing beat by beat (quarters, 8ths, triplets, 16ths), or you can choose. **Calibrate** once so your setup's delay doesn't count against you, and your takes are kept in **History**." },
    ],
  },
  {
    version: "0.10.1",
    date: "2026-10-20",
    title: "Pictures in notes, templates and faster typing",
    summary: "Paste pictures into Shed Notes, start notes from templates, and get word suggestions as you type.",
    changes: [
      { kind: "new", text: "**Pictures and files in notes:** paste a picture or drop files into a note and they're saved to your Files and shown right there. **File** above a note puts in anything from your Files: PDFs, recordings, audio and video play in the note." },
      { kind: "new", text: "**Templates** for notes, with blanks you fill in (in the title too) — start a note from one with [[, the command palette or an empty note." },
      { kind: "new", text: "**Share a note with what it links to**: one switch in Share, and the people you shared with (and the link) can open the notes it links to — every level down, or just one." },
      { kind: "new", text: "**Word suggestions** as you type in notes: up to four words that finish what you're typing, yours first (Enter or Tab fills one in). Off until you turn it on in Shed Notes' settings." },
      { kind: "new", text: "A **Settings page** for Shed Notes: switches, text size, every command's key (press the pencil and the new key to change it) and vim options. The JSON file is still there to edit." },
      { kind: "new", text: "**Vim mappings** with your leader key work (like nmap <leader>ff :app:search<CR>), and any command can run after a colon. Settings → Vim has a guide with examples." },
      { kind: "new", text: "**Shift-Enter** on a link opens that note." },
      { kind: "improved", text: "New keys: **Alt/⌥-Space** opens the command palette, **Alt/⌥-F** searches your notes and **Ctrl-`** switches live preview on and off." },
      { kind: "improved", text: "**New** opens a menu: a note, one from a template, or a folder. Drag the note list's edge to make it wider or narrower." },
      { kind: "improved", text: "A note's view options, Share and the rest are together in its **⋮ menu**, each with an icon." },
      { kind: "improved", text: "The links panel moves **under the note** when you close it, like on a phone." },
      { kind: "improved", text: "A note given a name you already use gets \" - 1\" (or the next free number)." },
      { kind: "improved", text: "A tidier [[ link menu, and the Shed Notes title fits in the note list." },
      { kind: "fixed", text: "The collapsed sidebar no longer shows two expand buttons." },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-10-20",
    title: "Shed Notes and Score Writer",
    summary: "Notes for your practice, linked together, and a real music notation editor.",
    changes: [
      { kind: "new", text: "**Shed Notes**: notes in markdown that look finished as you type. Link notes with [[ ]] and see what links back, use folders and #tags, and search everything." },
      { kind: "new", text: "Attach notes to a **routine on a day**, a **day**, a **tune** or your **lessons** with Add notes — a new note, or one you already have." },
      { kind: "new", text: "**Vim keys** in notes if you want them, and a settings file for your own keys, vim mappings and commands." },
      { kind: "new", text: "**Score Writer**: write music in notation — treble or bass clef, any key and time, notes typed or clicked onto the staff, chord symbols — and play it back." },
      { kind: "new", text: "Put **notation in any note**: it's a Score Writer score, shown right in the note." },
      { kind: "new", text: "**Share a note** with other people by username (they can view or edit), or by link — just for them, or for anyone with it." },
      { kind: "new", text: "Save a note as a **PDF**, **export** all your notes as Markdown files, and **import** them again (or any folder of Markdown notes)." },
      { kind: "improved", text: "**Lesson notes** are written in the Shed Notes editor, notation included, and students see it all." },
      { kind: "improved", text: "Bass Genius transcriptions use the same notation editor." },
      { kind: "improved", text: "The routine happening **right now** is outlined in the Shed Log and shown in the sidebar." },
      { kind: "improved", text: "On phones, a tune's **chord chart** is full size and scrolls sideways, with **Fit to screen** to see it all." },
      { kind: "improved", text: "Thinner, rounded scrollbars in your theme's colors (phones keep their own)." },
      { kind: "improved", text: "The button that hides the sidebar now sits in the sidebar, next to the ⋮ menu." },
      { kind: "improved", text: "Feedback you send gets an **ID** (like FB-12), shown on the Feedback page." },
      { kind: "fixed", text: "Recordings made in the browser can be **scrubbed** again (the playhead was stuck at the end in Firefox)." },
      { kind: "fixed", text: "Pausing the Shed Log's day timer now pauses a task's timer too." },
      { kind: "fixed", text: "The Library title no longer gets squeezed on phones." },
    ],
  },
  {
    version: "0.9.6",
    date: "2026-10-19",
    title: "Settings",
    summary: "A new Settings page in your account, to make soniroll work the way you like.",
    changes: [
      { kind: "new", text: "**Settings** in your account: General, Appearance, Sidebar, Dashboard, Tools and Shed Log." },
      { kind: "new", text: "Turn off the **Shed Log, Community or Lessons** if you don't use them. Nothing is deleted." },
      { kind: "new", text: "**Hide tools** you don't use from the sidebar and dashboard, and choose which **dashboard cards** show." },
      { kind: "new", text: "A **24-hour clock**, a bigger or smaller **text size**, and **less motion**." },
      { kind: "new", text: "Turn off confetti, the bug report button, the stats beside tool titles, or the colorful option chips." },
      { kind: "new", text: "Show option descriptions without pressing ?, and choose whether pages explain themselves the first time." },
      { kind: "new", text: "Pick which view the Shed Log opens on, and start the sidebar with its tool groups folded." },
      { kind: "improved", text: "The **theme picker** now lives in Settings → Appearance (the sidebar's ⋮ menu takes you there)." },
    ],
  },
  {
    version: "0.9.5",
    date: "2026-10-19",
    title: "Plan your practice by the clock",
    summary: "Put routines at a time by dragging them, and see a whole day hour by hour.",
    changes: [
      { kind: "new", text: "**Drag routines and tasks onto a time** in the Shed Log's week and day views, or between days." },
      { kind: "new", text: "**Set a time** for an any-time routine in a couple of taps, just for one day or every time." },
      { kind: "improved", text: "**Day view** is now an hour-by-hour grid like the week, next to the day's routines." },
      { kind: "improved", text: "The week and day grids show **the whole day**, midnight to midnight." },
      { kind: "improved", text: "On desktop you can **hide the day panel** so the calendar gets the full width." },
      { kind: "improved", text: "A routine's details now open **where you click** on the calendar." },
      { kind: "improved", text: "Routines on the calendar have the same coloured bar as their cards." },
    ],
  },
  {
    version: "0.9.4",
    date: "2026-10-19",
    title: "A better week view",
    summary: "The Shed Log's week is easier to use, and works properly on phones.",
    changes: [
      { kind: "improved", text: "**Tick tasks off from the week:** tap a routine or task in the week view to check off its tasks, start it on the timer, or open the day." },
      { kind: "new", text: "**Add at a time:** click a free time on the week grid to add a task then, start a routine that day, or add one of your routines to it." },
      { kind: "improved", text: "**Week view on phones:** the week is now a list of days with each routine as a big button showing how much is done. Swipe sideways for the next or last week." },
      { kind: "improved", text: "Each day in the week shows its minutes and a small bar toward your daily goal, and routines fill in as you finish tasks." },
    ],
  },
  {
    version: "0.9.3",
    date: "2026-10-18",
    title: "Streaks for every tool",
    summary: "Every tool now keeps its own streak and practice time, with a button to log it to your Shed Log. Plus livelier options and a tidier Library.",
    changes: [
      { kind: "new", text: "**Tool stats:** every tool shows its own streak, today's time (ticking while it runs), this week and in total, right by its title. Tap the total to see every day you used it." },
      { kind: "new", text: "**Log to Shed Log:** press **Log** in a tool to add today's time there to your Shed Log and your daily total. A day counts toward a tool's streak after a minute of real use." },
      { kind: "new", text: "**Hide stats** with the eye button if you'd rather not see them. The Log button stays." },
      { kind: "improved", text: "**Livelier options:** settings are bigger and pop when you change them, choices light up when picked, sliders fill with colour, round numbers get a ✦, and a dot marks the choices you haven't tried yet. (Bass Genius, Drum Generator, Syncopation and the Sticking Warmup keep their own options.)" },
      { kind: "improved", text: "**Metronome quick picks:** common time signatures (4/4, 3/4, 6/8, 7/8 and more) are one tap away in Time." },
      { kind: "improved", text: "Tool time no longer goes into the Shed Log by itself: you choose when with the Log button. The \"Count time in tools\" switch is gone." },
      { kind: "improved", text: "**Library** is one page with tabs for Tunes, Setlists, Chord Charts and Files, and shows how much storage you've used by its title. Old links still work." },
      { kind: "improved", text: "Page titles look the same across the site." },
      { kind: "improved", text: "Profiles are no longer stretched across wide screens." },
      { kind: "fixed", text: "Bass Genius no longer scrolls the page to follow the playing note on phones." },
    ],
  },
  {
    version: "0.9.2",
    date: "2026-10-18",
    title: "Hello, soniroll — and Files",
    summary: "sheddex is now soniroll, with a new logo. Plus a home for your files: upload, rename, share and delete everything your account stores.",
    changes: [
      { kind: "new", text: "**A new name:** sheddex is now **soniroll**, at soniroll.com. Old sheddex.com links still work and bring you here. The Shed Log keeps its name." },
      { kind: "new", text: "**A new logo:** the daily goal ring, drawn in your theme's colours so it matches whichever theme you pick." },
      { kind: "new", text: "**Files:** upload PDFs, lead sheets, images, audio and video to your account, on their own or attached to a tune. Drop files anywhere on the Files page to upload them." },
      { kind: "new", text: "**Everything in one place:** the Files page lists everything your account stores (uploads, recordings, tune songs, lesson files, hand-ins and profile images), with search, filters and columns you can sort by." },
      { kind: "new", text: "**Rename, share and delete anything** from its ⋮ menu or by right-clicking it. Tick several files to delete them together." },
      { kind: "new", text: "**Share a file by link:** anyone with the link can open and download it, no account needed, and save a copy to their own files if they're signed in." },
      { kind: "new", text: "**Share a tune by link** with its chord chart, files and recordings (never your notes). Whoever opens it can save it to their own tunes." },
      { kind: "new", text: "A **Files** section on every tune's page: upload there, or add files you've already uploaded." },
      { kind: "improved", text: "Every account has **100 MB** of storage for uploads, recordings, songs and lesson files. The Files page shows how much you've used." },
      { kind: "improved", text: "The sidebar is grouped into **Your shed** (Shed Log, Library), **People** (Community, Lessons) and **Tools**. The Tunes card is now **Library**." },
      { kind: "improved", text: "Supporting soniroll is easier to find: a Support row in the sidebar, a card on the dashboard, and a Support page that explains where the money goes." },
      { kind: "improved", text: "Chord chart links now start with soniroll://. Links made before still import." },
      { kind: "improved", text: "Emails (sign-up codes, password resets, lesson invites) now come from soniroll." },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-10-18",
    title: "A day view for the Shed Log, and a changelog",
    summary: "Plan and log one day at a time, with clearer sections. And this page, so you can see what's changed.",
    changes: [
      { kind: "new", text: "**What's new:** this changelog. Open it from the version number under the logo, or from the sidebar's ⋮ menu." },
      { kind: "new", text: "**Shed Log day view:** a Day option next to Month and Week hides the calendar and gives the day the whole page." },
      { kind: "improved", text: "The Shed Log's day is split into clear sections, each with a heading: Progress, Routines, Extra tasks, Log time, Notes and Recordings." },
      { kind: "improved", text: "**Extra tasks** (one-off tasks for just that day) sit below your routines, with an Add button and bigger checkboxes and buttons on phones." },
      { kind: "improved", text: "**Log time:** add practice you did without the timer in one tap (+5 min up to +1 h), with Undo. Or pick another amount, or log it on a particular task." },
      { kind: "fixed", text: "On phones you can now remove a subtask (its × only showed on hover)." },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-17",
    title: "The first public beta",
    summary: "Everything soniroll does, out in the open for the first time.",
    changes: [
      { kind: "new", text: "**Practice tools:** Metronome (with changing meters), Polyrhythm Metric Modulation metronome, Tempo Trainer, Tuner, Note / Scale / Interval Trainers with mic listen modes, Practice Timer, Recorder (with a tune's song and a mixer), Slow Downer." },
      { kind: "new", text: "**Play along:** Jam Practice, Bass Genius (walking bass, chords and drums over your charts, and bass players learned from transcriptions), Drum Generator (32 styles), Random Sticking Warmup, Syncopation." },
      { kind: "new", text: "**Ear training:** Guess the Interval, Chord and Progression, with a levelled Learn mode." },
      { kind: "new", text: "**Library:** Tunes I Know and Tunes to Learn, setlists, and chord charts (iReal Pro import, an editor, playlists)." },
      { kind: "new", text: "**Shed Log:** a practice calendar with routines, a day timer, goals, streaks and progress cards." },
      { kind: "new", text: "**Community:** profiles, follows, and posts (tunes, setlists, routines, milestones)." },
      { kind: "new", text: "**Lessons:** teachers and students, a page per lesson, assignments with hand-ins and feedback, lesson notes, booking with calendar invites." },
      { kind: "new", text: "**Feedback:** a Report a bug button on every page, plus /feedback for ideas and anything else. Report posts or profiles, and see what you've sent and its status." },
      { kind: "improved", text: "Shared soniroll links show a preview card with the logo." },
      { kind: "fixed", text: "On iPhone and iPad, sound plays with silent mode on." },
    ],
  },
];

/** An admin correction to a release, from Convex. */
export type ReleaseEdit = { version: string; release: Release; hidden: boolean; base: string };

export type ShownRelease = Release & { edited: boolean; hidden: boolean; originalChanged: boolean; original: Release };

/** What the site shows: each release from the file, replaced by its admin correction if it has
    one. `originalChanged`: the file's entry changed after the correction was made. */
export function mergeReleases(releases: Release[], edits: ReleaseEdit[] | undefined): ShownRelease[] {
  const byVersion = new Map((edits ?? []).map((e) => [e.version, e]));
  return releases.map((r) => {
    const e = byVersion.get(r.version);
    if (!e) return { ...r, edited: false, hidden: false, originalChanged: false, original: r };
    return { ...e.release, version: r.version, edited: true, hidden: e.hidden, originalChanged: e.base !== releaseKey(r), original: r };
  });
}

/** A stable string for a release's content (used to notice the file changing under an edit). */
export function releaseKey(r: Release): string {
  return JSON.stringify({ date: r.date, title: r.title, summary: r.summary ?? "", changes: r.changes });
}

/** "October 18, 2026". */
export function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "v0-9-1" — the anchor for a release on /changelog. */
export function releaseAnchor(version: string): string {
  return `v${version.replace(/\./g, "-")}`;
}

/** The latest version someone has seen on /changelog, per device. */
export const CHANGELOG_SEEN_KEY = "jam-practice-changelog-seen";

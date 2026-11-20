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
    version: "0.10.14",
    date: "2026-11-20",
    title: "Mark up your PDFs, and a simpler Library",
    summary: "PDFs open in a full viewer you can write on, and the Library is down to two tabs: Tunes and Files.",
    changes: [
      {
        kind: "new",
        text: "**PDF viewer and editor.** Open a PDF from Files to mark it up: pen, highlighter, eraser, text, music symbols (fermatas, codas, segnos, repeats, dynamics, accents), rehearsal letters and bar numbers that count up, hairpins and shapes. Your markings are saved with the file, and the PDF itself never changes.",
      },
      { kind: "new", text: "PDF pages: reorder, turn, delete, add blank or staff-paper pages, and insert the pages of another PDF. **Download with markings** makes a new PDF with everything in it." },
      { kind: "new", text: "**Play** from a PDF: full screen, one or two pages at a time, turned with the arrow keys, space, a Bluetooth page-turner pedal, a tap or a swipe." },
      {
        kind: "improved",
        text: "**The Library has two tabs, Tunes and Files.** Setlists and chord charts live inside Tunes, and recordings are in Files with your other audio.",
      },
      {
        kind: "improved",
        text: "Every chord chart belongs to a tune, and a tune can have several charts. Importing charts adds them to the tune of the same name, or makes the tune in a new **Library** list (neither Tunes I Know nor Tunes to Learn). Charts you already had are linked the same way.",
      },
      { kind: "new", text: "**Tags on tunes**: give a tune several tags and filter by one or more. Importing charts can tag everything it adds." },
      { kind: "new", text: "Audio in Files (uploads and recordings) opens straight in the **Slow Downer** or the **Tuner**." },
      {
        kind: "new",
        text: "Slow Downer: drag markers, jump to one with the number keys 1–9 and 0, loop from or to a marker, and **save loops** to come back to.",
      },
      { kind: "new", text: "Phone app: share your Shed Log progress cards as images, or post them to Community." },
      { kind: "fixed", text: "Phone app: the playing beat's outline on the Metronome no longer nudges the beats up and down." },
    ],
  },
  {
    version: "0.10.13",
    date: "2026-11-19",
    title: "A page for the phone app",
    changes: [
      {
        kind: "improved",
        text: "The Android app (alpha) has its own page, **soniroll.com/mobile**, linked from the home page on phones, the footer and the menus. You couldn't find it on a phone before.",
      },
    ],
  },
  {
    version: "0.10.12",
    date: "2026-11-19",
    title: "soniroll for Android (alpha)",
    summary: "The phone app is out as an early test, for Android phones.",
    changes: [
      {
        kind: "new",
        text: "**soniroll for Android**, an early alpha: every tool laid out for a phone, the Shed Log, your Library, Community and Lessons, with the same account. Get it from the Download page; expect rough edges, and tell us what breaks.",
      },
      { kind: "fixed", text: "Shed Log: a routine whose tasks have overlapping times shows as one block on the calendar instead of several small ones." },
      { kind: "fixed", text: "Deleting your account now also removes your saved settings, tunes and Shed Log." },
    ],
  },
  {
    version: "0.10.11",
    date: "2026-11-18",
    title: "Polish everywhere, recordings in the Library",
    summary: "Hundreds of small fixes from a page-by-page review on desktop and phones, plus a few things you asked for.",
    changes: [
      { kind: "improved", text: "**Recordings** now live in the **Library**, in their own tab next to Files. Old links still work." },
      { kind: "new", text: "**Open a file** shows a list of your files, with Upload, in the Slow Downer, the Tuner's takes and Rhythm Section's bass players. You can also **drop a file** anywhere on the tool." },
      { kind: "improved", text: "Files you open in the **Slow Downer** are saved to **Files** (online with a storage plan, on this device without)." },
      { kind: "improved", text: "**Split screen:** each side lays out like a screen of its own width, has its own bar with the page's name and close button, and Space only starts the tool in the side you clicked." },
      { kind: "improved", text: "Page intros no longer pop up on their own — the **?** by a page's title still opens one." },
      { kind: "improved", text: "**Beat bars** show the beat number above each bar instead of on top of it (Metronome, Metric Modulation, Jam Practice)." },
      { kind: "improved", text: "**Guess the Progression** no longer brings up the phone keyboard — the buttons type every answer. **Guess the Chord** shows the root for you, so you only type the quality, and spells the chord's notes." },
      { kind: "improved", text: "**Shed Log:** no more \"Day complete\" dialog popping up by itself, one celebration a day, practice minutes that agree everywhere, and the routine editor asks before throwing away changes." },
      { kind: "improved", text: "**The Recorder** asks before you leave mid-take and keeps it for when you come back." },
      { kind: "improved", text: "Lots of smaller fixes on phones: bigger buttons, nothing jumping around as you answer, clearer microphone errors, and every page has its own title in the browser tab." },
      { kind: "new", text: "**Find the Root** credits Rob Moreno for the idea." },
    ],
  },
  {
    version: "0.10.10",
    date: "2026-11-18",
    title: "Metronome beat bars on Macs",
    changes: [{ kind: "fixed", text: "The **Metronome**'s beat bars were still empty in the Mac desktop app — they show now." }],
  },
  {
    version: "0.10.9",
    date: "2026-11-18",
    title: "Bug button in the top bar",
    changes: [
      { kind: "improved", text: "**Report a bug** is now a button at the right of each tool's top bar, instead of floating in the corner over the page. Send feedback is still in the sidebar's ⋮ menu." },
      { kind: "fixed", text: "The **Metronome**'s beat bars showed empty on some Macs (in the desktop app) — they're drawn in a simpler way that works everywhere." },
    ],
  },
  {
    version: "0.10.8",
    date: "2026-11-18",
    title: "Rhythm Section stays put",
    changes: [{ kind: "improved", text: "**Rhythm Section** no longer scrolls the page to follow the music while it plays — the note being played is still lit." }],
  },
  {
    version: "0.10.7",
    date: "2026-11-18",
    title: "Piano chords in Rhythm Section",
    changes: [
      { kind: "improved", text: "Rhythm Section's chords play on the **piano** for now: the Rhodes is off until we have permission to use its recordings now that soniroll has paid plans. If you'd picked the Rhodes, you'll hear the piano." },
      { kind: "new", text: "A storage plan can be **given as a gift** — it shows on Account → Storage plan with when it ends, and works just like a paid one." },
    ],
  },
  {
    version: "0.10.6",
    date: "2026-11-17",
    title: "Storage plans, a new Recorder, and the desktop app",
    summary: "Every tool is still free. Files now live on your device, or online on all your devices with an optional storage plan — and the Recorder is rebuilt around getting your level right.",
    changes: [
      { kind: "new", text: "**Storage plans** keep your files, recordings and tune songs online, on all your devices. Every tool and feature stays free. See Account → Storage plan." },
      { kind: "improved", text: "Without a plan, new files, recordings and songs are **kept on the device that saved them**. Their names still show everywhere; only opening them needs that device. Shared files, lesson files, note pictures and your profile picture stay online." },
      { kind: "new", text: "Files you already have online can be **downloaded as a .zip** or **moved to this device** from the Files page, and **Back up** downloads everything you can open here as one .zip." },
      { kind: "new", text: "With a plan, pick **Online or This device** each time you add a file or save a take, set the default, and **Put online** anything kept on this device." },
      { kind: "improved", text: "**The Recorder, rebuilt:** pick your microphone, set the **input level**, **Check level** before you record, and watch a live level trace that warns when it's too loud. Auto gain is now off by default (it's under Input), and the metronome is a chip." },
      { kind: "new", text: "**Syncopation:** a swing beat underneath — the jazz ride pattern with the hi-hat foot on 2 and 4, swung." },
      { kind: "new", text: "**Get the desktop app** from the new download page (sidebar, dashboard and the home page), for macOS, Windows and Linux. It now updates itself." },
    ],
  },
  {
    version: "0.10.5",
    date: "2026-11-17",
    title: "A cleaner, clearer soniroll",
    summary: "A calmer look with less clutter, easier to find your way around, and a lot of small fixes — especially on phones. Prefer the old look? Settings → Appearance → Classic look.",
    changes: [
      { kind: "improved", text: "**A cleaner look** throughout: less clutter, smaller corners, fewer outlines, and the big stat cards are gone. **Classic look** in Settings → Appearance brings back the old feel." },
      { kind: "improved", text: "**The sidebar** is one simple list with colour-coded tools, Favorites stand out, there's a **Settings** row, and it scrolls to the page you're on." },
      { kind: "improved", text: "**Search (/)** finds tools, your tunes and chord charts, pages, settings and help — type \"theme\" or \"help metronome\". The phone menu's search does too." },
      { kind: "improved", text: "**On phones**: a top bar with the page name (tap it to go to that section), tools start at the top, the bug-report button sits in the top bar, and Account opens on a list of sections." },
      { kind: "improved", text: "**Tools**: Presets sit in every tool's top bar, all option chips look the same, your time today is one small button, and History/Struggles only show once you have some. Trainers say what to do before you start and show your instrument." },
      { kind: "new", text: "Metronome and other tempo tools: **−10, −5, +5, +10** buttons, and Space always starts and stops, even while typing a tempo." },
      { kind: "improved", text: "**Shed Log**: no more wall of red for missed days; the month and week views show minutes and progress for each day; past days let you log time; Stats steps back through past weeks; on phones, Today and Calendar tabs." },
      { kind: "improved", text: "**Library**: Chord Charts opens on your **folders** (what used to be called playlists), with a Recent row. A Recordings tab. Pick Tunes I Know or Tunes to Learn when adding standards." },
      { kind: "new", text: "**Write the chart** from a tune starts with its name, key and time and links it when you save; a chart's page can add it to your tunes; **Play along** opens a tune's chart in Rhythm Section." },
      { kind: "new", text: "**Slow Downer on phones**: drag across the waveform, or use Loop start and Loop end, to loop a section. **Score Writer** works on phones too." },
      { kind: "new", text: "**Practice Timer**: a quick timer — type the minutes and press Start." },
      { kind: "improved", text: "Pages load faster when you're signed in: your own things show first instead of waiting for your whole chart library." },
      { kind: "fixed", text: "Light themes' practice grid ran from dark to light; it now goes pale to deep. Seven themes (like Synthwave) had cards almost the same colour as the page." },
      { kind: "fixed", text: "The chord chart editor asks before you leave with unsaved changes, and no longer saves an empty bar at the end." },
      { kind: "fixed", text: "Chord charts: chords in a busy bar no longer run into the barlines, and the time signature no longer sits on the section letter." },
    ],
  },
  {
    version: "0.10.4",
    date: "2026-11-16",
    title: "Rhythm Section, presets and Find the Root",
    summary: "Bass Genius and the Drum Generator become one Rhythm Section, every tool can save presets, and the Tuner can record you.",
    changes: [
      { kind: "new", text: "**Rhythm Section** replaces Bass Genius and the Drum Generator: drums in over 30 styles to play along with, and an upright bass and piano or Rhodes that play your chord charts with them. Old links still work." },
      { kind: "new", text: "Every drum style now has a bass part that fits it (bossa, samba, tumbao, merengue, tango and more) and follows your chart's chords. Swing still walks, with your bass players." },
      { kind: "new", text: "**Presets** on every tool: save how you have a tool set up, give it a name, and get it back in one tap. The Presets chip shows which one you're on, or Custom once you change something. Presets only save options, so your history and stats stay as they are." },
      { kind: "new", text: "**Find the Root** (under Ear training): hear a rootless voicing like E♭ G B♭ D, then sing, play or pick the root that makes it the chord asked for (C for a C minor 9). Twelve chord types, from minor 7 to altered, including left-hand A and B voicings." },
      { kind: "new", text: "**Record in the Tuner** and play the take back through it: the needle follows what you played, and a graph shows how sharp or flat each note was. Takes stay on this device. You can also open an audio file, or a saved recording with **Open in Tuner**." },
      { kind: "new", text: "Slow Downer: a **⏮** button and the **B** key jump back to the start of the loop." },
      { kind: "improved", text: "Slow Downer: **Volume** has its own chip instead of being tucked inside Speed." },
      { kind: "improved", text: "Time Test: you can see and drag the playhead, and click anywhere (including the overview strip) to play from there, even while a take is playing." },
      { kind: "fixed", text: "The Metronome and other click tools no longer cut out when their tab is in the background." },
      { kind: "fixed", text: "Time Test's count-in sometimes played 3 clicks instead of 4." },
      { kind: "fixed", text: "A drum fill no longer runs past the end of its bar in the written-out groove." },
    ],
  },
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

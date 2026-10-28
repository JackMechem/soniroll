# Shed Notes

## First version (2026-10-20, branch `feat/shed-notes`)

Jack asked for "Shed Notes": a full note-taking app like Obsidian that also works with the Shed
Log, tunes and other notes. That means markdown with a rich live preview, music notation you can
make and insert, full vim keys (off by default, with a toggle), `[[links]]` between notes with
backlinks and forward links, notes attached to a day's routine (the routine card's Add notes button
opens a menu to make a note or pick an existing one), a sidebar entry under the Shed Log, and
settings in a JSON file only (custom keybindings and vim commands).

**What was built**
- **Backend** (`packages/convex/shedNotes.ts`, tables `shedNotes` and `shedNoteLinks`): one
  markdown note per row. `titleKey` (lowercased) is unique per account, so `[[Title]]` always means
  one note. `links` (the title keys a note links to) and `tags` are recomputed on every save, so
  backlinks are a lookup in `list`. There's a search index on `body` for full-text search.
  `shedNoteLinks.target` is a string from `packages/core/shedNotes.ts`'s `targetKey`:
  `day:<date>`, `day:<date>/routine:<id>` or `tune:<id>`. Because a day and its routines share the
  `day:<date>` prefix, `attachedTo({prefix})` can range-scan one index. `rename` rewrites
  `[[Old]]` (keeping `#heading` and `|alias`) in every note that links to it. `remove` leaves
  links to the deleted note in other notes, and opening one makes the note again (as Obsidian
  does). Limits: 200,000 characters a note, 5,000 notes, 50 notes per target. Account deletion
  cascades both tables. The preview seed adds two linked notes (one with notation), one of them
  attached to today's routine.
- **Shared logic** (`packages/core/shedNotes.ts`): wikilink parsing (ignores code), `linkKeys`,
  `renameLinks`, `findTags`, `noteSnippet` (notation becomes ♪), `cleanTitle` (drops `[ ] | #`),
  `uniqueTitle`, `cleanFolder`, `targetKey` / `parseTargetKey`.
- **Editor** (`components/shednotes/NoteEditor.tsx`) is **CodeMirror 6**, the editor Obsidian is
  built on, with `@replit/codemirror-vim`, the same vim port Obsidian uses. Tiptap (used by
  Lessons' `RichNote`) was ruled out because ProseMirror has no real vim mode. The text stays
  markdown; `livePreview.ts` hides marks wherever the cursor isn't and adds:
  - heading sizes;
  - bullets in place of `-`;
  - clickable checkboxes for `- [ ]`;
  - a rule for `---`;
  - a quote bar;
  - `[[links]]`: a click opens the note in Preview, Ctrl/⌘-click in Source; dimmed when the note
    doesn't exist yet;
  - `#tags` as pills and `==highlight==`;
  - ```` ```abc ```` / ```` ```music ```` blocks drawn as notation by **abcjs**, which is
    lazy-loaded and coloured with `currentColor`. A block is replaced by the notation while the
    cursor is outside it; inside, the source shows with a live preview under it. "Edit notation"
    opens the dialog.

  The notation blocks are a `StateField` (block decorations can't come from a ViewPlugin).
  `editorSetup.ts` holds the theme (all CSS tokens), the highlight style and the `[[`
  autocomplete. The editor is created once per note (the parent keys it); settings flow in
  through compartments.
- **Notation** (`NotationDialog.tsx`): title, key, time, clef and tempo become the ABC header.
  The body is a text box, plus click-to-add notes (length, octave, accidental), rests, bars,
  repeats, triplet, tie, beam break and chord symbols, plus three templates, with a live preview.
  It's saved as a ```` ```abc ```` block. The `?` explains ABC.
- **Commands** (`commands.ts`): one list of ids (`editor:*`, `note:*`, `view:*`, `app:*`) used by
  keybindings, vim `:` commands and the command palette (Ctrl/⌘-P). Ctrl/⌘-O is the quick
  switcher, which makes a note by that name if nothing matches.
- **Settings file** (`lib/shedNotesConfig.ts`, edited in `SettingsPane.tsx` at
  `/shed-notes?id=settings`): JSON in synced settings key `jam-practice-shed-notes`, with
  `configText` (exactly as typed) and `goodText` (the last version that parsed, so a half-typed
  file doesn't flip vim off mid-edit). Settings: `vimMode`, `livePreview`, `lineNumbers`,
  `readableLineLength`, `fontSize`, `spellcheck`, `keybindings: [{key, command}]` and
  `vim: {leader, mappings: [vimrc lines], exCommands: {name: commandId}}`. The toolbar's
  Vim / Preview switches rewrite the JSON (`setConfigValue`); they refuse while it's invalid.
  Reference lists every setting and command.
- **Vim** (`vimSetup.ts`): vim's maps are global, so `Vim.mapclear()` runs and the mappings are
  re-applied whenever the file changes. Built-in ex commands: `:w` (save now), `:q`, `:wq`,
  `:e Title`, `:new [Title]`, `:cmd <id>`. **Settings keybindings are `Prec.highest` and come before
  vim**, so Ctrl-P reaches the palette in normal mode (vim was eating it).
- **Page** (`/shed-notes[?id=]`, `ShedNotes.tsx`): the note list (folders, A–Z or Recent, search
  over titles, folders and `#tags` instantly plus body text from the server, ⋮ / right-click to
  rename, move, delete or rename a folder); the note (title field, where renaming rewrites links;
  back/forward history; Preview/Source; Vim; Links; formatting buttons; ⋮); and `LinksPanel` (what
  it's attached to, backlinks, forward links, tags). On phones the list and the note are separate
  screens. The address bar is kept with `history.replaceState`, never the router (see the tiling
  trap). It's also a split-screen pane (`toolRegistry`).
- **Integration** (`AttachedNotes.tsx`): routine cards, the day panel's Notes section and the
  tune page (new "Shed Notes" panel, signed in) list the attached notes. Add notes opens a menu
  (a bottom sheet on phones): "New note" (titled e.g. "Pad Warmup · Oct 20", attached, opened in
  `NoteDialog`) or pick an existing one. `NoteDialog` is the full editor in a dialog with "Take
  off …" and "Open in Shed Notes". **Old plain-text notes** (`Occurrence.notes`, `DayLog.notes`)
  still show and can be edited wherever they exist, with "Make it a Shed Note" (makes an attached
  note from the text, then clears it). The routine ⋮ menu lost "Notes for this day". The tune
  editor's own notes field is unchanged: it goes out with shared tunes.
- Also: `ShedNotesNavCard` under the Shed Log card (note count, last edited), a `NAV_LINKS` entry
  (kept out of the tool list like the Shed Log), a Help topic, a `shedNotes` feature switch on
  Settings, and the privacy page (stored data, deletion; date bumped).

**Verified**
- tsc (web, convex, mobile; core has only the old `lessonFiles.ts` errors), `pnpm lint`,
  `pnpm build`, and `npx convex dev --once` (indexes and the search index were created on dev).
- Pure logic in Node (21 checks: links in and out of code, aliases and headings, rename, tags,
  titles, targets, snippets, config errors, vimrc lines).
- In headless Chromium, the real components bundled with esbuild and injected into a signed-out
  page (so the site's CSS and theme apply), with `convex/react` aliased to an in-memory fake of
  these functions:
  - live preview and Source, dark and light, at 1440 and 390;
  - link click (opening, and making a missing note), checkbox toggle;
  - vim `dd` / `u` / `O`, an `imap jk <Esc>` mapping from the settings, `:w`;
  - `[[` completion, the palette with vim on;
  - the notation dialog (desktop and phone);
  - new note → title → link → follow → backlinks → rename rewriting the other note;
  - the Vim switch writing the JSON, the settings file and Reference;
  - Add notes → new note in the dialog → attach an existing note;
  - the phone list and note screens. No page errors, no overflow.
- Signed out on the real dev server: the `/shed-notes` gate, the sidebar card, the Help topic.

**Not verified**
- Anything signed in against the real backend (no test account here, and bypassing the gate was
  refused): the real Convex functions, rename and search in production, the routine card, day
  panel and tune page in place, account deletion.
- Real phones (iOS keyboard with CodeMirror, touch on checkboxes), Safari, hover styles.
- Large notes' performance, two tabs editing one note (last write wins).

**Later the same day:** the ABC notation dialog was replaced. Notation in a note is now a
Score Writer score, written in the shared notation editor (see `score-writer.md`); old
```` ```abc ```` blocks still display.

**Not built (ideas for later):** a graph view, embeds (`![[note]]`), playing notation back, Lessons
notes as Shed Notes (they're shared teacher → student), task and day-task notes, mobile.

**Polish (2026-10-20):**
- The note dialog's writing area is inset and framed (`px-5 pb-4`, a rounded `bg-background` box;
  the editor is absolutely positioned, so padding on its own box did nothing).
- Vim's status bar is a floating pill in the editor's bottom-left corner. `NoteEditor` sets
  `data-vim-mode` on the editor from vim's `vim-mode-change` and gives vim's mode label the class
  `cm-vim-mode`; `editorSetup.ts` hides the "--NORMAL--" text and draws a dot and "Normal",
  "Insert" (a filled accent pill) or "Visual". Pending keys show beside it; `:` widens it into the
  command line.
- Both side panels fold away on desktop with `PanelButton` (the Shed Log's panel icon): the note
  list from the left of the toolbar, the links from its right (replacing the "Links" pill).
  Stored per device in `jam-practice-shed-notes-view` (`listHidden`, `linksHidden`).

Checked in the esbuild harness: the dialog at 900×1184, the pill in every mode in dark and light,
and both panels hiding (with the stored flags). Not on a real phone.
- Narrow panes (2026-10-20): the note pane is a CSS container (`@container`), and the links sit
  beside the note only when the pane is at least `@4xl` (56rem); narrower, they go below the note
  (capped at 40% of the height, scrolling). The toolbar wraps, "Saved" and the folder path hide
  when it's tight, and the title is an auto-growing textarea that wraps instead of being cut off.
  Before this, at about 1400 px with the sidebar and note list open, the toolbar ran over the links.

**Tables, links, page pills (2026-10-20):**
- Tables (`components/shednotes/tables.ts`): a `StateField` finds GFM tables by lines (skipping
  code fences) and draws each as an HTML table (alignment from the dashes line; bold, italic,
  strikethrough, code and links in cells, escaped first) while the cursor is elsewhere; clicking a
  cell puts the cursor in it. With the cursor in it, the source lines get `cm-table-src` (fixed-
  width, nothing adding width). Tab / Shift+Tab (`Prec.high`) re-pads every column
  (`formatTable`) and selects the next / previous cell's text; Tab in the last cell adds a row.
  "Table" in the formatting row (`editor:insert-table`) inserts a 3-column starter.
- Links: a link opens on a plain click whenever it's drawn as a link (`data-live`), Ctrl/⌘-click
  any time — before, a click near where the cursor was did nothing. Bare `https://…` (GFM `URL`)
  and `<…>` autolinks are links too. `openHref`: web in a new tab, site paths ("/tunes") through
  `NoteActions.openPath` (the router), mailto/tel as they are.
- `[[note]]` links and links to site pages are `cm-page-pill`: accent-tinted rounded pills with a
  page icon (a CSS mask); a missing note is a dashed pill.
- Checked in the editor harness: the table drawn with its alignments, all five kinds of link
  opening the right way with the cursor on their line, cell click → source, Tab tidying and
  selecting, a new row from the last cell. Not on a phone.

**Keys for everything, and a search menu (2026-10-20):**
- `DEFAULT_CONFIG.keybindings` now gives every command a key (40; checked: none missing, no
  duplicates). The settings file's `keybindings` are merged on top: a key listed there replaces
  that key's built-in command, `"command": ""` turns it off — so files written before keep
  getting new built-in keys. Keys show as "⌘⇧F" / "Ctrl+Shift+F" (`keyLabel`, `keysFor` in
  `commands.ts`) in the palette, the Reference and the buttons' tooltips. Browser-reserved keys
  (Ctrl-N/T/W, Ctrl-Shift-Q, Ctrl-1…9) are avoided; headings are Ctrl/⌘-Alt-1…6.
- New commands: `app:search`, `view:toggle-note-list`, `view:toggle-links-panel`.
- Search menu (`NoteSearch.tsx`): `/` outside a note (a capture-phase listener that stops the
  site's tool search on this page; the tool search is still in the sidebar) or Ctrl/⌘-Shift-F.
  Titles, folders and #tags match at once, text through `shedNotes.search`, which now returns
  the excerpt around the first matching word; matches highlighted. A search button sits by the gear.
- Checked in the full-page harness: / opens it (and types a slash inside a note), a text match
  opens its note, Ctrl+Shift+F from the editor, heading / bullet / numbered / quote / table /
  rename / note-list keys, palette key labels.

**Create a note from a link (2026-10-20):** typing `[[` with a name no note has adds a last
suggestion, **Create “…”** (`wikilinkCompletion`, type "create", styled by `optionClass`): it
inserts the link and makes the note (`NoteActions.createLinkedNote`) in the current note's folder,
staying on the current note. Clicking a link to a missing note now also makes it in the current
note's folder (was the top level). Lesson notes don't offer it (no `createLinkedNote` there).
Checked in the harness: `[[Bass lines` → Create → note in "Practice", link inserted, still on the
same note; clicking a dashed link made "Ear training plan" in "Practice" and opened it.

**Per-note width and font (2026-10-20):** `shedNotes.view` ({ fullWidth?, font? }), set by
`shedNotes.setView` (null clears; doesn't touch `updatedAt`). The note pane's toolbar has a font
`Select` (the site's `FONTS`, or "Site font") and a full-width button (`view:toggle-full-width`,
Ctrl/⌘-Alt-F); the note's choice overrides the general `readableLineLength`, and the font applies
to the title and the editor (`NoteEditor`'s `fontFamily`). Checked in the harness: full width and
Lora stick to one note and not another, Ctrl+Alt+F toggles.

**Folders: empty folders, clearer tree, drag and drop (2026-10-20):**
- `shedNoteFolders` (userId, path): folders made with New folder, so they can be empty (account
  deletion cascades it). The tree is these plus every note's `folder`. `shedNotes.createFolder`,
  `renameFolder` (also a move: everything inside goes along, subfolders and notes; refuses to put
  a folder inside itself), `deleteFolder` (what's inside moves up to the parent; no note is
  deleted), `folders` (the list).
- `NoteList.tsx` rewritten: folder icons (open/closed), bold names, counts, a guide line down
  each folder's contents, "Empty" for an empty folder; on every folder row New note here, New
  folder inside and ⋮ (rename — name only; move — the folder to go into; delete). New folder no
  longer makes a note.
- Drag and drop (HTML5, mouse): notes onto folders, folders into folders, and onto the "Drop here
  for the top level" strip at the bottom. Phones use Move in the ⋮ menus.
- The note toolbar's font menu became an "Aa" button (it was wrapping the toolbar).
- Checked in the harness: empty folder, subfolder and note from the row buttons, a note dragged
  into a folder, a folder (with its note) into another, a folder into its own subfolder refused,
  a note to the top level, deleting a folder moving its contents up. Not checked with real mouse
  drags (Playwright's dragTo is flaky on this list; the HTML drag events were checked directly).

**Sharing, PDF, export and import (2026-10-20):**
- **Sharing** (`packages/convex/shedNoteShares.ts`, table `shedNoteShares` {noteId, ownerId,
  userId, role read|write}). `shedNotes.noteAccess(ctx, note, userId)` → "owner" | "write" | "read"
  | null is the one check: `get` returns shared notes with `role` and `owner` (username) and hides
  the owner's folder and attachments; `save` needs owner or write; rename, move, setView, delete
  and all sharing calls stay owner-only. `suggest` lists **public** profiles only; `shareWith`
  takes any exact username (private accounts too). Max 50 people per note. `leave` takes a shared
  note out of your list. Deleting a note deletes its shares; account deletion cascades both ways
  (`by_owner`, `by_user`).
- **Links:** `shedNotes.link` {token, access "invited" | "anyone"}, index `by_link_token`
  (`link.token`). Off → on makes a new token; switching invited ↔ anyone keeps it. `/note/<token>`
  (`SharedNotePage`) shows the note as a page (`byLink`: ok / gone / sign-in / not-shared), with
  "Edit/Open in Shed Notes" for people who have access, and Save as PDF. A link is always view
  only; editing is only for people added with Can edit.
- **Scores in shared notes:** `scores.get` takes `{ lessonId? noteId? token? }` (`ScoreContext`,
  passed as `NoteEditor`'s `scoreContext`); a score shows if it's the note owner's and its id is in
  that note's text, and the viewer can see the note. Collaborators get no Notation button (a score
  they made would be theirs, invisible to the owner).
- **UI:** `ShareDialog.tsx` (username box with suggestions and arrow keys, Can view / Can edit per
  person, ×, the link `Select` and Copy — turning the link on copies it). `NotePane`: owner-only
  controls (people button, Aa, full width, rename, move, delete, links panel) hidden on shared
  notes, a "@owner · can edit / view only" pill, read-only editor and no formatting bar for
  view-only. `NoteList` has a "Shared with me" section (owner, role; ⋮ → Remove from my list).
- **Live changes:** `NoteEditor` takes `syncText` (the saved body, passed only while nothing typed
  is waiting to save); when it differs from the editor it applies just the changed span with
  `Transaction.remote` (not re-saved, not in undo history). So a collaborator's saved edits (or
  another tab's) show up. It's last-write-wins, not real-time merging: if two people type at once,
  the later save wins.
- **PDF:** CodeMirror only draws what's on screen, so printing the editor would lose most of a
  long note. `NoteDocument.tsx` renders the note statically with `marked` (GFM tables and
  checkboxes, `[[links]]` as pills, `==highlight==`; raw HTML is escaped, links limited to
  http(s)/mailto/site paths, images to https) and the ```score / ```abc blocks as music.
  `NotePrint.tsx` portals it to `<body>` as a full-screen page, waits for the music (`data-ready`,
  max 6 s), sets `document.title` (the PDF's file name) and calls `window.print()`; print CSS in
  `globals.css` (`.note-print`) hides everything else and prints dark on white whatever the theme.
  Note ⋮ → Export as PDF (`note:export-pdf`, Ctrl/⌘-Alt-P) uses the editor's current text.
- **Export all** (⤓ by the search, `app:export-all`, Ctrl/⌘-Alt-E): `exportAll` query →
  `lib/exportNotes.ts` `notesZip` → `lib/zip.ts` `makeZip` (stored, CRC32, UTF-8 names; no
  dependency). `soniroll notes/<folders>/<title>.md`, empty folders included, file names made safe
  (`safeName`) with " (2)" on clashes, plus `soniroll-notes.json` (each file's exact title, folder,
  view and dates).
- **Import** (`ImportDialog.tsx`, `app:import`, Ctrl/⌘-Alt-I): a .zip or .md files, or a folder
  (`webkitdirectory`). `readZip` handles stored and deflated (`DecompressionStream("deflate-raw")`)
  zips. Each zip is read on its own; the shared top folder is dropped; with the metadata file the
  titles/folders/fonts come back exactly, otherwise folders come from paths and titles from file
  names; dot folders (`.obsidian`) and `__MACOSX` skipped. `shedNotes.importNotes` takes ≤100
  notes per call (the client chunks, ~4 MB max), with `clash` skip / replace / copy ("Title - 1").
  Score blocks keep their ids, so notation only comes back in the same account.
- Checked: the zip writer with `unzip -t`; export → import round trip and a zip made by `zip -r`
  (deflated, with `.obsidian`) through the real functions in Node; in the harness (fake backend):
  sharing with a suggested public user and a typed private one, changing a role, the link
  settings, a shared-with-me note (editable, owner controls hidden), the PDF view (no `<script>`,
  no `javascript:` link, wikilink pill, ABC drawn, print called once), print media screenshot,
  export download, importing two zips at once, `/note/<token>` at 390 (light) and 1440 (dark), no
  overflow, no console errors. **Not checked:** anything against the real backend signed in
  (two real accounts sharing, the "invited" link signed in/out), a real print dialog / PDF file,
  folder picking in a real browser, Safari/Firefox.

**Templates (2026-10-20):**
- Table `shedNoteTemplates` {userId, name (unique per account, case-insensitive), title (the new
  note's title with variables; empty = ask for a title), body} — **not notes**: not in the list,
  links, search or export. `packages/convex/shedNoteTemplates.ts` (list, create, update, remove;
  max 200). Account deletion cascades. `shedNotes.templateId` records the template a note was made
  from / last had applied (`create` takes `templateId`; `setTemplate`).
- Variables (`apps/web/lib/noteTemplates.ts`): `{{name}}` (spaces inside allowed, names match
  case-insensitively, each asked once); built-ins `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:mm) and
  `{{title}}` (the new note's final title) fill themselves. `{{ }}` (empty) is left alone. Live
  preview shows blanks as accent pills (`cm-template-var`).
- `TemplatesPane.tsx` (current id `TEMPLATES_ID = "templates"`, opened from the Templates row at the
  bottom of the note list, or `app:open-templates`, Ctrl/⌘-Alt-J): list + editor (name, title,
  "Asked for: …", the body in `NoteEditor` with notation allowed). Autosaves ~0.7 s after typing.
- `TemplateFillDialog.tsx` asks for the variables (plus a Title box when the template has no title
  and it's a new note) and previews the filled title.
- Ways in: (1) `[[` — `wikilinkCompletion` adds "New from “Name”" options in a Templates section
  ranked above Notes, matched on the template name (`displayLabel` shows the long label); picking
  one asks for the blanks, makes the note in the current folder and replaces the typed `[[…` with
  `[[Title]]` (or inserts at the cursor if the text moved). (2) `note:new-from-template` (Alt-T):
  pick a template in the palette; the new note is linked at the cursor if one of your notes is
  open, else opened. Also "From template" in the list's toolbar and on the empty start screen
  (phones have no keys). (3) An empty note of yours shows "Start from a template:" chips (6, then
  More…; "Make a template" when there are none). (4) ⋮ → "Apply a template…" / "Change template
  (now X)…" / `note:apply-template` (Alt-Shift-T): if the note has text, a ConfirmDialog warns it
  will be deleted; then the editor's whole text is replaced (an ordinary edit, so it autosaves and
  Ctrl-Z undoes it), the template recorded, and the note renamed if the template has a title.
- Scores in a template are **copied** for each note made from it (`instantiate` in ShedNotes:
  `scores.get` + `scores.create`), so editing the music in a note doesn't change the template.
- Renaming a note already rewrote `[[Old]]` in all your notes (`shedNotes.rename`); it now rewrites
  templates' text too. Not shared notes owned by others (they can't link to yours).
- Checked in the harness (fake backend): making a template; `[[Les` → New from “Lesson” → blanks →
  note "2026-10-20 lesson with Ella" made with the template's id and linked in place; Alt-T → palette
  → note linked at the cursor; an empty note's chip applying the template (title renamed); Change
  template warning then Replace; renaming "Scales" updating links in notes and in the template; 390
  dark (Templates page, the fill sheet), no overflow or errors. Not checked against the real backend
  signed in, or score copying with a real score.

## 2026-10-20: the New menu, a resizable note list, a tidier `[[` menu

- **+ New** in the note list opens a menu (New note · From a template… (only when there are
  templates) · New folder) instead of the "From template" / "New folder" text buttons that sat
  in the Folders/Recent row.
- **Resizable note list** on wide screens (`ListResizer.tsx`): a handle in the gap, drawn like
  the main sidebar's. Width is 220–520px, kept on this device as `listWidth` in the
  `jam-practice-shed-notes-view` settings; dragging previews live and saves once on release; arrow
  keys nudge it, double-click resets to 288. A plain click doesn't move it (it only saves after
  a 3px drag). The heading shrinks to `lg:text-xl` so "Shed Notes" fits at the narrow end.
- **`[[` suggestion menu restyled** (`editorTheme` in `editorSetup.ts`): padded list, rounded
  rows, an icon per row (CSS masks of DocumentIcon / NotePlusIcon / PlusIcon, so they take theme
  colours), the folder as a small pill on the right, no CodeMirror underline under section
  headers (needs `!important`). The template rows lost their "template" detail (the section
  says it); Create's detail is now "new note".
- Verified in the esbuild harness: menu items, drag/click/double-click widths, reload keeps the
  width, `[[` menu at 1300 light and 390 dark, no handle or overflow at 390. Not checked signed
  in on the real backend.

## 2026-10-20: duplicate titles get " - 1", " - 2"

Jack asked that a new note whose title is taken gets " - 1" (or whichever number is free) instead
of failing. `uniqueTitle` in `packages/core/shedNotes.ts` now numbers from 1 as "Title - N" (it
was "Title 2"); `create`, `importNotes` (Keep both) and the `[[`/palette/template paths all go
through it. Applying a template whose title clashes renames with `rename({ unique: true })`, which
numbers the same way and shows a notice. A plain rename you type still refuses a taken title
(so a typo doesn't silently become "X - 1"). Checked `uniqueTitle` with a Node script; tsc in
web, convex and mobile; pushed to dev. Not clicked through in a browser.

## 2026-10-20: the command palette's default key is Alt-Space

Jack's pick. `Alt-Space` replaces `Mod-Space` in `DEFAULT_CONFIG.keybindings`; `Mod-p` stays.
`matchesKey` now reads Space from `e.code` too, because Option-Space on a Mac types a no-break
space (`e.key` isn't " "). On Windows the system may grab Alt-Space for the window menu; Ctrl-P
still works there. Help text updated. Checked in the harness (Chromium on Linux): Alt+Space opens
the palette from the list and from inside the editor without typing a space; Ctrl+Space no
longer does. Not tried on a Mac or Windows.

Same day, also Jack's pick: search (`app:search`) defaults to `Alt-f` instead of `Mod-Shift-f`
(`/` outside a note still works). Option-F on a Mac types "ƒ", so it matches via `e.code` (KeyF).
Checked in the harness (opens from the list and inside the editor, no text typed). Not checked:
whether Chrome on Windows/Linux lets the page take Alt-F before its own menu.

Same day: **Shift-Enter** also follows the link under the cursor (`editor:follow-link`, next to
Mod-Enter). The editor's keymap had `preventDefault: true` on every binding, which would have
swallowed Shift-Enter everywhere; now only keys with Ctrl/Alt/⌘ always stop the browser, and a
plain/Shift key whose command does nothing falls through (Shift-Enter off a link makes a new
line). Checked in the harness: on `[[Scales]]` it opens Scales; at the end of a line it adds a
line. Not checked in vim mode.

## 2026-10-20: the note toolbar folded into ⋮

Jack asked for the note header's Preview/Source switch, Share, Vim switch, font (Aa) and full
width to move into the ⋮ menu, and for every ⋮ item to have an icon. The header is now just
back/forward, the save state, ⋮ and the links-panel button. The menu, in groups: Live preview ✓,
Vim keys ✓, Line numbers ✓, Full width ✓ (640px+ only), Font: X… (opens the font list in its
place, each font's "Aa" drawn in that font) · Share…, Rename, Move to folder, Apply/Change
template…, Export as PDF · Command palette, Open a note…, Settings file · Delete note. Shortcut
hints show at the end (first key only, none under 640px).

`ContextMenu` gained optional `checked` (a ✓, role menuitemcheckbox), `hint`, `divider` and a
`width` on `MenuState`; it scrolls when taller than the window, and now closes *before* running
the item so an item can open a submenu. Other menus look the same. New icons in `tools.tsx`:
`KeyboardIcon`, `CommandIcon`. Checked in the harness at 1300 light and 390 dark (Vim toggles
from the menu, font list picks Lora). Not checked signed in.

## 2026-10-20: links under the note when the panel is closed; Ctrl-` for live preview

- The right-hand panel button no longer hides the links panel: closed, the panel moves under the
  note (as on a phone), lined up with the note's text column (unless full width), up to 35% of
  the height with its own scroll. The button reads "Move the links under/beside the note"; the
  `view:toggle-links-panel` command's name matches. Same stored `linksHidden` setting.
- Live preview's default key is `Ctrl-`` ` (Ctrl on a Mac too, since ⌘-` switches windows),
  replacing Mod-e. Checked in the harness: toggles inside the editor (no backtick typed) and
  outside it.

## 2026-10-20: word suggestions, and a settings page in front of the JSON

**Word suggestions** (`wordCompletion`, off by default; `view:toggle-word-completion`):
`wordCompletion` in `editorSetup.ts` is a second CodeMirror completion source next to the `[[`
one. It offers words (4+ letters) from the open note — skipping fenced code/notation blocks — and
from your note titles, ranked by how often they come up, once 2 letters of a word are typed. Never
inside `[[`, after `#`, or inside code, URLs or HTML (syntax-tree check). Word rows have no icon
(`cm-completion-word`); optionClass is now `cm-completion-${type}`. Enter accepts (CodeMirror's
completion keymap); a `Tab → acceptCompletion` keymap at highest precedence takes one too, and
falls through to tables/indent when none is open. A `words` compartment carries the setting.

**Settings page**: the gear now opens "Settings" with two tabs over the same file. *Settings*
(`SettingsForm.tsx`): switches (live preview, word suggestions, vim, line numbers, readable line
length, spellcheck), a text size slider, a searchable list of every command with its keys
(pencil records a key — needs Ctrl/Alt/⌘, an F key or Shift-Enter; Esc stops; warns when it takes
a key from another command; × removes the key; ↺ goes back to the built-in), and vim leader,
mappings (a textarea, one per line) and a read-only list of :commands. *JSON*: the file as before,
with Reference and the problems list. Every form change rewrites the file through helpers in
`shedNotesConfig.ts` (`setConfigValue`, `setVimValue`, `setCommandKey`, `resetCommandKey`), so it
reads as if typed by hand: a rebind turns the built-in keys off (`"command": ""`) and adds the
new one. When the JSON doesn't parse, the form says so and changes nothing.

Gotcha for tests: the JSON editor only draws the lines on screen, so check the stored settings
(`__db.settings`), not the editor's text. Verified in the harness: suggestions on/off, Enter and
Tab fill in, none inside `[[`, none from an abc block; switching on from the form; recording
Alt-L for live preview saves and works; 390 dark has no overflow. Not checked signed in.

Same day, reworked after Jack's feedback ("only works for words already on the page… figure out
what word I'm typing… like 4"): suggestions now finish the word from a **dictionary** too. Up to
four, in order: your words (this note minus code blocks, plus note titles; most used first), then
`public/shed-notes/words-en.txt` — 39k words, most common first, fetched once (349 KB, ~140 KB
gzipped) the first time a suggestion is wanted. It's SCOWL levels 10–35 (wordlist-english, MIT
package; SCOWL's own permissive notice is kept at the top of the file and the source is credited
on /credits) plus a hand-written list of music words ranked just after the most common words;
within a tier, plain words before their -s/-ed/-ing/-ly forms, then shorter first. Rebuild with
`apps/web/scripts/build-word-list.mjs` (instructions at its top). The source is now async and
returns `filter: false` (CodeMirror keeps our order, asks again each letter), matching the typed
case ("Pra" → "Practice"). Checked in the harness: pra → your "Pratt's", practice, practical,
practically; arp → arpeggio…; synco → syncopated, syncopation; Met → Metal, Method, Methods,
Metronome; arrows + Enter and Tab fill in. English only.

## 2026-10-20: leader mappings actually work; a vim mapping guide

Jack's `nmap <leader>ff :palette<CR>` did nothing. Cause (in @replit/codemirror-vim-core's
`matchCommand`): a **full** match beats a partial one immediately, so a mapping whose first key
already does something alone (Space = move right, `,` = repeat search) can never be typed — every
leader mapping was dead with the default `<Space>` leader. `Vim.unmap` can drop the built-in key,
but the library tracks a fixed `defaultKeymapLength`, so removing built-ins breaks `mapclear` (run
on every settings change). Fix: `vimMappingWait` in `vimSetup.ts`, a highest-precedence keydown
handler put in the vim compartment, holds keys while they're the start of a normal/visual
mapping longer than one key (vim's `Vim.vimKeyFromEvent` names them), runs the mapping via
`Vim.handleKey(cm, wholeLhs)` (a whole sequence matches the user mapping in one go), and
otherwise feeds the held keys to vim one by one; a lone prefix key runs after 1 s (vim's
timeoutlen). Skipped in insert mode (the library already waits there, e.g. `imap jk <Esc>`) and
while vim has a count/operator pending. Checked in the harness: `<leader>ff` opens the palette,
`,x`→`dd`, Space alone moves right after the wait, Space+l moves two, Space types in insert mode,
`j`→`gj` still works.

`VimGuide.tsx`: the docs Jack asked for — a mapping piece by piece (modes, nore, unmap, special
keys, comments), the leader (current one named) and the wait, running commands (`:w`, `:q`,
`:wq`, `:e`, `:new`, `:cmd id`, exCommands), examples, and troubleshooting. Shown under "How to
write mappings" in Settings → Vim and in the JSON tab's Reference; a Help entry points to it.

Same day: **any command id works as a `:` command** — `nmap <leader>fg :app:search<CR>`. Vim's ex
parser reads `\w+` as the name (`app`) and the rest as `argString` (`:search`), so `vimSetup.ts`
defines one ex command per id prefix (`app`, `note`, `editor`, `view`, taken from COMMAND_BY_ID)
that runs prefix + rest (words after the id are its argument). Ex lookup takes the longest
defined prefix, so `editor` doesn't hit `:e`. From visual mode vim has already collapsed the
selection when an ex command runs (`:'<,'>`); `runById` restores it from `vim.lastSelection`
(inclusive end; whole lines for V) when the command has a range, so
`vnoremap <leader>b :editor:toggle-bold<CR>` bolds the selection. Checked in the harness: `<leader>fg`
opens search; `ve` then `<leader>b` gives `**Jthird**`. Guide and help updated.

## Pictures and files in notes (2026-10-20)

Jack: "paste images and have them display nicely in notes… it should go to the files also… embed anything in
the files into a note somehow".

- **Syntax:** a line that is only `![name](file:<ref>)` shows the file. `<ref>` is an upload's id (`files`
  table), or `<kind>/<id>` for anything else on the Files page (`recording/…`, `song/…`, `lesson/…`,
  `handin/<sub>:<file>`; not profile images). `![name|300](…)` sets a picture's width. A lone
  `![…](https://…)` shows that web picture. Standard markdown, so exports stay readable (the `file:` refs
  only resolve inside soniroll). Embeds inside fenced code are ignored.
- **Backend:** `files.embed({ref, lessonId?, noteId?, token?})`: yours, or someone else's when the note /
  lesson that shows it is one you can see — the same checks as scores in notes (`sharedInNote`,
  `sharedInLesson`, now exported from `scores.ts`, matching on `file:<ref>` in the body). `sharedInNote` now
  also accepts an owner who has **edit** access to the note (a collaborator's pasted picture is stored in
  their account), for scores too. Returns name, type, size, date, URL. No new table: pasted files are
  ordinary `files` rows, so they're on the Files page, count toward the 100 MB, and account deletion
  already removes them. Deleting the file leaves a "isn't available" card in the note.
- **Editor** (`fileEmbedSetup.ts` — not `fileEmbeds.ts`, which would clash with `FileEmbeds.tsx` on
  case-insensitive disks): paste (only when the clipboard has files and no plain text, so spreadsheet cells
  still paste as text) or drop uploads through `fileActionsFacet` (set by `NoteEditor` when signed in and
  not read-only). While uploading, a `pendingField` block widget says "Uploading … to your files…" at the
  spot (its position maps through edits); nothing goes into the text until the file is saved, so closing a
  note mid-upload leaves no broken line (the file is still in Files). Errors show in red for 8 s with ×;
  an out-of-room error drops the rest of the batch. Pasted `image.png` is renamed
  `Pasted image YYYY-MM-DD HHMMSS.png`. `insertOnOwnLine` always ends the line, so typing on doesn't join
  the embed line (found in testing: the picture stopped showing).
- **Rendering:** `FileWidget` in `livePreview.ts` (in the same state field as notation; live preview only)
  registers an empty box in `embedStore` (now `{kind: "score" | "file", id}`), and `FileEmbeds.tsx` portals
  `FileEmbedView` into it: picture (max 36rem tall, ⤢ / double-click → `FilePreviewDialog`), PDF (card with
  Open + an iframe from `sm` up, hidden in print), audio/video players, other files a Download card.
  Clicking it (not its controls) puts the cursor on the source line. `NoteDocument` (Export as PDF, a
  note's link page) renders the same view and waits for pictures to load before printing.
- **Insert a file:** the **File** button above a note (and in lesson notes) or `editor:insert-file` opens
  `FilePickDialog`: everything in `files.storage`, searchable, plus Upload.
- Word suggestions ignore link/file addresses now (ids were becoming suggestions).
- Help (steps, features, "Pictures and files"), Files help, changelog (0.10.0), privacy (people who can open
  a note can see and download its files; a collaborator's pasted pictures are in their account).

**Verified** in the harness (nix Chromium, mock backend that captures the upload): pasting a canvas PNG
(pending line, then the picture; typing on after it), the picker inserting a PDF (frame + Open), a
recording (`recording/r9`, audio player) and a .zip (Download card); search in the picker; an
out-of-room error; dropping a .txt at the end; `|200` width; a missing file's card; 390 px dark (no
overflow), click → source line with the dashed box, ⤢ → full-size dialog; source mode shows no widgets;
Export as PDF markup (files in order, code block untouched). `tsc`, eslint, Convex push to dev, and
`files.embed` with bad refs on dev (null).
**Not verified:** a real upload to Convex signed in, the shared-link page / shared-with-you / lesson student
seeing someone else's picture on the real backend, real clipboard pastes from other apps (only synthetic
paste events), iOS/Android paste, very large pictures.

## Share the notes a note links to (2026-10-20, on `preview`)

Jack: "an option when sharing a page to also share the pages linked in the page your sharing". Work moved
to `preview` (fast-forwarded to `feat/shed-notes`, which had all the Shed Notes work).

- **One switch in Share** ("Also share the N notes it links to"; shown when the note links to notes that
  exist, or it's on), stored as `shedNotes.shareLinked`. "Also shared: A, B" lists them when on.
- **Dynamic, not copied shares:** `noteAccess` (shedNotes.ts) now also grants access when a note of the
  same owner that's shared with you directly has `shareLinked` and links to this note — you get that
  note's role (Can edit → can edit the linked notes too). One level only. It follows the text: linking a
  note later shares it; unlinking, turning the switch off, or removing the person ends it — no rows to
  clean up. Every place that checks `noteAccess` (get, save, scores and files in notes) follows.
- **Link:** `/note/<token>?n=Title` opens a linked note through the shared note's link
  (`byLink({token, note})`, `linkedThrough`), same "invited"/"anyone" rule as the note itself. `byLink`
  returns `linked` (title keys that open from this page: the link's note and its linked notes that
  exist) and `parent`. `SharedNotePage` turns those [[links]] into real links (`NoteDocument`'s
  `linkHref`/`onLink`; router push), shows a back button to the shared note, and mutes links it can't
  open (`.note-doc-wikilink-closed`). Scores/files in a linked note use `{token, noteId}`;
  `sharedInNote` accepts that pair.
- **In Shed Notes:** `sharedWithMe` lists linked notes too, with `via` (the linking note's title; shown
  as "linked from X", and no "Remove from my list" since it comes with that note) and `ownerId`.
  Clicking a [[link]] in someone else's note opens **their** note when it's shared with you (else yours
  by that name, as before); `shedNotes.get` returns `ownerId` for this.
- Help (Share), changelog 0.10.1, privacy updated.

**Verified** in the harness (mock backend; a temporary `next dev` on port 3100, since the usual dev
server wasn't running, stopped afterwards): the switch and its stored value, "linked from" in Shared with
me, clicking a link in a shared note opening the owner's note, the link page (linked notes clickable,
a missing note and an unshared note not, child page with back button, back via its link), 390 px dark.
`tsc`, eslint, Convex push to dev. **Not verified:** the real backend with two accounts (access through a
linked note, editing it, the "invited" link signed in/out), and performance for someone with many shares
(`noteAccess` now reads the viewer's shares when there's no direct one).

### Follow-up: all the way down (2026-10-20)

Jack: "it should share ALL the sub pages including sub pages of sub pages". `shareLinked` now covers every
note the shared note **leads to** through links, at any depth: `reachableNotes(ctx, root, stopAt?)` in
`shedNotes.ts` walks the owner's notes breadth-first through `links` (by `by_user_title`, cycles and
missing notes skipped, never another account's notes, capped at `MAX_SHARED_LINKED` = 300 notes) and
stops early when looking for one note. `sharedAlong(parent, note)` and `linkedThrough` use it, so
`noteAccess`, the link page (`byLink`'s `linked` = every reachable note), "Shared with me" (`via` = the
shared note) and scores/files in those notes (`sharedInNote`) all follow. The switch reads "Also share
linked notes (N)" with N counting every reachable note, listed under it. Checked with a Node script
against the real `reachableNotes`/`sharedAlong`/`linkedThrough` (a fake db: depth 3, a loop, a missing
link, another owner's note with the same title, switch off) and in the harness (a sub-sub-note opening from
the link page, the dialog listing all three). Not checked on the real backend with two accounts; a note
web of hundreds of notes costs one index read per note on every access check through it.

### Follow-up: every level or one level (2026-10-20)

Jack: "make an option to share all sub pages or just one level". `shedNotes.shareDepth` (`"one"`; missing =
every level, so notes already switched on keep going all the way down). `reachableNotes` stops after the
first level's links when it's `"one"`, so access, the link page, Shared with me and embeds all follow.
In Share, once the switch is on, a `Select` under it: "Every level (their linked notes too)" / "One level
(only notes this links to)" (`setShareLinked({on, depth})`); the count in the switch's label and the
"Also shared" list follow the choice. Checked with the Node script (one level → only direct links;
deeper notes refused by `sharedAlong`/`linkedThrough`) and in the harness at 390 px dark (3 → 2 notes,
Private dropped, stored `"one"`).

## 2026-10-28 — vim `k` jumping lines, clicks landing on the line below

Jack: "in vim mode when i press k to go up it sometimes goes up multiple lines or sometimes goes to the
top of the note. also with my mouse i have to click above the line im aiming for".

Cause: the block widgets (tables, ```abc notation, scores, files, the "Uploading…" line) had CSS
**margins** (`margin: 6px 0`, `4px 0`). CodeMirror measures a block by its border box, so margins aren't
counted, and every one moved the editor's idea of where lines are 12 px further from where they're
drawn. After a couple of tables, `posAtCoords` (mouse clicks) picked the line below, and
`moveVertically` (what vim's `j`/`k` uses through `findPosV`) skipped lines; in the harness one `k` went
from line 130 to line 96.

Fix: `components/shednotes/blockBox.ts` — every block widget's DOM is now a plain outer box with the
space as **padding** (same sizes as the old margins; the editing variants keep their 2 px top), and no
widget class has a vertical margin any more. The box is also watched with a `ResizeObserver` that calls
`view.requestMeasure()`: CodeMirror only re-measures when it redraws, so a picture, score or notation
finishing loading after it's drawn left the heights stale until then (each widget's `destroy` stops
watching). Score and file widgets register the inner element with `embedStore` (`destroy` gets the box,
so it passes `firstElementChild`). Also the `---` rule's widget no longer ignores clicks, so clicking
right on the line puts the cursor there.

Rule for the future: **no vertical margins on anything CodeMirror measures** (block widgets, `.cm-line`
decorations). Use padding (on a wrapper if the element has a border or background).

Checked in an esbuild harness with the real `livePreview`/`tables`/`editorTheme` + vim, in headless
Chromium, on a note with six sections of headings, lists, a quote, a table, a code block, a rule and ABC
notation: the height map matched every drawn line (0 px drift; it was +6 px per table before); clicking
the middle of every visible line put the cursor on that line (2 misses before); `k` from the end of the
note to the top went up exactly one line every press at 1200, 800 and 500 px wide. Still there, and
the same before this change: at 390 px, with the cursor on the top edge of the screen and a table
right above, one `k` skipped the blank line above the table (CodeMirror hadn't drawn that line yet).
Not checked: the real signed-in Shed Notes page, scores and file embeds (they need the backend), and
anything on a real phone.

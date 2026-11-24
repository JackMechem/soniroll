# PDF viewer and editor (2026-11-20, web + desktop; FB-31)

Jack asked for "a full on pdf viewer with edit functionality for editing documents and making notes
in music", with music symbols (fermata, coda, repeats), highlighting and text boxes, "kinda like
acrobat but not that advanced". Web first, then desktop; the phone's viewer is fine as it is for now.

## Decisions (Jack's)

- Markings are a **layer saved with the file**; the PDF is never changed. "Download with markings"
  bakes them into a new PDF.
- First version includes: pen + eraser, page turning for gigs, page editing (reorder, rotate,
  delete, insert blank/staff pages, merge), rehearsal/bar/chord/dynamics stamps.

## How it's built (`apps/web/components/pdf/`)

- **pdf.js** (`pdfjs-dist` 6.5) draws pages on canvases, loaded lazily (`lib/pdfjs.ts`). The
  worker URL comes from `lib/pdfWorker.ts` (`new URL("pdfjs-dist/…", import.meta.url)`, fine under
  Turbopack and `next build`). The desktop app aliases that module to
  `apps/desktop/src/native/pdfWorker.ts` (`?url` import) and aliases `pdfjs-dist` to the **legacy
  build**, since WebKitGTK / older macOS WebKit lack things the modern build uses.
  (2026-11-20, UI pass 1: the `?url` import must use a **relative path**
  (`../../../web/node_modules/pdfjs-dist/legacy/…`), not `@web/node_modules/…`. Through the alias
  it looked like a package import, so Vite dev pre-bundled it, lost the default export and the whole
  desktop window was blank under `vite`/`tauri dev`. `vite build` was fine either way.)
- **pdf-lib** builds downloads (`exportPdf.ts`): original pages are copied as vectors (`copyPages`),
  rotation applied, blank/staff pages drawn, and each page's markings laid over it as a 3000 px-wide
  transparent PNG (drawn with Canvas 2D by `drawMarks`, then turned back to the page's unrotated
  frame, since PDF positions things before `/Rotate`).
- **Data** (`markup.ts`): `Layer = { v: 2, pages: LayerPage[] }` (version 1 layers are upgraded as
  they're read, see the 2026-11-23 object-editor entry); a page has a `src` (a page of this PDF, a
  page of another `files` PDF via `src.file`, or `blank`/`staff`), `rotate`, and `marks`.
  Coordinates are units: 1000 across the page as shown. Every mark is an object with optional `rot`
  (degrees about its box's centre), `opacity` and `locked`: `ink` (points, width, `highlight`),
  `text` (centre `x`/`y`, optional wrap width `w`, font sans/serif/mono/hand/music,
  bold/italic/underline, `align`, line height `lh`, frame box/circle/fill with `bg`), `shape`
  (line, arrow, cresc, dim end to end; rect, ellipse, bracket as boxes, with `fill`; a cover is a
  rect with a fill and `width` 0) and `image` (a `{ kind, id }` reference into Files, never the
  picture). Rotating a page turns its marks with the paper (`rotateMarks`).
- **Geometry** (`geometry.ts`): text layout and wrapping (canvas-measured, cached at 100 px),
  each mark's frame, hit-testing, moving/scaling/turning/resizing, text re-anchoring, snapping.
  `marksRender.ts` draws marks on a canvas (downloads), `MarkSvg.tsx` in the page's SVG; both use
  the same layout so the download matches the screen.
- **Backend**: `pdfMarkups` table (userId, fileId, `data` = the layer as one JSON string to dodge
  the 1,024-fields limit, max 900 KB), `pdfMarkups.get` / `save` (owner only). `files.remove` and
  account deletion delete the row. Saved a second after the last change; flushed on close.
- **UI**: `PdfEditor` (full-screen portal, z-70, or `embedded`): top bar (Done, save status,
  undo/redo, Pages, Play, ⋮ with Download / Download with markings / Hide markings / Clear all), a
  tool row (select, hand, pen, highlighter, eraser, text, edit text, Symbols popover, Shapes
  popover, add a picture, pen colour and width), the selection's toolbar (`ObjectBar.tsx`,
  floating above the selection; docked at the bottom under 640 px), page + zoom pills. It owns the
  history, selection, the text being typed, clipboard and keys. `PdfPageView` (one page: canvas
  only while near the screen, SVG marks, the selection box with handles, the text box being typed
  (`TextEditor.tsx`), and all the pointer input; hit-testing is geometric, not DOM). `pdfText.ts`
  reads the PDF's own text for Edit text. `editorParts.tsx`: `Pop`, `Swatch`, `ToolBtn`, … .
  `PdfPages` (thumbnail grid, drag reorder, Insert a PDF via `useFilePicker`). `PdfPerform` (full
  screen, 1–2 pages, keys / pedal / tap / swipe, next pages pre-drawn). `PdfInline` (view-only in
  place: shared files, note embeds, lesson files; shows the PDF without markings) with a Full
  screen button.
- Where it opens: `useFileActions` opens your own PDFs (`kind: "file"`) in `PdfEditor`;
  `FileViewer`'s PDF case is `PdfInline` (was an iframe).
- Ink colours are fixed hex values (markings sit on white paper, not the theme) — a deliberate
  exception to "theme tokens only". The editor's own chrome uses tokens.
- Palm rejection: once a pen pointer is seen, touch scrolls instead of drawing.

## Verified / not

Verified in headless Chromium against dev with a throwaway `.test` account: drawing, stamps,
symbols, hairpins, text (typing in place), select/move/resize, eraser, undo, saving and reloading,
Pages (turn with marks, staff page, insert another PDF, reset keeping marks), Play two-up and
turning, exported PDFs (pdftoppm/pdfinfo), 390 px dark with no overflow, `next build`, desktop
`vite build`. **Not verified:** a real pen/touch screen, Safari/iOS, the desktop app running
(WebKitGTK/macOS), very large PDFs, a lesson PDF preview with real data.

## Ideas not done

Mobile markup; showing markings on shared links; text search; bookmarks/setlists of PDFs; snapping
symbols to staff lines.

## UI pass 2 fixes (2026-11-20)

- **Escape on a popover** (Symbols, Shapes, Colour and size) closed the whole editor: `Pop`'s
  window capture-phase listener now calls `stopPropagation()`, which also stops the editor's own
  window (bubble) listener. Escape with nothing open still leaves the editor; with a selection it
  clears it first.
- **Escape while typing a text mark keeps the text** (it used to throw away what you'd typed),
  like Enter and clicking away. Empty text is still dropped; undo covers mistakes.
- **Phone tool row:** below `sm` the buttons are 36 px wide with a 2 px gap and the "Symbols" /
  stamp name is hidden (the glyph stays), so all ten tools fit at 360 px. The row uses
  `useEdgeFade` (from `components/library/ui.tsx`, which now also watches buttons being added —
  the selection's A−/A+/colour/delete) to fade the edge that has more; the bar's fill and border
  sit on a wrapper so the fade doesn't cut them.
- ⋮ menu is 240 px wide ("Download with markings" was cut off). "White box behind text" is a pill
  toggle ("White box", the explanation in its tooltip) instead of a bare checkbox.
- Verified in headless Chromium with a throwaway account (deleted after): Escape on all three
  popovers, Escape after typing, Escape with nothing selected, tool row at 1440, 390 and 360
  (light/dark, with a mark selected). Not verified: a real touch screen.

## 2026-11-23: PDFs open beside the page

Jack: "be viewing a pdf and see the metronome or another tool at the same time … by default open
every pdf in a … side view like clicking on a task in shed logs".

- **`/files/view?kind=&id=`** (`app/files/view/page.tsx`, `components/files/FileViewPage.tsx`, in
  `PANE_ROUTES` and the desktop's `routes.tsx`): one of your own files as a page (any `StoredKind`,
  through `fileFolders.item` and `useDeviceUrl`). A PDF fills it with `PdfEditor embedded` (under the
  pane's bar, which has Back/⤢/⋮/×; trail "Files / folder / name"); other kinds show in place with
  Open in…, Download and "Open <folder>". As a page of its own (not in a pane) a PDF opens in the
  full-window editor and Done goes back. `lib/fileView.ts`: `fileViewHref`, `filesHref`,
  `opensBeside` (PDFs), `openFileBeside(kind, id, { mode, from })`.
- **`useFileActions.openFile`** (Files, a tune's Files, a task's Files…): a PDF goes to the side view
  (`openBeside`; the old full-window editor only if that fails). Its ⋮ adds "Open side by side"
  (desktop) and "Open full window"; other files get "Open in the side view". Audio/video/images keep
  the preview dialog on a plain click (it's a quick look; the side view is one menu item away).
- **`PdfEditor`**: `embedded` (fills its box instead of covering the window; not portaled), `onClose`
  optional (no Done button and Escape doesn't leave without it), keys only when its pane has the
  keyboard (`usePaneKeyGuard`), and what's waiting to save is saved when it unmounts (a pane closed
  or went Back), not only on Done.
- **`PdfPerform`** in a pane: no browser full screen (the point is seeing the other panes), covers
  just the editor's box, keys guarded the same way.
- The side view keeps this device's choice of over/beside the page: "Over the page" covers part of
  a tool; "Beside the page" (the pane's ⋮) puts the PDF and the tool side by side.
- Lost on the beside path: the Files page's Move to folder / Tags items in the editor's ⋮ (they need
  the Files page's organizer); "Open full window" still has them.
- Verified with the Shed Log entry of the same date (`shed-log.md`): the side view beside the
  Metronome, a pen mark saved from it, Play inside it, 390 full screen with Back.

## 2026-11-23 (later) — PDFs open in place

Jack, after trying it: "when I open a pdf it opens in a new pane, i think the default behavior should
be to just open in the current window". Clicking a PDF (Files, a tune's files, a task's or routine's
Files section, a file chip on a routine card) now opens `/files/view` where you clicked — the page, or
that pane in a split — with Back returning. The side view and a split are in the ⋮ menu ("Open in the
side view", "Open side by side"), and "Open full window" stays. Other file kinds still open the quick
preview. Checked in headless Chromium: alone (Back returns to Files) and in a Files | Metronome split
(the Files pane became the PDF, no new pane).

## 2026-11-23 (later) — Markings on any PDF in your Files

Jack: "what happened to editing pdfs?" — his `stickControl.pdf` is a lesson file, and markings only
ever worked on uploads (`pdfMarkups.fileId` is a `files` id), so every other kind opened "View only"
(not new today; it just showed now that every PDF in Files opens the same way). `pdfMarkups` now has
an optional `item` ("<kind>:<id>", index `by_user_item`) beside `fileId`: uploads keep their rows by
`fileId` (no migration), lesson files, hand-ins, recordings and songs use `item`, with ownership
checked by `storedItemById`. `get`/`save` take `{ fileId }` or `{ kind, id }`; `PdfFile` gained
`kind`; `files.removeItem` deletes either kind of row; account deletion already deletes by user.
Checked in headless Chromium on dev: a lesson-file PDF made through the backend opens with the tools,
a pen stroke saves ("Saved") and is there after a reload; an upload still says "Markings are saved
with this file". Not checked: a hand-in, or a student opening a teacher's lesson file (not in their
Files, so it stays view-only).

## 2026-11-23 (later) — A real object editor (Canva/Acrobat-style)

Jack: "making edits with the pdf editor currently is a bit annoying and doesnt work like you would
think it would. I want it to be like an actual full featured pdf editor that really lets you do
things with text, markings, resize things, change text size and manipulate text like programs
like canva." Rebuilt the markings into objects you select, move, resize and turn.

**Data model (layer v2) and migration.** `markup.ts` `Layer.v` is 2. Every mark has optional
`rot`, `opacity`, `locked`. Text: `font` is sans/serif/mono/hand/music with separate
`bold`/`italic`/`underline`, `align` (left/centre/right; missing = centre, how v1 drew it), `lh`,
`w` (wrap width; missing = as wide as the text), `bg` for a fill frame. Shapes: `fill`; a bracket is
now a box (its legs are the box's height). New `image` marks reference a Files item (`src: { kind,
id }`); the picture itself is never in the layer, so the 900 KB limit is safe. `parseLayerInfo`
upgrades v1 as it reads: text font `"bold"` → `sans` + `bold: true`; brackets get `y2 = y1 + 18`
(v1 always drew 18-unit legs). Nothing else changes, so old layers look the same (checked: a v1
layer saved through `pdfMarkups:save` opened and drew as before, and the first edit saved it as v2
with the bold stamp upgraded). A layer with `v` above 2 (saved by a newer soniroll) opens view-only
("reload the page to edit") instead of being saved over. **Risk:** an older build (a desktop app
not yet updated) reads a v2 layer as unreadable and shows the PDF bare — and its next edit would
save over the v2 markings. Nothing to do about builds already out; update the desktop app with this.

**Interactions (decisions).**
- **Select is the default tool** (it was Scroll). Like Canva/Acrobat: click a mark to select it,
  Shift-click adds/removes, drag on empty paper draws a selection box (marks it touches), Ctrl/⌘+A
  selects the page's marks, Escape deselects (then leaves). Scrolling stays easy: the wheel,
  trackpads and touch scroll with every tool; on touch, the Select, Text, Symbols and Edit text
  tools act on a **tap** and a drag scrolls (a selected mark's box takes drags, to move it). A
  mouse drags the page with the Hand tool or while **Space** is held.
- Selection box: 8 resize handles + a turn handle above. Text: corners scale (size and all), the
  side handles set the wrap width (no top/bottom handles: its height follows the text). Several
  marks: corner handles scale them all evenly; the turn handle turns them about their middle.
  Lines, arrows and hairpins get a handle on each end (Shift: steps of 15°). Shift keeps
  proportions while resizing and turns in 15° steps; without Shift turning clicks to 0/90/180/270
  within 4°. A label shows the angle while turning. Locked marks show a dashed frame and "Locked",
  no handles, can't be moved, erased, boxed or deleted (Unlock is in the toolbar).
- Moving snaps (6 screen px) to the page's edges and middle and to other marks' edges and middles,
  with accent guide lines; **Alt/Option** turns snapping off; Shift moves along one axis only.
- On touch screens the handles are bigger hit areas (32 px) with a small dot; small marks drop the
  side handles, and short text keeps only its width handles (size is in the toolbar).
- **Text tool:** click to place a box and type at once (a real textarea over the spot, in the
  mark's font, size, alignment and turn: caret, selection, accents/IME and plain-text paste are the
  browser's own); drag a box for text that wraps at that width. Enter is a new line; Escape,
  Ctrl/⌘+Enter or clicking away finishes; empty text is dropped. Double-click (or Enter on a
  selected text) edits. The whole edit (typing plus any styling meanwhile) is one undo step. Text
  grows the way it's aligned (left keeps its left edge, …) and always keeps its top.
  Below 16 px on screen the box is typed at 16 px and scaled down (phones zoom into small fields);
  on touch the tap focuses a hidden field first so the keyboard comes up (`primeKeyboard`).
- **Styles are per text box** — per-character styling is out of scope (one font, size, colour,
  B/I/U per box). New text takes the last style you chose.
- **Selection toolbar** (`ObjectBar`): text — font, size in points (as the page prints, from the
  page's width in points; −/+, a list of sizes, type a number), B/I/U, colour, alignment (one
  button cycles), frame/fill/line spacing; strokes — colour, width, opacity; shapes — line colour
  (None for boxes), fill, width; pictures — opacity; always — duplicate, forward, backward, ⋮ (to
  front, to back, lock), delete. It sits **above** the selection (first version sat below and
  covered the next line you'd click), below when there's no room; hidden during a drag. Under
  640 px it's docked at the bottom, scrolling sideways with faded edges, in place of the page/zoom
  pills. Clicks on it keep the keyboard in the text being typed.
- **Edit text** (tool next to Text): pages with a real text layer show their runs as faint dashed
  boxes; click one and it's covered with a box the colour of the paper (sampled from the drawn page
  just outside the run) and replaced by a text mark with that text, at its place, its size (font
  height), and a guessed family (serif/mono/sans from the font name or pdf.js's style) and
  bold/italic. Deleting all the text keeps the cover (that's how you take the PDF's words out).
  Runs are pdf.js text items joined along a line (same angle and baseline, small gaps). A scanned
  page has none: clicking says so, with a **Use Cover** button (Shapes → Cover: a box filled like
  the paper, no line).
- **Pictures:** the picture button opens `useFilePicker` (images in your Files, or Upload — a file
  from this device is saved to Files first, then placed). Placed in the middle of what's showing of
  the page, 42% of its width; they move, resize and turn like the rest. Pictures kept on another
  device show a dashed "Picture not on this device" box (and are left out of downloads).
- Clipboard is shared by every open PDF (paste into another one, or another page — same place;
  same page — offset 12 units each time). Plain text pasted from elsewhere (nothing copied in the
  editor) becomes a text box.

**Keyboard:** V select, H hand (Space held: hand), P pen, M highlighter, E eraser, T text; Ctrl/⌘+Z
undo, Ctrl/⌘+Shift+Z or Ctrl/⌘+Y redo; Ctrl/⌘+A, C, X, V, D (duplicate); Delete/Backspace;
arrows nudge 1 unit, Shift+arrows 10 (a run of nudges is one undo step); Ctrl/⌘+] / [ forward /
backward, with Shift to front / back; Ctrl/⌘+B/I/U and Ctrl/⌘+Shift+> / < on selected text or while
typing; Enter edits the selected text; Escape finishes typing, then deselects, then leaves; +/−
zoom. Keys only in the active pane (`usePaneKeyGuard`), as before.

**Download with markings** draws every new property: wrapped lines, alignment, bold/italic,
underline (drawn as rules, the same on screen and in the file), fill colours, rotation, opacity,
covers and pictures (fetched and decoded with `createImageBitmap`, so the canvas isn't tainted).
Clear pixels of the markings picture are written white at 1/255 alpha: PDF viewers scale a
picture's colour and transparency separately, and clear-black edges showed as grey lines round
covers. Play mode and the Pages thumbnails show pictures too (`images` prop). The view-only
`PdfInline` still shows the PDF without markings (as before).

**Files:** `markup.ts` (v2 model, migration, `rotateMarks`, palettes), `geometry.ts` (new),
`marksRender.ts` (canvas drawing), `MarkSvg.tsx` (new), `PdfPageView.tsx` (pointer input,
selection box, gestures), `TextEditor.tsx` (new), `ObjectBar.tsx` (new), `editorParts.tsx` (new;
`Pop` now opens above when there's more room there), `pdfText.ts` (new), `PdfEditor.tsx`
(orchestration), `exportPdf.ts`, `usePdfDoc.ts` (page widths in points), `PdfPerform.tsx` /
`PdfPages.tsx` (`images`). New icons in `components/tools.tsx`: Copy, Lock, Unlock, BringForward,
SendBackward, AlignLeft/Center/Right, EditText. No backend change.

**Verified** in headless Chromium against dev with a throwaway `pdfed@soniroll.test` account
(deleted after, with its files and markings), using a pdf-lib text PDF (Helvetica, Helvetica-Bold,
Times) and an image-only "scan": typing with the Text tool (focus, Ctrl+B/I/U, size steps), the
width handle wrapping text, corner scaling, turning (and Shift's 15° steps), a pen stroke, box
selection, copy/paste, undo/redo (paste; nudges as one step), Ctrl+D, Delete, lock (no handles),
Select all, snap guides to the page middle, Space-drag scrolling, endpoint handles on an arrow,
Edit text on both fonts (serif guessed for Times; text appended; a line retyped), the no-text
notice and Cover on the scan (colour matched the cream paper), a box with a fill, a picture from
Files and one uploaded from "this device", saving and reloading, Play with markings, turning a
page in Pages (text and bracket turned with it), a v1 layer opening unchanged, and four "Download
with markings" files checked with pdftoppm (wrapped/underlined/italic/rotated text with a cream
fill, covers with no grey edge after the fix, pictures, v1 marks). 1440 light and dark, 390 light
and dark (touch taps for Text, a stamp, Edit text; docked toolbar; no horizontal overflow).
`tsc` (web, desktop), eslint, `next build`, desktop `vite build`.

**Not verified:** a real touch screen or pen (palm rejection, the phone keyboard coming up via
`primeKeyboard`, especially iOS), Safari/WebKit and the desktop app running, IME typing (Japanese
etc.), hover-only bits (cursors), very large PDFs with many runs, PDFs with rotated text runs, a
picture kept online (the test account kept files on the device), and the exported cover's colour
against a scan in other PDF viewers (poppler drew it a shade lighter than Chrome's sampled colour).

**Known gaps:** per-character styles; pinch zoom; group/ungroup; snapping while resizing or to a
grid; marquee on touch (use Select all); covers aren't joined to the text that replaced them (move
the text and the cover stays); Edit text guesses fonts (embedded fonts aren't used); pictures from
another device can't be drawn into downloads; an older build seeing a v2 layer (above).

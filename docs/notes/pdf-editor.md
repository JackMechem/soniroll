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
- **Data** (`markup.ts`): `Layer = { v: 1, pages: LayerPage[] }`; a page has a `src` (a page of this
  PDF, a page of another `files` PDF via `src.file`, or `blank`/`staff`), `rotate`, and `marks`.
  Coordinates are units: 1000 across the page as shown. Marks: `ink` (points, width, `highlight`),
  `text` (font sans/bold/hand/music, optional frame box/circle/fill — symbols, rehearsal letters,
  bar numbers and fingerings are all text marks), `shape` (line, arrow, rect, ellipse, cresc, dim,
  bracket). Rotating a page rotates its marks (`rotateMarks`).
- **Backend**: `pdfMarkups` table (userId, fileId, `data` = the layer as one JSON string to dodge
  the 1,024-fields limit, max 900 KB), `pdfMarkups.get` / `save` (owner only). `files.remove` and
  account deletion delete the row. Saved a second after the last change; flushed on close.
- **UI**: `PdfEditor` (full-screen portal, z-70): top bar (Done, save status, undo/redo, Pages,
  Play, ⋮ with Download / Download with markings / Hide markings / Clear all), a tool row (scroll,
  select, pen, highlighter, eraser, text, Symbols popover, Shapes popover, colour and size), page +
  zoom pills. `PdfPageView` (one page: canvas only while near the screen, SVG marks on top, all the
  pointer input; hit-testing is geometric in `marksRender.ts`, not DOM). `PdfPages` (thumbnail grid,
  drag reorder, Insert a PDF via `useFilePicker`). `PdfPerform` (full screen, 1–2 pages, keys /
  pedal / tap / swipe, next pages pre-drawn). `PdfInline` (view-only in place: shared files, note
  embeds, lesson files) with a Full screen button.
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

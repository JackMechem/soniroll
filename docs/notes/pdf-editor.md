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

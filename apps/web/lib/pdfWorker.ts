/** Where pdf.js's worker script is served from. The desktop app swaps this module for its own
    (Vite resolves the file differently; `apps/desktop/src/native/pdfWorker.ts`). */
export function pdfWorkerSrc() {
  return new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

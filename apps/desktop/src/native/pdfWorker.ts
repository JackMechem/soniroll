// pdf.js's worker (the legacy build, for older system web views), as a file Vite serves and
// bundles (the website's `new URL(…, import.meta.url)` form doesn't resolve a package name under
// Vite).
import workerUrl from "@web/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export function pdfWorkerSrc() {
  return workerUrl;
}

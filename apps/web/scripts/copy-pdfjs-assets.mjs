// Copies pdf.js's decoders, character maps, standard fonts and colour profiles from
// node_modules/pdfjs-dist into public/pdfjs/<version>/, where lib/pdfjs.ts points pdf.js at them.
// Without them scanned PDFs (JBIG2 / JPEG 2000 page images) open with every page blank.
// Run it after upgrading pdfjs-dist: node scripts/copy-pdfjs-assets.mjs (then commit the folder and
// delete the old version's).
import fs from "node:fs";
import path from "node:path";

const web = path.join(import.meta.dirname, "..");
const pkg = path.join(web, "node_modules/pdfjs-dist");
const { version } = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8"));
const out = path.join(web, "public/pdfjs", version);
for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  fs.cpSync(path.join(pkg, dir), path.join(out, dir), { recursive: true });
}
console.log(`pdf.js ${version} assets copied to ${path.relative(web, out)}`);

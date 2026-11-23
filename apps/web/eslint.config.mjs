import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party code copied in as is (see each file's header).
    "lib/vendor/**",
    // pdf.js's decoders, copied in by scripts/copy-pdfjs-assets.mjs.
    "public/pdfjs/**",
    // `convex/_generated/**` was ignored here before the Expo-migration monorepo restructure —
    // Convex now lives in packages/convex (its own package, own lint config if it ever needs
    // one), entirely outside this app's own directory tree, so eslint run from here never sees
    // it in the first place.
  ]),
]);

export default eslintConfig;

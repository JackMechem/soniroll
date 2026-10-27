import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import webPkg from "../web/package.json" with { type: "json" };

// The desktop app reuses the website's own components straight out of apps/web (no copies), so
// it looks exactly the same. Three kinds of alias make that work:
//  1. `@/…` points at apps/web, like it does in the website.
//  2. Next.js-only modules (next/link, next/navigation, …) point at small stand-ins in src/shims.
//  3. A few audio modules point at native versions in src/native (the shared AudioContext is the
//     native Web Audio bridge; the click engine waits for its clock; the microphone is opened
//     natively). Each native module imports the original through `@web/…` (which the
//     exact-match aliases below don't catch) for everything it doesn't replace.
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../web");
const src = path.resolve(here, "src");
const require = createRequire(path.join(web, "package.json"));

const exact = (name: string, file: string) => ({
  find: new RegExp(`^${name.replace(/[/.]/g, "\\$&")}$`),
  replacement: path.join(src, file),
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // Images, samples and help screenshots come from the website too.
  publicDir: path.join(web, "public"),
  // Reads apps/web/.env.local, so both apps talk to the same Convex deployment.
  envDir: web,
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  define: {
    "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(webPkg.version),
  },
  resolve: {
    alias: [
      exact("@/lib/clickEngine", "native/clickEngine.ts"),
      exact("@/lib/metronome", "native/metronome.ts"),
      exact("@/lib/audioInput", "native/audioInput.ts"),
      exact("@/lib/recorderEngine", "native/recorderEngine.ts"),
      exact("@convex-dev/auth/react", "native/convexAuthReact.ts"),
      { find: /^convex-auth-react-original$/, replacement: require.resolve("@convex-dev/auth/react") },
      exact("next/link", "shims/next-link.tsx"),
      exact("next/navigation", "shims/next-navigation.ts"),
      exact("next/dynamic", "shims/next-dynamic.tsx"),
      exact("next/image", "shims/next-image.tsx"),
      exact("next/font/google", "shims/next-font-google.ts"),
      exact("next/font/local", "shims/next-font-local.ts"),
      { find: /^@web\//, replacement: `${web}/` },
      { find: /^@\//, replacement: `${web}/` },
    ],
    dedupe: ["react", "react-dom", "convex", "@convex-dev/auth"],
  },
  server: {
    port: 1420,
    strictPort: true,
    // Vite has to read files from apps/web and packages/*, outside this folder.
    fs: { allow: [path.resolve(here, "../..")] },
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
});

import { defineConfig, globalIgnores } from "eslint/config";
import webConfig from "../web/eslint.config.mjs";

// The website's rules (React Compiler / react-hooks included), since most of this app's code is
// the website's own components.
export default defineConfig([
  ...webConfig,
  globalIgnores(["dist/**", "src-tauri/**"]),
  // There's no Next.js here: <img> and <a> are the right tags in the next/* stand-ins.
  { files: ["src/shims/**"], rules: { "@next/next/no-img-element": "off", "@next/next/no-html-link-for-pages": "off" } },
]);

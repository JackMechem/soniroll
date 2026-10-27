import petaluma from "@/components/fonts/petaluma/Petaluma.otf?url";
import petalumaScript from "@/components/fonts/petaluma/PetalumaScript.otf?url";

/** Stand-in for `next/font/local`. The website only uses it for the two Petaluma chord-chart
    fonts, so they're listed here by file name. */

const FILES: Record<string, string> = {
  "Petaluma.otf": petaluma,
  "PetalumaScript.otf": petalumaScript,
};

export default function localFont({ src, variable }: { src: string; variable?: string; display?: string }) {
  const file = src.split("/").pop() ?? src;
  const name = file.replace(/\.[a-z0-9]+$/i, "");
  const family = `'${name} desktop'`;
  const className = `desktop-local-${name}`;
  const style = document.createElement("style");
  style.textContent = `@font-face { font-family: ${family}; src: url(${FILES[file]}); font-display: swap; }
.${className} { font-family: ${family}; ${variable ? `${variable}: ${family};` : ""} }`;
  document.head.appendChild(style);
  return { className, variable: className, style: { fontFamily: family } };
}

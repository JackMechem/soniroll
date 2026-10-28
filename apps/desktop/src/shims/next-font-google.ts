import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

/** Stand-in for `next/font/google`. Geist (the default) is bundled; the other theme fonts load
    from Google Fonts the first time someone picks one, like on the website. Each call returns a
    class name that sets the same CSS variable Next would have. */

type FontOptions = { variable?: string; subsets?: string[]; weight?: string[]; preload?: boolean };

const GOOGLE_FAMILIES: Record<string, string> = {
  "--font-inter": "Inter",
  "--font-dm-sans": "DM Sans",
  "--font-space-grotesk": "Space Grotesk",
  "--font-nunito": "Nunito",
  "--font-lora": "Lora",
  "--font-playfair": "Playfair Display",
  "--font-jetbrains-mono": "JetBrains Mono",
  "--font-poppins": "Poppins",
  "--font-plex-mono": "IBM Plex Mono",
};

const BUNDLED: Record<string, string> = {
  "--font-geist-sans": "'Geist Variable'",
  "--font-geist-mono": "'Geist Mono Variable'",
};

const rules: string[] = [];
const families: string[] = [];

function font(options: FontOptions) {
  const variable = options.variable ?? "";
  const className = `desktop-font${variable.replace(/[^a-z0-9]+/gi, "-")}`;
  const family = BUNDLED[variable] ?? (GOOGLE_FAMILIES[variable] ? `'${GOOGLE_FAMILIES[variable]}'` : "sans-serif");
  rules.push(`.${className} { ${variable}: ${family}; }`);
  if (GOOGLE_FAMILIES[variable]) families.push(GOOGLE_FAMILIES[variable]);
  flush();
  return { variable: className, className, style: { fontFamily: family } };
}

let scheduled = false;
function flush() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    const style = document.createElement("style");
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
      .join("&")}&display=swap`;
    document.head.appendChild(link);
  });
}

export const Geist = font;
export const Geist_Mono = font;
export const Inter = font;
export const DM_Sans = font;
export const Space_Grotesk = font;
export const Nunito = font;
export const Lora = font;
export const Playfair_Display = font;
export const JetBrains_Mono = font;
export const Poppins = font;
export const IBM_Plex_Mono = font;

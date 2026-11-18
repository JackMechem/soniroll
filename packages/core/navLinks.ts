/**
 * The tool list: which category each one belongs to, the fixed category display order, and the
 * label/description/href every nav surface (the web sidebar, the web command palette, and the
 * Expo app's own menu/search screen) shows for it. Plain data with no DOM/React dependency, so
 * it lives here rather than only in `apps/web/components/tools.tsx` — that file still owns the
 * actual icon *components* (SVG JSX, web-only) and re-exports `NAV_LINKS` built by pairing this
 * data with them; `apps/mobile` imports this directly and doesn't need the icons for its own
 * list screen (yet).
 */

export const CATEGORIES = [
  "Community",
  "Play along",
  "Time & rhythm",
  "Ear training",
  "On your instrument",
  "Drums",
  "Practice tools",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface NavLinkInfo {
  href: string;
  label: string;
  description: string;
  category: Category;
  /** A shorter name for the sidebar's tool list, where the section heading gives the context
      (e.g. "Intervals" under Ear training). Search, titles and everything else use `label`. */
  short?: string;
  /** Needs a desktop-sized screen on web (Recorder); not meaningful on mobile, kept for parity
      with the web list so both sides describe the exact same tools the exact same way. */
  desktopOnly?: boolean;
}

export const NAV_LINKS_DATA: NavLinkInfo[] = [
  {
    href: "/jam-practice",
    label: "Jam Practice",
    description: "Build a tune list, pick one at random and get counted in at the right tempo.",
    category: "Play along",
  },
  {
    href: "/rhythm-section",
    label: "Rhythm Section",
    description: "Drums in over 30 styles to play along with. Add one of your chord charts and an upright bass and piano play it too.",
    category: "Play along",
  },
  {
    href: "/note-trainer",
    label: "Note Trainer",
    description: "Random notes in your instrument's range, with a listen mode that grades you.",
    category: "On your instrument",
  },
  {
    href: "/scale-trainer",
    label: "Scale Trainer",
    description:
      "Random scales in your instrument's range, with a listen mode that grades you note by note.",
    category: "On your instrument",
  },
  {
    href: "/interval-trainer",
    label: "Interval Trainer",
    description: "Random intervals in your instrument's range, with a listen mode that grades you.",
    category: "On your instrument",
  },
  {
    href: "/guess-the-interval",
    label: "Guess the Interval",
    short: "Intervals",
    description:
      "Hear an interval and pick which one it is, against the same countdown-timed rounds as Interval Trainer.",
    category: "Ear training",
  },
  {
    href: "/guess-the-chord",
    label: "Guess the Chord",
    short: "Chords",
    description:
      "Hear a chord — including weird slash chords — and type its symbol, iReal-Pro style (F#^7, Ab-7/D, ...).",
    category: "Ear training",
  },
  {
    href: "/guess-the-progression",
    label: "Guess the Progression",
    short: "Progressions",
    description:
      "Hear a chord progression and type it in Roman numerals (ii7 V7 I^7) or as chord names, from a pool of common jazz, pop and minor progressions.",
    category: "Ear training",
  },
  {
    href: "/find-the-root",
    label: "Find the Root",
    short: "Rootless voicings",
    description:
      "Hear a rootless voicing (E♭ G B♭ D) and sing, play or pick the root that makes it the chord asked for (C for a C minor 9).",
    category: "Ear training",
  },
  {
    href: "/shed-log",
    label: "Shed Log",
    description:
      "A practice calendar: repeating routines with tasks to check off and times for each, run on the Practice Timer, with notes, recordings and tunes, setlists and charts attached to each day.",
    category: "Practice tools",
  },
  {
    href: "/shed-notes",
    label: "Shed Notes",
    description:
      "Notes for your practice in markdown: link them together with [[ ]], write music notation in them, attach them to Shed Log routines and tunes, and use vim keys if you like.",
    category: "Practice tools",
  },
  {
    href: "/score-writer",
    label: "Score Writer",
    description:
      "Write music in notation — notes, rests, ties, triplets and chord symbols in any key and time, typed or clicked onto the staff — and play it back. Your scores can go in Shed Notes too.",
    category: "Practice tools",
  },
  {
    href: "/practice-timer",
    label: "Practice Timer",
    description:
      "Chain named timers back to back — scales, a break, a tune — or run a configurable Pomodoro. Save sessions to replay later.",
    category: "Practice tools",
  },
  {
    href: "/metronome",
    label: "Metronome",
    description: "Any time signature, custom accents, subdivisions and tap tempo.",
    category: "Time & rhythm",
  },
  {
    href: "/random-metric-modulation",
    label: "Polyrhythm Metric Modulation Metronome",
    short: "Metric Modulation",
    description: "A metronome that jumps to a new, mathematically related tempo every few bars.",
    category: "Time & rhythm",
  },
  {
    href: "/tempo-trainer",
    label: "Tempo Trainer",
    description:
      "A metronome that cuts out for a few bars at a time, so you can practice holding the tempo on your own.",
    category: "Time & rhythm",
  },
  {
    href: "/tuner",
    label: "Tuner",
    description: "Tune by ear or by mic with a tone generator, for strings, brass and reeds.",
    category: "On your instrument",
  },
  {
    href: "/slow-downer",
    label: "Slow Downer",
    description: "Load a song, slow it down without changing pitch and loop the tricky parts.",
    category: "Play along",
  },
  {
    href: "/recorder",
    label: "Recorder",
    description: "Record a take with an optional metronome, save it to your account and link it to a tune.",
    category: "Practice tools",
  },
  {
    href: "/random-sticking-warmup",
    label: "Random Sticking Warmup",
    short: "Sticking Warmup",
    description:
      "A drummer's warmup: a random sticking pattern paired with a roll, written out and counted in by a metronome.",
    category: "Drums",
  },
  {
    href: "/time-test",
    label: "Time Test",
    description:
      "Play along to the click on a practice pad and see how far off it every stroke was: early or late, by how much, and where.",
    category: "Drums",
  },
  {
    href: "/syncopation",
    label: "Syncopation",
    description:
      "Random 16-bar snare reading exercises — quarters, eighths, sixteenths and triplets — over a steady bass drum or hi-hat, written out and played.",
    category: "Drums",
  },
  {
    href: "/community",
    label: "Community",
    description:
      "Search public profiles for other musicians — see what they play and which tunes they know.",
    category: "Community",
  },
  {
    href: "/tunes",
    label: "Library",
    description:
      "Your library: the tunes you know and the ones you're learning, setlists, chord charts and files.",
    category: "Community",
  },
  {
    href: "/chord-charts",
    label: "Chord Charts",
    description: "Import, build, and read chord charts, styled to match the rest of the site.",
    category: "Community",
  },
  {
    href: "/lessons",
    label: "Lessons",
    description: "Teach with soniroll: a page per lesson with notes, assignments, PDFs and charts, Shed Log routines, booking, and your students' practice. Or open your teacher's link.",
    category: "Community",
  },
];

/** Tools that were folded into another: their old hrefs (still in saved Shed Log sessions and
    attachments, usage stats, favorites, recents and old links) → the tool that replaced them.
    Bass Genius and the Drum Generator became Rhythm Section (2026-11-16). */
export const RETIRED_TOOL_HREFS: Record<string, string> = {
  "/bass-genius": "/rhythm-section",
  "/drum-generator": "/rhythm-section",
};

/** A tool's current href: a retired one's replacement, else itself. */
export function currentToolHref(href: string): string {
  return RETIRED_TOOL_HREFS[href] ?? href;
}

/** Case-insensitive substring match on `label`, same rule `apps/web/components/tools.tsx`'s own
    `filterLinks` already used before this moved here — kept generic over the link shape so both
    apps can call it with their own richer type (web's includes an `icon`, mobile's doesn't). */
/** Extra words people search with that aren't in a tool's name or description. */
const SEARCH_WORDS: Record<string, string> = {
  "/metronome": "bpm click tempo beat time signature",
  "/tuner": "pitch intonation a440",
  "/guess-the-interval": "ear",
  "/guess-the-chord": "ear quality",
  "/guess-the-progression": "ear changes ii v i",
  "/find-the-root": "ear root",
  "/slow-downer": "transcribe slow down speed loop",
  "/practice-timer": "pomodoro countdown",
  "/rhythm-section": "backing band bass drums play along",
  "/tunes": "library tunes setlists charts files recordings",
};

/** The tools a search matches: every word has to appear somewhere in the tool's name, its short
    sidebar name, its category, its description or its extra search words, in any order ("guess
    interval", "ear", "bpm"). Matches in the name come first. */
export function filterNavLinks<T extends { label: string; href?: string; short?: string; category?: string; description?: string }>(links: T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return links;
  const scored: { link: T; score: number; i: number }[] = [];
  links.forEach((link, i) => {
    const name = `${link.label} ${link.short ?? ""}`.toLowerCase();
    const rest = `${link.category ?? ""} ${link.description ?? ""} ${(link.href && SEARCH_WORDS[link.href]) ?? ""}`.toLowerCase();
    // In the name a word can match anywhere; elsewhere only at the start of a word ("ear" shouldn't
    // find every description that says "hear").
    const inRest = (w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(rest);
    if (!words.every((w) => name.includes(w) || inRest(w))) return;
    scored.push({ link, score: words.filter((w) => name.includes(w)).length, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((s) => s.link);
}

/** Buckets a (possibly filtered) list of links by category, in `CATEGORIES` order. */
export function groupByCategory<T extends { category: Category }>(
  links: T[],
): { category: Category; items: T[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    items: links.filter((link) => link.category === category),
  })).filter((group) => group.items.length > 0);
}

/** `"/jam-practice"` -> `"jam-practice"` — the mobile app's own `tool/[slug]` route param, since
    Expo Router dynamic segments can't contain a literal `/` the way a web href already does. */
export function hrefToSlug(href: string): string {
  return href.replace(/^\//, "");
}

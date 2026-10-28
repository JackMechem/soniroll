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
    href: "/bass-genius",
    label: "Bass Genius",
    description: "Pick one of your chord charts and a jazz upright bass walks the changes with you.",
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
    href: "/drum-generator",
    label: "Drum Generator",
    description:
      "A drummer to play along with — jazz and Latin American grooves from Brazil, Cuba, the Caribbean and Argentina on a real kit, written out as it plays.",
    category: "Play along",
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

/** Case-insensitive substring match on `label`, same rule `apps/web/components/tools.tsx`'s own
    `filterLinks` already used before this moved here — kept generic over the link shape so both
    apps can call it with their own richer type (web's includes an `icon`, mobile's doesn't). */
export function filterNavLinks<T extends { label: string }>(links: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? links.filter((link) => link.label.toLowerCase().includes(q)) : links;
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

/**
 * The dashboard's cards and how they're laid out. The layout is a list of `{ id, size }` in the
 * order they show, kept in the site settings (`dashboard`); `null` means "the default". It's edited
 * right on the dashboard (Edit), so this file is the one place that knows which cards exist, what
 * sizes each can be, and what the default looks like.
 */

export type CardSize = "small" | "medium" | "large" | "full";
export type DashboardItem = { id: string; size: CardSize };

export const SIZE_LABELS: Record<CardSize, string> = { small: "Small", medium: "Medium", large: "Large", full: "Full width" };

/** Grid classes per size: one column on phones, two from `md`, twelve from `lg` (a third, half,
    two thirds, all). Written out so Tailwind sees them. */
export const SIZE_CLASSES: Record<CardSize, string> = {
  small: "md:col-span-1 lg:col-span-4",
  medium: "md:col-span-1 lg:col-span-6",
  large: "md:col-span-2 lg:col-span-8",
  full: "md:col-span-2 lg:col-span-12",
};

export const DASHBOARD_CARDS = [
  { id: "momentum", label: "Goal and streak", hint: "Today's goal ring, your streak, this week and your hours, from the Shed Log.", sizes: ["large", "full"], feature: "shedLog" },
  { id: "today", label: "Today's practice", hint: "What's on today in the Shed Log: routines to start, tasks to tick off, the day timer.", sizes: ["medium", "large", "full"], feature: "shedLog" },
  { id: "practiceGrid", label: "Days practiced", hint: "The last few months as a grid of days, greener for more practice.", sizes: ["small", "medium", "large"], feature: "shedLog" },
  { id: "recent", label: "Pick up where you left off", hint: "The tools, tunes and charts you opened last.", sizes: ["medium", "large", "full"] },
  { id: "tuneOfDay", label: "Tune of the day", hint: "A tune from Tunes I Know, a new one each day.", sizes: ["small", "medium"] },
  { id: "favorites", label: "Favorites", hint: "Your starred tools.", sizes: ["medium", "large", "full"] },
  { id: "library", label: "Your library", hint: "How many tunes, setlists and charts you have.", sizes: ["small", "medium"] },
  { id: "setlists", label: "Setlists", hint: "Your latest setlists.", sizes: ["small", "medium"] },
  { id: "sessions", label: "Practice sessions", hint: "Your Practice Timer sessions, or the one running now.", sizes: ["small", "medium"] },
  { id: "weakSpots", label: "Ear training weak spots", hint: "The intervals, chords and progressions you miss most.", sizes: ["small", "medium"] },
  { id: "earPath", label: "Ear training path", hint: "How far you are in each ear trainer's Learn mode.", sizes: ["large", "full"] },
  { id: "allTools", label: "All tools", hint: "Every tool, by group.", sizes: ["large", "full"] },
  { id: "lessons", label: "Lessons", hint: "Your next lessons, your students or teachers, and what needs doing.", sizes: ["large", "full"], feature: "lessons" },
  { id: "support", label: "Support soniroll", hint: "The card asking for a donation.", sizes: ["medium", "large", "full"] },
] as const satisfies readonly { id: string; label: string; hint: string; sizes: readonly CardSize[]; feature?: "shedLog" | "lessons" }[];

export type DashboardCardId = (typeof DASHBOARD_CARDS)[number]["id"];
type CardDef = (typeof DASHBOARD_CARDS)[number];
const BY_ID = new Map<string, CardDef>(DASHBOARD_CARDS.map((c) => [c.id, c]));

export function cardDef(id: string): CardDef | undefined {
  return BY_ID.get(id);
}

/** A short, calm start: today's practice, where you left off, your tools. Everything else is a
    click away in Edit → Add a card. */
export const DEFAULT_LAYOUT: DashboardItem[] = [
  { id: "momentum", size: "full" },
  { id: "today", size: "large" },
  { id: "practiceGrid", size: "small" },
  { id: "recent", size: "large" },
  { id: "tuneOfDay", size: "small" },
  { id: "favorites", size: "full" },
  { id: "lessons", size: "full" },
  { id: "support", size: "full" },
];

/** The layout to show: the saved one (unknown cards dropped, sizes kept to ones the card allows),
    or the default. Before layouts existed, cards were switched off in Settings (`hiddenCards`);
    the default respects those (the old "Today's practice" covered the goal, the day and the grid). */
export function resolveLayout(saved: DashboardItem[] | null, hiddenCards: string[]): DashboardItem[] {
  if (!saved) {
    const hidden = new Set(hiddenCards);
    if (hidden.has("today")) ["momentum", "practiceGrid"].forEach((id) => hidden.add(id));
    return DEFAULT_LAYOUT.filter((c) => !hidden.has(c.id));
  }
  const seen = new Set<string>();
  const out: DashboardItem[] = [];
  for (const item of saved) {
    const def = BY_ID.get(item.id);
    if (!def || seen.has(item.id)) continue;
    seen.add(item.id);
    const sizes: readonly CardSize[] = def.sizes;
    out.push({ id: item.id, size: sizes.includes(item.size) ? item.size : defaultSize(item.id) });
  }
  return out;
}

/** The size a card gets when it's added: its size in the default layout, or the smallest it allows. */
export function defaultSize(id: string): CardSize {
  return DEFAULT_LAYOUT.find((c) => c.id === id)?.size ?? BY_ID.get(id)?.sizes[0] ?? "medium";
}

/** The next size a card allows, wrapping round. */
export function nextSize(id: string, size: CardSize): CardSize {
  const sizes: readonly CardSize[] = BY_ID.get(id)?.sizes ?? [size];
  return sizes[(sizes.indexOf(size) + 1) % sizes.length];
}

/** `items` with `id` moved to just before (or after) `targetId`. */
export function moveItem(items: DashboardItem[], id: string, targetId: string, after: boolean): DashboardItem[] {
  if (id === targetId) return items;
  const moving = items.find((i) => i.id === id);
  if (!moving) return items;
  const rest = items.filter((i) => i.id !== id);
  const at = rest.findIndex((i) => i.id === targetId);
  if (at < 0) return items;
  rest.splice(after ? at + 1 : at, 0, moving);
  return rest;
}

/** `items` with `id` moved one place earlier (-1) or later (+1). */
export function shiftItem(items: DashboardItem[], id: string, by: -1 | 1): DashboardItem[] {
  const from = items.findIndex((i) => i.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const out = [...items];
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

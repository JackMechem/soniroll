/**
 * Shed Notes: the pure parts shared by the web editor and the Convex functions — wikilinks
 * (`[[Title]]`, `[[Title|shown text]]`, `[[Title#Heading]]`), how titles compare, rewriting links
 * when a note is renamed, a plain-text snippet for lists, and the "link targets" that tie a note to
 * a day, a routine on a day, or a tune.
 */

export const MAX_TITLE = 200;
/** Characters in one note (Convex documents top out at 1 MiB). */
export const MAX_BODY = 200_000;

/** How titles compare: case and outer spaces don't matter (`[[pad warmup]]` finds "Pad Warmup"). */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A title made safe to store: one line, no `[ ] | #` (they'd break a `[[link]]` to it), capped. */
export function cleanTitle(title: string): string {
  return title.replace(/[\r\n]+/g, " ").replace(/[[\]|#]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
}

export const WIKILINK_RE = /\[\[([^[\]\n]+?)\]\]/g;

export type WikiLink = {
  /** The whole `[[...]]`, start and end offsets in the text. */
  from: number;
  to: number;
  /** The note it points at, as written. */
  target: string;
  /** `#Heading` part, if any. */
  heading: string | null;
  /** The `|shown text`, if any. */
  alias: string | null;
};

/** Parses one link's inside (`Title#Heading|alias`). */
export function parseLinkInner(inner: string): { target: string; heading: string | null; alias: string | null } {
  const bar = inner.indexOf("|");
  const head = bar < 0 ? inner : inner.slice(0, bar);
  const alias = bar < 0 ? null : inner.slice(bar + 1).trim() || null;
  const hash = head.indexOf("#");
  return {
    target: (hash < 0 ? head : head.slice(0, hash)).trim(),
    heading: hash < 0 ? null : head.slice(hash + 1).trim() || null,
    alias,
  };
}

/** Every `[[link]]` in a text (outside code). */
export function findWikiLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  const code = codeRanges(text);
  for (const m of text.matchAll(WIKILINK_RE)) {
    const from = m.index ?? 0;
    if (code.some(([a, b]) => from >= a && from < b)) continue;
    const parsed = parseLinkInner(m[1]);
    if (!parsed.target) continue;
    out.push({ from, to: from + m[0].length, ...parsed });
  }
  return out;
}

/** The distinct title keys a text links to — stored on the note so backlinks are a lookup. */
export function linkKeys(text: string): string[] {
  return [...new Set(findWikiLinks(text).map((l) => titleKey(l.target)))].slice(0, 500);
}

/** Rewrites `[[Old]]`, `[[Old#H]]` and `[[Old|x]]` to the new title, keeping headings and aliases. */
export function renameLinks(text: string, oldTitle: string, newTitle: string): string {
  const key = titleKey(oldTitle);
  const links = findWikiLinks(text).filter((l) => titleKey(l.target) === key);
  if (!links.length) return text;
  let out = "";
  let at = 0;
  for (const l of links) {
    out += text.slice(at, l.from) + `[[${newTitle}${l.heading ? `#${l.heading}` : ""}${l.alias ? `|${l.alias}` : ""}]]`;
    at = l.to;
  }
  return out + text.slice(at);
}

/** Fenced code blocks and inline code spans, as [from, to) ranges — links inside them don't count. */
function codeRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const fence = /^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm;
  for (const m of text.matchAll(fence)) out.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  for (const m of text.matchAll(/`[^`\n]+`/g)) out.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return out;
}

/** A line or two of plain text for lists and chips: markdown marks dropped, notation skipped. */
export function noteSnippet(text: string, max = 160): string {
  const plain = text
    .replace(/^(```|~~~)\s*(abc|music|score)[^\n]*\n[\s\S]*?^\1\s*$/gim, " ♪ ")
    .replace(/^(```|~~~)[^\n]*$/gm, " ")
    .replace(/\[\[([^[\]\n]+?)\]\]/g, (_, inner: string) => {
      const p = parseLinkInner(inner);
      return p.alias ?? p.target;
    })
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[*_~`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** `#tags` in a text (outside code and headings' own `#`). Letters, digits, `-`, `_` and `/`. */
export function findTags(text: string): string[] {
  const code = codeRanges(text);
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[\s(])#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu)) {
    const at = (m.index ?? 0) + m[1].length;
    if (code.some(([a, b]) => at >= a && at < b)) continue;
    out.add(m[2].toLowerCase());
  }
  return [...out];
}

/** A unique title among `taken` (title keys): "Untitled", "Untitled 2", ... */
export function uniqueTitle(base: string, taken: Set<string>): string {
  const clean = cleanTitle(base) || "Untitled";
  if (!taken.has(titleKey(clean))) return clean;
  for (let n = 1; ; n++) {
    const t = `${clean} - ${n}`;
    if (!taken.has(titleKey(t))) return t;
  }
}

/** A folder path made safe: "Scales / Major " → "Scales/Major". Empty = the top level. */
export function cleanFolder(folder: string): string {
  return folder
    .split("/")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("/")
    .slice(0, 300);
}

// ---------------------------------------------------------------- what a note can be linked to

/** What a note is attached to outside Shed Notes. Stored as a string so one index finds a day's
    notes and its routines' notes together (they share the `day:<date>` prefix). */
export type NoteTarget =
  | { kind: "day"; date: string }
  | { kind: "routine"; date: string; routineId: string }
  /** A routine itself (not one day of it): its page's main notes. */
  | { kind: "routineNotes"; routineId: string }
  /** A task in a routine: its page's notes. */
  | { kind: "task"; routineId: string; taskId: string }
  /** A one-off task on a day (not in a routine). */
  | { kind: "dayTask"; date: string; taskId: string }
  | { kind: "tune"; tuneId: string }
  /** Lessons with a teacher or student (a `lessonStudents` id). */
  | { kind: "lesson"; lessonId: string };

export function targetKey(t: NoteTarget): string {
  switch (t.kind) {
    case "day":
      return `day:${t.date}`;
    case "routine":
      return `day:${t.date}/routine:${t.routineId}`;
    case "routineNotes":
      return `routine:${t.routineId}`;
    case "task":
      return `routine:${t.routineId}/task:${t.taskId}`;
    case "dayTask":
      return `day:${t.date}/task:${t.taskId}`;
    case "tune":
      return `tune:${t.tuneId}`;
    case "lesson":
      return `lesson:${t.lessonId}`;
  }
}

export function parseTargetKey(key: string): NoteTarget | null {
  let m = /^day:(\d{4}-\d{2}-\d{2})\/routine:(.+)$/.exec(key);
  if (m) return { kind: "routine", date: m[1], routineId: m[2] };
  m = /^day:(\d{4}-\d{2}-\d{2})\/task:(.+)$/.exec(key);
  if (m) return { kind: "dayTask", date: m[1], taskId: m[2] };
  m = /^routine:([^/]+)\/task:(.+)$/.exec(key);
  if (m) return { kind: "task", routineId: m[1], taskId: m[2] };
  m = /^routine:([^/]+)$/.exec(key);
  if (m) return { kind: "routineNotes", routineId: m[1] };
  m = /^day:(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) return { kind: "day", date: m[1] };
  m = /^tune:(.+)$/.exec(key);
  if (m) return { kind: "tune", tuneId: m[1] };
  m = /^lesson:(.+)$/.exec(key);
  if (m) return { kind: "lesson", lessonId: m[1] };
  return null;
}

// ---------------------------------------------------------------- a task's notes and its recordings

/** A line that's only a recording's player (`![name](file:recording/<id>)`). */
const RECORDING_EMBED = /^!\[[^\]\n]*\]\(file:recording\/[^)\s]+\)\s*$/;

/**
 * Adds `line` (a recording's player) to a task's note under its "## Recordings" heading, at the end
 * of that section. A note without one gets "## Notes" over what's written and "## Recordings" under
 * it, and players already in the note (on lines of their own) move under "## Recordings".
 */
export function addRecordingToNote(body: string, line: string): string {
  const lines = body.replace(/\s+$/, "").split("\n");
  const at = lines.findIndex((l) => /^##\s+Recordings\s*$/i.test(l));
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
    // Before the blank lines that end the section.
    let insert = end;
    while (insert > at + 1 && !lines[insert - 1].trim()) insert--;
    lines.splice(insert, 0, line);
    return `${lines.join("\n")}\n`;
  }
  const players = lines.filter((l) => RECORDING_EMBED.test(l.trim()));
  const text = lines.filter((l) => !RECORDING_EMBED.test(l.trim()));
  while (text.length && !text[text.length - 1].trim()) text.pop();
  while (text.length && !text[0].trim()) text.shift();
  const hasNotes = text.some((l) => /^##\s+Notes\s*$/i.test(l));
  const notes = hasNotes ? text : ["## Notes", ...(text.length ? ["", ...text] : [])];
  return `${[...notes, "", "## Recordings", ...players.map((l) => l.trim()), line].join("\n")}\n`;
}

/** How a new task note starts. */
export const TASK_NOTE_START = "## Notes\n\n";

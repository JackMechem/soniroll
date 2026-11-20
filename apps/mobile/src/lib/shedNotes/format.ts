/**
 * The phone's Shed Notes formatting buttons, as plain text edits: each takes the note and the
 * selection and returns the new note and where the cursor goes. They do what the website's editor
 * commands do (`apps/web/components/shednotes/commands.ts`), so a note reads the same either way.
 * Pure: no React Native here.
 */

export type Sel = { start: number; end: number };
export type Edit = { text: string; sel: Sel };

/** Wraps the selection in `mark` (`**`, `*`, `~~`, `==`, `` ` ``), or takes it off if it's there.
    With nothing selected it puts a pair in and the cursor between them. */
export function toggleWrap(text: string, sel: Sel, mark: string): Edit {
  const n = mark.length;
  const { start, end } = sel;
  const inside = text.slice(start, end);
  if (inside.length >= 2 * n && inside.startsWith(mark) && inside.endsWith(mark)) {
    const un = inside.slice(n, inside.length - n);
    return { text: text.slice(0, start) + un + text.slice(end), sel: { start, end: start + un.length } };
  }
  if (text.slice(start - n, start) === mark && text.slice(end, end + n) === mark && start >= n) {
    return { text: text.slice(0, start - n) + inside + text.slice(end + n), sel: { start: start - n, end: end - n } };
  }
  return { text: text.slice(0, start) + mark + inside + mark + text.slice(end), sel: { start: start + n, end: end + n } };
}

/** The lines the selection touches: where the first starts and the last ends. */
function touchedLines(text: string, sel: Sel): { from: number; to: number } {
  const from = text.lastIndexOf('\n', sel.start - 1) + 1;
  const endAt = sel.end > sel.start && text[sel.end - 1] === '\n' ? sel.end - 1 : sel.end;
  const nl = text.indexOf('\n', endAt);
  return { from, to: nl < 0 ? text.length : nl };
}

/** Applies `fn` to every line the selection touches; the cursor stays on the same spot in its
    line (moved along by what was added or taken off at the start). */
export function mapLines(text: string, sel: Sel, fn: (line: string) => string): Edit {
  const { from, to } = touchedLines(text, sel);
  const lines = text.slice(from, to).split('\n');
  const next = lines.map(fn);
  const block = next.join('\n');
  const firstDelta = next[0].length - lines[0].length;
  const totalDelta = block.length - (to - from);
  const out = text.slice(0, from) + block + text.slice(to);
  if (sel.start === sel.end) {
    const at = Math.max(from, Math.min(from + next[0].length, sel.start + firstDelta));
    return { text: out, sel: { start: at, end: at } };
  }
  return { text: out, sel: { start: from, end: Math.max(from, sel.end + totalDelta) } };
}

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

/** Heading `level` (1–6) on the lines, or off again if they're already that level (0: off). */
export function setHeading(text: string, sel: Sel, level: number): Edit {
  return mapLines(text, sel, (line) => {
    const m = /^(#{1,6})\s+/.exec(line);
    const rest = m ? line.slice(m[0].length) : line;
    if (m && m[1].length === level) return rest;
    return level ? `${'#'.repeat(level)} ${rest}` : rest;
  });
}

/** Checklist items (`- [ ] `); on a line that already is one, ticks or unticks it. */
export function toggleChecklist(text: string, sel: Sel): Edit {
  return mapLines(text, sel, (line) => {
    const m = /^(\s*)[-*+]\s+\[([ xX])\]\s+/.exec(line);
    if (m) return `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${line.slice(m[0].length)}`;
    const p = LIST_PREFIX.exec(line)!;
    return `${p[1]}- [ ] ${line.slice(p[0].length)}`;
  });
}

/** Bulleted or numbered items, or a quote — on, or off if the lines already are. */
export function toggleList(text: string, sel: Sel, kind: 'bullet' | 'number' | 'quote'): Edit {
  return mapLines(text, sel, (line) => {
    if (kind === 'quote') return /^>\s?/.test(line) ? line.replace(/^>\s?/, '') : `> ${line}`;
    const p = LIST_PREFIX.exec(line)!;
    const has = kind === 'bullet' ? /^\s*[-*+]\s+(?!\[)/.test(line) : /^\s*\d+[.)]\s+/.test(line);
    return has ? p[1] + line.slice(p[0].length) : `${p[1]}${kind === 'bullet' ? '- ' : '1. '}${line.slice(p[0].length)}`;
  });
}

/** Indents the lines by two spaces (a list item one level in), or takes two off (`out`). */
export function indentLines(text: string, sel: Sel, out: boolean): Edit {
  return mapLines(text, sel, (line) => (out ? line.replace(/^( {1,2}|\t)/, '') : `  ${line}`));
}

/** `[[…]]` around the selection, the cursor before the `]]` (so a name can be typed or picked). */
export function insertWikilink(text: string, sel: Sel): Edit {
  const inside = text.slice(sel.start, sel.end);
  const at = sel.start + 2 + inside.length;
  return { text: `${text.slice(0, sel.start)}[[${inside}]]${text.slice(sel.end)}`, sel: { start: at, end: at } };
}

/** A block on lines of its own at the cursor (a table, a divider, a score, a file): after the
    current line if it has text, with a blank line before it. `select` picks part of the block to
    select afterwards (from its start); otherwise the cursor goes after it. */
export function insertBlock(text: string, sel: Sel, block: string, select?: { from: number; length: number }): Edit {
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  const nl = text.indexOf('\n', sel.start);
  const lineEnd = nl < 0 ? text.length : nl;
  const hasText = !!text.slice(lineStart, lineEnd).trim();
  const prevLine = lineStart > 0 ? text.slice(text.lastIndexOf('\n', lineStart - 2) + 1, lineStart - 1) : '';
  const pre = hasText ? '\n\n' : prevLine.trim() ? '\n' : '';
  const at = hasText ? lineEnd : lineStart;
  const insert = pre + block + '\n';
  const out = text.slice(0, at) + insert + text.slice(at);
  if (select) {
    const s = at + pre.length + select.from;
    return { text: out, sel: { start: s, end: s + select.length } };
  }
  const c = at + insert.length;
  return { text: out, sel: { start: c, end: c } };
}

export const NEW_TABLE = '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |';

export function insertTable(text: string, sel: Sel): Edit {
  return insertBlock(text, sel, NEW_TABLE, { from: 2, length: 'Column 1'.length });
}

export function insertRule(text: string, sel: Sel): Edit {
  return insertBlock(text, sel, '---');
}

/** A ```score block for a Score Writer score. */
export function insertScoreBlock(text: string, sel: Sel, scoreId: string): Edit {
  return insertBlock(text, sel, '```score\n' + scoreId + '\n```');
}

/** A file's line (`![name](file:ref)`). Brackets in the name would break it, so they go. */
export function insertFileLine(text: string, sel: Sel, name: string, ref: string): Edit {
  return insertBlock(text, sel, `![${name.replace(/[[\]|\n]/g, ' ').trim()}](file:${ref})`);
}

/**
 * After a new line is typed, carries the list on: the line before was `- thing`, `- [ ] thing` or
 * `3. thing` → this one starts `- `, `- [ ] ` or `4. `. On an empty item, the new line ends the
 * list instead (the empty item's marker goes). Null when the edit wasn't one typed new line after
 * a list item.
 */
export function continueList(prev: string, next: string, cursor?: number): Edit | null {
  if (next.length !== prev.length + 1) return null;
  let at = 0;
  while (at < prev.length && prev[at] === next[at]) at++;
  if (next[at] !== '\n' || next.slice(at + 1) !== prev.slice(at)) return null;
  // A new line typed next to another one: the cursor says which side (else the first).
  if (cursor !== undefined && cursor <= at && next[cursor] === '\n' && next.slice(cursor, at).split('').every((c) => c === '\n')) at = cursor;
  else while (at > 0 && prev[at - 1] === '\n') at--;
  const lineStart = prev.lastIndexOf('\n', at - 1) + 1;
  const line = prev.slice(lineStart, at);
  // Only at the end of the item's line (a new line typed mid-line just splits it).
  const restOfLine = prev.slice(at, prev.indexOf('\n', at) < 0 ? prev.length : prev.indexOf('\n', at));
  if (restOfLine.trim()) return null;
  const m = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+|>\s?)(.*)$/.exec(line);
  if (!m) return null;
  if (!m[5].trim()) {
    // An empty item: end the list — take its marker off and don't add a new line.
    const out = prev.slice(0, lineStart) + m[1] + prev.slice(at);
    const c = lineStart + m[1].length;
    return { text: out, sel: { start: c, end: c } };
  }
  let marker = m[2];
  if (/^[-*+]\s+\[[ xX]\]/.test(marker)) marker = `${marker[0]} [ ] `;
  else if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `;
  const insert = `\n${m[1]}${marker}`;
  const out = prev.slice(0, at) + insert + prev.slice(at);
  const c = at + insert.length;
  return { text: out, sel: { start: c, end: c } };
}

/** The `[[` being typed before the cursor: what's typed after it and where the `[[` starts. */
export function linkQueryAt(text: string, cursor: number): { query: string; from: number } | null {
  const before = text.slice(Math.max(0, cursor - 200), cursor);
  const m = /\[\[([^[\]\n|#]*)$/.exec(before);
  if (!m) return null;
  return { query: m[1], from: cursor - m[0].length };
}

/** Puts `[[title]]` in place of the `[[…` being typed (and a `]]` right after it, if there is one). */
export function completeLink(text: string, cursor: number, from: number, title: string): Edit {
  const tail = text.slice(cursor);
  const skip = tail.startsWith(']]') ? 2 : 0;
  const link = `[[${title}]]`;
  const out = text.slice(0, from) + link + tail.slice(skip);
  const c = from + link.length;
  return { text: out, sel: { start: c, end: c } };
}

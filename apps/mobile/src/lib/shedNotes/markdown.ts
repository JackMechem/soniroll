import { parseLinkInner } from '@jam-practice/core/shedNotes';

/**
 * A small markdown reader for Shed Notes on the phone — what the reading view draws as native
 * views (the website draws notes with CodeMirror's live preview, or `marked` on a note's page).
 * It covers what notes use: headings, paragraphs, bulleted / numbered / checklist items (nested by
 * indent), quotes, code blocks, divider lines, simple tables, and inside text **bold**, *italic*,
 * ~~strikethrough~~, `code`, ==highlight==, [links](https://…), bare https:// links, [[note
 * links]] and #tags. Every block knows its line in the note (from 0), so tapping it can put the
 * cursor there and ticking a checkbox can rewrite just that line. Pure: no React Native here.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'strike' | 'highlight'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'wikilink'; target: string; heading: string | null; label: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'break' };

export type ListItem = {
  line: number;
  depth: number;
  ordered: boolean;
  /** The number shown ("3."), for numbered items. */
  number: number;
  /** A checklist item: ticked or not. Null for a plain item. */
  task: boolean | null;
  inline: Inline[];
};

export type Align = 'left' | 'center' | 'right' | null;

export type Block =
  | { kind: 'heading'; level: number; inline: Inline[]; line: number; end: number }
  | { kind: 'paragraph'; inline: Inline[]; line: number; end: number }
  | { kind: 'list'; items: ListItem[]; line: number; end: number }
  | { kind: 'quote'; lines: Inline[][]; line: number; end: number }
  | { kind: 'code'; lang: string; text: string; line: number; end: number }
  | { kind: 'rule'; line: number; end: number }
  | { kind: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][]; line: number; end: number };

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s{0,3}(```|~~~)\s*([^\s`]*)/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$|^\[([ xX])\]$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const indentOf = (s: string) => s.replace(/\t/g, '  ').length;

/** The cells of a table row (`| a | b |` → ["a", "b"]); `\|` stays in the cell. */
export function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      out.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

function alignOf(cell: string): Align {
  const c = cell.trim();
  const left = c.startsWith(':');
  const right = c.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
}

/** The note's markdown as blocks. `offset` is the line the text starts on in the whole note. */
export function parseMarkdown(text: string, offset = 0): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const isBlank = (n: number) => !lines[n]?.trim();

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const close = new RegExp(`^\\s{0,3}${fence[1]}\\s*$`);
      let end = i + 1;
      while (end < lines.length && !close.test(lines[end])) end++;
      blocks.push({ kind: 'code', lang: fence[2] ?? '', text: lines.slice(i + 1, end).join('\n'), line: offset + i, end: offset + Math.min(end, lines.length - 1) });
      i = end + 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, inline: parseInline(heading[2]), line: offset + i, end: offset + i });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule', line: offset + i, end: offset + i });
      i++;
      continue;
    }

    // A table: a row with a | , then the dashes line.
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = tableCells(line);
      const align = tableCells(lines[i + 1]).map(alignOf);
      const rows: Inline[][][] = [];
      let end = i + 2;
      while (end < lines.length && lines[end].trim() && lines[end].includes('|')) {
        rows.push(tableCells(lines[end]).map(parseInline));
        end++;
      }
      blocks.push({ kind: 'table', align, header: header.map(parseInline), rows, line: offset + i, end: offset + end - 1 });
      i = end;
      continue;
    }

    if (QUOTE.test(line)) {
      const out: Inline[][] = [];
      const start = i;
      while (i < lines.length && QUOTE.test(lines[i])) {
        out.push(parseInline(QUOTE.exec(lines[i])![1]));
        i++;
      }
      blocks.push({ kind: 'quote', lines: out, line: offset + start, end: offset + i - 1 });
      continue;
    }

    if (LIST.test(line)) {
      const items: ListItem[] = [];
      const start = i;
      // Indents seen so far, deepest last, to turn spaces into a depth.
      const stack: number[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m) {
          // A line under an item, indented: more of that item's text.
          if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !FENCE.test(lines[i])) {
            const last = items[items.length - 1];
            last.inline = [...last.inline, { kind: 'break' }, ...parseInline(lines[i].trim())];
            i++;
            continue;
          }
          // A blank line between items keeps the list going.
          if (isBlank(i) && i + 1 < lines.length && LIST.test(lines[i + 1])) {
            i++;
            continue;
          }
          break;
        }
        const indent = indentOf(m[1]);
        while (stack.length && indent < stack[stack.length - 1]) stack.pop();
        if (!stack.length || indent > stack[stack.length - 1]) stack.push(indent);
        const depth = stack.length - 1;
        const ordered = /\d/.test(m[2]);
        const task = !ordered ? TASK.exec(m[3]) : null;
        items.push({
          line: offset + i,
          depth,
          ordered,
          number: ordered ? parseInt(m[2], 10) : 0,
          task: task ? (task[1] ?? task[3]) !== ' ' : null,
          inline: parseInline(task ? (task[2] ?? '') : m[3]),
        });
        i++;
      }
      blocks.push({ kind: 'list', items, line: offset + start, end: offset + i - 1 });
      continue;
    }

    // A paragraph: lines up to a blank line or the start of another kind of block.
    const start = i;
    const parts: string[] = [];
    let setext = 0;
    while (i < lines.length && lines[i].trim()) {
      const l = lines[i];
      // "Title" over a line of = or - is a heading (as on the website).
      const under = /^\s{0,3}(=+|-+)\s*$/.exec(l);
      if (i > start && under) {
        setext = under[1][0] === '=' ? 1 : 2;
        i++;
        break;
      }
      if (i > start && (FENCE.test(l) || HEADING.test(l) || QUOTE.test(l) || LIST.test(l) || RULE.test(l))) break;
      parts.push(l);
      i++;
    }
    if (setext) {
      blocks.push({ kind: 'heading', level: setext, inline: parseInline(parts.join(' ').trim()), line: offset + start, end: offset + i - 1 });
      continue;
    }
    const inline: Inline[] = [];
    parts.forEach((p, n) => {
      // Two spaces or a backslash at the end of a line break it; otherwise lines run together.
      const hard = / {2,}$/.test(p) || /\\$/.test(p);
      inline.push(...parseInline(p.replace(/\\$/, '').trim()));
      if (n < parts.length - 1) inline.push(hard ? { kind: 'break' } : { kind: 'text', text: ' ' });
    });
    blocks.push({ kind: 'paragraph', inline, line: offset + start, end: offset + i - 1 });
  }
  return blocks;
}

const PUNCT = /[\\`*_{}[\]()#+\-.!|~=<>]/;
const TAG = /^#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/u;
const URL_RE = /^(https?:\/\/|www\.)[^\s<>]*[^\s<>.,;:!?'")\]]/;

/** Where `mark` closes, from `from` on: not right after a space, with something inside. */
function closing(s: string, mark: string, from: number): number {
  let at = s.indexOf(mark, from);
  while (at >= 0) {
    if (at > from && !/\s/.test(s[at - 1]) && s[at - 1] !== '\\') return at;
    at = s.indexOf(mark, at + 1);
  }
  return -1;
}

/** The text inside a line: emphasis, code, links, [[note links]], #tags. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const push = (node: Inline) => {
    if (text) out.push({ kind: 'text', text });
    text = '';
    out.push(node);
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const rest = s.slice(i);
    const prev = i > 0 ? s[i - 1] : ' ';

    if (c === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      const run = /^`+/.exec(rest)![0];
      const end = s.indexOf(run, i + run.length);
      if (end > i) {
        push({ kind: 'code', text: s.slice(i + run.length, end).replace(/^ (.+) $/, '$1') });
        i = end + run.length;
        continue;
      }
    }
    if (rest.startsWith('[[')) {
      const m = /^\[\[([^[\]\n]+?)\]\]/.exec(rest);
      if (m) {
        const { target, heading, alias } = parseLinkInner(m[1]);
        if (target) {
          push({ kind: 'wikilink', target, heading, label: alias ?? (heading ? `${target} › ${heading}` : target) });
          i += m[0].length;
          continue;
        }
      }
    }
    if (c === '!' && s[i + 1] === '[') {
      const m = /^!\[([^\]\n]*)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/.exec(rest);
      if (m) {
        push({ kind: 'link', href: m[2], children: [{ kind: 'text', text: m[1] || 'Picture' }] });
        i += m[0].length;
        continue;
      }
    }
    if (c === '[') {
      const m = /^\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/.exec(rest);
      if (m) {
        push({ kind: 'link', href: m[2], children: parseInline(m[1]) });
        i += m[0].length;
        continue;
      }
    }
    if (c === '<') {
      const m = /^<((?:https?:\/\/|mailto:)[^\s>]+)>/.exec(rest);
      if (m) {
        push({ kind: 'link', href: m[1], children: [{ kind: 'text', text: m[1].replace(/^mailto:/, '') }] });
        i += m[0].length;
        continue;
      }
    }
    if ((c === 'h' || c === 'w') && !/[\p{L}\p{N}]/u.test(prev)) {
      const m = URL_RE.exec(rest);
      if (m) {
        push({ kind: 'link', href: m[0], children: [{ kind: 'text', text: m[0] }] });
        i += m[0].length;
        continue;
      }
    }
    if (c === '#' && /[\s(]/.test(prev)) {
      const m = TAG.exec(rest);
      if (m) {
        push({ kind: 'tag', tag: m[1] });
        i += m[0].length;
        continue;
      }
    }
    const pairs: [string, 'bold' | 'strike' | 'highlight'][] = [
      ['**', 'bold'],
      ['__', 'bold'],
      ['~~', 'strike'],
      ['==', 'highlight'],
    ];
    const pair = pairs.find(([mark]) => rest.startsWith(mark) && s[i + 2] && !/\s/.test(s[i + 2]));
    if (pair && !(pair[0] === '__' && /[\p{L}\p{N}]/u.test(prev))) {
      const end = closing(s, pair[0], i + 2);
      if (end > i + 2) {
        push({ kind: pair[1], children: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((c === '*' || c === '_') && s[i + 1] && !/\s/.test(s[i + 1]) && s[i + 1] !== c && !(c === '_' && /[\p{L}\p{N}]/u.test(prev))) {
      let end = closing(s, c, i + 1);
      // Skip a double mark (that's bold inside the italic).
      while (end > 0 && s[end + 1] === c) end = closing(s, c, end + 2);
      if (end > i + 1 && !(c === '_' && /[\p{L}\p{N}]/u.test(s[end + 1] ?? ''))) {
        push({ kind: 'italic', children: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    text += c;
    i++;
  }
  if (text) out.push({ kind: 'text', text });
  return out;
}

/** Plain text of some inline nodes (for a table column's width). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
        case 'code':
          return n.text;
        case 'wikilink':
          return n.label;
        case 'tag':
          return `#${n.tag}`;
        case 'break':
          return ' ';
        default:
          return inlineText(n.children);
      }
    })
    .join('');
}

/** The note with the checkbox on `line` (from 0) ticked or unticked. Unchanged when that line
    isn't a checklist item. */
export function toggleTaskLine(text: string, line: number): string {
  const lines = text.split('\n');
  const l = lines[line];
  if (l === undefined) return text;
  const m = /^(\s*[-*+]\s+\[)([ xX])(\].*)$/.exec(l);
  if (!m) return text;
  lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`;
  return lines.join('\n');
}

/** Where line `line` (from 0) starts in the text, and where it ends. */
export function lineRange(text: string, line: number): { from: number; to: number } {
  let from = 0;
  for (let n = 0; n < line; n++) {
    const next = text.indexOf('\n', from);
    if (next < 0) return { from: text.length, to: text.length };
    from = next + 1;
  }
  const end = text.indexOf('\n', from);
  return { from, to: end < 0 ? text.length : end };
}

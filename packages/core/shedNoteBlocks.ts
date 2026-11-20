/**
 * Shed Notes: the blocks a note's text is drawn as, beside its markdown — music (```score blocks
 * holding a Score Writer score's id, and older ```abc / ```music blocks) and files (a line that's
 * only `![name](file:<ref>)` or `![name](https://…)`). Shared by the website (its live preview, a
 * note's page and Export as PDF) and the phone's reading view.
 */

/** A line that's only an embed: the name (with an optional `|width`), then the address. */
export const EMBED_LINE = /^\s*!\[([^\]\n]*)\]\(\s*(file:[^\s)]+|https:\/\/[^\s)]+)\s*\)\s*$/;

/** "Lead sheet|300" → the name and width. */
export function parseEmbedName(raw: string): { name: string; width?: number } {
  const m = /^(.*?)\s*\|\s*(\d{2,4})\s*$/.exec(raw);
  return m ? { name: m[1], width: Number(m[2]) } : { name: raw };
}

/** An embed line's file: its ref (what follows `file:`, or the whole https address), name, width. */
export function parseEmbedLine(text: string): { ref: string; name: string; width?: number } | null {
  const m = EMBED_LINE.exec(text);
  if (!m) return null;
  const ref = m[2].startsWith("file:") ? m[2].slice(5) : m[2];
  return { ref, ...parseEmbedName(m[1]) };
}

/** The score id inside a ```score block. */
export const scoreIdOf = (body: string) => body.trim().split(/\s+/)[0] ?? "";

export type NotePart =
  | { kind: "md"; text: string }
  | { kind: "score"; id: string }
  | { kind: "abc"; abc: string }
  | { kind: "file"; ref: string; name: string; width?: number };

/** The parts with where each starts and ends in the note (line numbers, from 0; `end` is the last
    line, inclusive) — the phone's reading view puts the cursor there when a part is tapped. */
export type PlacedPart = NotePart & { line: number; end: number };

/** The note's text, split around its notation blocks and file lines (the same fences the editor
    draws). Other code blocks stay in the markdown whole, so a fence inside them isn't read as
    notation. */
export function splitNotePlaced(body: string): PlacedPart[] {
  const lines = body.split("\n");
  const parts: PlacedPart[] = [];
  let buf: string[] = [];
  let bufStart = 0;
  const flush = (next: number) => {
    if (buf.length) parts.push({ kind: "md", text: buf.join("\n"), line: bufStart, end: bufStart + buf.length - 1 });
    buf = [];
    bufStart = next;
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = /^(```|~~~)\s*(\S*)/.exec(lines[i]);
    const kind = fence ? (/^score$/i.test(fence[2]) ? "score" : /^(abc|music)$/i.test(fence[2]) ? "abc" : null) : null;
    const file = fence ? null : parseEmbedLine(lines[i]);
    if (file) {
      flush(i);
      parts.push({ kind: "file", ...file, line: i, end: i });
      bufStart = i + 1;
      continue;
    }
    if (!fence || !kind) {
      if (!buf.length) bufStart = i;
      buf.push(lines[i]);
      if (fence) {
        const close = new RegExp(`^${fence[1]}\\s*$`);
        for (i++; i < lines.length; i++) {
          buf.push(lines[i]);
          if (close.test(lines[i])) break;
        }
      }
      continue;
    }
    const close = new RegExp(`^${fence[1]}\\s*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end])) end++;
    if (end >= lines.length) {
      if (!buf.length) bufStart = i;
      buf.push(lines[i]);
      continue;
    }
    flush(i);
    const inner = lines.slice(i + 1, end).join("\n");
    parts.push(kind === "score" ? { kind: "score", id: scoreIdOf(inner), line: i, end } : { kind: "abc", abc: inner, line: i, end });
    i = end;
    bufStart = end + 1;
  }
  flush(lines.length);
  return parts;
}

/** The note's parts without their places (what the website's note page draws). */
export function splitNote(body: string): NotePart[] {
  return splitNotePlaced(body).map((p) => {
    const { line: _line, end: _end, ...part } = p;
    void _line;
    void _end;
    return part as NotePart;
  });
}

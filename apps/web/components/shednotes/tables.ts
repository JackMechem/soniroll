import { type EditorState, Prec, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType, keymap } from "@codemirror/view";
import { blockBox, unwatchBlockBox } from "./blockBox";
import { liveFacet } from "./livePreview";

/**
 * Markdown tables in Shed Notes. In live preview a table is drawn as a real table while the cursor
 * is elsewhere (click a cell to edit it there); with the cursor in it, the source shows in a fixed-
 * width font so the columns line up. Tab / Shift+Tab in a table tidies it (pads every column to
 * the same width) and moves to the next / previous cell; Tab in the last cell adds a row.
 */

type Align = "left" | "center" | "right" | null;
type Cell = { text: string; from: number; to: number };
export type Table = { from: number; to: number; header: Cell[]; aligns: Align[]; rows: Cell[][]; lineFroms: number[] };

const DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Where a line's unescaped pipes are. */
function pipesIn(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "|" && text[i - 1] !== "\\") out.push(i);
  return out;
}

/** A row's cells (between unescaped pipes; the outer pipes are optional), with where each cell's
    trimmed text sits in the document. */
function splitRow(text: string, lineFrom: number): Cell[] {
  const pipes = pipesIn(text);
  const first = text.length - text.trimStart().length;
  const last = text.trimEnd().length - 1;
  const inner = pipes.filter((p) => p !== first && p !== last);
  const start = pipes.includes(first) ? first + 1 : 0;
  const end = pipes.includes(last) && last > first ? last : text.length;
  const edges = [start - 1, ...inner, end];
  const cells: Cell[] = [];
  for (let k = 0; k < edges.length - 1; k++) {
    const a = edges[k] + 1;
    const raw = text.slice(a, edges[k + 1]);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    cells.push({ text: trimmed, from: lineFrom + a + lead, to: lineFrom + a + lead + trimmed.length });
  }
  return cells;
}

function alignOf(cell: string): Align {
  const l = cell.startsWith(":");
  const r = cell.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : null;
}

export function findTables(state: EditorState): Table[] {
  const doc = state.doc;
  const out: Table[] = [];
  let fence: string | null = null;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const f = /^(```|~~~)/.exec(line.text);
    if (f) {
      fence = fence ? (line.text.startsWith(fence) ? null : fence) : f[1];
      continue;
    }
    if (fence || n === doc.lines || !line.text.includes("|")) continue;
    const delim = doc.line(n + 1);
    if (!DELIM.test(delim.text) || !delim.text.includes("-")) continue;
    const header = splitRow(line.text, line.from);
    const aligns = splitRow(delim.text, delim.from).map((c) => alignOf(c.text));
    if (!header.length) continue;
    const rows: Cell[][] = [];
    const lineFroms = [line.from, delim.from];
    let end = delim.to;
    let k = n + 2;
    for (; k <= doc.lines; k++) {
      const row = doc.line(k);
      if (!row.text.trim() || !row.text.includes("|")) break;
      rows.push(splitRow(row.text, row.from));
      lineFroms.push(row.from);
      end = row.to;
    }
    out.push({ from: line.from, to: end, header, aligns, rows, lineFroms });
    n = k - 1;
  }
  return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A cell's markdown as HTML: bold, italic, strikethrough, code, [[links]] and [links](…). The
    text is escaped first; only these tags are added. */
function cellHtml(md: string): string {
  return escapeHtml(md.replace(/\\\|/g, "|"))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t: string, a?: string) => `<span class="cm-page-pill">${a ?? t}</span>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="cm-md-link">$1</span>');
}

class TableWidget extends WidgetType {
  constructor(readonly table: Table) {
    super();
  }
  eq(other: TableWidget) {
    const key = (t: Table) => JSON.stringify([t.header.map((c) => c.text), t.aligns, t.rows.map((r) => r.map((c) => c.text))]);
    return key(other.table) === key(this.table);
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-wrap";
    const table = document.createElement("table");
    wrap.append(table);
    const cols = Math.max(this.table.header.length, ...this.table.rows.map((r) => r.length));
    const row = (cells: Cell[], tag: "th" | "td", lineFrom: number) => {
      const tr = document.createElement("tr");
      for (let i = 0; i < cols; i++) {
        const el = document.createElement(tag);
        const cell = cells[i];
        el.innerHTML = cell ? cellHtml(cell.text) : "";
        el.dataset.pos = String(cell ? cell.from : lineFrom);
        const align = this.table.aligns[i];
        if (align) el.style.textAlign = align;
        tr.append(el);
      }
      return tr;
    };
    const thead = document.createElement("thead");
    thead.append(row(this.table.header, "th", this.table.lineFroms[0]));
    const tbody = document.createElement("tbody");
    this.table.rows.forEach((r, i) => tbody.append(row(r, "td", this.table.lineFroms[i + 2])));
    table.append(thead, tbody);
    // Clicking a cell puts the cursor in it (which shows the table's source).
    wrap.addEventListener("mousedown", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-pos]");
      if (!cell || view.state.readOnly) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: Number(cell.dataset.pos) } });
      view.focus();
    });
    return blockBox(view, wrap, "6px 0");
  }
  destroy(dom: HTMLElement) {
    unwatchBlockBox(dom);
  }
  ignoreEvent() {
    return true;
  }
}

const touches = (state: EditorState, from: number, to: number) => state.selection.ranges.some((r) => r.from <= to && r.to >= from);

function tableDecos(state: EditorState, tables: Table[]): DecorationSet {
  if (!state.facet(liveFacet)) return Decoration.none;
  const out: Range<Decoration>[] = [];
  for (const t of tables) {
    if (touches(state, t.from, t.to)) {
      for (const from of t.lineFroms) out.push(Decoration.line({ class: "cm-table-src" }).range(from));
    } else out.push(Decoration.replace({ widget: new TableWidget(t), block: true }).range(t.from, t.to));
  }
  return Decoration.set(out, true);
}

const tableField = StateField.define<{ tables: Table[]; decos: DecorationSet }>({
  create(state) {
    const tables = findTables(state);
    return { tables, decos: tableDecos(state, tables) };
  },
  update(value, tr) {
    const liveChanged = tr.startState.facet(liveFacet) !== tr.state.facet(liveFacet);
    if (!tr.docChanged && !tr.selection && !liveChanged) return value;
    const tables = tr.docChanged ? findTables(tr.state) : value.tables;
    return { tables, decos: tableDecos(tr.state, tables) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
});

// ---------------------------------------------------------------- tidying and Tab

/** The table as tidy text (every column padded to its widest cell), and where each cell's text
    starts in it: `starts[row][col]`, row 0 the header. */
export function formatTable(t: Table, extraRow = false): { text: string; starts: number[][]; lengths: number[][] } {
  const body = extraRow ? [...t.rows, []] : t.rows;
  const cols = Math.max(t.header.length, t.aligns.length, ...body.map((r) => r.length));
  const grid = [t.header, ...body].map((r) => Array.from({ length: cols }, (_, i) => r[i]?.text ?? ""));
  const widths = Array.from({ length: cols }, (_, i) => Math.max(3, ...grid.map((r) => r[i].length)));
  const lines: string[] = [];
  const starts: number[][] = [];
  let offset = 0;
  const pushRow = (cells: string[], rowIndex: number | null) => {
    let line = "|";
    const rowStarts: number[] = [];
    cells.forEach((c, i) => {
      rowStarts.push(offset + line.length + 1);
      line += ` ${c.padEnd(widths[i])} |`;
    });
    if (rowIndex !== null) starts.push(rowStarts);
    lines.push(line);
    offset += line.length + 1;
  };
  pushRow(grid[0], 0);
  pushRow(
    widths.map((w, i) => {
      const a = t.aligns[i] ?? null;
      const dashes = "-".repeat(Math.max(1, w - (a === "center" ? 2 : a ? 1 : 0)));
      return a === "center" ? `:${dashes}:` : a === "left" ? `:${dashes}` : a === "right" ? `${dashes}:` : dashes;
    }),
    null,
  );
  grid.slice(1).forEach((r, i) => pushRow(r, i + 1));
  return { text: lines.join("\n"), starts, lengths: [grid[0], ...grid.slice(1)].map((r) => r.map((c) => c.length)) };
}

/** Which cell the cursor is in: [row (0 = header), col], or null on the dashes line. */
function cellAt(state: EditorState, t: Table, pos: number): [number, number] | null {
  const lineIndex = t.lineFroms.findIndex((from, i) => pos >= from && (i === t.lineFroms.length - 1 || pos < t.lineFroms[i + 1]));
  if (lineIndex < 0 || lineIndex === 1) return null;
  const row = lineIndex === 0 ? 0 : lineIndex - 1;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const leading = /^\s*\|/.test(line.text) ? 1 : 0;
  return [row, Math.max(0, pipesIn(before).length - leading)];
}

function tableTab(dir: 1 | -1) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const pos = state.selection.main.head;
    const t = findTables(state).find((x) => pos >= x.from && pos <= x.to);
    if (!t) return false;
    const at = cellAt(state, t, pos) ?? [1, -1];
    const cols = Math.max(t.header.length, t.aligns.length, ...t.rows.map((r) => r.length));
    let [row, col] = at;
    col += dir;
    if (col >= cols) {
      col = 0;
      row++;
    } else if (col < 0) {
      col = cols - 1;
      row--;
    }
    if (row < 0) return true;
    const addRow = row > t.rows.length;
    const { text, starts, lengths } = formatTable(t, addRow);
    // The next cell's text is selected, so typing replaces it (like a spreadsheet).
    const target = t.from + (starts[row]?.[col] ?? 0);
    view.dispatch({ changes: { from: t.from, to: t.to, insert: text }, selection: { anchor: target, head: target + (lengths[row]?.[col] ?? 0) }, userEvent: "input.format", scrollIntoView: true });
    return true;
  };
}

/** The starter table the Table button and command insert. */
export const NEW_TABLE = "| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n|          |          |          |";

export const tables = [tableField, Prec.high(keymap.of([{ key: "Tab", run: tableTab(1) }, { key: "Shift-Tab", run: tableTab(-1) }]))];

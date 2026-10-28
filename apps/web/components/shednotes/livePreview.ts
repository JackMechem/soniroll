import { syntaxTree } from "@codemirror/language";
import { type EditorState, Facet, type Range, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { WIKILINK_RE, parseLinkInner, titleKey } from "@jam-practice/core/shedNotes";
import type { NoteActions } from "./commands";
import { blockBox, unwatchBlockBox } from "./blockBox";
import { addEmbed, ownerFacet, removeEmbed } from "./embedStore";
import { type FileEmbed, findFileEmbeds } from "./fileEmbedSetup";

/**
 * Obsidian-style live preview for the markdown editor: the text stays markdown, but marks hide
 * (`**`, `#`, `[[ ]]`, `> `, link URLs) wherever the cursor isn't, headings get their size, list
 * dashes become bullets, `- [ ]` becomes a checkbox you can click, `---` a rule, and ```abc
 * blocks show as notation (their source comes back while the cursor is inside). Off (`live`
 * false), it's plain source with only the link and tag colours.
 */

/** Live preview on or off. */
export const liveFacet = Facet.define<boolean, boolean>({ combine: (v) => v[0] ?? true });
/** The note titles that exist (title keys), so `[[links]]` to missing notes look different. */
export const titlesFacet = Facet.define<Set<string>, Set<string>>({ combine: (v) => v[0] ?? new Set() });
/** The page's actions (open a note, the notation dialog), read when a link is clicked. */
export const actionsFacet = Facet.define<() => NoteActions, () => NoteActions>({ combine: (v) => v[0] ?? (() => ({})) });

const touches = (state: EditorState, from: number, to: number) => state.selection.ranges.some((r) => r.from <= to && r.to >= from);
const touchesLines = (state: EditorState, from: number, to: number) => touches(state, state.doc.lineAt(from).from, state.doc.lineAt(to).to);

const hide = Decoration.replace({});

function inCode(state: EditorState, pos: number): boolean {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === "InlineCode" || n.name === "FencedCode" || n.name === "CodeBlock" || n.name === "CodeText") return true;
  }
  return false;
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-bullet";
    s.textContent = "•";
    return s;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task-box";
    box.checked = this.checked;
    box.setAttribute("aria-label", this.checked ? "Done" : "Not done");
    box.disabled = view.state.readOnly;
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      const pos = view.posAtDOM(box);
      const line = view.state.doc.lineAt(pos);
      const at = line.text.indexOf("[", pos - line.from);
      if (at < 0) return;
      const from = line.from + at + 1;
      view.dispatch({ changes: { from, to: from + 1, insert: this.checked ? " " : "x" }, userEvent: "input.toggle" });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-rule";
    return s;
  }
  /** A click right on the line puts the cursor there, like anywhere else on the line. */
  ignoreEvent() {
    return false;
  }
}

function addMarks(view: EditorView, out: Range<Decoration>[]) {
  const { state } = view;
  const live = state.facet(liveFacet);
  const titles = state.facet(titlesFacet);
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    if (live) {
      tree.iterate({
        from,
        to,
        enter: (ref) => {
          const node = ref.node;
          const name = node.name;
          if (name.startsWith("ATXHeading")) {
            const level = Number(name.slice(10)) || 1;
            out.push(Decoration.line({ class: `cm-h cm-h${level}` }).range(state.doc.lineAt(node.from).from));
            const mark = node.getChild("HeaderMark");
            if (mark && !touchesLines(state, node.from, node.to)) {
              const end = state.sliceDoc(mark.to, mark.to + 1) === " " ? mark.to + 1 : mark.to;
              out.push(hide.range(mark.from, end));
            }
            return;
          }
          switch (name) {
            case "Emphasis":
            case "StrongEmphasis":
            case "Strikethrough":
            case "InlineCode": {
              if (name === "InlineCode") out.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
              if (touches(state, node.from, node.to)) return;
              for (let c = node.firstChild; c; c = c.nextSibling) {
                if (c.name === "EmphasisMark" || c.name === "StrikethroughMark" || c.name === "CodeMark") out.push(hide.range(c.from, c.to));
              }
              return;
            }
            case "Link": {
              const marks = node.getChildren("LinkMark");
              const url = node.getChild("URL");
              if (marks.length < 2 || !url) return;
              const textFrom = marks[0].to;
              const textTo = marks[1].from;
              const href = state.sliceDoc(url.from, url.to);
              const editing = touches(state, node.from, node.to);
              // A link to a page of the site ("/tunes") is a pill, like a link to a note.
              const page = href.startsWith("/") && !editing;
              if (textTo > textFrom) {
                out.push(Decoration.mark({ class: `cm-md-link${page ? " cm-page-pill" : ""}`, attributes: { "data-url": href, ...(editing ? {} : { "data-live": "1" }) } }).range(textFrom, textTo));
              }
              if (editing) return;
              out.push(hide.range(marks[0].from, marks[0].to));
              out.push(hide.range(marks[1].from, node.to));
              return false;
            }
            case "Autolink": {
              // <https://…>
              const url = node.getChild("URL");
              if (!url) return false;
              const editing = touches(state, node.from, node.to);
              out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-url": state.sliceDoc(url.from, url.to), ...(editing ? {} : { "data-live": "1" }) } }).range(url.from, url.to));
              if (!editing) for (const m of node.getChildren("LinkMark")) out.push(hide.range(m.from, m.to));
              return false;
            }
            case "URL": {
              // A bare https://… address (GFM autolink) — a link of its own.
              if (node.parent?.name === "Link" || node.parent?.name === "Autolink" || node.parent?.name === "Image") return;
              out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-url": state.sliceDoc(node.from, node.to), "data-live": "1" } }).range(node.from, node.to));
              return;
            }
            case "Blockquote": {
              for (let pos = node.from; pos <= node.to; ) {
                const line = state.doc.lineAt(pos);
                out.push(Decoration.line({ class: "cm-quote" }).range(line.from));
                pos = line.to + 1;
              }
              return;
            }
            case "QuoteMark": {
              if (touchesLines(state, node.from, node.to)) return;
              const end = state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              out.push(hide.range(node.from, end));
              return;
            }
            case "ListMark": {
              const item = node.parent;
              const list = item?.parent;
              if (!item || list?.name !== "BulletList") return;
              const task = item.getChild("Task");
              const marker = task?.getChild("TaskMarker");
              if (marker) {
                const checked = /x/i.test(state.sliceDoc(marker.from, marker.to));
                if (checked) out.push(Decoration.line({ class: "cm-task-done" }).range(state.doc.lineAt(node.from).from));
                if (touches(state, node.from, marker.to)) return;
                out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, marker.to));
                return;
              }
              if (touches(state, node.from, node.to)) return;
              out.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
              return;
            }
            case "HorizontalRule": {
              if (touchesLines(state, node.from, node.to)) return;
              out.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
              return;
            }
            case "FencedCode": {
              const info = node.getChild("CodeInfo");
              if (info && /^(abc|music|score)$/i.test(state.sliceDoc(info.from, info.to).trim())) return false;
              for (let pos = node.from; pos <= node.to; ) {
                const line = state.doc.lineAt(pos);
                out.push(Decoration.line({ class: "cm-codeblock" }).range(line.from));
                pos = line.to + 1;
              }
              return false;
            }
          }
        },
      });
    }

    // `[[links]]`, ==highlights== and #tags, line by line (not part of the markdown grammar).
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      for (const m of line.text.matchAll(WIKILINK_RE)) {
        const start = line.from + (m.index ?? 0);
        const end = start + m[0].length;
        if (inCode(state, start)) continue;
        const { target, alias } = parseLinkInner(m[1]);
        if (!target) continue;
        const cls = `cm-wikilink${titles.has(titleKey(target)) ? "" : " cm-wikilink-missing"}`;
        const attrs = { "data-wikilink": target };
        if (live && !touches(state, start, end)) {
          const bar = m[1].indexOf("|");
          const shownFrom = alias ? start + 2 + bar + 1 : start + 2;
          out.push(hide.range(start, shownFrom));
          // Shown as a pill with a page icon (a link to a note that doesn't exist yet: dashed).
          out.push(Decoration.mark({ class: `${cls} cm-page-pill`, attributes: { ...attrs, "data-live": "1" } }).range(shownFrom, end - 2));
          out.push(hide.range(end - 2, end));
        } else {
          out.push(Decoration.mark({ class: cls, attributes: attrs }).range(start, end));
        }
      }
      for (const m of line.text.matchAll(/==([^=\n]+)==/g)) {
        const start = line.from + (m.index ?? 0);
        const end = start + m[0].length;
        if (inCode(state, start)) continue;
        out.push(Decoration.mark({ class: "cm-highlight" }).range(start, end));
        if (live && !touches(state, start, end)) {
          out.push(hide.range(start, start + 2));
          out.push(hide.range(end - 2, end));
        }
      }
      // Template blanks: {{name}}.
      for (const m of line.text.matchAll(/\{\{\s*[^{}\n]*?[^{}\s][^{}\n]*?\s*\}\}/g)) {
        const start = line.from + (m.index ?? 0);
        if (inCode(state, start)) continue;
        out.push(Decoration.mark({ class: "cm-template-var" }).range(start, start + m[0].length));
      }
      for (const m of line.text.matchAll(/(^|[\s(])(#[\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu)) {
        const start = line.from + (m.index ?? 0) + m[1].length;
        if (inCode(state, start)) continue;
        // A heading's own `# ` never matches (the tag needs a letter right after the #).
        out.push(Decoration.mark({ class: "cm-tag" }).range(start, start + m[2].length));
      }
      pos = line.to + 1;
    }
  }
}

const marksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        syntaxTree(u.startState) !== syntaxTree(u.state) ||
        u.startState.facet(liveFacet) !== u.state.facet(liveFacet) ||
        u.startState.facet(titlesFacet) !== u.state.facet(titlesFacet)
      ) {
        this.decorations = this.build(u.view);
      }
    }
    build(view: EditorView) {
      const out: Range<Decoration>[] = [];
      addMarks(view, out);
      return Decoration.set(out, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---------------------------------------------------------------- notation blocks

/** A ```score block (a Score Writer score, by id) or an ```abc one (ABC typed by hand). */
export type Block = { kind: "score" | "abc"; from: number; to: number; bodyFrom: number; body: string };

export function findBlocks(state: EditorState): Block[] {
  const out: Block[] = [];
  const doc = state.doc;
  for (let n = 1; n <= doc.lines; n++) {
    const open = doc.line(n);
    const fence = /^(```|~~~)\s*(\S*)/.exec(open.text);
    if (!fence) continue;
    let close = 0;
    for (let e = n + 1; e <= doc.lines; e++) {
      if (new RegExp(`^${fence[1]}\\s*$`).test(doc.line(e).text)) {
        close = e;
        break;
      }
    }
    if (!close) break;
    const kind = /^score$/i.test(fence[2]) ? "score" : /^(abc|music)$/i.test(fence[2]) ? "abc" : null;
    if (kind) {
      const bodyFrom = n + 1 < close ? doc.line(n + 1).from : open.to;
      const body = n + 1 < close ? doc.sliceString(doc.line(n + 1).from, doc.line(close - 1).to) : "";
      out.push({ kind, from: open.from, to: doc.line(close).to, bodyFrom, body });
    }
    n = close;
  }
  return out;
}

/** A score block's id (its first non-empty line). */
export const scoreIdOf = (body: string) => body.trim().split(/\s+/)[0] ?? "";

/** abcjs is big — loaded the first time a note shows ABC notation. */
let abcjsPromise: Promise<typeof import("abcjs")> | null = null;
export function loadAbcjs() {
  abcjsPromise ??= import("abcjs");
  return abcjsPromise;
}

/** Draws ABC into `el` (theme-coloured), with abcjs's first warning under it. */
export function renderNotation(el: HTMLElement, abc: string) {
  el.replaceChildren();
  if (!abc.trim()) {
    const p = document.createElement("p");
    p.className = "cm-abc-empty";
    p.textContent = "Empty notation";
    el.append(p);
    return;
  }
  const paper = document.createElement("div");
  paper.className = "cm-abc-paper";
  el.append(paper);
  void loadAbcjs().then((abcjs) => {
    const tunes = abcjs.renderAbc(paper, abc, { responsive: "resize", foregroundColor: "currentColor", add_classes: true, paddingleft: 0, paddingright: 0, paddingtop: 4, paddingbottom: 4 });
    const warning = tunes[0]?.warnings?.[0];
    if (warning) {
      const p = document.createElement("p");
      p.className = "cm-abc-warning";
      p.textContent = warning.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
      el.append(p);
    }
  });
}

/** Puts the cursor into a block's source (which shows it), on a plain click. */
function revealOnClick(wrap: HTMLElement, view: EditorView) {
  wrap.addEventListener("mousedown", (e) => {
    // Its own controls (buttons, a player, a PDF) work as they are.
    if ((e.target as HTMLElement).closest("button, a, audio, video, iframe, [data-note]")) return;
    e.preventDefault();
    const pos = view.posAtDOM(wrap);
    const block = findBlocks(view.state).find((b) => pos >= b.from && pos <= b.to + 1);
    const file = block ? null : findFileEmbeds(view.state).find((f) => pos >= f.from && pos <= f.to + 1);
    if (block) view.dispatch({ selection: { anchor: block.bodyFrom } });
    else if (file) view.dispatch({ selection: { anchor: file.to } });
    view.focus();
  });
}

class AbcWidget extends WidgetType {
  constructor(
    readonly abc: string,
    readonly editing: boolean,
  ) {
    super();
  }
  eq(other: AbcWidget) {
    return other.abc === this.abc && other.editing === this.editing;
  }
  get estimatedHeight() {
    return 140;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = `cm-abc${this.editing ? " cm-abc-editing" : ""}`;
    const body = document.createElement("div");
    wrap.append(body);
    renderNotation(body, this.abc);
    const box = blockBox(view, wrap, this.editing ? "2px 0 6px" : "6px 0");
    if (!this.editing) revealOnClick(box, view);
    return box;
  }
  destroy(dom: HTMLElement) {
    unwatchBlockBox(dom);
  }
  ignoreEvent() {
    return true;
  }
}

/** A Score Writer score: an empty box the note's editor renders the score into (`embedStore`). */
class ScoreWidget extends WidgetType {
  constructor(
    readonly scoreId: string,
    readonly editing: boolean,
  ) {
    super();
  }
  eq(other: ScoreWidget) {
    return other.scoreId === this.scoreId && other.editing === this.editing;
  }
  get estimatedHeight() {
    return 220;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = `cm-score${this.editing ? " cm-abc-editing" : ""}`;
    addEmbed({ el: wrap, kind: "score", id: this.scoreId, view, owner: view.state.facet(ownerFacet) });
    const box = blockBox(view, wrap, this.editing ? "2px 0 6px" : "6px 0");
    if (!this.editing) revealOnClick(box, view);
    return box;
  }
  destroy(dom: HTMLElement) {
    removeEmbed(dom.firstElementChild as HTMLElement);
    unwatchBlockBox(dom);
  }
  ignoreEvent() {
    return true;
  }
}

/** A file in the note (`![name](file:…)` on a line of its own): an empty box the note's editor
    renders the file into (`FileEmbeds`). */
class FileWidget extends WidgetType {
  constructor(
    readonly ref: string,
    readonly name: string,
    readonly width: number | undefined,
    readonly editing: boolean,
  ) {
    super();
  }
  eq(other: FileWidget) {
    return other.ref === this.ref && other.name === this.name && other.width === this.width && other.editing === this.editing;
  }
  get estimatedHeight() {
    return 240;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = `cm-file${this.editing ? " cm-file-editing" : ""}`;
    addEmbed({ el: wrap, kind: "file", id: this.ref, name: this.name, width: this.width, view, owner: view.state.facet(ownerFacet) });
    const box = blockBox(view, wrap, this.editing ? "2px 0 6px" : "6px 0");
    if (!this.editing) revealOnClick(box, view);
    return box;
  }
  destroy(dom: HTMLElement) {
    removeEmbed(dom.firstElementChild as HTMLElement);
    unwatchBlockBox(dom);
  }
  ignoreEvent() {
    return true;
  }
}

function notationDecos(state: EditorState, blocks: Block[], files: FileEmbed[]): DecorationSet {
  if (!state.facet(liveFacet)) return Decoration.none;
  const out: Range<Decoration>[] = [];
  for (const f of files) {
    const editing = touches(state, f.from, f.to);
    const widget = new FileWidget(f.ref, f.name, f.width, editing);
    if (editing) out.push(Decoration.widget({ widget, block: true, side: 1 }).range(f.to));
    else out.push(Decoration.replace({ widget, block: true }).range(f.from, f.to));
  }
  for (const b of blocks) {
    const editing = touches(state, b.from, b.to);
    const widget = b.kind === "score" ? new ScoreWidget(scoreIdOf(b.body), editing) : new AbcWidget(b.body, editing);
    if (editing) out.push(Decoration.widget({ widget, block: true, side: 1 }).range(b.to));
    else out.push(Decoration.replace({ widget, block: true }).range(b.from, b.to));
  }
  return Decoration.set(out, true);
}

const notationField = StateField.define<{ blocks: Block[]; files: FileEmbed[]; decos: DecorationSet }>({
  create(state) {
    const blocks = findBlocks(state);
    const files = findFileEmbeds(state);
    return { blocks, files, decos: notationDecos(state, blocks, files) };
  },
  update(value, tr) {
    const liveChanged = tr.startState.facet(liveFacet) !== tr.state.facet(liveFacet);
    if (!tr.docChanged && !tr.selection && !liveChanged) return value;
    const blocks = tr.docChanged ? findBlocks(tr.state) : value.blocks;
    const files = tr.docChanged ? findFileEmbeds(tr.state) : value.files;
    return { blocks, files, decos: notationDecos(tr.state, blocks, files) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
});

/** Opens a link's address: the web in a new tab, a page of the site in place, email/phone links
    as they are. */
export function openHref(href: string, actions: NoteActions) {
  if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
  else if (href.startsWith("/")) {
    if (actions.openPath) actions.openPath(href);
    else window.location.assign(href);
  } else if (/^(mailto|tel):/i.test(href)) window.location.assign(href);
  else if (/^www\./i.test(href)) window.open(`https://${href}`, "_blank", "noopener,noreferrer");
}

/** Clicking a link opens it — when it's showing as a link (live preview, cursor not inside it);
    Ctrl/⌘-click opens it any time (and in source mode). Clicking a link whose source is showing
    puts the cursor there instead, to edit it. */
const linkClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-wikilink], [data-url]");
    if (!el || e.button !== 0) return false;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod && !(view.state.facet(liveFacet) && el.dataset.live)) return false;
    e.preventDefault();
    const actions = view.state.facet(actionsFacet)();
    const target = el.dataset.wikilink;
    if (target) actions.openNoteByTitle?.(target, { create: true });
    else if (el.dataset.url) openHref(el.dataset.url, actions);
    return true;
  },
});

export const livePreview = [marksPlugin, notationField, linkClicks];

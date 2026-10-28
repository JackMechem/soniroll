import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { cleanTitle, titleKey } from "@jam-practice/core/shedNotes";
import { actionsFacet } from "./livePreview";
import { HighlightStyle, syntaxTree } from "@codemirror/language";
import { type Text, Facet } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Icons for the suggestion menu, as CSS masks so they take the theme's colours (DocumentIcon,
    NotePlusIcon and PlusIcon from components/tools). */
const maskIcon = (paths: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${paths}</svg>`)}")`;
const ICON_DOC = maskIcon("<path d='M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z'/><path d='M14 3v5h5M9 13h6M9 17h4'/>");
const ICON_NOTE_PLUS = maskIcon("<path d='M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z'/><path d='M14 3v5h5M12 11v6M9 14h6'/>");
const ICON_PLUS = maskIcon("<path d='M12 5v14M5 12h14'/>");


/** The editor's look, all from the theme's tokens so it follows every preset, light and dark. */
export const editorTheme = EditorView.theme({
  "&": { color: "var(--foreground)", backgroundColor: "transparent", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { padding: "12px 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 4px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--accent) 28%, transparent) !important",
  },
  ".cm-fat-cursor": { background: "color-mix(in oklab, var(--accent) 70%, transparent) !important", color: "var(--accent-foreground) !important" },
  "&:not(.cm-focused) .cm-fat-cursor": { background: "none !important", outline: "1px solid var(--accent) !important" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "color-mix(in oklab, var(--muted) 70%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid color-mix(in oklab, var(--foreground) 10%, transparent)" },
  // Vim's status: a floating pill in the bottom-left corner, not a full-width bar.
  ".cm-panels.cm-panels-bottom": { position: "absolute", left: "12px", bottom: "12px", right: "auto", zIndex: "5", backgroundColor: "transparent", border: "none" },
  ".cm-vim-panel": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "0",
    padding: "5px 12px 5px 10px",
    borderRadius: "999px",
    backgroundColor: "var(--surface)",
    border: "1px solid color-mix(in oklab, var(--foreground) 12%, transparent)",
    boxShadow: "0 6px 20px rgb(0 0 0 / 0.18)",
    fontFamily: "inherit",
    fontSize: "12px",
    lineHeight: "1.2",
  },
  ".cm-vim-panel > span[style*='flex']": { display: "none" },
  ".cm-vim-panel:has(input)": { minWidth: "min(22rem, calc(100vw - 4rem))", fontFamily: "var(--font-mono, ui-monospace), monospace" },
  ".cm-vim-panel:has(input) > span:last-child": { display: "none" },
  ".cm-vim-panel input": { flex: "1", color: "var(--foreground)", background: "transparent", outline: "none", border: "none", font: "inherit" },
  ".cm-vim-panel > span:last-child:not(:empty)": { fontFamily: "var(--font-mono, ui-monospace), monospace", color: "var(--muted)" },
  // The mode label: "--NORMAL--" hidden, a dot and a name in its place.
  ".cm-vim-mode": { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0", fontWeight: "700", cursor: "pointer" },
  ".cm-vim-mode::before": { content: "''", width: "7px", height: "7px", borderRadius: "999px", backgroundColor: "var(--muted)" },
  ".cm-vim-mode::after": { content: "'Normal'", fontSize: "12px", color: "var(--foreground)" },
  "&[data-vim-mode=normal] .cm-vim-mode::before": { backgroundColor: "var(--accent)" },
  "&[data-vim-mode=insert] .cm-vim-panel": { backgroundColor: "var(--accent)", borderColor: "transparent" },
  "&[data-vim-mode=insert] .cm-vim-mode::before": { backgroundColor: "var(--accent-foreground)" },
  "&[data-vim-mode=insert] .cm-vim-mode::after": { content: "'Insert'", color: "var(--accent-foreground)" },
  "&[data-vim-mode=visual] .cm-vim-panel": { backgroundColor: "color-mix(in oklab, var(--accent) 22%, var(--surface))" },
  "&[data-vim-mode=visual] .cm-vim-mode::before": { backgroundColor: "var(--accent)", borderRadius: "2px" },
  "&[data-vim-mode=visual] .cm-vim-mode::after": { content: "'Visual'" },
  "&[data-vim-mode=replace] .cm-vim-mode::after": { content: "'Replace'" },
  ".cm-search": { padding: "6px 10px", fontSize: "13px" },
  ".cm-search input, .cm-search button": { borderRadius: "8px" },
  ".cm-textfield": { backgroundColor: "var(--background)", border: "1px solid color-mix(in oklab, var(--foreground) 15%, transparent)", color: "var(--foreground)", padding: "2px 6px" },
  ".cm-button": { backgroundImage: "none", backgroundColor: "var(--background)", border: "1px solid color-mix(in oklab, var(--foreground) 15%, transparent)", color: "var(--foreground)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--accent) 22%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in oklab, var(--accent) 45%, transparent)" },
  ".cm-tooltip": { backgroundColor: "var(--surface)", color: "var(--foreground)", border: "1px solid color-mix(in oklab, var(--foreground) 12%, transparent)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 10px 30px rgb(0 0 0 / 0.18)" },
  // The suggestion menu: padded, rounded rows, an icon per kind, the folder as a small pill.
  ".cm-tooltip.cm-tooltip-autocomplete": { padding: "4px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "inherit", maxHeight: "18rem", minWidth: "15rem", maxWidth: "min(26rem, 90vw)", fontSize: "0.9em" },
  ".cm-tooltip-autocomplete > ul > li": { display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px !important", borderRadius: "8px", lineHeight: "1.4" },
  ".cm-tooltip-autocomplete > ul > li::before": {
    content: "''",
    flexShrink: "0",
    width: "15px",
    height: "15px",
    backgroundColor: "var(--muted)",
    mask: `${ICON_DOC} center / contain no-repeat`,
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "color-mix(in oklab, var(--accent) 18%, transparent)", color: "var(--foreground)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]::before": { backgroundColor: "var(--accent)" },
  ".cm-completionLabel": { minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "800" },
  ".cm-completionDetail": {
    marginLeft: "auto !important",
    flexShrink: "0",
    maxWidth: "45%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontStyle: "normal",
    fontSize: "11px",
    fontWeight: "500",
    color: "var(--muted)",
    backgroundColor: "color-mix(in oklab, var(--foreground) 7%, transparent)",
    padding: "1px 7px",
    borderRadius: "999px",
  },
  ".cm-completionIcon": { display: "none" },
  // Word suggestions (the wordCompletion setting): plain words, no icon.
  ".cm-tooltip-autocomplete > ul > li.cm-completion-word::before": { display: "none" },
  // "Create “…”" — the last choice when linking a note that doesn't exist yet.
  ".cm-tooltip-autocomplete > ul > li.cm-completion-create": { color: "var(--accent)", fontWeight: "600", marginTop: "2px" },
  ".cm-tooltip-autocomplete > ul > li.cm-completion-create::before": { backgroundColor: "var(--accent)", mask: `${ICON_PLUS} center / contain no-repeat` },
  // "New from “…”" — making a note from a template, at the top of the `[[` suggestions.
  ".cm-tooltip-autocomplete > ul > li.cm-completion-template": { color: "var(--accent)", fontWeight: "600" },
  ".cm-tooltip-autocomplete > ul > li.cm-completion-template::before": { backgroundColor: "var(--accent)", mask: `${ICON_NOTE_PLUS} center / contain no-repeat` },
  ".cm-tooltip-autocomplete > ul > completion-section": { display: "block", borderBottom: "none !important", padding: "6px 8px 3px", fontSize: "11px", fontWeight: "600", color: "var(--muted)", opacity: "1" },
  ".cm-tooltip-autocomplete > ul > completion-section:not(:first-child)": { marginTop: "4px", paddingTop: "8px", borderTop: "1px solid color-mix(in oklab, var(--foreground) 8%, transparent)" },
  // A template's {{blank}}.
  ".cm-template-var": { backgroundColor: "color-mix(in oklab, var(--accent) 14%, transparent)", color: "var(--accent)", borderRadius: "6px", padding: "0 2px", fontWeight: "600" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--danger)" },

  // Live preview
  ".cm-h": { fontWeight: "800", lineHeight: "1.3" },
  ".cm-h1": { fontSize: "1.75em", paddingTop: "0.4em" },
  ".cm-h2": { fontSize: "1.45em", paddingTop: "0.35em" },
  ".cm-h3": { fontSize: "1.25em", paddingTop: "0.3em" },
  ".cm-h4": { fontSize: "1.1em" },
  ".cm-h5, .cm-h6": { fontSize: "1em", color: "var(--muted)" },
  ".cm-quote": { borderLeft: "3px solid var(--accent)", paddingLeft: "14px !important", color: "var(--muted)" },
  ".cm-codeblock": { backgroundColor: "var(--background)", fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: "0.9em", padding: "0 12px !important" },
  ".cm-bullet": { color: "var(--accent)", fontWeight: "800", display: "inline-block", width: "0.9em" },
  ".cm-task-box": { width: "1em", height: "1em", verticalAlign: "-0.15em", marginRight: "0.4em", accentColor: "var(--accent)", cursor: "pointer" },
  ".cm-task-done": { color: "var(--muted)", textDecoration: "line-through" },
  ".cm-rule": { display: "inline-block", width: "100%", height: "0", borderTop: "2px solid color-mix(in oklab, var(--foreground) 15%, transparent)", verticalAlign: "middle" },
  ".cm-wikilink": { color: "var(--accent)", cursor: "pointer", textDecoration: "none" },
  ".cm-wikilink:hover": { textDecoration: "underline" },
  ".cm-wikilink-missing": { opacity: "0.65" },
  // Tables: drawn (cursor elsewhere), or their source lined up in a fixed-width font.
  ".cm-table-wrap": { overflowX: "auto", borderRadius: "12px", border: "1px solid color-mix(in oklab, var(--foreground) 12%, transparent)", cursor: "text" },
  ".cm-table-wrap table": { borderCollapse: "collapse", width: "100%", fontSize: "0.95em", lineHeight: "1.45" },
  ".cm-table-wrap th, .cm-table-wrap td": { padding: "6px 12px", textAlign: "left", verticalAlign: "top", borderTop: "1px solid color-mix(in oklab, var(--foreground) 10%, transparent)" },
  ".cm-table-wrap th + th, .cm-table-wrap td + td": { borderLeft: "1px solid color-mix(in oklab, var(--foreground) 10%, transparent)" },
  ".cm-table-wrap thead th": { borderTop: "none", fontWeight: "700", backgroundColor: "color-mix(in oklab, var(--foreground) 5%, transparent)" },
  ".cm-table-wrap tbody tr:nth-child(even) td": { backgroundColor: "color-mix(in oklab, var(--foreground) 2.5%, transparent)" },
  ".cm-table-wrap td:hover, .cm-table-wrap th:hover": { backgroundColor: "color-mix(in oklab, var(--accent) 8%, transparent)" },
  ".cm-table-wrap code": { fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: "0.9em", backgroundColor: "color-mix(in oklab, var(--foreground) 8%, transparent)", borderRadius: "4px", padding: "0 3px" },
  ".cm-table-src": { fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: "0.88em", whiteSpace: "pre" },
  // Nothing in a table's source may add width, or the pipes stop lining up.
  ".cm-table-src .cm-inline-code, .cm-table-src .cm-tag, .cm-table-src .cm-page-pill": { padding: "0", fontSize: "1em" },
  ".cm-table-src .cm-page-pill::before": { display: "none" },

  // A link to a note or to a page of the site: a rounded pill with a page icon.
  ".cm-page-pill": {
    backgroundColor: "color-mix(in oklab, var(--accent) 14%, transparent)",
    color: "var(--accent)",
    borderRadius: "999px",
    padding: "0.05em 0.6em 0.1em 0.5em",
    fontWeight: "600",
    fontSize: "0.92em",
    textDecoration: "none !important",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    transition: "background-color 120ms",
  },
  ".cm-page-pill:hover": { backgroundColor: "color-mix(in oklab, var(--accent) 24%, transparent)", textDecoration: "none" },
  ".cm-page-pill::before": {
    content: "''",
    display: "inline-block",
    width: "0.85em",
    height: "0.85em",
    marginRight: "0.3em",
    verticalAlign: "-0.1em",
    backgroundColor: "currentColor",
    WebkitMask: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 3v5h5'/%3E%3C/svg%3E") center / contain no-repeat`,
    mask: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'/%3E%3Cpath d='M14 3v5h5'/%3E%3C/svg%3E") center / contain no-repeat`,
  },
  ".cm-page-pill.cm-wikilink-missing": { backgroundColor: "transparent", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--accent) 45%, transparent)", opacity: "0.75" },
  ".cm-md-link": { color: "var(--accent)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "color-mix(in oklab, var(--accent) 45%, transparent)" },
  ".cm-inline-code": { backgroundColor: "color-mix(in oklab, var(--foreground) 8%, transparent)", borderRadius: "4px", padding: "0 3px" },
  ".cm-highlight": { backgroundColor: "color-mix(in oklab, var(--accent) 25%, transparent)", borderRadius: "3px" },
  ".cm-tag": { color: "var(--accent)", backgroundColor: "color-mix(in oklab, var(--accent) 12%, transparent)", borderRadius: "999px", padding: "0 6px" },
  ".cm-abc": { position: "relative", padding: "10px 12px", borderRadius: "14px", backgroundColor: "var(--background)", color: "var(--foreground)", cursor: "text" },
  ".cm-abc-editing": { border: "1px dashed color-mix(in oklab, var(--accent) 50%, transparent)" },
  ".cm-abc-paper svg": { maxWidth: "100%" },
  ".cm-abc-empty, .cm-abc-warning": { margin: "0", fontSize: "12px", color: "var(--muted)" },
  ".cm-score": { padding: "10px 12px", borderRadius: "14px", backgroundColor: "var(--surface)", color: "var(--foreground)", cursor: "text", whiteSpace: "normal", lineHeight: "1.4" },
  // A file in the note: drawn by FileEmbeds (React) inside this box.
  ".cm-file": { color: "var(--foreground)", cursor: "text", whiteSpace: "normal", lineHeight: "1.4" },
  ".cm-file-editing": { padding: "6px", borderRadius: "14px", border: "1px dashed color-mix(in oklab, var(--accent) 50%, transparent)" },
  ".cm-upload": { display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "12px", backgroundColor: "var(--surface)", color: "var(--muted)", fontSize: "13px", whiteSpace: "normal", lineHeight: "1.4" },
  ".cm-upload:not(.cm-upload-failed)::before": { content: '""', flex: "none", width: "8px", height: "8px", borderRadius: "999px", backgroundColor: "var(--accent)", animation: "cm-upload-pulse 1s ease-in-out infinite alternate" },
  ".cm-upload-failed": { color: "var(--danger)", backgroundColor: "color-mix(in oklab, var(--danger) 10%, transparent)" },
  ".cm-upload span": { flex: "1", minWidth: "0" },
  ".cm-upload button": { flex: "none", width: "24px", height: "24px", borderRadius: "999px", fontSize: "16px", lineHeight: "1", color: "inherit", cursor: "pointer" },
  "@keyframes cm-upload-pulse": { from: { opacity: "0.3" }, to: { opacity: "1" } },
  "@media (prefers-reduced-motion: reduce)": { ".cm-upload::before": { animation: "none" } },
});

/** Markdown (and JSON, for the settings file) colours. Marks are muted; content keeps its weight. */
export const highlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: "800" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: "var(--muted)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: "0.9em" },
  { tag: t.quote, color: "var(--muted)" },
  { tag: t.propertyName, color: "var(--accent)" },
  { tag: t.string, color: "var(--foreground)" },
  { tag: [t.number, t.bool, t.null], color: "color-mix(in oklab, var(--accent) 60%, var(--foreground))" },
  { tag: [t.brace, t.squareBracket, t.separator, t.punctuation], color: "var(--muted)" },
]);

export type NoteTitle = { title: string; folder: string };

// Templates first, then notes.
const TEMPLATES_SECTION = { name: "Templates", rank: 0 };
const NOTES_SECTION = { name: "Notes", rank: 1 };
export const noteTitlesFacet = Facet.define<NoteTitle[], NoteTitle[]>({ combine: (v) => v[0] ?? [] });

/** Typing `[[` suggests your notes' titles; picking one closes the link. When what's typed isn't a
    note yet, the last choice makes it (in the current note's folder) and links it. */
export function wikilinkCompletion(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/\[\[[^[\]\n|#]*$/);
  if (!m) return null;
  const from = m.from + 2;
  const closed = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === "]]";
  const notes = ctx.state.facet(noteTitlesFacet);
  const insert = (view: EditorView, f: number, to: number, title: string) =>
    view.dispatch({
      changes: { from: f, to: closed ? to + 2 : to, insert: `${title}]]` },
      selection: { anchor: f + title.length + 2 },
      userEvent: "input.complete",
    });
  const actions = ctx.state.facet(actionsFacet)();
  const options: Completion[] = notes.map((n) => ({
    label: n.title,
    detail: n.folder || undefined,
    section: NOTES_SECTION,
    apply: (view: EditorView, _c: Completion, f: number, to: number) => insert(view, f, to, n.title),
  }));
  // A new note from a template: what's typed picks the template. Its blanks are asked for, then
  // the note is made and linked here, in place of what was typed.
  for (const t of actions.newFromTemplate ? (actions.templates?.() ?? []) : []) {
    options.push({
      label: t.name,
      displayLabel: `New from “${t.name}”`,
      type: "template",
      section: TEMPLATES_SECTION,
      apply: (view: EditorView, _c: Completion, f: number, to: number) => {
        const start = f - 2;
        const end = closed ? to + 2 : to;
        const typedText = view.state.sliceDoc(start, end);
        actions.newFromTemplate!(t.id, (title) => {
          const link = `[[${title}]]`;
          // Still where it was? Replace it; otherwise put the link at the cursor.
          const here = view.state.sliceDoc(start, end) === typedText;
          const from = here ? start : view.state.selection.main.head;
          view.dispatch({ changes: { from, to: here ? end : from, insert: link }, selection: { anchor: from + link.length }, userEvent: "input.complete" });
          view.focus();
        });
      },
    });
  }
  const typed = cleanTitle(ctx.state.sliceDoc(from, ctx.pos));
  if (typed && actions.createLinkedNote && !notes.some((n) => titleKey(n.title) === titleKey(typed))) {
    options.push({
      label: `Create “${typed}”`,
      detail: "new note",
      type: "create",
      section: NOTES_SECTION,
      boost: -99,
      apply: (view: EditorView, _c: Completion, f: number, to: number) => {
        insert(view, f, to, typed);
        void actions.createLinkedNote!(typed);
      },
    });
  }
  // No `validFor`: the "Create" choice changes with every letter typed.
  return { from, options };
}

/** The `wordCompletion` setting: suggest words while typing. */
export const wordCompletionFacet = Facet.define<boolean, boolean>({ combine: (v) => v.some(Boolean) });

const WORD = /[\p{L}\p{M}\p{N}'’]+/gu;
const WORD_BEFORE = /\p{L}[\p{L}\p{M}\p{N}'’]*$/u;
// Where suggesting words would get in the way: code, notation, links, URLs.
const NO_WORDS = new Set(["FencedCode", "CodeBlock", "InlineCode", "CodeText", "URL", "Autolink", "LinkMark", "HTMLBlock", "HTMLTag", "Comment"]);
// The words in a text and how often each comes up, worked out once per version of the note.
const wordCache = new WeakMap<Text, Map<string, number>>();
function wordCounts(doc: Text): Map<string, number> {
  let counts = wordCache.get(doc);
  if (!counts) {
    counts = new Map();
    // Not from code or notation blocks, or links' and files' addresses.
    const prose = doc
      .toString()
      .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
      .replace(/\]\([^)\n]*\)/g, "]");
    for (const m of prose.matchAll(WORD)) if (m[0].length >= 4 && /\p{L}/u.test(m[0])) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
    wordCache.set(doc, counts);
  }
  return counts;
}

// The dictionary (public/shed-notes/words-en.txt, most common first), fetched the first time a
// suggestion is wanted and kept for the visit.
let dictionary: Promise<string[]> | null = null;
function loadDictionary(): Promise<string[]> {
  dictionary ??= fetch("/shed-notes/words-en.txt")
    .then((r) => (r.ok ? r.text() : ""))
    .then((t) => t.split("\n").filter((l) => l && !l.startsWith("#")))
    .catch(() => {
      dictionary = null; // try again next time
      return [];
    });
  return dictionary;
}

const MAX_WORDS = 4;

/** `word` in the case of what's typed: "Pra" → "Practice", "PRA" → "PRACTICE". */
function matchCase(word: string, typed: string): string {
  if (typed.length > 1 && typed === typed.toUpperCase() && typed !== typed.toLowerCase()) return word.toUpperCase();
  if (typed[0] !== typed[0].toLowerCase() && word === word.toLowerCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/**
 * Word suggestions as you type, like a phone keyboard's or a code editor's: up to four words that
 * start with what you've typed — your own words first (from this note and your note titles, the
 * ones you use most), then common English and music words. Enter or Tab fills one in. Off unless
 * the setting is on, and never inside `[[links]]`, #tags, code or notation.
 */
export async function wordCompletion(ctx: CompletionContext): Promise<CompletionResult | null> {
  if (!ctx.state.facet(wordCompletionFacet)) return null;
  const m = ctx.matchBefore(WORD_BEFORE);
  if (!m || (m.to - m.from < 2 && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, m.from - line.from);
  if (/\[\[[^\]]*$/.test(before) || before.endsWith("#")) return null;
  for (let n: { name: string; parent: unknown } | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent as typeof n) if (NO_WORDS.has(n.name)) return null;
  const typed = ctx.state.sliceDoc(m.from, m.to);
  const lower = typed.toLowerCase();

  // Yours: words in this note (not counting the one being typed) and in your note titles.
  const counts = new Map(wordCounts(ctx.state.doc));
  counts.set(typed, (counts.get(typed) ?? 1) - 1);
  for (const { title } of ctx.state.facet(noteTitlesFacet))
    for (const w of title.matchAll(WORD)) if (w[0].length >= 4) counts.set(w[0], (counts.get(w[0]) ?? 0) + 1);
  const yours = [...counts].filter(([w, n]) => n > 0 && w.length > typed.length && w.toLowerCase().startsWith(lower)).sort((a, b) => b[1] - a[1]).map(([w]) => w);

  const picked: string[] = [];
  const taken = new Set<string>();
  const add = (w: string) => {
    const k = w.toLowerCase();
    if (picked.length < MAX_WORDS && !taken.has(k)) {
      taken.add(k);
      picked.push(w);
    }
  };
  yours.forEach(add);
  if (picked.length < MAX_WORDS) {
    const words = await loadDictionary();
    if (ctx.aborted) return null;
    for (const w of words) {
      if (picked.length >= MAX_WORDS) break;
      if (w.length > lower.length && w.startsWith(lower)) add(matchCase(w, typed));
    }
  }
  if (!picked.length) return null;
  // In this order, as given (no re-sorting or fuzzy filtering); asked again on every letter.
  return { from: m.from, filter: false, options: picked.map((w) => ({ label: w, type: "word" })) };
}

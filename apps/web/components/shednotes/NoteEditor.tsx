"use client";

import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, keymap, lineNumbers, placeholder as placeholderExt } from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { titleKey } from "@jam-practice/core/shedNotes";
import { errorText, uploadFile } from "@/lib/files";
import type { ShedNotesConfig } from "@/lib/shedNotesConfig";
import { type NoteActions, runCommand } from "./commands";
import { type NoteTitle, editorTheme, highlightStyle, noteTitlesFacet, wikilinkCompletion, wordCompletion, wordCompletionFacet } from "./editorSetup";
import { actionsFacet, liveFacet, livePreview, titlesFacet } from "./livePreview";
import { tables } from "./tables";
import ScoreEmbeds, { type ScoreContext } from "./ScoreEmbeds";
import { ownerFacet } from "./embedStore";
import FileEmbeds, { FilePickDialog } from "./FileEmbeds";
import { embedText, fileActionsFacet, fileEmbeds, insertOnOwnLine, uploadIntoNote } from "./fileEmbedSetup";
import { applyVimConfig, registerVimEditor, vimMappingWait } from "./vimSetup";

/**
 * The Shed Notes editor (CodeMirror 6, the editor Obsidian is built on): markdown with live
 * preview, `[[` suggestions, notation blocks, files (paste or drop a picture: it goes to your
 * Files and shows in the note), search (Ctrl/⌘-F), and vim when the settings file turns it on. `language="json"` is the settings file itself. The text is only read when it
 * mounts — give it a `key` per note.
 */
export default function NoteEditor({
  initialText,
  language = "markdown",
  config,
  notes = [],
  actions,
  onChange,
  onView,
  autoFocus = false,
  placeholder = "",
  lint,
  className = "",
  readOnly = false,
  scoreContext,
  bottomSpace = "40vh",
  fontFamily,
  syncText,
}: {
  initialText: string;
  language?: "markdown" | "json";
  config: ShedNotesConfig;
  notes?: NoteTitle[];
  actions: NoteActions;
  onChange: (text: string) => void;
  onView?: (view: EditorView | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
  /** Extra problems to underline (the settings file's). */
  lint?: (text: string) => Diagnostic[];
  className?: string;
  /** Shown, not edited (a student reading lesson notes). */
  readOnly?: boolean;
  /** Whose scores can be shown, and through what: a lesson's notes, a shared note, a note's link. */
  scoreContext?: ScoreContext;
  /** Room below the last line (a full-height editor scrolls past the end; one in a page doesn't). */
  bottomSpace?: string;
  /** This note's font (a CSS font-family), else the site's. */
  fontFamily?: string;
  /** The text as saved, when nothing typed here is waiting to be saved: if someone else changed
      it (a shared note, another tab), the editor takes their version. */
  syncText?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const owner = useId();
  const viewRef = useRef<EditorView | null>(null);
  const actionsRef = useRef(actions);
  const onChangeRef = useRef(onChange);
  const lintRef = useRef(lint);
  const compartments = useRef<Record<"vim" | "keys" | "live" | "gutter" | "look" | "attrs" | "notes" | "words" | "files", Compartment> | null>(null);

  // Files: pasted or dropped ones go up to your Files (signed in, in a note you can write in).
  // Always online, even on the free plan: everyone who can open the note sees them.
  const { isAuthenticated } = useConvexAuth();
  const canUpload = isAuthenticated && !readOnly && language === "markdown";
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createFile = useMutation(api.files.create);
  const [picking, setPicking] = useState<EditorView | null>(null);

  useEffect(() => {
    actionsRef.current = actions;
    onChangeRef.current = onChange;
    lintRef.current = lint;
  });

  // Create once; settings changes reconfigure below.
  useEffect(() => {
    if (!host.current) return;
    const c = {
      vim: new Compartment(),
      keys: new Compartment(),
      live: new Compartment(),
      gutter: new Compartment(),
      look: new Compartment(),
      attrs: new Compartment(),
      notes: new Compartment(),
      words: new Compartment(),
      files: new Compartment(),
    };
    compartments.current = c;
    const getActions = () => actionsRef.current;
    const lang =
      language === "json"
        ? [json(), linter((view) => [...jsonParseLinter()(view), ...(lintRef.current?.(view.state.doc.toString()) ?? [])], { delay: 300 })]
        : [markdown({ base: markdownLanguage }), livePreview, tables, autocompletion({ override: [wikilinkCompletion, wordCompletion], icons: false, optionClass: (c) => (c.type ? `cm-completion-${c.type}` : "") }), actionsFacet.of(getActions), ownerFacet.of(owner), fileEmbeds];
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          // Your keybindings first and highest, so they win over vim's own keys (like Obsidian).
          c.keys.of([]),
          c.vim.of([]),
          // Tab also takes a suggestion (Enter does already); with none open it does what it did.
          Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
          c.words.of([]),
          c.files.of([]),
          history(),
          drawSelection(),
          closeBrackets(),
          search({ top: true }),
          EditorView.lineWrapping,
          editorTheme,
          syntaxHighlighting(highlightStyle),
          placeholderExt(placeholder),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, indentWithTab]),
          c.live.of([]),
          c.gutter.of([]),
          c.look.of([]),
          c.attrs.of([]),
          c.notes.of([]),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.theme({ ".cm-content": { paddingBottom: bottomSpace } }),
          ...lang,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((t) => t.annotation(Transaction.remote))) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    registerVimEditor(view, getActions);
    onView?.(view);
    if (autoFocus) view.focus();
    return () => {
      onView?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // Mount once per note (the parent keys it); the text and settings flow in through refs and
    // the compartments below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings → compartments.
  useEffect(() => {
    const view = viewRef.current;
    const c = compartments.current;
    if (!view || !c) return;
    applyVimConfig(config);
    const keys = config.keybindings.map((b) => ({
      key: b.key,
      // Keys with Ctrl/Alt/⌘ never reach the browser (Ctrl-P mustn't print); a plain or Shift key
      // that does nothing here (Shift-Enter off a link) still types as usual.
      preventDefault: /(^|-)(mod|ctrl|c|meta|cmd|m|alt|a)-/i.test(b.key),
      run: (v: EditorView) => runCommand(b.command, { view: v, actions: actionsRef.current }),
    }));
    view.dispatch({
      effects: [
        c.vim.reconfigure(config.vimMode && !readOnly ? [vimMappingWait, vim({ status: true })] : []),
        c.keys.reconfigure(Prec.highest(keymap.of(keys))),
        c.live.reconfigure(liveFacet.of(language === "markdown" && config.livePreview)),
        c.words.reconfigure(wordCompletionFacet.of(language === "markdown" && config.wordCompletion)),
        c.gutter.reconfigure(config.lineNumbers || language === "json" ? lineNumbers() : []),
        c.look.reconfigure(
          EditorView.theme({
            ".cm-content": {
              fontSize: `${config.fontSize}px`,
              ...(fontFamily && language === "markdown" ? { fontFamily } : {}),
              ...(config.readableLineLength && language === "markdown" ? { maxWidth: "46rem", marginInline: "auto", width: "100%" } : {}),
              ...(language === "json" ? { fontFamily: "var(--font-mono, ui-monospace), monospace", fontSize: `${Math.max(12, config.fontSize - 3)}px` } : {}),
            },
          }),
        ),
        c.attrs.reconfigure(
          EditorView.contentAttributes.of({
            spellcheck: config.spellcheck && language === "markdown" ? "true" : "false",
            autocorrect: language === "markdown" ? "on" : "off",
            autocapitalize: language === "markdown" ? "sentences" : "off",
          }),
        ),
      ],
    });
  }, [config, language, readOnly, fontFamily]);

  // Vim's status bar is drawn as a floating pill (styles in editorSetup.ts): the editor carries the
  // mode as data-vim-mode, and the mode label gets a class to restyle.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!config.vimMode || readOnly) {
      delete view.dom.dataset.vimMode;
      return;
    }
    type VimCM = { on: (event: string, fn: (e: { mode: string; subMode?: string }) => void) => void; state: { vimPlugin?: { statusButton?: HTMLElement } }; shedTagged?: boolean };
    const cm = getCM(view) as unknown as VimCM | null;
    if (!cm || cm.shedTagged) return;
    cm.shedTagged = true;
    view.dom.dataset.vimMode = "normal";
    cm.on("vim-mode-change", (e) => {
      view.dom.dataset.vimMode = e.mode;
    });
    const label = cm.state.vimPlugin?.statusButton;
    if (label) label.className = "cm-vim-mode";
  }, [config.vimMode, readOnly]);

  // Someone else's saved changes → this editor (only the part that changed, so the cursor stays).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || syncText === undefined) return;
    const doc = view.state.doc.toString();
    if (doc === syncText) return;
    let from = 0;
    while (from < doc.length && from < syncText.length && doc[from] === syncText[from]) from++;
    let end = 0;
    while (end < doc.length - from && end < syncText.length - from && doc[doc.length - 1 - end] === syncText[syncText.length - 1 - end]) end++;
    view.dispatch({
      changes: { from, to: doc.length - end, insert: syncText.slice(from, syncText.length - end) },
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [syncText]);

  // What the editor can do with files (none signed out or read-only).
  useEffect(() => {
    const view = viewRef.current;
    const c = compartments.current;
    if (!view || !c || language !== "markdown") return;
    const actions = canUpload
      ? {
          upload: async (file: File, name: string) => {
            try {
              return await uploadFile(file, () => generateUploadUrl({ purpose: "note" }), (args) => createFile({ ...args, keepOnline: true }), undefined, name);
            } catch (e) {
              throw new Error(errorText(e, `Couldn't upload ${name}.`));
            }
          },
          pick: (v: EditorView) => setPicking(v),
        }
      : null;
    view.dispatch({ effects: c.files.reconfigure(fileActionsFacet.of(actions)) });
  }, [canUpload, language, generateUploadUrl, createFile]);

  // The note list → link colours and `[[` suggestions.
  useEffect(() => {
    const view = viewRef.current;
    const c = compartments.current;
    if (!view || !c || language !== "markdown") return;
    view.dispatch({ effects: c.notes.reconfigure([noteTitlesFacet.of(notes), titlesFacet.of(new Set(notes.map((n) => titleKey(n.title))))]) });
  }, [notes, language]);

  return (
    <>
      <div ref={host} className={`min-h-0 ${className}`} />
      {language === "markdown" && <ScoreEmbeds owner={owner} context={scoreContext} />}
      {language === "markdown" && <FileEmbeds owner={owner} context={scoreContext} />}
      {picking && (
        <FilePickDialog
          onPick={(ref, name) => {
            const v = picking;
            setPicking(null);
            insertOnOwnLine(v, v.state.selection.main.head, embedText(name.replace(/\.\w+$/, ""), ref));
            v.focus();
          }}
          onUpload={(files) => {
            const v = picking;
            setPicking(null);
            void uploadIntoNote(v, files, v.state.selection.main.head);
            v.focus();
          }}
          onClose={() => {
            picking.focus();
            setPicking(null);
          }}
        />
      )}
    </>
  );
}

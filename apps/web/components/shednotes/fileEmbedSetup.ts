import { type EditorState, Facet, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { blockBox, unwatchBlockBox } from "./blockBox";

/**
 * Files in a note. A line that's only `![name](file:<ref>)` shows the file there (a picture, a PDF,
 * audio, video, or a card to download anything else); `<ref>` is an upload's id, or `<kind>/<id>`
 * for anything else on the Files page (a recording, a lesson file…). `![name|300](…)` sets a
 * picture's width. A plain `![…](https://…)` picture works the same way.
 *
 * Pasting or dropping files into the editor uploads them to your Files and puts them in at the
 * cursor; while one is on its way a line under the cursor says so (nothing goes into the text until
 * it's saved, so leaving mid-upload never leaves a broken line behind).
 */

/** A line that's only an embed: the name (with an optional `|width`), then the address. */
const EMBED_LINE = /^\s*!\[([^\]\n]*)\]\(\s*(file:[^\s)]+|https:\/\/[^\s)]+)\s*\)\s*$/;

export type FileEmbed = { from: number; to: number; ref: string; name: string; width?: number };

/** "Lead sheet|300" → the name and width. */
export function parseEmbedName(raw: string): { name: string; width?: number } {
  const m = /^(.*?)\s*\|\s*(\d{2,4})\s*$/.exec(raw);
  return m ? { name: m[1], width: Number(m[2]) } : { name: raw };
}

/** An embed line's file: its ref (what follows `file:`, or the whole https address), name, width. */
export function parseEmbedLine(text: string): Omit<FileEmbed, "from" | "to"> | null {
  const m = EMBED_LINE.exec(text);
  if (!m) return null;
  const ref = m[2].startsWith("file:") ? m[2].slice(5) : m[2];
  return { ref, ...parseEmbedName(m[1]) };
}

/** Every embed line in the note, outside code blocks. */
export function findFileEmbeds(state: EditorState): FileEmbed[] {
  const out: FileEmbed[] = [];
  const doc = state.doc;
  let fence: string | null = null;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const f = /^\s*(```|~~~)/.exec(line.text);
    if (fence) {
      if (f && f[1] === fence && /^\s*(```|~~~)\s*$/.test(line.text)) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (!line.text.includes("![")) continue;
    const embed = parseEmbedLine(line.text);
    if (embed) out.push({ from: line.from, to: line.to, ...embed });
  }
  return out;
}

/** The markdown for a file in a note. Brackets and bars would end the name early, so they go. */
export function embedText(name: string, ref: string) {
  const clean = name.replace(/[[\]|\n]+/g, " ").trim() || "File";
  return `![${clean}](file:${ref})`;
}

/** What the editor's page can do with files: upload one (to your Files; resolves to its ref) and
    open the "insert a file" picker. Absent where nothing can be added (signed out, read-only). */
export type FileEmbedActions = {
  upload: (file: File, name: string) => Promise<string>;
  pick: (view: EditorView) => void;
};

export const fileActionsFacet = Facet.define<FileEmbedActions | null, FileEmbedActions | null>({ combine: (v) => v[0] ?? null });

/** Puts `text` on a line of its own at `pos` (splitting the line there if it has words before it);
    the cursor, if it was there, goes to the start of the next line, so typing on doesn't join it. */
export function insertOnOwnLine(view: EditorView, pos: number, text: string) {
  const line = view.state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const insert = `${before.trim() ? "\n" : ""}${text}\n`;
  // The cursor follows only when it was where the file went (not if you've typed on elsewhere).
  const here = view.state.selection.main.empty && view.state.selection.main.head === pos;
  view.dispatch({
    changes: { from: pos, insert },
    ...(here ? { selection: { anchor: pos + insert.length } } : {}),
    userEvent: "input",
  });
}

// ---------------------------------------------------------------- uploads on their way

type Pending = { id: number; pos: number; name: string; error?: string };

const addPending = StateEffect.define<Pending>({ map: (p, change) => ({ ...p, pos: change.mapPos(p.pos, 1) }) });
const setError = StateEffect.define<{ id: number; error: string }>();
const dropPending = StateEffect.define<number>();

class PendingWidget extends WidgetType {
  constructor(readonly p: Pending) {
    super();
  }
  eq(other: PendingWidget) {
    return other.p.id === this.p.id && other.p.error === this.p.error && other.p.name === this.p.name;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = `cm-upload${this.p.error ? " cm-upload-failed" : ""}`;
    const text = document.createElement("span");
    text.textContent = this.p.error ?? `Uploading ${this.p.name} to your files…`;
    el.append(text);
    if (this.p.error) {
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.setAttribute("aria-label", "Dismiss");
      x.addEventListener("mousedown", (e) => {
        e.preventDefault();
        view.dispatch({ effects: dropPending.of(this.p.id) });
      });
      el.append(x);
    }
    return blockBox(view, el, "4px 0");
  }
  destroy(dom: HTMLElement) {
    unwatchBlockBox(dom);
  }
  ignoreEvent() {
    return true;
  }
}

const pendingField = StateField.define<Pending[]>({
  create: () => [],
  update(list, tr) {
    let next = tr.docChanged ? list.map((p) => ({ ...p, pos: tr.changes.mapPos(p.pos, 1) })) : list;
    for (const e of tr.effects) {
      if (e.is(addPending)) next = [...next, e.value];
      else if (e.is(setError)) next = next.map((p) => (p.id === e.value.id ? { ...p, error: e.value.error } : p));
      else if (e.is(dropPending)) next = next.filter((p) => p.id !== e.value);
    }
    return next;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (list): DecorationSet => {
      if (!list.length) return Decoration.none;
      return Decoration.set(
        list.map((p): Range<Decoration> => Decoration.widget({ widget: new PendingWidget(p), block: true, side: 1 }).range(p.pos)),
        true,
      );
    }),
});

let nextId = 1;

const pad = (n: number) => String(n).padStart(2, "0");

/** A pasted screenshot comes in as "image.png" — give it a name you can find on the Files page. */
export function pastedName(file: File, now = new Date()) {
  if (file.name && !/^image\.\w+$/i.test(file.name)) return file.name;
  const ext = file.name.match(/\.(\w+)$/)?.[1] ?? file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return `Pasted image ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
}

/** Uploads files and puts each in the note at `pos` once it's saved, one after another. */
export async function uploadIntoNote(view: EditorView, files: File[], pos: number) {
  const actions = view.state.facet(fileActionsFacet);
  if (!actions || !files.length) return;
  const jobs = files.map((file) => ({ file, name: pastedName(file), id: nextId++ }));
  view.dispatch({ effects: jobs.map((j) => addPending.of({ id: j.id, pos, name: j.name })) });
  for (const job of jobs) {
    try {
      const ref = await actions.upload(job.file, job.name);
      // The note was closed meanwhile: the file is in your Files, but there's no note to put it in.
      if (!view.dom.isConnected) return;
      const at = view.state.field(pendingField, false)?.find((p) => p.id === job.id)?.pos;
      view.dispatch({ effects: dropPending.of(job.id) });
      if (at !== undefined) insertOnOwnLine(view, at, embedText(job.name.replace(/\.\w+$/, ""), ref));
    } catch (e) {
      if (!view.dom.isConnected) return;
      const error = e instanceof Error && e.message.length < 200 ? e.message : `Couldn't upload ${job.name}.`;
      view.dispatch({ effects: setError.of({ id: job.id, error }) });
      setTimeout(() => {
        if (view.state.field(pendingField, false)?.some((p) => p.id === job.id)) view.dispatch({ effects: dropPending.of(job.id) });
      }, 8000);
      // Out of room: the rest won't fit either.
      if (/room|full|paused/i.test(error)) {
        view.dispatch({ effects: jobs.filter((j) => j.id > job.id).map((j) => dropPending.of(j.id)) });
        return;
      }
    }
  }
}

/** Pasting a picture (a screenshot, "Copy image") or dropping files uploads them. A paste that
    also has text (cells copied from a spreadsheet) pastes the text as usual. */
const pasteAndDrop = EditorView.domEventHandlers({
  paste(e, view) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length || !view.state.facet(fileActionsFacet)) return false;
    if (e.clipboardData?.getData("text/plain").trim()) return false;
    e.preventDefault();
    void uploadIntoNote(view, files, view.state.selection.main.head);
    return true;
  },
  drop(e, view) {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length || !view.state.facet(fileActionsFacet)) return false;
    e.preventDefault();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
    void uploadIntoNote(view, files, pos);
    return true;
  },
});

export const fileEmbeds = [pendingField, pasteAndDrop];

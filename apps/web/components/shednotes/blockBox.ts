import type { EditorView } from "@codemirror/view";

/**
 * The outer box of a block widget (a table, notation, a score, a file, an upload's line), with the
 * space above and below it as padding. CodeMirror measures a block by its border box, so a margin
 * on the widget isn't counted: every table or picture with one put the editor's idea of where the
 * lines are a few pixels further off, until clicks landed on the line below and vim's `k` skipped
 * lines or jumped far up the note.
 *
 * The box is also watched for size changes (a picture or a score that finishes loading, notation
 * drawn a moment later): CodeMirror only re-measures when it redraws, so until then its heights
 * would be just as wrong. The widget's `destroy` calls `unwatchBlockBox`.
 */
export function blockBox(view: EditorView, inner: HTMLElement, space: string): HTMLElement {
  const box = document.createElement("div");
  box.style.padding = space;
  box.append(inner);
  viewOf.set(box, view);
  resizes()?.observe(box);
  return box;
}

export function unwatchBlockBox(box: HTMLElement) {
  resizes()?.unobserve(box);
}

const viewOf = new WeakMap<Element, EditorView>();
let observer: ResizeObserver | null = null;
function resizes() {
  if (typeof ResizeObserver !== "function") return null;
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) viewOf.get(e.target)?.requestMeasure();
  });
  return observer;
}

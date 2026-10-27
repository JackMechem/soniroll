import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Dropping files on the window (Files, Slow Downer, chart import, Shed Notes). The web view
    can't be trusted with file drops: WebKitGTK currently gives the page an empty
    `dataTransfer.files` (WebKit bug 323277). So Tauri catches file drops natively (its default)
    and this turns them back into the DOM events the website already listens for —
    dragenter/dragover/dragleave while hovering, then `drop` with real `File`s read through Rust
    (`file_drop.rs`, which only serves the files of the latest drop). Drags inside the page (notes
    into folders, the Shed Log calendar) aren't file drops and never come through here. */

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  flac: "audio/flac",
  ogg: "audio/ogg",
  opus: "audio/opus",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  musicxml: "application/vnd.recordare.musicxml+xml",
  mxl: "application/vnd.recordare.musicxml",
  mid: "audio/midi",
  midi: "audio/midi",
  zip: "application/zip",
  html: "text/html",
};

const nameOf = (path: string) => path.split(/[\\/]/).pop() || "file";
const typeOf = (name: string) => MIME[name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ""] ?? "";

/** Stand-ins while hovering: right names and types, no contents yet (like a browser, which
    doesn't hand over contents before the drop either). */
function placeholderTransfer(paths: string[]): DataTransfer {
  const dt = new DataTransfer();
  for (const path of paths) dt.items.add(new File([], nameOf(path), { type: typeOf(nameOf(path)) }));
  return dt;
}

async function droppedTransfer(paths: string[]): Promise<DataTransfer> {
  const dt = new DataTransfer();
  for (const path of paths) {
    try {
      const bytes = await invoke<ArrayBuffer>("read_dropped_file", { path });
      const name = nameOf(path);
      dt.items.add(new File([bytes], name, { type: typeOf(name) }));
    } catch {
      // A folder, or a file that can't be read: leave it out, like a browser does.
    }
  }
  return dt;
}

export function installFileDrop() {
  let target: Element | null = null;
  let hovering: DataTransfer | null = null;
  let accepted = false;
  let point = { x: 0, y: 0 };

  function fire(type: string, at: Element | null, dataTransfer: DataTransfer): boolean {
    const event = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer, clientX: point.x, clientY: point.y });
    return !(at ?? document.body).dispatchEvent(event);
  }

  function moveTo(x: number, y: number) {
    point = { x, y };
    const next = document.elementFromPoint(x, y);
    if (next !== target && hovering) {
      if (target) fire("dragleave", target, hovering);
      fire("dragenter", next, hovering);
      target = next;
    }
    if (hovering) accepted = fire("dragover", target, hovering);
  }

  function reset() {
    target = null;
    hovering = null;
    accepted = false;
  }

  void getCurrentWebview().onDragDropEvent(async ({ payload }) => {
    const scale = window.devicePixelRatio || 1;
    if (payload.type === "enter") {
      hovering = placeholderTransfer(payload.paths);
      target = null;
      moveTo(payload.position.x / scale, payload.position.y / scale);
    } else if (payload.type === "over") {
      moveTo(payload.position.x / scale, payload.position.y / scale);
    } else if (payload.type === "leave") {
      if (target && hovering) fire("dragleave", target, hovering);
      reset();
    } else if (payload.type === "drop") {
      if (!hovering) hovering = placeholderTransfer(payload.paths);
      moveTo(payload.position.x / scale, payload.position.y / scale);
      const at = target;
      const wanted = accepted;
      const placeholder = hovering;
      reset();
      if (!wanted) {
        if (at) fire("dragleave", at, placeholder);
        return;
      }
      fire("drop", at, await droppedTransfer(payload.paths));
    }
  });
}

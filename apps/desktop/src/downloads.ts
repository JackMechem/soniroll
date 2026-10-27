import { invoke } from "@tauri-apps/api/core";
import { openExternal } from "./links";

/** Downloads: the website saves files with `<a download>` (exports, .ics files, progress cards,
    stored files). In the app, every such download asks where to save it with the system's Save
    dialog (Rust's `save_download`) instead of being left to the web view: WebKitGTK drops it into
    Downloads without a word, and each platform's web view does something different.

    Most of the website's download code clicks a link it made itself (`a.click()`, sometimes
    without adding it to the page) and frees the blob address straight after, so: the link's
    `click()` is caught, and the blob behind every `blob:` address is remembered for a minute after
    it's freed so it can still be read. Links people click are caught too. */

const blobs = new Map<string, Blob>();
const KEEP_AFTER_REVOKE_MS = 60_000;

async function bytesOf(url: string): Promise<Uint8Array> {
  const blob = blobs.get(url) ?? (await (await fetch(url)).blob());
  return new Uint8Array(await blob.arrayBuffer());
}

function fallbackName(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "download";
  } catch {
    return "download";
  }
}

/** Asks where to save `url` (a blob:, data: or web address) and writes it there. Resolves to the
    saved path, or null if the person cancelled. */
export async function saveDownload(url: string, name: string): Promise<string | null> {
  let bytes: Uint8Array;
  try {
    bytes = await bytesOf(url);
  } catch {
    // A file on another site that won't let the app read it: let the browser fetch it.
    if (/^https?:/i.test(url)) openExternal(url);
    return null;
  }
  return invoke<string | null>("save_download", bytes, {
    headers: { "x-file-name": encodeURIComponent(name || fallbackName(url)) },
  });
}

function save(anchor: HTMLAnchorElement) {
  saveDownload(anchor.href, anchor.download).catch((e) => console.error("Couldn't save the file", e));
}

export function installDownloads() {
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = create(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoke(url);
    if (blobs.has(url)) setTimeout(() => blobs.delete(url), KEEP_AFTER_REVOKE_MS);
  };

  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.hasAttribute("download") && this.href) save(this);
    else click.call(this);
  };

  document.addEventListener(
    "click",
    (e) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href][download]") as HTMLAnchorElement | null;
      if (!anchor || e.defaultPrevented) return;
      e.preventDefault();
      save(anchor);
    },
    true,
  );
}

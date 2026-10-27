import { invoke } from "@tauri-apps/api/core";
import { navigate } from "./router";

export const SITE_URL = "https://www.soniroll.com";

export function openExternal(url: string) {
  void invoke("open_external", { url });
}

function isExternal(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/** A page of the app (not a blob: or data: address, which share the app's origin). */
function isAppPage(href: string): boolean {
  try {
    return new URL(href, window.location.href).protocol === window.location.protocol;
  } catch {
    return false;
  }
}

/** Links to other sites (soniroll.com, GitHub, mailto:) open in the system browser, and links to
    the app's own pages open in the app, even ones meant for a new tab ("Open" in the share
    dialogs). Without this, a new-tab link to a page of the app would go to the system browser as
    `tauri://localhost/…`, which no browser can open. Rust also refuses any navigation away from
    the app (`lib.rs`); this catches new-tab links and `window.open`, which never reach that
    check. Links with `download` are left to `downloads.ts`. */
export function installExternalLinks() {
  document.addEventListener(
    "click",
    (e) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || e.defaultPrevented || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") ?? "";
      if (isExternal(href)) {
        e.preventDefault();
        openExternal(new URL(href, window.location.href).toString());
      } else if (anchor.target && anchor.target !== "_self" && isAppPage(href)) {
        e.preventDefault();
        navigate(href);
      }
    },
    true,
  );
  const originalOpen = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    if (url && isExternal(String(url))) {
      openExternal(new URL(String(url), window.location.href).toString());
      return null;
    }
    if (url && String(url) && isAppPage(String(url))) {
      navigate(String(url));
      return null;
    }
    return originalOpen(url, target, features);
  };
}

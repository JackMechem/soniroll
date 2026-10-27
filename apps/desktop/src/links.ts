import { invoke } from "@tauri-apps/api/core";

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

/** Links to other sites (soniroll.com, GitHub, mailto:) open in the system browser. Rust also
    refuses any navigation away from the app (`lib.rs`); this catches new-tab links and
    `window.open`, which never reach that check. */
export function installExternalLinks() {
  document.addEventListener(
    "click",
    (e) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || e.defaultPrevented) return;
      const href = anchor.getAttribute("href") ?? "";
      if (isExternal(href)) {
        e.preventDefault();
        openExternal(new URL(href, window.location.href).toString());
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
    return originalOpen(url, target, features);
  };
}

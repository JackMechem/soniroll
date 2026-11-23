import { paneCanGoBackFor } from "@/lib/paneContext";

/** Whether the browser's Back would stay on soniroll. A page opened straight from a bookmark or in
    a new tab has nothing behind it (or another site), and `router.back()` there leaves the site or
    lands on a blank tab. The Navigation API only lists this site's own entries, so `canGoBack` is
    exactly "there's a soniroll page behind this one"; browsers without it fall back to the
    history length. */
export function hasInAppHistory(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (window as unknown as { navigation?: { canGoBack?: unknown } }).navigation;
  if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack;
  return window.history.length > 1;
}

/** Goes back a page when there's a soniroll page to go back to, otherwise opens `fallback` (the
    page's sensible parent) in this page's place, so Back from there doesn't return here. */
export function goBackOr(router: { back: () => void; replace: (href: string) => void }, fallback: string) {
  // In a split-screen pane, "back" is the pane's own history.
  if (paneCanGoBackFor(router.back) ?? hasInAppHistory()) router.back();
  else router.replace(fallback);
}

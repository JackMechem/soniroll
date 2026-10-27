/** The address share links and copied links start with: the site's own origin, so a preview
    deployment shares preview links and localhost shares localhost links. Call it in the browser
    only (it reads `window`).

    The desktop app swaps this module for one that always returns https://www.soniroll.com
    (`apps/desktop/src/shims/siteOrigin.ts`), because its own origin (`tauri://localhost`) means
    nothing to the person a link is sent to. */
export function siteOrigin(): string {
  return window.location.origin;
}

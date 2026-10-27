import { SITE_URL } from "../links";

/** Stand-in for the website's `lib/siteOrigin`: share links and copied links always point at
    soniroll.com. The app's own origin (`tauri://localhost`, or `http://localhost:1420` in dev)
    would mean nothing to the person a link is sent to. */
export function siteOrigin(): string {
  return SITE_URL;
}

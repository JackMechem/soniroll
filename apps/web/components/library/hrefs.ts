/** Where a chord chart, and a chart folder, open. */
export const chartHref = (id: string) => `/chord-charts/view?id=${encodeURIComponent(id)}`;
export const playlistHref = (id: string) => `/chord-charts/playlist?id=${encodeURIComponent(id)}`;

/** The Library's crumbs for the header bar's trail (`PageBar`): "Library / Tunes / Setlists / …".
    Plain hrefs (no `libraryHref` import) so this file stays dependency-free. */
export const LIBRARY_CRUMB = { label: "Library", href: "/tunes" };
export const TUNES_CRUMB = { label: "Tunes", href: "/tunes" };
export const SETLISTS_CRUMB = { label: "Setlists", href: "/tunes?tab=setlists" };
export const FILES_CRUMB = { label: "Files", href: "/tunes?tab=files" };
/** The crumbs above a page inside Tunes (a tune, a folder, Setlists, Import). */
export const UNDER_TUNES = [LIBRARY_CRUMB, TUNES_CRUMB];

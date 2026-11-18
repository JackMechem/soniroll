/** One row in the sidebar (and the mobile menu): an icon and a label on a flat row, highlighted
    while it's the page you're on. Every sidebar entry — Dashboard, the Shed Log, the library,
    each tool — uses this, so they read as one list. */
export function navRowClass(active: boolean, large?: boolean) {
  return `flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 transition-colors ${large ? "h-11 text-base" : "h-8 text-sm"} ${
    active ? "bg-surface-hover font-medium text-foreground" : "text-foreground/75 hover:bg-surface-hover/60 hover:text-foreground"
  }`;
}

/** The row's icon. Give it its colour with `style={{ color }}` (a tool's category colour); the
    class only sets its size. */
export function navIconClass(large?: boolean) {
  return `${large ? "h-5 w-5" : "h-4 w-4"} shrink-0`;
}

/** The collapsed sidebar's icon-only button (its icon coloured like the full row's). */
export function navIconButtonClass(active: boolean) {
  return `mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${active ? "bg-surface-hover" : "hover:bg-surface-hover/60"}`;
}

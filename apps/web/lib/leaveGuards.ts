/**
 * Pages with unsaved work (`useLeaveGuard`) register here, so something that swaps the page out
 * without a link or Back — switching tabs (`lib/useTabs.ts`) — can ask first, with the page's own
 * "Leave without saving?" dialog.
 */

type Guard = { dirty: () => boolean; ask: (go: () => void) => void };

const guards = new Set<Guard>();

export function registerLeaveGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => guards.delete(guard);
}

/** Runs `go` now, or once the page with unsaved work says "Leave". */
export function confirmLeave(go: () => void) {
  for (const guard of guards) {
    if (guard.dirty()) {
      guard.ask(go);
      return;
    }
  }
  go();
}

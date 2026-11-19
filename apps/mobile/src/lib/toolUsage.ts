import { TOOL_USAGE_KEY, addUsage, todayKey, withLogged, withRetired, type ToolUsage } from '@jam-practice/core/toolUsage';
import { useMemo } from 'react';

import { createLiveDoc, useLiveDoc } from '@/lib/liveSynced';

/**
 * Each tool's own usage log on the phone — the website's `lib/toolUsage.ts`, same synced key
 * (`jam-practice-tool-usage`, `{ tools: { [href]: { [day]: [ms, loggedMs] } } }`), so a tool's time
 * on the phone and on the website add up in one place. The time comes from `lib/toolTime.ts`;
 * reaching the Shed Log takes the Log button (`logToolToday`), as on the website. Works signed out
 * (this phone) and in (the account).
 */

const doc = createLiveDoc(TOOL_USAGE_KEY);

function toolsOf(raw: Record<string, unknown>): ToolUsage {
  return raw.tools && typeof raw.tools === 'object' && !Array.isArray(raw.tools) ? (raw.tools as ToolUsage) : {};
}

type Change = (u: ToolUsage) => ToolUsage;
const waiting: Change[] = [];

/** Applies a change (held until the log has loaded, so it never lands on an empty default). */
function change(fn: Change) {
  if (doc.current() === null) {
    waiting.push(fn);
    return;
  }
  doc.write((raw) => ({ ...raw, tools: fn(toolsOf(raw)) }));
}

doc.subscribe(() => {
  if (doc.current() === null || !waiting.length) return;
  const list = waiting.splice(0);
  doc.write((raw) => ({ ...raw, tools: list.reduce((u, fn) => fn(u), toolsOf(raw)) }));
});

/** Adds running time to a tool's day. */
export function recordUsage(href: string, ms: number, day = todayKey()) {
  if (ms > 0) change((u) => addUsage(u, href, ms, day));
}

/** Marks a tool's day as logged into the Shed Log up to `ms`. */
export function markLogged(href: string, ms: number, day = todayKey()) {
  change((u) => withLogged(u, href, ms, day));
}

/** The stored usage (retired tools counted under the ones that replaced them), and whether it's
    loaded. `ShedLogGlobal` keeps it mounted app-wide, so it loads and syncs (and time recorded
    by `lib/toolTime.ts` lands) wherever you are. */
export function useToolUsage(): [ToolUsage, boolean] {
  const snap = useLiveDoc(doc);
  const tools = useMemo(() => withRetired(toolsOf(snap.value)), [snap.value]);
  return [tools, snap.ready];
}

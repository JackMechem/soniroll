"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useConvex, useConvexConnectionState, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { parseLayerInfo, type Layer } from "@/components/pdf/markup";
import { mergeLayers } from "@/components/pdf/merge";
import { errorText, type StoredKind } from "@/lib/files";
import { registerLeaveGuard } from "@/lib/leaveGuards";

export type SyncTarget = { fileId: Id<"files"> } | { kind: StoredKind; id: string };
type Row = { data: string; rev: number } | null | undefined;
/** The saved version this copy's changes build on. `json`: the layer as `JSON.stringify` makes it
    (what's compared, so a re-read of the same thing never counts as a change). */
type Base = { layer: Layer; json: string; rev: number };

const DRAFT_PREFIX = "jam-practice-pdf-draft:";
/** Fetch's `keepalive` (a request that outlives the page) carries at most 64 KiB. */
const KEEPALIVE_MAX = 60_000;

const draftKey = (t: SyncTarget) => DRAFT_PREFIX + ("fileId" in t ? `file:${t.fileId}` : `${t.kind}:${t.id}`);

/**
 * Keeping a PDF's markings saved without losing anything:
 *
 * - **Saves at once** when the layer changes (`local`: each finished edit; text being typed comes
 *   in after a pause), one save at a time; edits made meanwhile go in the next one.
 * - **Revisions.** Each save says which saved revision it started from (`baseRev`). If the server
 *   has moved on (another tab, another device, or this tab was offline), it refuses and sends the
 *   newer layer back; this copy's changes since its base are merged onto it (`mergeLayers`, by id)
 *   and saved again. Newer layers arriving live are merged in the same way (`rebase`), so an open
 *   editor never drops what's typed in it, nor overwrites what another one saved.
 * - **Leaving.** While anything isn't saved yet: closing or reloading the tab asks first
 *   (`beforeunload`), switching tabs in the app asks (`lib/leaveGuards.ts`, `leaveDialog`), and
 *   when the page goes away anyway (or is hidden, on a phone that may close it) what's unsaved is
 *   kept on this device as a draft and sent once more (a `keepalive` request to Convex's HTTP API
 *   when it's small enough). The draft is merged in the next time the PDF opens here, so it's
 *   harmless if the last save did land.
 *
 * `live` is the layer including the text being typed right now (for those last-moment saves).
 */
export function useLayerSync({
  target,
  enabled,
  row,
  pageCount,
  local,
  live,
  rebase,
  onDraft,
}: {
  target: SyncTarget | null;
  enabled: boolean;
  /** The saved row (`pdfMarkups.get`): undefined while loading, null when there's none yet. */
  row: Row;
  pageCount: number;
  /** This copy's layer, once it's been changed here (null before). */
  local: Layer | null;
  live: RefObject<Layer | null>;
  /** A newer saved layer arrived: merge this copy's changes since `base` onto `theirs`. */
  rebase: (base: Layer, theirs: Layer) => void;
  /** Unsaved changes from last time on this device, merged onto the saved layer. */
  onDraft: (layer: Layer) => void;
}) {
  const save = useMutation(api.pdfMarkups.save);
  const convex = useConvex();
  const token = useAuthToken();
  const connection = useConvexConnectionState();
  const [base, setBaseState] = useState<Base | null>(null);
  const baseRef = useRef<Base | null>(null);
  const setBase = (b: Base) => {
    baseRef.current = b;
    setBaseState(b);
  };
  const sending = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const localJson = useMemo(() => (local ? JSON.stringify(local) : null), [local]);
  const localJsonRef = useRef<string | null>(null);
  const handlers = useRef({ rebase, onDraft });
  const targetRef = useRef(target);
  const tokenRef = useRef(token);
  useEffect(() => {
    localJsonRef.current = localJson;
    handlers.current = { rebase, onDraft };
    targetRef.current = target;
    tokenRef.current = token;
  });

  const parse = useCallback((data: string | null | undefined) => {
    const layer = parseLayerInfo(data, pageCount).layer;
    return { layer, json: JSON.stringify(layer) };
  }, [pageCount]);

  /** A saved layer newer than our base: ours already (an echo of our own save), or someone else's
      to merge with. */
  const adopt = useCallback((layer: Layer, json: string, rev: number) => {
    const b = baseRef.current;
    if (!b || rev <= b.rev) return;
    if (json !== sending.current && json !== localJsonRef.current && json !== b.json) handlers.current.rebase(b.layer, layer);
    setBase({ layer, json, rev });
  }, []);

  // The saved row: the first one is the base; newer ones (other tabs) are merged in.
  useEffect(() => {
    if (row === undefined || !pageCount || !enabled || !target) return;
    const { layer, json } = parse(row?.data);
    const rev = row?.rev ?? 0;
    if (!baseRef.current) {
      setBase({ layer, json, rev });
      // Left unsaved here last time (closed offline, or reloaded mid-save)?
      const key = draftKey(target);
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const d = JSON.parse(raw) as { base: string; mine: string };
          const merged = mergeLayers(parse(d.base).layer, parse(d.mine).layer, layer);
          if (JSON.stringify(merged) !== json) handlers.current.onDraft(merged);
          else localStorage.removeItem(key);
        }
      } catch {
        // An unreadable draft: nothing to recover.
      }
      return;
    }
    adopt(layer, json, rev);
  }, [row, pageCount, enabled, target, parse, adopt]);

  // Saving: whenever this copy differs from its base and nothing's on its way.
  useEffect(() => {
    if (!enabled || !target || !base || localJson === null || sending.current) return;
    if (localJson === base.json) {
      clearDraft(target);
      return;
    }
    const json = localJson;
    const layer = local!;
    const from = base;
    sending.current = json;
    save({ ...target, data: json, baseRev: from.rev })
      .then((res) => {
        sending.current = null;
        setError(null);
        if (res.ok) {
          if (res.rev > (baseRef.current?.rev ?? -1)) setBase({ layer, json, rev: res.rev });
        } else {
          // Someone saved first: merge onto theirs, then (once merged) save again.
          const theirs = parse(res.data);
          adopt(theirs.layer, theirs.json, res.rev);
        }
        setTick((t) => t + 1);
      })
      .catch((e: unknown) => {
        sending.current = null;
        setError(errorText(e, "Couldn't save your markings."));
        // Try again in a while.
        setTimeout(() => setTick((t) => t + 1), 4000);
      });
  }, [enabled, target, base, localJson, local, tick, save, parse, adopt]);

  const dirtyNow = () => {
    const b = baseRef.current;
    if (!b) return false;
    const now = live.current ? JSON.stringify(live.current) : localJsonRef.current;
    return !!sending.current || (now !== null && now !== b.json);
  };

  // Leaving: ask while something's unsaved; keep it as a draft (and send it once more) if it goes.
  const [ask, setAsk] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const keep = () => {
      const t = targetRef.current;
      const b = baseRef.current;
      if (!t || !b || !dirtyNow()) return;
      const mine = live.current ? JSON.stringify(live.current) : localJsonRef.current;
      if (!mine || mine === b.json) return;
      try {
        localStorage.setItem(draftKey(t), JSON.stringify({ base: b.json, mine, rev: b.rev, at: Date.now() }));
      } catch {
        // Full or blocked storage: the save under way (and the keepalive below) are all there is.
      }
      return { t, b, mine };
    };
    const onHide = () => {
      const kept = keep();
      if (!kept || !tokenRef.current) return;
      const args = { ...kept.t, data: kept.mine, baseRev: kept.b.rev + (sending.current ? 1 : 0) };
      const body = JSON.stringify({ path: "pdfMarkups:save", args, format: "json" });
      if (body.length > KEEPALIVE_MAX) return;
      try {
        void fetch(`${convex.url}/api/mutation`, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` },
          body,
        }).catch(() => null);
      } catch {
        // The draft is still there for next time.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") keep();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyNow()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    const unguard = registerLeaveGuard({ dirty: dirtyNow, ask: (go) => setAsk(() => go) });
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      unguard();
    };
    // `dirtyNow` reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, convex, live]);

  // Closed (a pane closed, Back): what's unsaved goes now, and stays as a draft until it's in.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(
    () => () => {
      const t = targetRef.current;
      const b = baseRef.current;
      if (!t || !b || !dirtyNow()) return;
      const mine = live.current ? JSON.stringify(live.current) : localJsonRef.current;
      if (!mine || mine === b.json) return;
      try {
        localStorage.setItem(draftKey(t), JSON.stringify({ base: b.json, mine, rev: b.rev, at: Date.now() }));
      } catch {
        // See above.
      }
      if (!sending.current)
        void saveRef.current({ ...t, data: mine, baseRev: b.rev })
          .then((res) => res.ok && clearDraft(t))
          .catch(() => null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // (A save on its way counts: the base only moves once it's in.)
  const pending = enabled && !!base && localJson !== null && localJson !== base.json;
  const browserOffline = useSyncExternalStore(subscribeOnline, () => !navigator.onLine, () => false);
  const offline = browserOffline || (connection.hasEverConnected && !connection.isWebSocketConnected);
  return {
    /** Something isn't saved yet (the editor adds text being typed). */
    pending,
    offline,
    error,
    /** The saved revision's layer this copy builds on. */
    base,
    /** "Leave without saving?" when switching tabs with something unsaved. */
    askLeave: ask,
    answerLeave: (go: boolean) => {
      const run = ask;
      setAsk(null);
      if (go) run?.();
    },
    /** Whether anything isn't saved yet, right now (for Done). */
    dirtyNow,
  };
}

function clearDraft(t: SyncTarget) {
  try {
    localStorage.removeItem(draftKey(t));
  } catch {
    // Nothing to clear.
  }
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

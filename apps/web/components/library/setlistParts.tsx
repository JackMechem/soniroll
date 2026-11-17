"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TUNE_LIST_LABEL, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { tuneSummary } from "@/components/library/shared";
import { CheckIcon, PlusIcon, SearchIcon } from "@/components/tools";
import { KEY_NAMES } from "@/lib/iRealPro";
import { DEFAULT_TIME_SIGNATURE, makeId, type Tune } from "@/lib/types";
import type { SetlistOverride } from "@/lib/useSetlists";
import { displayKey, isMinorKey, setlistKey } from "@jam-practice/core/setlistKeys";
import { sortByText } from "@jam-practice/core/sortText";
import { nameId, searchStandards, standardToTune, type Standard } from "@/lib/standards";

/** Pieces of the setlist pages (`SetlistsPage`, `SetlistPage`), the web side of the mobile app's
    `app/library/setlist*.tsx` and `components/library/*`. */

export function setlistHref(id: string) {
  return `/tunes/setlist?id=${encodeURIComponent(id)}`;
}

/** A tune's key and tempo *in a setlist*: the setlist's own choice if it made one, otherwise the
    chart's key (else the tune's first key) and the tune's first tempo. */
export function playInfo(tune: Tune, override: SetlistOverride | undefined, chartKey: string | undefined) {
  const tuneKeys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const base = chartKey || tuneKeys[0] || null;
  const defaultTempo = tune.tempos.find((t) => t.enabled)?.value ?? null;
  return {
    key: setlistKey({ overrideRoot: override?.key, chartKey, tuneKeys }),
    defaultKey: base ? displayKey(base) : null,
    minor: base ? isMinorKey(base) : false,
    keyChanged: !!override?.key,
    tempo: override?.tempo ?? defaultTempo,
    defaultTempo,
    tempoChanged: override?.tempo != null,
  };
}

/** "Em · 140 BPM · 4/4" — the key/tempo in accent when the setlist changed them. */
export function PlayInfoLine({ info, timeSignature }: { info: ReturnType<typeof playInfo>; timeSignature: string }) {
  const parts: { text: string; changed: boolean }[] = [];
  if (info.key) parts.push({ text: info.key, changed: info.keyChanged });
  if (info.tempo != null) parts.push({ text: `${info.tempo} BPM`, changed: info.tempoChanged });
  if (timeSignature) parts.push({ text: timeSignature, changed: false });
  return (
    <span className="block truncate text-sm text-muted">
      {parts.map((p, i) => (
        <span key={i} className={p.changed ? "font-semibold text-accent" : undefined}>
          {i ? " · " : ""}
          {p.text}
        </span>
      ))}
    </span>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

type PickerRow = { key: string; tune: Tune; list: TuneListId } | { key: string; standard: Standard } | { key: string; newName: string };

/**
 * Pick several tunes at once — adding tunes to a setlist (or a Community post). Two sections: your
 * tunes (Tunes I Know and Tunes to Learn), then the jazz standards you don't have in either list
 * yet (search matches composer and key too). A picked standard is added to Tunes I Know on Add, so
 * the setlist can point at it — same as the app and as "Save as my setlist". The top row creates a
 * tune of your own — "Create “…”" for what's typed when nothing has that name (an empty search's
 * "Create a new tune" just focuses the box) — listed ticked under "New tunes" and made in Tunes I
 * Know on Add. Tunes already in it
 * (`exclude`) aren't offered again.
 */
export function TunePickerModal({ exclude, onAdd, onClose }: { exclude: string[]; onAdd: (tuneIds: string[]) => void; onClose: () => void }) {
  const lists = useTuneLists();
  const known = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const addToKnown = lists.tunes.setTunes;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [newNames, setNewNames] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEscape(onClose);

  const { mine, standards, fresh, canCreate } = useMemo(() => {
    const skip = new Set(exclude);
    const all: PickerRow[] = [];
    const have = new Set<string>();
    for (const [list, tunes] of [["tunes", known], ["learn", learn]] as const)
      for (const tune of tunes) {
        have.add(nameId(tune.name));
        if (!skip.has(tune.id)) all.push({ key: tune.id, tune, list });
      }
    const q = query.trim().toLowerCase();
    const mineRows = sortByText(
      q ? all.filter((r) => "tune" in r && r.tune.name.toLowerCase().includes(q)) : all,
      (r) => ("tune" in r ? r.tune.name : ""),
    );
    const standardRows: PickerRow[] = searchStandards(query)
      .filter((st) => !have.has(nameId(st.name)))
      .map((standard) => ({ key: `s:${standard.name}`, standard }));
    const typed = query.trim();
    const taken =
      !!typed &&
      (have.has(nameId(typed)) || standardRows.some((r) => "standard" in r && nameId(r.standard.name) === nameId(typed)) || newNames.some((n) => nameId(n) === nameId(typed)));
    const newRows: PickerRow[] = newNames.map((newName) => ({ key: `new:${newName}`, newName }));
    return { mine: mineRows, standards: standardRows, fresh: newRows, canCreate: !taken };
  }, [known, learn, exclude, query, newNames]);

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function createTune() {
    const name = query.trim();
    if (!name) {
      searchRef.current?.focus();
      return;
    }
    if (!newNames.some((n) => nameId(n) === nameId(name))) setNewNames((prev) => [...prev, name]);
    setPicked((prev) => (prev.includes(`new:${name}`) ? prev : [...prev, `new:${name}`]));
    setQuery("");
    searchRef.current?.focus();
  }

  function add() {
    const byKey = new Map([...fresh, ...mine, ...standards].map((r) => [r.key, r]));
    const ids: string[] = [];
    const created: Tune[] = [];
    for (const key of picked) {
      const row = byKey.get(key);
      if (!row) continue;
      if ("tune" in row) ids.push(row.tune.id);
      else if ("newName" in row) {
        const tune: Tune = { id: makeId(), name: row.newName, tempos: [], keys: [], timeSignature: DEFAULT_TIME_SIGNATURE, notes: "" };
        created.push(tune);
        ids.push(tune.id);
      } else {
        const tune = standardToTune(row.standard);
        created.push(tune);
        ids.push(tune.id);
      }
    }
    if (created.length) addToKnown((prev) => [...prev, ...created]);
    onAdd(ids);
    onClose();
  }

  const renderRow = (row: PickerRow) => {
    const on = picked.includes(row.key);
    const title = "tune" in row ? row.tune.name : "newName" in row ? row.newName : row.standard.name;
    const subtitle =
      "tune" in row
        ? [TUNE_LIST_LABEL[row.list], tuneSummary(row.tune)].filter(Boolean).join(" · ")
        : "newName" in row
          ? "New tune · added to Tunes I Know"
          : [row.standard.composer, row.standard.key, `${row.standard.bpm} BPM`, row.standard.timeSignature].filter(Boolean).join(" · ");
    return (
      <li key={row.key}>
        <button
          type="button"
          onClick={() => {
            if ("newName" in row) {
              setNewNames((prev) => prev.filter((n) => n !== row.newName));
              setPicked((prev) => prev.filter((k) => k !== row.key));
            } else toggle(row.key);
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-hover">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${on ? "bg-accent text-accent-foreground" : "border-2 border-muted"}`}>
            {on && <CheckIcon className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-muted">{subtitle}</span>
          </span>
        </button>
      </li>
    );
  };

  const header = (label: string) => <li className="px-3 pb-1 pt-3 text-xs font-medium text-muted first:pt-0">{label}</li>;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[8vh]" onClick={onClose}>
      <div role="dialog" aria-label="Add tunes" className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-base font-semibold">Add tunes</h2>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={add}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
          >
            {picked.length ? `Add ${picked.length}` : "Add"}
          </button>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input ref={searchRef} autoFocus onKeyDown={(e) => e.key === "Enter" && canCreate && query.trim() && createTune()} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your tunes and standards…" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm" />
        </label>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {canCreate && (
            <li>
              <button type="button" onClick={createTune} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-hover">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted">
                  <PlusIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{query.trim() ? `Create “${query.trim()}”` : "Create a new tune"}</span>
                  <span className="block truncate text-xs text-muted">{query.trim() ? "A tune of your own, added to Tunes I Know" : "Type its name in the search box"}</span>
                </span>
              </button>
            </li>
          )}
          {fresh.length > 0 && header("New tunes")}
          {fresh.map(renderRow)}
          {mine.length === 0 && standards.length === 0 ? (
            !canCreate && <li className="p-3 text-sm text-muted">{query.trim() ? `No tunes match “${query}”.` : "Everything is already in here."}</li>
          ) : (
            <>
              {mine.length > 0 && header("Your tunes")}
              {mine.map(renderRow)}
              {standards.length > 0 && header("Jazz standards")}
              {standards.map(renderRow)}
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

const MIN_BPM = 30;
const MAX_BPM = 400;

/** Key and tempo for one tune *in one setlist* — the 12 keys (plus "Default", the chart's/tune's
    own key) and a tempo stepper (plus "Default"). Saving never changes the tune itself. */
export function SetlistTuneDialog({
  tuneName,
  minor,
  defaultKey,
  defaultTempo,
  value,
  onSave,
  onClose,
}: {
  tuneName: string;
  minor: boolean;
  defaultKey: string | null;
  defaultTempo: number | null;
  value: SetlistOverride | undefined;
  onSave: (next: SetlistOverride | null) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState<string | undefined>(value?.key);
  const [tempo, setTempo] = useState<number | undefined>(value?.tempo);
  useEscape(onClose);
  const shownTempo = tempo ?? defaultTempo ?? 120;
  const bump = (d: number) => setTempo(Math.max(MIN_BPM, Math.min(MAX_BPM, shownTempo + d)));

  function save() {
    const next: SetlistOverride = {};
    if (key) next.key = key;
    if (tempo != null && tempo !== defaultTempo) next.tempo = tempo;
    onSave(Object.keys(next).length ? next : null);
    onClose();
  }

  const pill = (selected: boolean) => `rounded-md py-2 text-sm font-medium ${selected ? "bg-accent text-accent-foreground" : "hover:bg-surface-hover"}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-overlay p-4 pt-[8vh]" onClick={onClose}>
      <div role="dialog" aria-label={`Key and tempo for ${tuneName}`} className="flex w-full max-w-md flex-col gap-4 rounded-xl ring-1 ring-foreground/[0.06] bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{tuneName}</h2>
            <p className="text-xs text-muted">Key and tempo in this setlist only — the tune itself doesn&apos;t change.</p>
          </div>
          <button type="button" onClick={save} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover">
            Done
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Key</span>
          <button type="button" onClick={() => setKey(undefined)} className={pill(!key)}>
            Default{defaultKey ? ` (${defaultKey})` : ""}
          </button>
          <div className="grid grid-cols-4 gap-2">
            {KEY_NAMES.map((k) => (
              <button key={k} type="button" onClick={() => setKey(k)} className={pill(key === k)}>
                {k}
                {minor ? "m" : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Tempo</span>
          <div className="flex items-center gap-2">
            {[-5, -1].map((d) => (
              <button key={d} type="button" onClick={() => bump(d)} className="h-11 w-11 rounded-md bg-foreground/[0.05] font-medium hover:bg-surface-hover">
                {d}
              </button>
            ))}
            <div className="flex flex-1 flex-col items-center">
              <span className={`text-3xl font-semibold tabular-nums ${tempo != null ? "text-accent" : ""}`}>{shownTempo}</span>
              <span className="text-xs text-muted">BPM</span>
            </div>
            {[1, 5].map((d) => (
              <button key={d} type="button" onClick={() => bump(d)} className="h-11 w-11 rounded-md bg-foreground/[0.05] font-medium hover:bg-surface-hover">
                +{d}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setTempo(undefined)} className={pill(tempo == null)}>
            Default{defaultTempo ? ` (${defaultTempo} BPM)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A vertical list whose rows can be dragged to a new position by their grip (`handle`) — mouse,
 * touch or pen alike (Pointer Events + pointer capture, the same approach as the Metronome's
 * structure form chips). Rows are measured once when a drag starts; crossing into another row's
 * slot reorders live. `onReorder` gets the new order of `keys` when the drag ends.
 */
export function DraggableList({
  keys,
  renderRow,
  onReorder,
}: {
  keys: string[];
  renderRow: (key: string, index: number, handle: (node: ReactNode) => ReactNode, dragging: boolean) => ReactNode;
  onReorder: (order: string[]) => void;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<{ key: string; startY: number; slots: { top: number; height: number }[] } | null>(null);
  const shown = order ?? keys;

  function start(e: React.PointerEvent, key: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      key,
      startY: e.clientY,
      slots: keys.map((k) => {
        const r = rowRefs.current.get(k)!.getBoundingClientRect();
        return { top: r.top, height: r.height };
      }),
    };
    setOrder(keys);
    setDragKey(key);
    setOffset(0);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !order) return;
    const dy = e.clientY - d.startY;
    const origin = d.slots[keys.indexOf(d.key)];
    // Where the dragged row's centre is now, and which slot that falls in.
    const centre = origin.top + origin.height / 2 + dy;
    let to = d.slots.findIndex((s) => centre < s.top + s.height);
    if (to === -1) to = d.slots.length - 1;
    const from = order.indexOf(d.key);
    let next = order;
    if (to !== from) {
      next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, d.key);
      setOrder(next);
    }
    // Keep the row under the pointer, relative to the slot it's rendered in now.
    setOffset(origin.top + dy - d.slots[to].top);
  }

  function end() {
    if (order && drag.current && order.join("|") !== keys.join("|")) onReorder(order);
    drag.current = null;
    setOrder(null);
    setDragKey(null);
    setOffset(0);
  }

  return (
    <div>
      {shown.map((key, i) => {
        const dragging = key === dragKey;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) rowRefs.current.set(key, el);
              else rowRefs.current.delete(key);
            }}
            style={dragging ? { transform: `translateY(${offset}px)`, position: "relative", zIndex: 10 } : undefined}
            className={dragging ? "shadow-lg" : undefined}
          >
            {renderRow(
              key,
              i,
              (node) => (
                <div
                  onPointerDown={(e) => start(e, key)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  className="cursor-grab touch-none active:cursor-grabbing"
                >
                  {node}
                </div>
              ),
              dragging,
            )}
          </div>
        );
      })}
    </div>
  );
}

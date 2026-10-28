"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { HintsButton } from "@/components/CollapsiblePanel";
import Hint from "@/components/Hint";
import { CloseIcon, DragIcon, PlusIcon } from "@/components/tools";
import { HintsContext } from "@/lib/hints";
import {
  DASHBOARD_CARDS,
  SIZE_CLASSES,
  SIZE_LABELS,
  cardDef,
  defaultSize,
  moveItem,
  nextSize,
  type DashboardItem,
} from "@/lib/dashboardLayout";

type Drop = { id: string; after: boolean; wide: boolean };
type Drag = { id: string; el: HTMLElement; x0: number; y0: number; x: number; y: number; scroller: HTMLElement | null; scroll0: number };

/** The nearest element that scrolls vertically (the app shell's main area), for scrolling while
    dragging near its top or bottom edge. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * The dashboard's cards in a grid, in the order and sizes of `items`. While `editing`, every card
 * gets a frame with a handle to drag it somewhere else (or arrow keys on the handle), a size
 * button and a remove button, and an "Add a card" panel lists the cards that aren't on it.
 * `renderCard` returns null when a card has nothing to show right now: it's left out, or shown as
 * a placeholder while editing (`emptyText`).
 */
export default function DashboardGrid({
  items,
  editing,
  onChange,
  renderCard,
  available,
  emptyText,
}: {
  items: DashboardItem[];
  editing: boolean;
  onChange: (items: DashboardItem[]) => void;
  renderCard: (item: DashboardItem) => ReactNode | null;
  available: (id: string) => boolean;
  emptyText: (id: string) => string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropRef = useRef<Drop | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);

  const visible = items.filter((i) => available(i.id));
  const missing = DASHBOARD_CARDS.filter((c) => available(c.id) && !items.some((i) => i.id === c.id));

  // Keyboard moves reorder the DOM, which can drop focus: put it back on the moved card's handle.
  useEffect(() => {
    if (focusId) gridRef.current?.querySelector<HTMLElement>(`[data-dash-handle="${focusId}"]`)?.focus();
  }, [focusId, items]);

  // While dragging: follow the pointer, find the card under it, scroll near the edges, drop or
  // cancel (Escape).
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const place = () => {
      const d = drag.current;
      if (!d) return;
      const scrolled = d.scroller ? d.scroller.scrollTop - d.scroll0 : 0;
      d.el.style.transform = `translate(${d.x - d.x0}px, ${d.y - d.y0 + scrolled}px)`;
      const under = document.elementFromPoint(d.x, d.y)?.closest<HTMLElement>("[data-dash-card]");
      const id = under?.dataset.dashCard;
      if (!under || !id || id === d.id || !gridRef.current) return;
      const r = under.getBoundingClientRect();
      const wide = r.width > gridRef.current.getBoundingClientRect().width * 0.7;
      const next = { id, wide, after: wide ? d.y > r.top + r.height / 2 : d.x > r.left + r.width / 2 };
      const cur = dropRef.current;
      if (!cur || cur.id !== next.id || cur.after !== next.after || cur.wide !== next.wide) {
        dropRef.current = next;
        setDrop(next);
      }
    };
    const tick = () => {
      const d = drag.current;
      if (d?.scroller) {
        const r = d.scroller.getBoundingClientRect();
        const by = d.y < r.top + 80 ? -14 : d.y > r.bottom - 80 ? 14 : 0;
        if (by) {
          d.scroller.scrollTop += by;
          place();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const finish = (commit: boolean) => {
      const d = drag.current;
      const target = dropRef.current;
      if (d) {
        d.el.style.transform = "";
        d.el.style.pointerEvents = "";
      }
      drag.current = null;
      dropRef.current = null;
      setDragging(null);
      setDrop(null);
      if (commit && d && target) onChange(moveItem(items, d.id, target.id, target.after));
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      place();
    };
    const onUp = () => finish(true);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [dragging, items, onChange]);

  const startDrag = (e: ReactPointerEvent, id: string, fromHandle: boolean) => {
    if (e.button !== 0) return;
    // A finger or pen drags by the handle only, so the page still scrolls; a mouse can grab the
    // whole card (but not its buttons).
    if (!fromHandle && (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button"))) return;
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-dash-card]");
    if (!el) return;
    e.preventDefault();
    const scroller = scrollParent(el);
    el.style.pointerEvents = "none";
    drag.current = { id, el, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, scroller, scroll0: scroller?.scrollTop ?? 0 };
    setDragging(id);
  };

  // Arrow keys on a handle move the card one place among the visible cards.
  const onHandleKey = (e: KeyboardEvent, id: string) => {
    const by = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    const at = visible.findIndex((i) => i.id === id);
    const neighbor = visible[at + by];
    if (!neighbor) return;
    onChange(moveItem(items, id, neighbor.id, by > 0));
    setFocusId(id);
  };

  const update = (id: string, patch: Partial<DashboardItem> | null) =>
    onChange(patch ? items.map((i) => (i.id === id ? { ...i, ...patch } : i)) : items.filter((i) => i.id !== id));

  return (
    // Outside edit mode, smaller cards fill gaps (a card that has nothing to show leaves one);
    // while editing, the grid follows the order exactly.
    <div ref={gridRef} className={`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 ${editing ? "" : "md:grid-flow-row-dense"}`}>
      {visible.map((item) => {
        const node = renderCard(item);
        if (!editing && node == null) return null;
        const def = cardDef(item.id);
        const label = def?.label ?? item.id;
        const sizes = def?.sizes ?? [];
        const isDragging = dragging === item.id;
        const target = drop?.id === item.id ? drop : null;
        return (
          <div key={item.id} data-dash-card={item.id} className={`@container relative min-w-0 ${SIZE_CLASSES[item.size]} ${isDragging ? "z-30" : ""}`}>
            {!editing ? (
              node
            ) : (
              <div
                onPointerDown={(e) => startDrag(e, item.id, false)}
                className={`flex h-full flex-col gap-2 rounded-[1.75rem] p-2 outline-2 transition-shadow ${
                  isDragging ? "cursor-grabbing bg-background shadow-2xl outline-accent" : "cursor-grab outline-dashed outline-accent/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-dash-handle={item.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startDrag(e, item.id, true);
                    }}
                    onKeyDown={(e) => onHandleKey(e, item.id)}
                    aria-label={`Move ${label} (arrow keys move it)`}
                    title="Drag to move"
                    className="flex h-9 w-9 shrink-0 touch-none items-center justify-center rounded-full bg-accent text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                  >
                    <DragIcon className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
                  {sizes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => update(item.id, { size: nextSize(item.id, item.size) })}
                      title="Change the size"
                      className="hidden h-9 shrink-0 items-center rounded-full bg-surface px-3 text-xs font-semibold hover:bg-surface-hover md:flex"
                    >
                      {SIZE_LABELS[item.size]}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => update(item.id, null)}
                    aria-label={`Take ${label} off the dashboard`}
                    title="Take off the dashboard"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                <div inert className="min-h-0 flex-1 select-none opacity-60">
                  {node ?? (
                    <div className="flex h-full min-h-24 items-center rounded-3xl bg-surface p-5">
                      <p className="text-sm text-muted">{emptyText(item.id)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {target && (
              <span
                aria-hidden
                className={`pointer-events-none absolute z-20 rounded-full bg-accent ${
                  target.wide
                    ? `inset-x-0 h-1 ${target.after ? "-bottom-2.5" : "-top-2.5"}`
                    : `inset-y-0 w-1 ${target.after ? "-right-2.5" : "-left-2.5"}`
                }`}
              />
            )}
          </div>
        );
      })}

      {editing && (
        <section className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-foreground/10 p-5 md:col-span-2 lg:col-span-12">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted">Add a card</h2>
            {missing.length > 0 && <HintsButton on={showHints} onToggle={() => setShowHints((on) => !on)} />}
          </div>
          {missing.length ? (
            <HintsContext.Provider value={showHints}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {missing.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onChange([...items, { id: c.id, size: defaultSize(c.id) }])}
                    className="flex items-start gap-3 rounded-2xl bg-surface p-3 text-left transition-colors hover:bg-surface-hover"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <PlusIcon className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 self-center">
                      <span className="text-sm font-semibold">{c.label}</span>
                      <Hint>{c.hint}</Hint>
                    </span>
                  </button>
                ))}
              </div>
            </HintsContext.Provider>
          ) : (
            <p className="text-sm text-muted">Every card is on your dashboard.</p>
          )}
        </section>
      )}
    </div>
  );
}

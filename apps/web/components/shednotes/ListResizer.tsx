"use client";

import { useState } from "react";

export const LIST_MIN = 220;
export const LIST_MAX = 520;
export const LIST_DEFAULT = 288;

export const clampListWidth = (w: number) => Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, w)));

/**
 * The drag handle on the note list's right edge (wide screens only), drawn like the sidebar's: a
 * faint pill in the middle of the gap. Dragging shows the new width live through `onPreview` and
 * saves it once on release; arrow keys nudge it, a double-click puts it back.
 */
export default function ListResizer({ width, onPreview, onCommit }: { width: number; onPreview: (w: number | null) => void; onCommit: (w: number) => void }) {
  // Where the drag started and the width then, so grabbing the handle off-centre doesn't jump it;
  // null when not dragging. `moved` keeps a plain click (or a double-click) from saving anything.
  const [drag, setDrag] = useState<{ x: number; width: number; moved: boolean } | null>(null);
  const dragging = drag !== null;

  const widthAt = (e: React.PointerEvent<HTMLDivElement>) => clampListWidth((drag?.width ?? width) + e.clientX - (drag?.x ?? e.clientX));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the note list"
      aria-valuemin={LIST_MIN}
      aria-valuemax={LIST_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ x: e.clientX, width, moved: false });
      }}
      onPointerMove={(e) => {
        if (!drag || (!drag.moved && Math.abs(e.clientX - drag.x) < 3)) return;
        if (!drag.moved) setDrag({ ...drag, moved: true });
        onPreview(widthAt(e));
      }}
      onPointerUp={(e) => {
        if (!drag) return;
        setDrag(null);
        onPreview(null);
        if (drag.moved) onCommit(widthAt(e));
      }}
      onPointerCancel={() => {
        setDrag(null);
        onPreview(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onCommit(clampListWidth(width - 16));
        else if (e.key === "ArrowRight") onCommit(clampListWidth(width + 16));
        else return;
        e.preventDefault();
      }}
      onDoubleClick={() => onCommit(LIST_DEFAULT)}
      title="Drag to resize · double-click to reset"
      className="group absolute -right-5 top-0 z-10 hidden h-full w-4 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
    >
      <div className={`absolute inset-y-0 w-px transition-colors ${dragging ? "bg-accent/60" : "bg-foreground/10 group-hover:bg-foreground/25 group-focus-visible:bg-accent/50"}`} />
      <div
        className={`relative h-10 w-1 rounded-full transition-opacity duration-150 ${
          dragging ? "bg-accent opacity-100" : "bg-foreground/30 opacity-0 group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100"
        }`}
      />
    </div>
  );
}

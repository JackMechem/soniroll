"use client";

import { useRef, useState } from "react";
import type { View } from "@/components/Waveform";

/**
 * A scrollbar for the zoomed waveform: the thumb is the visible part of the track.
 * Drag the thumb to pan, or click the track to jump there.
 */
export default function WaveScrollbar({
  view,
  duration,
  onChange,
  thin = false,
}: {
  view: View;
  duration: number;
  onChange: (start: number) => void;
  /** A slim 3px bar (with a taller invisible grab area), for overlaying on other content. */
  thin?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ offset: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const maxStart = Math.max(0, duration - view.span);
  const thumbWidth = duration > 0 ? Math.min(100, (view.span / duration) * 100) : 100;
  const thumbLeft = duration > 0 ? (view.start / duration) * 100 : 0;

  function timeAtPointer(clientX: number, grabOffset: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(maxStart, Math.max(0, (ratio - grabOffset) * duration));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = trackRef.current!.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const onThumb = (e.target as HTMLElement).dataset.thumb !== undefined;
    // Grabbing the thumb keeps the point you grabbed under the cursor; clicking the
    // track centres the thumb there.
    const offset = onThumb ? ratio - view.start / duration : view.span / duration / 2;
    dragRef.current = { offset };
    setDragging(true);
    onChange(timeAtPointer(e.clientX, offset));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) onChange(timeAtPointer(e.clientX, dragRef.current.offset));
  }

  function end() {
    dragRef.current = null;
    setDragging(false);
  }

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-orientation="horizontal"
      aria-controls="waveform"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxStart)}
      aria-valuenow={Math.round(view.start)}
      aria-label="Scroll waveform"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className={`relative w-full cursor-pointer touch-none ${
        thin ? "h-3" : "-mt-3 h-3 rounded-full bg-foreground/10"
      }`}
    >
      <div
        className={`absolute inset-x-0 ${
          thin ? "top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-background/60" : "inset-y-0"
        }`}
      >
        <div
          data-thumb
          className={`absolute inset-y-0 rounded-full transition-colors ${
            dragging ? "bg-accent" : "bg-muted/60 hover:bg-muted"
          }`}
          style={{ left: `${thumbLeft}%`, width: `${thumbWidth}%` }}
        />
      </div>
    </div>
  );
}

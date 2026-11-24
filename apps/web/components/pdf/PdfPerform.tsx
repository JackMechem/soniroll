"use client";

import { useEffect, useRef, useState } from "react";
import PdfPageView from "@/components/pdf/PdfPageView";
import type { Layer } from "@/components/pdf/markup";
import type { PdfSources } from "@/components/pdf/usePdfDoc";
import { BookmarkIcon, CloseIcon, SlidesIcon } from "@/components/tools";
import { sectionsOf } from "@/components/pdf/outline";
import { usePaneElement, usePaneKeyGuard } from "@/lib/paneContext";

/**
 * Playing from the PDF: full screen, the page (or two side by side) as big as it fits, turned with
 * the arrow keys, space, Page Up/Down (what Bluetooth page-turner pedals send), a tap on either
 * side, or a swipe. Escape leaves, back on the page you were on.
 */
export default function PdfPerform({ sources, layer, start, hideMarks, images, onExit }: { sources: PdfSources; layer: Layer; start: number; hideMarks: boolean; images?: Record<string, string | null | undefined>; onExit: (page: number) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // In a split-screen pane: that pane, not the whole window.
  // There it doesn't go full screen either: the point is seeing the other panes (a metronome)
  // while you play, and its keys only work while its pane has the keyboard.
  const inPane = usePaneElement() !== null;
  const inPaneRef = useRef(inPane);
  const forThisPane = usePaneKeyGuard();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [index, setIndex] = useState(start);
  const [twoUp, setTwoUp] = useState<boolean | null>(null);
  const [chrome, setChrome] = useState(true);
  const [picking, setPicking] = useState(false);
  const pages = layer.pages;
  // Sections (bookmarks): a list to jump to, the one you're in shown.
  const sections = sectionsOf(layer);
  let at = -1;
  sections.forEach((s, i) => {
    if (s.index <= index) at = i;
  });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    // Full screen where the browser allows it (not on iPhone; the page still fills the window).
    const full = !inPaneRef.current;
    if (full) el.requestFullscreen?.().catch(() => null);
    return () => {
      ro.disconnect();
      if (full && document.fullscreenElement) void document.exitFullscreen().catch(() => null);
    };
  }, []);

  // Wide screens show two pages at once unless you say otherwise.
  const two = (twoUp ?? size.w > size.h * 1.15) && pages.length > 1;
  const step = two ? 2 : 1;
  const first = two ? index - (index % 2) : index;
  const shown = pages.slice(first, first + step);
  const turn = (dir: 1 | -1) => setIndex((i) => Math.max(0, Math.min(pages.length - 1, (two ? i - (i % 2) : i) + dir * step)));

  // The controls fade after a few seconds.
  useEffect(() => {
    if (!chrome || picking) return;
    const t = setTimeout(() => setChrome(false), 2500);
    return () => clearTimeout(t);
  }, [chrome, index, picking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!forThisPane(e)) return;
      if (picking && e.key === "Escape") return setPicking(false);
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        turn(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        turn(-1);
      } else if (e.key === "Escape") onExit(index);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(pages.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving full screen (Esc in the browser) leaves the view too.
  useEffect(() => {
    const onChange = () => !inPane && !document.fullscreenElement && onExit(index);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  });

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const gap = 8;
  const pad = 8;
  const fit = (aspect: number) => Math.max(50, Math.min((size.w - pad * 2 - (two ? gap : 0)) / step, (size.h - pad * 2) / aspect));

  return (
    <div
      ref={rootRef}
      className={`${inPane ? "absolute z-[22]" : "fixed z-[72]"} inset-0 flex select-none items-center justify-center bg-background`}
      style={{ gap }}
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) return turn(dx < 0 ? 1 : -1);
        if ((e.target as HTMLElement).closest("button, [data-no-turn]")) return;
        // A tap: the left third goes back, the rest goes on.
        const r = rootRef.current!.getBoundingClientRect();
        if (e.clientX - r.left < r.width / 3) turn(-1);
        else turn(1);
        setChrome(true);
      }}
      onPointerMove={() => !chrome && setChrome(true)}
    >
      {size.w > 0 &&
        shown.map((p) => <PdfPageView key={p.id} doc={sources.docFor(p)} page={p} aspect={sources.aspectOf(p)} width={Math.floor(fit(sources.aspectOf(p)))} hideMarks={hideMarks} images={images} eager />)}
      {/* The next pages, drawn ahead so turning is instant. */}
      <div className="pointer-events-none absolute -left-[9999px] top-0 opacity-0" aria-hidden>
        {size.w > 0 && pages.slice(first + step, first + step * 2).map((p) => <PdfPageView key={p.id} doc={sources.docFor(p)} page={p} aspect={sources.aspectOf(p)} width={Math.floor(fit(sources.aspectOf(p)))} hideMarks={hideMarks} images={images} eager />)}
      </div>

      <div className={`absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] transition-opacity duration-300 ${chrome ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="flex items-center gap-2">
        <button type="button" onClick={() => onExit(index)} className="flex h-10 items-center gap-1.5 rounded-full bg-surface/90 px-3 text-sm font-medium text-foreground shadow-md" aria-label="Leave">
          <CloseIcon className="h-4 w-4" /> Done
        </button>
        {sections.length > 0 && (
          // In place, not a popover: in full screen only what's inside this view shows.
          <div className="relative" data-no-turn>
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              aria-expanded={picking}
              aria-label="Go to a section"
              title="Go to a section"
              className="flex h-10 items-center gap-1.5 rounded-full bg-surface/90 px-3 text-sm font-medium text-foreground shadow-md"
            >
              <BookmarkIcon className="h-4 w-4" /> <span className="max-w-[9rem] truncate max-sm:hidden">{sections[at]?.bm.title ?? "Sections"}</span>
            </button>
            {picking && (
              <div className="absolute top-12 left-0 z-[1] flex max-h-[70vh] w-64 max-w-[calc(100vw-1.5rem)] flex-col overflow-y-auto rounded-xl bg-surface p-2 shadow-xl ring-1 ring-foreground/10">
                {sections.map((s, i) => (
                  <button
                    key={s.bm.id}
                    type="button"
                    onClick={() => {
                      setIndex(s.index);
                      setPicking(false);
                      setChrome(true);
                    }}
                    className={`flex h-10 shrink-0 items-center gap-2 rounded-md pr-2 text-left text-sm ${i === at ? "bg-accent/15 text-accent" : "hover:bg-surface-hover"} ${s.bm.sub ? "pl-6" : "pl-2 font-medium"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.bm.title || "Untitled section"}</span>
                    <span className="text-xs tabular-nums text-muted">{s.index + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
        <span className="rounded-full bg-surface/90 px-3 py-2 text-xs font-medium tabular-nums text-foreground shadow-md">
          {first + 1}
          {shown.length > 1 ? `–${first + shown.length}` : ""} / {pages.length}
        </span>
        <button type="button" onClick={() => setTwoUp(!two)} className="flex h-10 items-center gap-1.5 rounded-full bg-surface/90 px-3 text-sm font-medium text-foreground shadow-md" aria-pressed={two}>
          <SlidesIcon className="h-4 w-4" /> {two ? "One page" : "Two pages"}
        </button>
      </div>
    </div>
  );
}

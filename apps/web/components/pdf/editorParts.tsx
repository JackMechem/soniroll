"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Small pieces of the PDF editor's toolbars. */

// 44px on touch screens (the row scrolls sideways when they don't all fit).
export const toolCls = (active: boolean) =>
  `flex h-10 w-9 shrink-0 items-center justify-center rounded-lg transition-colors sm:w-10 pointer-coarse:h-11 pointer-coarse:w-11 ${active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-surface-hover"}`;

/** Keeps a click on a toolbar from taking the keyboard away from text being typed. */
export const keepFocus = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();

/** The same, except on a field (it has to take the keyboard to be typed in). */
export const keepFocusUnlessField = (e: React.MouseEvent) => {
  if (!(e.target as HTMLElement).closest("input, textarea, select")) e.preventDefault();
};

/** A music-font (SMuFL) glyph drawn to fit its box: the fonts' glyphs sit at odd heights and some
    (repeat signs) are taller than a line, so its ink is measured (canvas `measureText`, once the
    font has loaded) and centred, scaled to `max` px tall (small ones, a staccato dot, up to 3×). */
export function FitGlyph({ text, family, max }: { text: string; family: string; max: number }) {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    const font = `24px ${family}`;
    void document.fonts
      .load(font, text)
      .catch(() => [])
      .then(() => {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx || !live) return;
        ctx.font = font;
        const m = ctx.measureText(text);
        const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        if (w > 0 && h > 0) setBox({ x: -m.actualBoundingBoxLeft, y: -m.actualBoundingBoxAscent, w, h });
      });
    return () => {
      live = false;
    };
  }, [text, family]);
  const scale = box ? Math.min(3, max / box.h, (max * 1.5) / box.w) : 1;
  return (
    <svg
      aria-hidden
      viewBox={box ? `${box.x} ${box.y} ${box.w} ${box.h}` : `0 -${max} ${max} ${max}`}
      width={box ? box.w * scale : max}
      height={box ? box.h * scale : max}
      className={box ? "" : "invisible"}
      overflow="visible"
    >
      <text fontSize={24} fill="currentColor" style={{ fontFamily: family }}>
        {text}
      </text>
    </svg>
  );
}

export function ToolBtn({ label, icon: Icon, active = false, danger, onClick, disabled }: { label: string; icon: ComponentType<{ className?: string }>; active?: boolean; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`${toolCls(active)} disabled:opacity-35 ${danger ? "text-danger" : ""}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function IconBtn({ label, icon: Icon, onClick, disabled, active }: { label: string; icon: ComponentType<{ className?: string }>; onClick: (e: React.MouseEvent) => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-35 ${active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-surface-hover"}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function Swatch({ name, color, on, onClick }: { name: string; color: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      aria-label={name}
      title={name}
      aria-pressed={on}
      // The inset line keeps black and white swatches visible on any theme.
      className={`h-8 w-8 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(127_127_127/0.45)] ring-offset-2 ring-offset-surface ${on ? "ring-2 ring-accent" : "ring-1 ring-foreground/25"}`}
      style={{ background: color }}
    />
  );
}

/** A colour of your own: the system colour picker, shown as a rainbow swatch (or the colour, when
    it's the one in use and isn't one of the swatches). */
export function CustomColour({ color, on, onPick, label = "Custom colour" }: { color: string; on: boolean; onPick: (c: string) => void; label?: string }) {
  return (
    <label
      title={label}
      className={`relative h-8 w-8 shrink-0 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgb(127_127_127/0.45)] ring-offset-2 ring-offset-surface ${on ? "ring-2 ring-accent" : "ring-1 ring-foreground/25"}`}
      style={{ background: on ? color : "conic-gradient(#f44, #fd4, #4d6, #4cf, #64f, #f4c, #f44)" }}
    >
      <span className="sr-only">{label}</span>
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#000000"}
        onChange={(e) => onPick(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/** A row of choices as pills (font, alignment, frame…). */
export function Pills<T extends string>({ value, options, onChange }: { value: T | undefined; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onMouseDown={keepFocus}
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={value === o.value}
          className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs ${value === o.value ? "bg-accent/15 font-medium text-accent" : "bg-foreground/[0.04] hover:bg-surface-hover"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A slider with its value. */
export function RangeRow({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs font-semibold text-muted">
        {label} <span className="tabular-nums">{format(value)}</span>
      </span>
      <input type="range" className="slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--progress" as string]: `${progress}%` }} />
    </label>
  );
}

/** A button that opens a small panel by it (portaled, kept on screen: below, or above when there's
    more room there; lined up with whichever side of the button leaves it room). */
export function Pop({ label, trigger, children, className = "shrink-0" }: { label: string; trigger: ReactNode; children: (close: () => void) => ReactNode; className?: string }) {
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setPos(null);
    };
    // Escape closes just this panel: stopping it here (capture, on window) keeps the editor's own
    // Escape handler from closing the whole editor.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPos(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [pos]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={!!pos}
        onMouseDown={keepFocus}
        onClick={() => {
          if (pos) return setPos(null);
          // Phones: a sheet along the bottom (easier to reach, and never off the side).
          if (window.innerWidth < 640) return setPos({ left: 0, right: 0, bottom: 0, maxHeight: "70dvh" });
          const r = btn.current!.getBoundingClientRect();
          const below = window.innerHeight - r.bottom;
          const vertical: React.CSSProperties = below >= 320 || below >= r.top ? { top: r.bottom + 6, maxHeight: below - 14 } : { bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 14 };
          const horizontal: React.CSSProperties = r.left + r.width / 2 > window.innerWidth / 2 ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) };
          setPos({ ...vertical, ...horizontal });
        }}
        className={className}
      >
        {trigger}
      </button>
      {pos &&
        createPortal(
          pos.bottom === 0 && pos.left === 0 ? (
            <div ref={panel} data-keep-typing onMouseDown={keepFocusUnlessField} className="fixed z-[75] overflow-y-auto rounded-t-2xl bg-surface px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-8px_30px_rgb(0_0_0/0.18)] ring-1 ring-foreground/10" style={pos} role="dialog" aria-label={label}>
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-foreground/20" aria-hidden />
              <div className="mx-auto w-fit max-w-full">{children(() => setPos(null))}</div>
            </div>
          ) : (
            <div ref={panel} data-keep-typing onMouseDown={keepFocusUnlessField} className="fixed z-[75] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl bg-surface p-3 shadow-xl ring-1 ring-foreground/10" style={pos}>
              {children(() => setPos(null))}
            </div>
          ),
          document.body,
        )}
    </>
  );
}

/** A row that scrolls sideways (a phone's toolbars): its edges fade where there's more, and a small
    arrow on that side shows it (a tap scrolls). `attach` goes on the scrolling row, `hints` beside it
    inside a `relative` wrapper. */
export function useRowScroll<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    const added = new MutationObserver(() => {
      for (const child of el.children) observer.observe(child);
      update();
    });
    added.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      added.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [el]);
  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent, black 2.5rem" : "black, black"}, ${edges.right ? "black calc(100% - 2.5rem), transparent" : "black"})`
      : undefined;
  const nudge = (dir: 1 | -1) => el?.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: "smooth" });
  const arrow = (dir: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={keepFocus}
      onClick={() => nudge(dir)}
      aria-label={dir > 0 ? "More tools" : "Back to the first tools"}
      className={`absolute top-1/2 z-[1] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-foreground/80 shadow-md ring-1 ring-foreground/10 ${dir > 0 ? "right-1" : "left-1"}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir > 0 ? "M8 5l5 5-5 5" : "M12 5l-5 5 5 5"} />
      </svg>
    </button>
  );
  const hints = (
    <>
      {edges.left && arrow(-1)}
      {edges.right && arrow(1)}
    </>
  );
  return { attach: setEl, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined, hints };
}

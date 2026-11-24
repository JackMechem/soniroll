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
    font has loaded) and centred, shrunk to `max` px when it's bigger. */
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
  const scale = box ? Math.min(1, max / box.h, (max * 1.5) / box.w) : 1;
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
      className={`h-8 w-8 shrink-0 rounded-full ring-offset-2 ring-offset-surface ${on ? "ring-2 ring-accent" : "ring-1 ring-foreground/15"}`}
      style={{ background: color }}
    />
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
          <div ref={panel} data-keep-typing onMouseDown={keepFocusUnlessField} className="fixed z-[75] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl bg-surface p-3 shadow-xl ring-1 ring-foreground/10" style={pos}>
            {children(() => setPos(null))}
          </div>,
          document.body,
        )}
    </>
  );
}

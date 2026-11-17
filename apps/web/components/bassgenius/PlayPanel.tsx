"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, CloseIcon } from "@/components/tools";
import { usePersistedSettings } from "@/lib/usePersistedSettings";

// The building blocks of Bass Genius's properties panel: collapsible sections (open or closed is
// remembered on this device), labelled fields and level sliders.

type Collapsed = { closed: string[]; opened: string[] };
const COLLAPSED_KEY = "jam-practice-bass-genius-panel";
const COLLAPSED_DEFAULTS: Collapsed = { closed: [], opened: [] };

export function PanelSection({
  id,
  title,
  icon: Icon,
  summary,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown beside the title while the section is closed. */
  summary?: string;
  /** Closed until opened the first time (then remembered like the rest). */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [state, update] = usePersistedSettings(COLLAPSED_KEY, COLLAPSED_DEFAULTS);
  const open = defaultOpen ? !state.closed.includes(id) : state.opened.includes(id);
  const toggle = () =>
    defaultOpen
      ? update({ closed: open ? [...state.closed, id] : state.closed.filter((x) => x !== id) })
      : update({ opened: open ? state.opened.filter((x) => x !== id) : [...state.opened, id] });
  return (
    <section className="border-b border-foreground/10 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2.5 px-4 text-left transition-colors hover:bg-surface-hover"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted" />
        <span className="text-sm font-medium">{title}</span>
        {!open && summary && <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">{summary}</span>}
        <ChevronRightIcon className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="flex flex-col gap-4 px-4 pb-4">{children}</div>}
    </section>
  );
}

/** A labelled control: the label above, an optional note below. */
export function Field({ label, note, children }: { label: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {label && <span className="text-xs font-medium text-muted">{label}</span>}
      {children}
      {note && <span className="text-xs leading-relaxed text-muted">{note}</span>}
    </div>
  );
}

/** One mixer channel: name, level, and a slider (or a "turn on" link while that part is off). */
export function LevelRow({
  label,
  value,
  onChange,
  offLabel,
  onTurnOn,
}: {
  label: string;
  /** Null while the part is off. */
  value: number | null;
  onChange: (v: number) => void;
  offLabel?: string;
  onTurnOn?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        {value === null ? (
          onTurnOn ? (
            <button type="button" onClick={onTurnOn} className="text-xs font-medium text-accent hover:underline">
              {offLabel ?? "Turn on"}
            </button>
          ) : (
            <span className="text-xs text-muted">{offLabel ?? "Off"}</span>
          )
        ) : (
          <span className="text-xs text-muted tabular-nums">{Math.round(value * 100)}%</span>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value ?? 0}
        disabled={value === null}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--progress": `${(value ?? 0) * 100}%` } as React.CSSProperties}
        className="slider h-6 w-full cursor-pointer disabled:cursor-default disabled:opacity-40"
        aria-label={`${label} level`}
      />
    </div>
  );
}

/** Phones: the properties panel as a bottom sheet (Esc, the ×, or a tap above it closes it). */
export function OptionsSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-overlay lg:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Options"
        className="flex max-h-[88dvh] flex-col rounded-t-xl border-t border-foreground/15 bg-surface pb-[env(safe-area-inset-bottom)] text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-foreground/10 pl-4 pr-2">
          <h2 className="text-sm font-semibold">Options</h2>
          <button type="button" onClick={onClose} aria-label="Close options" className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

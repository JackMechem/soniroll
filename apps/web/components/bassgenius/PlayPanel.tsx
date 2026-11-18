"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, CloseIcon, SlidersIcon } from "@/components/tools";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { usePaneElement } from "@/lib/paneContext";

// The building blocks of Bass Genius's properties panel: collapsible sections (open or closed is
// remembered on this device), labelled fields and level sliders.

type Collapsed = { closed: string[]; opened: string[] };
const COLLAPSED_KEY = "jam-practice-bass-genius-panel";
const COLLAPSED_DEFAULTS: Collapsed = { closed: [], opened: [] };

/** Inside the phones' Options sheet the sections don't use the remembered open/closed state (the
    desktop panel's): the sheet opens with just its first section open, so it isn't one long page. */
const SheetSections = createContext<{ open: string[]; toggle: (id: string) => void } | null>(null);

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
  const sheet = useContext(SheetSections);
  const open = sheet ? sheet.open.includes(id) : defaultOpen ? !state.closed.includes(id) : state.opened.includes(id);
  const toggle = () =>
    sheet
      ? sheet.toggle(id)
      : defaultOpen
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

/** Phones: the one button that opens the Options sheet, saying what's set (tempo, style…) since
    the options panel is hidden there. */
export function OptionsButton({ summary, onOpen }: { summary: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Options: ${summary}`}
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-md bg-foreground/[0.05] py-1 pl-3 pr-4 text-left transition-colors hover:bg-surface-hover lg:hidden"
    >
      <SlidersIcon className="h-4 w-4 shrink-0 text-muted" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[11px] font-medium text-muted">Options</span>
        {/* Two lines if it needs them (a long style name), rather than cutting it off. */}
        <span className="line-clamp-2 text-sm font-semibold tabular-nums">{summary}</span>
      </span>
    </button>
  );
}

/** Desktop: the options panel beside the music stays in view as the page scrolls, without a
    scrollbar of its own (a scrolling panel inside a scrolling page). A panel taller than the
    window scrolls with the page until its bottom is in view, then stays (a negative sticky
    `top`); a shorter one sticks near the top. The panel needs `lg:sticky`. */
export function useStickyPanel(ref: React.RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const fit = () => {
      const scroller = el.parentElement?.closest<HTMLElement>(".overflow-y-auto");
      const view = scroller?.clientHeight ?? window.innerHeight;
      el.style.top = `${Math.min(16, view - el.offsetHeight - 24)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [ref, active]);
}

/** Phones: the properties panel as a bottom sheet (Esc, the ×, or a tap above it closes it), the
    same inset, rounded sheet as every tool's setting chips (`SettingChip` on phones). Its
    sections start closed except `firstOpen` (the most used one), each time it opens. */
export function OptionsSheet({ open, onClose, firstOpen, children }: { open: boolean; onClose: () => void; firstOpen?: string; children: React.ReactNode }) {
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
  // In a split-screen pane (which lays out like a phone), the sheet covers just that pane.
  const pane = usePaneElement();
  if (!open) return null;
  return createPortal(
    <div className={`${pane ? "absolute" : "fixed"} inset-0 z-[60] flex flex-col justify-end bg-overlay p-3 lg:hidden`} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Options"
        className="settings-pop flex max-h-[80dvh] flex-col overflow-hidden rounded-3xl bg-surface text-left text-foreground shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45)] ring-1 ring-foreground/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-1 pb-2 pl-5 pr-3 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">Options</h2>
          <button type="button" onClick={onClose} aria-label="Close options" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <SheetBody firstOpen={firstOpen}>{children}</SheetBody>
        </div>
      </div>
    </div>,
    pane ?? document.body,
  );
}

/** Mounted each time the sheet opens, so its sections start from `firstOpen` again. */
function SheetBody({ firstOpen, children }: { firstOpen?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState<string[]>(firstOpen ? [firstOpen] : []);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return <SheetSections.Provider value={{ open, toggle }}>{children}</SheetSections.Provider>;
}

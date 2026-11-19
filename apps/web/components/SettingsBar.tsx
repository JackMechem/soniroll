"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, SlidersIcon } from "@/components/tools";
import { rewardGradient, usePopKey, useReward } from "@/components/reward/Reward";

/** Set by `ToolLayout` around a tool's `options`: when true, `CollapsiblePanel`, `OptionsCard` and
    `OptionSection` render as setting chips (below) instead of panels, which is how every tool's
    options are shown. */
export const ChipsModeContext = createContext(false);
export const useChipsMode = () => useContext(ChipsModeContext);

/** True when a click/keypress belongs to a floating menu or listbox (a `Select`'s options, a
    `Flyout`/`ContextMenu`) or a dialog opened from the popover (marked `data-popover-child`, e.g.
    the presets' rename and delete dialogs), which are portaled outside the popover but belong
    to it. */
function inFloatingMenu(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[role="listbox"], [role="menu"], [data-popover-child]');
}

/** A row of setting chips. Each chip shows the setting's current value and opens a popover (a
    bottom sheet on phones) to change it, so there's no options column to expand, collapse or
    hide. One popover is open at a time. */
export function SettingsBar({ children, fit = false }: { children: ReactNode; /** Wrap within the container instead of growing past it (inside a card). */ fit?: boolean }) {
  return (
    <div
      className={`flex w-full flex-wrap items-stretch justify-center gap-2 ${
        // Wider on a big desktop window (up to 960px, leaving room for the sidebar) so a tool's
        // chips fit one row at 1440 instead of leaving one alone on a second row; never narrower
        // than before. `lg:` never applies in a split-screen pane.
        fit ? "" : "sm:w-max sm:max-w-[min(46rem,calc(100cqw-2rem))] sm:shrink-0 lg:max-w-[min(60rem,max(46rem,calc(100cqw-28rem)))]"
      }`}
    >
      {children}
    </div>
  );
}

/** A bigger tap area for a small (32px) button on touch screens and phones: an invisible layer
    6px above and below it, so it's 44px to a finger without looking any bigger. The button must
    not clip its overflow. `TOUCH_HIT_ROUND` grows it on every side (a 32px square icon button). */
export const TOUCH_HIT =
  "relative max-sm:after:absolute max-sm:after:inset-x-0 max-sm:after:-inset-y-1.5 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5";
export const TOUCH_HIT_ROUND =
  "relative max-sm:after:absolute max-sm:after:-inset-1.5 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5";

const GAP = 8; // between the chip and its popover
const MARGIN = 16; // kept clear at the screen's edges
const SM = 640; // Tailwind's `sm` breakpoint: below it the popover is a bottom sheet
const TOP_CLEAR = 56 + 8; // the page's header bar (56px; a pane's top bar is the same) and a gap

type Placement = { style: CSSProperties; below: boolean };

/** Where the popover goes on a wider screen: just above its chip (or below it, for a chip near
    the top of the screen with more room underneath), centred on it but kept on screen, and never
    taller than the space it opens into. Opening upward it stops under the page's header bar (or
    the split-screen pane's top bar), so it never covers the tool's title. It's `position: fixed`,
    so a long popover scrolls inside itself instead of making the page scroll. */
function place(chip: HTMLElement, width: number): Placement | null {
  if (window.innerWidth < SM) return null;
  const r = chip.getBoundingClientRect();
  const w = Math.min(width, window.innerWidth - 2 * MARGIN);
  const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, MARGIN), window.innerWidth - w - MARGIN);
  const paneTop = chip.closest("[data-pane]")?.getBoundingClientRect().top ?? 0;
  const spaceAbove = r.top - GAP - Math.max(MARGIN, paneTop + TOP_CLEAR);
  const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN;
  if (spaceBelow > spaceAbove) {
    return {
      below: true,
      style: { position: "fixed", left, width: w, top: r.bottom + GAP, maxHeight: spaceBelow },
    };
  }
  return {
    below: false,
    style: {
      position: "fixed",
      left,
      width: w,
      bottom: window.innerHeight - r.top + GAP,
      maxHeight: spaceAbove,
    },
  };
}

export function SettingChip({
  icon: Icon,
  label,
  value,
  title,
  wide,
  headerExtra,
  toggle,
  trigger,
  open: openProp,
  onOpenChange,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** Control the popover from outside (e.g. an Edit button elsewhere opening it). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** A setting that can be switched on and off as a whole: the chip becomes a split chip, a
      switch (with the label and value) that toggles it straight away, and a separate settings
      button that opens the popover. Dimmed while off. */
  toggle?: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };
  /** A differently styled button that opens the popover (e.g. a tool's History stat pill). */
  trigger?: { className: string; content: ReactNode };
  /** Small caption above the value, e.g. "Time" — or, with no `value`, the chip's only text. */
  label: string;
  /** The current value, e.g. "7/8". */
  value?: ReactNode;
  /** Extra controls in the popover's header, before the close button (e.g. a "?" toggle). */
  headerExtra?: ReactNode;
  /** The popover's heading (defaults to `label`). */
  title?: string;
  /** A wider popover, for bigger editors. */
  wide?: boolean;
  children: ReactNode;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean | ((open: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (onOpenChange) onOpenChange(value);
    if (openProp === undefined) setOpenState(value);
  };
  const reward = useReward();
  const valueKey = `${typeof value === "string" || typeof value === "number" ? String(value) : ""}|${toggle?.checked ?? ""}`;
  const pop = usePopKey(valueKey);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const width = wide ? 480 : 384;

  // Position it before paint, and follow the chip if the window resizes or the page scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => chipRef.current && setPlacement(place(chipRef.current, width));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (inFloatingMenu(e.target)) return;
      if (!chipRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // A dropdown open inside the popover closes first.
      if (e.key === "Escape" && !document.querySelector('[role="listbox"], [role="menu"]')) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sheet = !placement; // phones

  const labelAndValue = (inverted: boolean) =>
    value === undefined || value === null || value === "" ? (
      <span className="whitespace-nowrap text-sm font-semibold">{label}</span>
    ) : (
      <span className="min-w-0">
        <span className={`block text-[11px] font-medium leading-tight ${inverted ? "opacity-80" : "text-muted"}`}>{label}</span>
        <span className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold leading-tight">{value}</span>
      </span>
    );

  const chip = toggle ? (
    <div
      ref={chipRef}
      className={`flex items-stretch overflow-hidden bg-surface transition ${reward ? "h-14 rounded-full" : "rounded-2xl"} ${open ? "ring-2 ring-accent" : ""} ${toggle.checked ? "" : "opacity-70"}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={toggle.checked}
        aria-label={label}
        disabled={toggle.disabled}
        onClick={() => toggle.onChange(!toggle.checked)}
        className={`flex items-center gap-3 text-left transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60 ${reward ? "pl-2 pr-4" : "py-2 pl-3 pr-3"}`}
      >
        {reward ? (
          <span className={`relative h-9 w-[3.75rem] shrink-0 rounded-full transition-colors ${toggle.checked ? "" : "bg-background"}`} style={toggle.checked ? { background: rewardGradient(reward.color) } : undefined}>
            <span
              key={pop}
              className={`absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full shadow transition-transform ${toggle.checked ? "translate-x-6 bg-accent-foreground text-accent" : "bg-foreground/80"} ${pop ? "reward-pop" : ""}`}
            >
              {toggle.checked && <CheckIcon className="h-4 w-4" />}
            </span>
          </span>
        ) : (
          <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${toggle.checked ? "bg-accent" : "bg-background"}`}>
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground shadow transition-transform ${toggle.checked ? "translate-x-4" : ""}`} />
          </span>
        )}
        {reward && value !== undefined && value !== null && value !== "" ? (
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="whitespace-nowrap text-base font-extrabold">{value}</span>
            <span className="whitespace-nowrap text-[11px] font-semibold text-muted">{label}</span>
          </span>
        ) : (
          labelAndValue(false)
        )}
      </button>
      <span className="my-2 w-px bg-foreground/10" aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label} settings`}
        title={`${label} settings`}
        className={`flex items-center transition ${reward ? "pl-3 pr-4" : "px-3"} ${open ? "bg-accent text-accent-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}
      >
        <SlidersIcon className="h-4 w-4" />
      </button>
    </div>
  ) : null;

  const custom = trigger ? (
    <div ref={chipRef} className="flex">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label={title ?? label} className={trigger.className}>
        {trigger.content}
      </button>
    </div>
  ) : null;

  // The reward look (tools on the new Shed Log logging): a chunky pill with a coloured icon, the
  // value big on top, and a pop + glow each time the value changes.
  const rewardChip =
    reward && !chip && !custom ? (
      <div ref={chipRef} className="flex">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`relative flex h-14 items-center gap-3 rounded-full bg-surface pl-1.5 pr-5 text-left transition hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-md active:scale-[0.97] ${open ? "shadow-md" : ""}`}
          style={open ? { boxShadow: `0 0 0 2px ${reward.color}` } : undefined}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent-foreground shadow-sm" style={{ background: rewardGradient(reward.color) }}>
            <Icon className="h-5 w-5" />
          </span>
          {value === undefined || value === null || value === "" ? (
            <span className="whitespace-nowrap text-sm font-bold">{label}</span>
          ) : (
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span key={pop} className={`flex items-center gap-1 whitespace-nowrap text-base font-extrabold ${pop ? "reward-pop" : ""}`}>
                {value}
              </span>
              <span className="whitespace-nowrap text-[11px] font-semibold text-muted">{label}</span>
            </span>
          )}
          {pop > 0 && (
            <span key={`g${pop}`} aria-hidden className="reward-glow pointer-events-none absolute inset-0 rounded-full" style={{ "--reward": reward.color } as CSSProperties} />
          )}
        </button>
      </div>
    ) : null;

  return (
    <>
      {chip ?? custom ?? rewardChip ?? (
      <div ref={chipRef} className="flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-3 rounded-2xl py-2 pl-3 pr-4 text-left transition active:scale-[0.98] ${
          open ? "bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-hover"
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${open ? "bg-accent-foreground/15" : "bg-accent/15 text-accent"}`}>
          <Icon className="h-4 w-4" />
        </span>
        {labelAndValue(open)}
      </button>
      </div>
      )}

      {open &&
        createPortal(
          <>
            {sheet && <div className="fixed inset-0 z-40 bg-overlay" aria-hidden onClick={() => setOpen(false)} />}
            <div
              ref={popRef}
              role="dialog"
              aria-label={title ?? label}
              style={placement?.style}
              className={`settings-pop ${reward ? "reward-scope" : ""} z-50 flex flex-col overflow-hidden rounded-3xl bg-surface text-left text-foreground shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45)] ring-1 ring-foreground/[0.06] ${
                sheet ? "fixed inset-x-3 bottom-3 max-h-[80dvh]" : placement.below ? "origin-top" : "origin-bottom"
              }`}
            >
              {/* On touch screens the header's buttons (the ? and ×) are 40px with a gap between. */}
              <div className="flex shrink-0 items-center gap-1 px-5 pb-2 pt-4 pointer-coarse:gap-2 pointer-coarse:pr-3 max-sm:gap-2 max-sm:pr-3">
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title ?? label}</h2>
                {headerExtra}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  title="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground pointer-coarse:h-10 pointer-coarse:w-10 max-sm:h-10 max-sm:w-10"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              {/* Only this part scrolls, inside the popover. */}
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

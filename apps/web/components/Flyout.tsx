"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";

/** A small icon-button trigger that opens a portaled popover menu below it — the sidebar's own
    "..." options flyout (Advanced layouts / Theme / Collapse) and the account row's own profile
    flyout both use this, rather than each rolling its own positioning/outside-click logic.
    `children` is a render prop receiving `close`, so an item inside can close the menu itself
    after acting (e.g. "Sign out"). Positioned the same way `components/Select.tsx`'s own dropdown
    is — `getBoundingClientRect()` on open, `position: fixed` in a portal — rather than CSS
    `position: absolute`, so it's never clipped by a `overflow-hidden` ancestor (the sidebar's own
    `<aside>` scrolls its nav list). */
export default function Flyout({
  icon: Icon,
  label,
  align = "start",
  buttonClassName,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  /** Accessible name for the trigger button. */
  label: string;
  /** Which edge of the trigger the popover's own edge lines up with. */
  align?: "start" | "end";
  buttonClassName?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = align === "end" ? rect.right - MENU_WIDTH : rect.left;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8)),
    });
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  // Flips the menu to open *above* the trigger instead, if opening below it would run off the
  // bottom of the viewport — the account row's own flyout lives at the very bottom of the
  // sidebar, so "always open downward" ran it straight off-screen. Measured after the real
  // content actually renders (a caller's item count/length isn't known up front, unlike
  // `ContextMenu.tsx`'s own fixed-height items), via `useLayoutEffect` so the corrected position
  // lands before the browser paints — no visible flash of the wrong placement first.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !buttonRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - 8) {
      const triggerRect = buttonRef.current.getBoundingClientRect();
      const top = Math.max(8, triggerRect.top - menuRect.height - 6);
      setPos((p) => (p && p.top !== top ? { ...p, top } : p));
    }
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-flyout]") && !target.closest("[data-flyout-trigger]")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-flyout-trigger
        onClick={() => (open ? close() : openMenu())}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          buttonClassName ??
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        }
      >
        <Icon className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            data-flyout
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, maxHeight: "calc(100dvh - 16px)" }}
            className="z-[70] flex flex-col gap-px overflow-y-auto overscroll-contain rounded-lg bg-surface p-1 text-sm shadow-lg ring-1 ring-foreground/10"
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

const MENU_WIDTH = 224;

/** A single row inside a `Flyout` — a plain action, or (with `checked` passed) a toggle that
    shows a checkmark when on, the same "label + checkmark on the right" shape
    `AdvancedLayoutsButton` already used standalone before this component existed. */
export function FlyoutItem({
  icon: Icon,
  label,
  checked,
  danger,
  onSelect,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Omit for a plain action row; pass `true`/`false` to show it as a toggle with a checkmark. */
  checked?: boolean;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      onClick={onSelect}
      aria-checked={checked}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover ${
        danger ? "text-danger" : ""
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {checked && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/tools";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
  /** A setting that's on (a ✓ at the end). */
  checked?: boolean;
  /** Its keyboard shortcut, shown faintly at the end. */
  hint?: string;
  /** A thin line above it, starting a new group. */
  divider?: boolean;
  /** A short second line under the label, in muted text (wraps instead of being cut). */
  detail?: string;
};
export type MenuState = {
  x: number;
  y: number;
  items: MenuItem[];
  width?: number;
  /** Where the menu's bottom goes when it doesn't fit below `y` (the top of the ⋮ button it
      opened from); without it, it's pushed up just enough to fit. */
  flipY?: number;
  /** A heading for the phone's bottom sheet (the file's or tune's name). */
  title?: string;
};

const MENU_WIDTH = 208;

/** Phones: the menu is a bottom sheet (every item reachable, scrolling if there are many). */
const SHEET_QUERY = "(max-width: 639px)";

/**
 * A menu at a point (a right-click, or under a ⋮ button), portaled-style with `position: fixed`.
 * It's measured once drawn: if it doesn't fit below, it opens upward (above the button, `flipY`),
 * it never leaves the screen, and a long one scrolls. On phones it's a bottom sheet instead.
 */
export default function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const [sheet] = useState(() => typeof window !== "undefined" && window.matchMedia(SHEET_QUERY).matches);
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-context-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // A phone's address bar showing or hiding resizes the window: the sheet stays.
    const onResize = () => !sheet && onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onResize);
    if (!sheet) window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose, sheet]);

  // Measured once drawn (items can be taller on touch screens, or have a second line): below the
  // point if it fits, else above the button it came from, else as low as it fits.
  useLayoutEffect(() => {
    if (sheet || !ref.current) return;
    const h = ref.current.offsetHeight;
    const room = window.innerHeight - 8;
    let next = menu.y;
    if (menu.y + h > room) next = menu.flipY !== undefined && menu.flipY - h >= 8 ? menu.flipY - h : room - h;
    setTop(Math.max(8, next));
  }, [menu, sheet]);

  const list = menu.items.map((item) => (
    <div key={item.label} className={item.divider ? "mt-1 border-t border-foreground/10 pt-1" : undefined}>
      <button
        type="button"
        role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
        aria-checked={item.checked}
        onClick={() => {
          // Closed first, so an item can open another menu in its place (a submenu).
          onClose();
          item.onSelect();
        }}
        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left pointer-coarse:min-h-11 transition-colors hover:bg-surface-hover ${
          item.danger ? "text-danger" : ""
        }`}
      >
        {item.icon && <span className="flex min-w-4 shrink-0 justify-center">{item.icon}</span>}
        {item.detail ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{item.label}</span>
            <span className="text-xs text-muted">{item.detail}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        )}
        {item.hint && <span className="shrink-0 text-xs text-muted">{item.hint}</span>}
        {item.checked && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
      </button>
    </div>
  ));

  if (sheet) {
    return (
      <div data-context-menu className="fixed inset-0 z-[70] flex flex-col justify-end" onContextMenu={(e) => e.preventDefault()}>
        {/* Inside the menu's own box, so a tap on it closes the sheet without reaching the page. */}
        <button type="button" aria-label="Close the menu" tabIndex={-1} className="absolute inset-0 bg-overlay" onClick={onClose} />
        <div className="relative m-2 flex max-h-[80dvh] flex-col rounded-2xl bg-surface p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-left text-sm shadow-2xl">
          {menu.title && <p className="truncate px-2.5 pb-1 pt-2 text-xs font-semibold text-muted">{menu.title}</p>}
          <div role="menu" aria-label={menu.title} className="flex flex-col gap-px overflow-y-auto overscroll-contain">
            {list}
          </div>
        </div>
      </div>
    );
  }

  const width = Math.min(menu.width ?? MENU_WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  return (
    <div
      ref={ref}
      data-context-menu
      role="menu"
      className="fixed z-[70] flex flex-col gap-px overflow-y-auto overscroll-contain rounded-lg ring-1 ring-foreground/[0.06] bg-surface p-1 text-left text-sm shadow-lg"
      style={{ left, top: top ?? menu.y, width, maxHeight: window.innerHeight - 16, visibility: top === null ? "hidden" : undefined }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {list}
    </div>
  );
}

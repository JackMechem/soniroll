"use client";

import { useEffect } from "react";
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
export type MenuState = { x: number; y: number; items: MenuItem[]; width?: number };

const MENU_WIDTH = 208;

export default function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-context-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  const width = Math.min(menu.width ?? MENU_WIDTH, window.innerWidth - 16);
  const height = Math.min(menu.items.reduce((h, item) => h + (item.detail ? 52 : 36), 12), window.innerHeight - 16);
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));

  return (
    <div
      data-context-menu
      role="menu"
      className="fixed z-[70] flex flex-col gap-px overflow-y-auto rounded-lg ring-1 ring-foreground/[0.06] bg-surface p-1 text-left text-sm shadow-lg"
      style={{ left, top, width, maxHeight: window.innerHeight - 16 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item) => (
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
      ))}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  /** Optional icon shown before the label, in the button and in the menu. */
  icon?: React.ReactNode;
  /** When set, the row shows a delete button that calls this instead of selecting the row. */
  onDelete?: () => void;
};

type Props<T extends string | number> = {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

type MenuPos = { left: number; width: number; maxWidth: number; top?: number; bottom?: number; maxHeight: number };

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 288;

export default function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  className = "",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  function openMenu() {
    if (disabled) return;
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function choose(index: number) {
    onChange(options[index].value);
    close();
  }

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - MENU_GAP - 8;
      const above = rect.top - MENU_GAP - 8;
      const flip = below < 160 && above > below;
      const maxHeight = Math.min(MENU_MAX_HEIGHT, flip ? above : below);
      // At least as wide as the button, wider if an option needs it, but never off the screen.
      const maxWidth = Math.max(rect.width, window.innerWidth - rect.left - 8);
      setPos(
        flip
          ? {
              left: rect.left,
              width: rect.width,
              maxWidth,
              bottom: window.innerHeight - rect.top + MENU_GAP,
              maxHeight,
            }
          : { left: rect.left, width: rect.width, maxWidth, top: rect.bottom + MENU_GAP, maxHeight },
      );
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, pos]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex min-h-9 items-center justify-between gap-2 rounded-md bg-foreground/[0.05] px-3 py-1.5 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60 ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon}
          <span className="truncate">{selected?.label ?? ""}</span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              minWidth: pos.width,
              width: "max-content",
              maxWidth: pos.maxWidth,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            className="z-[100] overflow-auto rounded-lg ring-1 ring-foreground/[0.06] bg-surface p-1 text-sm shadow-lg"
          >
            {options.map((option, i) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                data-index={i}
                onPointerEnter={() => setActiveIndex(i)}
                onClick={() => choose(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 ${
                  i === activeIndex ? "bg-surface-hover" : ""
                } ${option.value === value ? "font-semibold text-accent" : ""}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {option.value === value && (
                    <svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 10.5l4 4 8-9" />
                    </svg>
                  )}
                  {option.onDelete && (
                    <button
                      type="button"
                      aria-label={`Delete ${option.label}`}
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        option.onDelete?.();
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-danger"
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

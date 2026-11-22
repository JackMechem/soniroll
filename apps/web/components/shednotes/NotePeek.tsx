"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, CloseIcon, DotsVerticalIcon, MaximizeIcon } from "@/components/tools";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useNotesConfig } from "@/lib/useShedNotes";
import {
  type PeekMode,
  PEEK_MAX_WIDTH,
  PEEK_MIN_WIDTH,
  clampPeekWidth,
  closeNotePeek,
  followNotePeek,
  peekBack,
  setPeekPrefs,
  useNotePeek,
  useNotePeekPrefs,
} from "@/lib/notePeek";
import NoteSurface from "./NoteSurface";

/** Two panels side by side: the page and the note pushed beside it. */
function PushIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16" />
    </svg>
  );
}

/** A panel floating over the page. */
function OverlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="12" y="7" width="7" height="10" rx="1" />
    </svg>
  );
}

/**
 * The note side view, like Notion's side peek: a Shed Note open beside whatever page you're on
 * (`openNotePeek` from `lib/notePeek.ts`). On desktop it either floats over the page or pushes the
 * page over (the ⋮ menu, kept for this device), and its left edge drags to resize; on phones it
 * covers the screen. Links in it open in the same view, with Back. Mounted once, in `AppShell`,
 * after the page, so pushing just takes room from the page beside it.
 */
export default function NotePeek() {
  const { noteId, back, detach } = useNotePeek();
  const { mode, width } = useNotePeekPrefs();
  const isDesktop = useIsDesktop();
  const cfg = useNotesConfig();
  const flushRef = useRef<() => void>(() => {});
  const [dragging, setDragging] = useState(false);
  const onFlush = useCallback((f: () => void) => {
    flushRef.current = f;
  }, []);
  const close = useCallback(() => {
    flushRef.current();
    closeNotePeek();
  }, []);
  const openNote = useCallback((id: string) => {
    flushRef.current();
    followNotePeek(id);
  }, []);

  useEffect(() => {
    if (!noteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Vim uses Escape to leave insert mode: only close from outside the editor, or with it off.
      const inEditor = (e.target as HTMLElement | null)?.closest(".cm-editor");
      if (inEditor && cfg.config.vimMode) return;
      // A menu or dialog over it closes first.
      if (document.querySelector('[role="menu"], [role="dialog"][aria-modal="true"]')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [noteId, close, cfg.config.vimMode]);

  if (!noteId) return null;
  const push = isDesktop && mode === "push";

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setPeekPrefs({ width: clampPeekWidth(window.innerWidth - e.clientX) });
  }

  const iconButton = "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
  const modeOption = (value: PeekMode, label: string, Icon: typeof PushIcon) => (
    <FlyoutItem key={value} icon={Icon} label={label} checked={mode === value} onSelect={() => setPeekPrefs({ mode: value })} />
  );

  return (
    <aside
      aria-label="Note"
      style={isDesktop ? { width } : undefined}
      className={
        push
          ? "relative flex h-full shrink-0 flex-col border-l border-foreground/10 bg-surface"
          : isDesktop
            ? "fixed inset-y-0 right-0 z-[45] flex flex-col bg-surface shadow-2xl shadow-black/25 ring-1 ring-foreground/10"
            : "fixed inset-0 z-[65] flex flex-col bg-surface pt-[env(safe-area-inset-top)]"
      }
    >
      {isDesktop && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the note"
          aria-valuemin={PEEK_MIN_WIDTH}
          aria-valuemax={PEEK_MAX_WIDTH}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPeekPrefs({ width: clampPeekWidth(width + 24) });
            else if (e.key === "ArrowRight") setPeekPrefs({ width: clampPeekWidth(width - 24) });
            else return;
            e.preventDefault();
          }}
          title="Drag to resize"
          className="group absolute -left-2 top-0 z-10 flex h-full w-4 cursor-col-resize touch-none items-center justify-center outline-none"
        >
          <div className={`h-10 w-1 rounded-full transition-colors ${dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/60 group-focus-visible:bg-accent"}`} />
        </div>
      )}
      <NoteSurface
        key={noteId}
        noteId={noteId}
        onOpenNote={openNote}
        onFlush={onFlush}
        autoFocus={isDesktop}
        headerStart={
          back.length > 0 ? (
            <button type="button" onClick={() => { flushRef.current(); peekBack(); }} aria-label="Back" title="Back to the note before" className={iconButton}>
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          ) : undefined
        }
        headerEnd={
          <>
            <Link
              href={`/shed-notes?id=${encodeURIComponent(noteId)}`}
              onClick={close}
              aria-label="Open in Shed Notes"
              title="Open in Shed Notes"
              className={iconButton}
            >
              <MaximizeIcon className="h-4 w-4" />
            </Link>
            <Flyout icon={DotsVerticalIcon} label="Note view options" align="end">
              {(closeMenu) => (
                <>
                  {isDesktop && (
                    <>
                      {modeOption("overlay", "Over the page", OverlayIcon)}
                      {modeOption("push", "Beside the page", PushIcon)}
                    </>
                  )}
                  {detach && (
                    <FlyoutItem
                      icon={CloseIcon}
                      label={detach.label}
                      onSelect={() => {
                        closeMenu();
                        flushRef.current();
                        detach.run();
                        closeNotePeek();
                      }}
                    />
                  )}
                </>
              )}
            </Flyout>
            <button type="button" onClick={close} aria-label="Close the note" title="Close (Esc)" className={iconButton}>
              <CloseIcon className="h-4 w-4" />
            </button>
          </>
        }
        footer={(saveState) => (
          <p className="px-5 pb-3 text-xs text-muted">{saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "Saving…"}</p>
        )}
      />
    </aside>
  );
}

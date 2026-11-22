"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Flyout, { FlyoutItem } from "@/components/Flyout";
import RoutinePage from "@/components/practicelog/RoutinePage";
import TaskPage from "@/components/practicelog/TaskPage";
import { useSidebarShownWidth } from "@/components/Sidebar";
import { ChevronLeftIcon, CloseIcon, DotsVerticalIcon, ExternalLinkIcon, MaximizeIcon, MinimizeIcon } from "@/components/tools";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useNotesConfig } from "@/lib/useShedNotes";
import { routineHref, taskHref } from "@/lib/shedLogPages";
import {
  type PeekMode,
  type SideItem,
  PEEK_MAX_WIDTH,
  PEEK_MIN_WIDTH,
  clampPeekWidth,
  closeSide,
  followSide,
  setPeekPrefs,
  setSideFull,
  sideBack,
  useNotePeekPrefs,
  useSideView,
} from "@/lib/notePeek";
import NoteSurface from "./NoteSurface";

/** Two panels side by side: the page and the view pushed beside it. */
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

/** Where the thing in the side view lives as a page of its own. */
function hrefOf(item: SideItem): string {
  if (item.kind === "note") return `/shed-notes?id=${encodeURIComponent(item.id)}`;
  if (item.kind === "routine") return routineHref(item.id);
  return taskHref(item);
}

/**
 * The side view, like Notion's side peek: a Shed Note, a task's page or a routine's page beside
 * whatever page you're on (`openSide` / `openNotePeek` in `lib/notePeek.ts`). On desktop it floats
 * over the page or pushes it over (the ⋮ menu, kept for this device) and its left edge drags to
 * resize; ⤢ makes it cover the page (beside the sidebar), and then Back returns to what was open
 * before it, or to the page under it. Phones always get it full screen. Links and tasks in it open
 * in the same view, with Back. Going to another page closes it. Mounted once, in `AppShell`, after
 * the page, so pushing just takes room from the page beside it.
 */
export default function NotePeek() {
  const { item, back, detach, full } = useSideView();
  const { mode, width } = useNotePeekPrefs();
  const isDesktop = useIsDesktop();
  const sidebarWidth = useSidebarShownWidth();
  const cfg = useNotesConfig();
  const router = useRouter();
  const pathname = usePathname();
  const flushRef = useRef<() => void>(() => {});
  const [dragging, setDragging] = useState(false);
  const onFlush = useCallback((f: () => void) => {
    flushRef.current = f;
  }, []);
  const close = useCallback(() => {
    flushRef.current();
    closeSide();
  }, []);
  const goBack = useCallback(() => {
    flushRef.current();
    sideBack();
  }, []);

  // Another page: the view closes (it belonged to the page you were on).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    closeSide();
  }, [pathname]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Vim uses Escape to leave insert mode: only close from outside the editor, or with it off.
      const inEditor = (e.target as HTMLElement | null)?.closest(".cm-editor");
      if (inEditor && cfg.config.vimMode) return;
      // A menu or dialog over it closes first.
      if (document.querySelector('[role="menu"], [role="dialog"]:not([aria-label="Side view"])')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, close, cfg.config.vimMode]);

  if (!item) return null;
  const covers = full || !isDesktop;
  const push = isDesktop && !full && mode === "push";

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

  // Back: what was open before in the view; full screen with nothing before it, the page under it.
  const backButton =
    back.length > 0 || covers ? (
      <button type="button" onClick={goBack} title={back.length > 0 ? "Back to what was open before" : "Back to the page"} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] pl-1.5 pr-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
        <ChevronLeftIcon className="h-4 w-4" /> Back
      </button>
    ) : null;

  const controls = (
    <>
      {isDesktop && (
        <button type="button" onClick={() => setSideFull(!full)} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"} className={iconButton}>
          {full ? <MinimizeIcon className="h-4 w-4" /> : <MaximizeIcon className="h-4 w-4" />}
        </button>
      )}
      <Flyout icon={DotsVerticalIcon} label="Side view options" align="end">
        {(closeMenu) => (
          <>
            <FlyoutItem
              icon={ExternalLinkIcon}
              label={item.kind === "note" ? "Open in Shed Notes" : "Open as a page"}
              onSelect={() => {
                closeMenu();
                flushRef.current();
                router.push(hrefOf(item));
              }}
            />
            {isDesktop && !full && (
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
                  closeSide();
                }}
              />
            )}
          </>
        )}
      </Flyout>
      <button type="button" onClick={close} aria-label="Close the side view" title="Close (Esc)" className={iconButton}>
        <CloseIcon className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <aside
      role="dialog"
      aria-label="Side view"
      style={covers ? (isDesktop ? { left: sidebarWidth } : undefined) : { width }}
      className={
        covers
          ? "fixed inset-y-0 right-0 z-[65] flex flex-col bg-background pt-[env(safe-area-inset-top)] max-lg:left-0"
          : push
            ? "relative flex h-full shrink-0 flex-col border-l border-foreground/10 bg-surface"
            : "fixed inset-y-0 right-0 z-[45] flex flex-col bg-surface shadow-2xl shadow-black/25 ring-1 ring-foreground/10"
      }
    >
      {isDesktop && !covers && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the side view"
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
      {item.kind === "note" ? (
        <div className={`flex min-h-0 flex-1 flex-col ${covers ? "mx-auto w-full max-w-4xl" : ""}`}>
          <NoteSurface
            key={item.id}
            noteId={item.id}
            onOpenNote={(id) => {
              flushRef.current();
              followSide({ kind: "note", id });
            }}
            onFlush={onFlush}
            autoFocus={isDesktop}
            headerStart={backButton}
            headerEnd={controls}
            footer={(saveState) => <p className="px-5 pb-3 text-xs text-muted">{saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "Saving…"}</p>}
          />
        </div>
      ) : (
        <>
          <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-foreground/10 px-4">
            {backButton}
            <span className="flex-1" />
            {controls}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={`flex flex-col gap-6 px-5 py-5 ${covers ? "mx-auto w-full max-w-5xl lg:px-8" : ""}`}>
              {item.kind === "task" ? (
                <TaskPage key={JSON.stringify(item)} inPanel routineId={"routineId" in item ? item.routineId : undefined} date={"date" in item ? item.date : undefined} taskId={item.taskId} />
              ) : (
                <RoutinePage key={item.id} inPanel id={item.id} />
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

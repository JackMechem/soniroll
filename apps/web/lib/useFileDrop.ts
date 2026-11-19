"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Dropping files anywhere on a tool's page (`components/files/FilePicker.tsx` shows the overlay).
 * Only drags that carry files count. On a normal page the whole window takes the drop; in split
 * screen it's the pane the tool is in (the nearest scrolling box around `anchor`), so a file
 * dropped on the other pane goes to that pane's tool. Elements marked `data-file-drop={dropId}`
 * (the tool's own dialogs, portaled outside the pane) take drops too.
 */

/** The box that takes drops for a tool rendered inside `anchor`: null for the whole window. */
function dropScope(anchor: HTMLElement): HTMLElement | null {
  for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    // The single-page scroller (`AppShell`): the whole window is this tool's.
    if (el.hasAttribute("data-page-scroll")) return null;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll") return el;
  }
  return null;
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

export type DropArea = { top: number; left: number; width: number; height: number } | "window";

export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /** Where the overlay goes while a file is dragged over this tool; null otherwise. */
  const [area, setArea] = useState<DropArea | null>(null);
  const dropId = useId();
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  });

  useEffect(() => {
    if (!anchor || !enabled) return;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const hide = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      setArea(null);
    };
    /** The area this tool owns, if the event is over it. */
    const areaFor = (e: DragEvent): DropArea | null => {
      const scope = dropScope(anchor);
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(`[data-file-drop="${CSS.escape(dropId)}"]`)) return scope ? rectOf(scope) : "window";
      if (!scope) return "window";
      if (!target || !scope.contains(target)) return null;
      return rectOf(scope);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      const next = areaFor(e);
      if (!next) {
        hide();
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setArea((prev) => (sameArea(prev, next) ? prev : next));
      // `dragover` keeps firing while the file is held over the page; when it stops (the drag
      // left, or was cancelled), the overlay goes.
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 250);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented || !areaFor(e)) return;
      e.preventDefault();
      hide();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFilesRef.current(files);
    };
    const onLeave = (e: DragEvent) => {
      // Left the window.
      if (!e.relatedTarget) hide();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragleave", onLeave);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragleave", onLeave);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [anchor, enabled, dropId]);

  return { setAnchor, area: enabled ? area : null, dropId };
}

function rectOf(el: HTMLElement): DropArea {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameArea(a: DropArea | null, b: DropArea) {
  if (a === b) return true;
  if (!a || a === "window" || b === "window") return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

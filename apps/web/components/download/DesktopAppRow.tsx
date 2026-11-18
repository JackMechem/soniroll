"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { navIconButtonClass, navRowClass } from "@/components/navRow";
import { DownloadIcon } from "@/components/tools";
import { inDesktopApp } from "@/lib/deviceFiles";

export const DOWNLOAD_PATH = "/download";
const noSubscribe = () => () => {};

/** The sidebar's "Desktop app" row, beside Storage plans (or, collapsed, just the icon). Only on the
    website on a computer: not inside the desktop app, and not in the phone menu (`large`). */
export function DesktopAppRow({ collapsed = false, active = false }: { collapsed?: boolean; active?: boolean }) {
  const desktop = useSyncExternalStore(noSubscribe, inDesktopApp, () => false);
  if (desktop) return null;
  if (collapsed) {
    return (
      <Link href={DOWNLOAD_PATH} aria-label="Get the desktop app" title="Get the desktop app" className={`${navIconButtonClass(active)} text-accent`}>
        <DownloadIcon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <Link href={DOWNLOAD_PATH} className={`group ${navRowClass(active, false)}`}>
      <span data-nav-icon className="flex shrink-0 text-accent">
        <DownloadIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate">Desktop app</span>
      <span className="shrink-0 text-xs text-muted">Free</span>
    </Link>
  );
}

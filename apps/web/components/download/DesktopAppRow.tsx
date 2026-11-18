"use client";

import Link from "next/link";
import { navIconButtonClass, navRowClass } from "@/components/navRow";
import { DownloadIcon } from "@/components/tools";
import { DOWNLOAD_PATH } from "@/lib/desktopRelease";

/** The sidebar's "Desktop app" row on the website (where Support soniroll used to be; inside the
    desktop app that row is Support again). Collapsed, just the icon. */
export function DesktopAppRow({ collapsed = false, active = false }: { collapsed?: boolean; active?: boolean }) {
  if (collapsed) {
    return (
      <Link href={DOWNLOAD_PATH} aria-label="Desktop app" title="Get the desktop app" className={`${navIconButtonClass(active)} text-accent`}>
        <DownloadIcon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <Link href={DOWNLOAD_PATH} title="Get the desktop app for macOS, Windows and Linux" className={navRowClass(active, false)}>
      <span data-nav-icon className="flex shrink-0 text-accent">
        <DownloadIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate">Desktop app</span>
    </Link>
  );
}

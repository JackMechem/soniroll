"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { navIconButtonClass } from "@/components/navRow";
import { DownloadIcon } from "@/components/tools";
import { inDesktopApp } from "@/lib/deviceFiles";

export const DOWNLOAD_PATH = "/download";
const noSubscribe = () => () => {};

/** The collapsed sidebar's desktop app button (expanded, it shares a row with the storage plan:
    `AppAndPlansRow`). Not shown inside the desktop app. */
export function DesktopAppRow({ active = false }: { active?: boolean }) {
  const desktop = useSyncExternalStore(noSubscribe, inDesktopApp, () => false);
  if (desktop) return null;
  return (
    <Link href={DOWNLOAD_PATH} aria-label="Get the desktop app" title="Get the desktop app" className={`${navIconButtonClass(active)} text-accent`}>
      <DownloadIcon className="h-4 w-4" />
    </Link>
  );
}

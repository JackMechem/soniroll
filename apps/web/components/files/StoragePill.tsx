"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { filesApi, formatBytes } from "@/lib/files";

/** Storage used, as a small meter: "20 MB of 100 MB" over a thin bar. It sits beside the Library
    title (signed in only) and opens Files. */
export default function StoragePill() {
  const { isAuthenticated } = useConvexAuth();
  const storage = useQuery(filesApi.storage, isAuthenticated ? {} : "skip");
  if (!isAuthenticated || !storage) return null;
  const { used, quota } = storage;
  const frac = Math.min(1, used / Math.max(1, quota));
  const full = used >= quota;
  return (
    <Link
      href="/tunes?tab=files"
      title={`Every account has ${formatBytes(quota)} for uploads, recordings, songs and lesson files. Plans with more storage are coming.`}
      className="flex h-10 shrink-0 flex-col justify-center gap-1 rounded-md px-2 transition-colors hover:bg-surface-hover"
    >
      <span className={`whitespace-nowrap text-xs tabular-nums ${full ? "text-danger" : "text-muted"}`}>
        {full ? "Storage full" : <>{formatBytes(used)}<span className="hidden sm:inline"> of {formatBytes(quota)}</span></>}
      </span>
      <span className="block h-1 w-20 overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(frac, used ? 0.02 : 0) * 100}%`, background: frac > 0.9 ? "var(--danger)" : "var(--accent)", transition: "width 0.8s" }}
        />
      </span>
    </Link>
  );
}

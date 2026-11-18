"use client";

import Link from "next/link";
import { formatBytes } from "@/lib/files";
import { useStoragePlan } from "@/lib/storagePlan";

/** Online storage used, as a small meter: "20 MB of 5 GB" over a thin bar. It sits beside the
    Library title (signed in only) and opens the storage plans page. On the free plan it's the
    online space for sharing and Lessons (new files are kept on the device). */
export default function StoragePill() {
  const storage = useStoragePlan();
  if (!storage) return null;
  const { used, quota } = storage;
  const frac = Math.min(1, used / Math.max(1, quota));
  const full = used >= quota;
  return (
    <Link
      href="/plans"
      title={
        storage.plan
          ? `Your plan keeps ${formatBytes(quota)} online, on all your devices.`
          : `Online space for shared files, Lessons and your profile: ${formatBytes(quota)}. New files are kept on this device; a storage plan keeps them online.`
      }
      className="flex h-10 shrink-0 flex-col justify-center gap-1 rounded-md px-2 transition-colors hover:bg-surface-hover"
    >
      <span className={`whitespace-nowrap text-xs tabular-nums ${full ? "text-danger" : "text-muted"}`}>
        {full ? "Online storage full" : <>{formatBytes(used)}<span className="hidden sm:inline"> of {formatBytes(quota)} online</span></>}
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

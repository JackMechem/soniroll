"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { navIconButtonClass, navRowClass } from "@/components/navRow";
import { CloudIcon, DownloadIcon } from "@/components/tools";
import { DOWNLOAD_PATH } from "@/components/download/DesktopAppRow";
import { inDesktopApp } from "@/lib/deviceFiles";
import { PLAN_HREF, useStoragePlan } from "@/lib/storagePlan";

export const PLANS_PATH = "/plans";

/** The Account page keeps its section in `?tab=`, which the server doesn't see in the layout, so
    the row only lights up for it after hydrating (no mismatch). */
function useOnAccountSection(path: string) {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("popstate", cb);
      return () => window.removeEventListener("popstate", cb);
    },
    () => path === "/account" && new URLSearchParams(window.location.search).get("tab") === "storage",
    () => false,
  );
}

/** The sidebar's "Storage plans" row, beside Support soniroll (or, collapsed, just the cloud). With
    a plan it shows its size instead. Always there, so everyone knows plans exist. */
export function PlansRow({ collapsed = false, large = false, path, onNavigate }: { collapsed?: boolean; large?: boolean; path: string; onNavigate?: () => void }) {
  const onSection = useOnAccountSection(path);
  const active = path === PLANS_PATH || onSection;
  const storage = useStoragePlan();
  const plan = storage?.plan ?? null;
  // Signed in: straight to the Account page's section (`/plans` would only redirect there).
  const href = storage ? PLAN_HREF : PLANS_PATH;
  const label = plan ? "Your storage plan" : "Storage plans";
  if (collapsed) {
    return (
      <Link href={href} aria-label={label} title={label} className={`${navIconButtonClass(active)} text-accent`}>
        <CloudIcon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <Link href={href} onClick={onNavigate} className={`group ${navRowClass(active, large)}`}>
      <span data-nav-icon className="flex shrink-0 text-accent">
        <CloudIcon className={large ? "h-5 w-5" : "h-4 w-4"} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(large || plan) && <span className="shrink-0 text-xs text-muted">{plan ? `${plan.storageGb} GB` : "Files on every device"}</span>}
    </Link>
  );
}

/** The expanded sidebar's one row for both: "Desktop app" and "Storage" side by side (two full rows
    were too much next to Support and Settings). Inside the desktop app it's just the plans row. */
export function AppAndPlansRow({ path }: { path: string }) {
  const storage = useStoragePlan();
  const plan = storage?.plan ?? null;
  const onSection = useOnAccountSection(path);
  const plansActive = path === PLANS_PATH || onSection;
  const inApp = useSyncExternalStore(noSubscribe, inDesktopApp, () => false);
  if (inApp) return <PlansRow path={path} />;
  // "Desktop app" takes the width it needs; "Storage" gets the rest.
  const half = (active: boolean, grow: boolean) => `${navRowClass(active, false)} !w-auto gap-2 ${grow ? "flex-1" : "flex-none"}`;
  return (
    <div className="flex gap-1">
      <Link href={DOWNLOAD_PATH} title="Get the desktop app for macOS, Windows and Linux" className={half(path === DOWNLOAD_PATH, false)}>
        <DownloadIcon className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">Desktop app</span>
      </Link>
      <Link href={storage ? PLAN_HREF : PLANS_PATH} title={plan ? `Your storage plan: ${plan.storageGb} GB` : "Storage plans: your files on every device"} className={half(plansActive, true)}>
        <CloudIcon className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 truncate">{plan ? `${plan.storageGb} GB plan` : "Storage"}</span>
      </Link>
    </div>
  );
}

const noSubscribe = () => () => {};

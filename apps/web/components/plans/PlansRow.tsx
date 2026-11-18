"use client";

import Link from "next/link";
import { navIconButtonClass, navRowClass } from "@/components/navRow";
import { CloudIcon } from "@/components/tools";
import { useStoragePlan } from "@/lib/storagePlan";

export const PLANS_PATH = "/plans";

/** The sidebar's "Storage plans" row, beside Support soniroll (or, collapsed, just the cloud). With
    a plan it shows its size instead. Always there, so everyone knows plans exist. */
export function PlansRow({ collapsed = false, large = false, active = false, onNavigate }: { collapsed?: boolean; large?: boolean; active?: boolean; onNavigate?: () => void }) {
  const storage = useStoragePlan();
  const plan = storage?.plan ?? null;
  const label = plan ? "Your storage plan" : "Storage plans";
  if (collapsed) {
    return (
      <Link href={PLANS_PATH} aria-label={label} title={label} className={`${navIconButtonClass(active)} text-accent`}>
        <CloudIcon className="h-4 w-4" />
      </Link>
    );
  }
  return (
    <Link href={PLANS_PATH} onClick={onNavigate} className={`group ${navRowClass(active, large)}`}>
      <span data-nav-icon className="flex shrink-0 text-accent">
        <CloudIcon className={large ? "h-5 w-5" : "h-4 w-4"} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(large || plan) && <span className="shrink-0 text-xs text-muted">{plan ? `${plan.storageGb} GB` : "Files on every device"}</span>}
    </Link>
  );
}

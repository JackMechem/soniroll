"use client";

import { CloudIcon, DeviceIcon } from "@/components/tools";
import type { SaveTarget } from "@/lib/storagePlan";

/**
 * Online or only this device, for what you're about to add (with a storage plan; nothing without
 * one, where it's always this device). Starts on your default (Account → Storage plan).
 * `labels` shows the words beside the icons (else they're only in the tooltips, below `sm`).
 */
export default function SaveWhere({ target, labels = false, className = "" }: { target: SaveTarget; labels?: boolean; className?: string }) {
  if (!target.canChoose) return null;
  const option = (online: boolean) => {
    const on = target.online === online;
    const Icon = online ? CloudIcon : DeviceIcon;
    const label = online ? "Online" : "This device";
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => target.setOnline(online)}
        title={online ? "Save online, on all your devices" : "Save only on this device"}
        className={`inline-flex h-full items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors ${on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
      >
        <Icon className={`h-3.5 w-3.5 ${on ? "text-accent" : ""}`} />
        <span className={labels ? "" : "hidden sm:inline"}>{label}</span>
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label="Save to" className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-foreground/[0.05] p-0.5 ${className}`}>
      {option(true)}
      {option(false)}
    </div>
  );
}

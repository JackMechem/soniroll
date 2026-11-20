"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TunerIcon, WaveIcon } from "@/components/tools";
import { fileKind, type StoredEntry } from "@/lib/files";
import { copyRecordingToTuner } from "@/lib/tunerTakes";

/** The address that opens a stored file in a tool whose `useFilePicker` takes `openStored`. */
export function openInToolHref(toolHref: string, item: { kind: string; id: string }) {
  return `${toolHref}?open=${encodeURIComponent(`${item.kind}:${item.id}`)}`;
}

/** The tools a stored audio (or video) file can be opened in, from Files: "Open in…". */
const TOOLS = [
  { href: "/slow-downer", label: "Slow Downer", icon: WaveIcon, kinds: ["audio", "video"] },
  { href: "/tuner", label: "Tuner", icon: TunerIcon, kinds: ["audio"] },
] as const;

export type OpenInTool = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; open: () => void };

/**
 * "Open in Slow Downer", "Open in Tuner": a recording, an uploaded audio file or a tune's song,
 * opened in a tool that plays audio. The Slow Downer opens it from the address
 * (`?open=<kind>:<id>`, `useFilePicker`'s `openStored`); the Tuner keeps it as one of its takes
 * (once per file) and opens that (`?take=`).
 */
export function useOpenInTool() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toolsFor(item: StoredEntry): OpenInTool[] {
    if (item.kind !== "file" && item.kind !== "recording" && item.kind !== "song") return [];
    if (!item.url) return [];
    const kind = fileKind(item.mimeType, item.name);
    return TOOLS.filter((t) => (t.kinds as readonly string[]).includes(kind)).map((t) => ({
      href: t.href,
      label: t.label,
      icon: t.icon,
      open: () => {
        setError(null);
        if (t.href !== "/tuner") {
          router.push(openInToolHref(t.href, item));
          return;
        }
        setBusy(item.name);
        copyRecordingToTuner({
          id: item.kind === "recording" ? item.id : `${item.kind}:${item.id}`,
          name: item.name.replace(/\.[^.]+$/, ""),
          url: item.url!,
          durationSec: 0,
          source: item.kind === "recording" ? "recording" : "file",
        })
          .then((takeId) => router.push(`/tuner?take=${encodeURIComponent(takeId)}`))
          .catch((e) => setError(e instanceof Error ? e.message : "Couldn't open it in the Tuner."))
          .finally(() => setBusy(null));
      },
    }));
  }

  return { toolsFor, busy, error };
}

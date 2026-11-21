import { useEffect, useState } from "react";
import { CloseIcon, DownloadIcon } from "@/components/tools";
import { checkForUpdates, DOWNLOAD_URL, useUpdateState } from "./updates";

/**
 * The update card in the corner: checks once a few seconds after launch (the logic is in
 * `updates.ts`), then shows the install's progress, the restart, a failure, or on Linux that a
 * new version is out. "Check for updates" in Settings shows its own answers there, so a manual
 * check only brings this card up once something is installing.
 *
 * No launch check in development builds.
 */

const CHECK_AFTER_MS = 3000;

export default function Updater() {
  const state = useUpdateState();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const timer = setTimeout(() => void checkForUpdates({ manual: false }), CHECK_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const shown =
    (state.kind === "available" && !state.manual) ||
    state.kind === "installing" ||
    state.kind === "restarting" ||
    state.kind === "failed";
  if (!shown || hidden) return null;
  const closable = state.kind === "available" || state.kind === "failed";
  const frac = state.kind === "installing" && state.total ? Math.min(1, state.done / state.total) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[45] flex justify-center px-4 lg:justify-end lg:pr-20">
      <div role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-background/95 p-4 text-sm shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <DownloadIcon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {state.kind === "available" && (
            <>
              <p>
                <span className="font-semibold">soniroll {state.version} is out.</span> Update with your package manager, or get the new download.
              </p>
              <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-fit items-center rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent-hover">
                Get the download
              </a>
            </>
          )}
          {state.kind === "installing" && (
            <>
              <p>
                <span className="font-semibold">Updating to {state.version}…</span> soniroll restarts when it&apos;s ready.
              </p>
              <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${(frac ?? 0.05) * 100}%` }} />
              </span>
            </>
          )}
          {state.kind === "restarting" && <p className="font-semibold">Restarting with soniroll {state.version}…</p>}
          {state.kind === "failed" && (
            <>
              <p>
                <span className="font-semibold">Couldn&apos;t update to {state.version}.</span> You can install it from the downloads instead.
              </p>
              <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-fit items-center rounded-md bg-foreground/[0.05] px-3 text-xs font-medium hover:bg-surface-hover">
                Get the download
              </a>
            </>
          )}
        </div>
        {closable && (
          <button type="button" onClick={() => setHidden(true)} aria-label="Close" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

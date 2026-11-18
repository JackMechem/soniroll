import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { CloseIcon, DownloadIcon } from "@/components/tools";

/**
 * Updates, checked once a few seconds after launch (Tauri's updater: the manifest comes from
 * `www.soniroll.com/api/desktop-update`, which points at the newest release's `latest.json`; every
 * update is signed and checked against the public key in tauri.conf.json).
 *
 * - macOS and Windows: downloads and installs straight away, then restarts (on Windows the
 *   installer closes the app and opens the new one).
 * - Linux: only says a new version is out, with a link to the downloads — the .deb, .rpm and Nix
 *   package are updated by their own package managers.
 *
 * Nothing in development builds.
 */

type State =
  | { kind: "idle" }
  | { kind: "available"; version: string }
  | { kind: "installing"; version: string; done: number; total: number | null }
  | { kind: "restarting"; version: string }
  | { kind: "failed"; version: string; message: string };

const CHECK_AFTER_MS = 3000;
const DOWNLOAD_URL = "https://www.soniroll.com/download";
const isLinux = () => /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

export default function Updater() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        let update: Update | null = null;
        try {
          update = await check();
        } catch (e) {
          console.warn("Update check failed", e);
          return;
        }
        if (!update || cancelled) return;
        const version = update.version;
        if (isLinux()) {
          setState({ kind: "available", version });
          return;
        }
        setState({ kind: "installing", version, done: 0, total: null });
        try {
          let done = 0;
          await update.downloadAndInstall((event) => {
            if (event.event === "Started") setState({ kind: "installing", version, done: 0, total: event.data.contentLength ?? null });
            else if (event.event === "Progress") {
              done += event.data.chunkLength;
              setState((s) => (s.kind === "installing" ? { ...s, done } : s));
            }
          });
          setState({ kind: "restarting", version });
          await relaunch();
        } catch (e) {
          setState({ kind: "failed", version, message: e instanceof Error ? e.message : String(e) });
        }
      })();
    }, CHECK_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (state.kind === "idle" || hidden) return null;
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
                Get it
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

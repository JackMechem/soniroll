import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * The app's updates, in one place: the check a few seconds after launch (`Updater.tsx`'s card)
 * and "Check for updates" in Settings (`UpdatesSettings.tsx`) both go through here, so they
 * always agree on what's happening. Tauri's updater gets the manifest from
 * `www.soniroll.com/api/desktop-update`, which points at the newest release's `latest.json`;
 * every update is signed and checked against the public key in tauri.conf.json.
 *
 * - macOS and Windows install updates themselves, then restart (on Windows the installer closes
 *   the app and opens the new one).
 * - Linux only says a new version is out: the .deb, .rpm and Nix package are updated by their own
 *   package managers.
 */

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; manual: boolean }
  | { kind: "current"; checkedAt: number }
  | { kind: "available"; version: string; manual: boolean }
  | { kind: "installing"; version: string; done: number; total: number | null }
  | { kind: "restarting"; version: string }
  | { kind: "failed"; version: string; message: string }
  | { kind: "checkFailed"; message: string };

export const DOWNLOAD_URL = "https://www.soniroll.com/download";
export const isLinux = () => /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
/** Linux can't install updates itself (see above). */
export const canInstall = () => !isLinux();

let state: UpdateState = { kind: "idle" };
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

const busy = () => state.kind === "checking" || state.kind === "installing" || state.kind === "restarting";

/** Asks for a newer version. At launch (`manual: false`) an update on macOS/Windows installs
    straight away; from Settings it waits for "Update now". */
export async function checkForUpdates({ manual }: { manual: boolean }) {
  if (busy()) return;
  set({ kind: "checking", manual });
  let update: Update | null;
  try {
    update = await check();
  } catch (e) {
    console.warn("Update check failed", e);
    // At launch a failed check stays quiet (offline, say); from Settings it says so.
    set(manual ? { kind: "checkFailed", message: errorText(e) } : { kind: "idle" });
    return;
  }
  if (!update) {
    set({ kind: "current", checkedAt: Date.now() });
    return;
  }
  pending = update;
  if (!manual && canInstall()) await installUpdate();
  else set({ kind: "available", version: update.version, manual });
}

/** Downloads and installs the update the last check found, then restarts. */
export async function installUpdate() {
  const update = pending;
  if (!update || busy()) return;
  const version = update.version;
  set({ kind: "installing", version, done: 0, total: null });
  try {
    let done = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") set({ kind: "installing", version, done: 0, total: event.data.contentLength ?? null });
      else if (event.event === "Progress") {
        done += event.data.chunkLength;
        if (state.kind === "installing") set({ ...state, done });
      }
    });
    set({ kind: "restarting", version });
    await relaunch();
  } catch (e) {
    set({ kind: "failed", version, message: errorText(e) });
  }
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

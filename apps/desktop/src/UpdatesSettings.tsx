import { BUTTON_PRIMARY, BUTTON_SECONDARY, SettingsCard } from "@/components/settings/SettingsSections";
import { DESKTOP_VERSION } from "@/lib/version";
import { canInstall, checkForUpdates, DOWNLOAD_URL, installUpdate, useUpdateState } from "./updates";

/** Settings → General's "Updates" section in the desktop app (stands in for the website's empty
    `components/settings/DesktopUpdates.tsx`): which version this is, and a button to look for a
    newer one. */
export default function UpdatesSettings() {
  const state = useUpdateState();
  const checking = state.kind === "checking";
  const installing = state.kind === "installing" || state.kind === "restarting";

  let status: string;
  switch (state.kind) {
    case "checking":
      status = "Checking for a newer version…";
      break;
    case "current":
      status = `You have the newest version. Checked at ${new Date(state.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
      break;
    case "available":
      status = canInstall()
        ? `soniroll ${state.version} is out. soniroll restarts once it's installed.`
        : `soniroll ${state.version} is out. Update with your package manager, or get the new download.`;
      break;
    case "installing":
      status = `Updating to ${state.version}…`;
      break;
    case "restarting":
      status = `Restarting with soniroll ${state.version}…`;
      break;
    case "failed":
      status = `Couldn't update to ${state.version}. You can install it from the downloads instead.`;
      break;
    case "checkFailed":
      status = "Couldn't check for updates. Check your internet connection and try again.";
      break;
    default:
      status = "soniroll checks for updates each time it opens.";
  }

  const showDownload = (state.kind === "available" && !canInstall()) || state.kind === "failed";

  return (
    <SettingsCard
      title="Updates"
      description={`You're on soniroll ${DESKTOP_VERSION ?? ""} for desktop.`}
      hints={false}
      footer={
        <>
          <p role="status" className="min-w-0 flex-1">
            {status}
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            {state.kind === "available" && canInstall() && (
              <button type="button" onClick={() => void installUpdate()} className={BUTTON_PRIMARY}>
                Update now
              </button>
            )}
            {showDownload && (
              <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className={BUTTON_PRIMARY}>
                Get the download
              </a>
            )}
            {state.kind !== "available" && !installing && (
              <button type="button" onClick={() => void checkForUpdates({ manual: true })} disabled={checking} className={BUTTON_SECONDARY}>
                {checking ? "Checking…" : "Check for updates"}
              </button>
            )}
          </div>
        </>
      }
    />
  );
}

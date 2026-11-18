"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import AppShell from "@/components/AppShell";
import { LANDING_PATH } from "@/lib/landing";
import { installIosAudio } from "@/lib/iosAudio";
import FeedbackDialog from "@/components/feedback/FeedbackDialog";
import FeedbackFab from "@/components/feedback/FeedbackFab";
import UsageTracker from "@/components/UsageTracker";
import { MaintenanceScreen, SiteBanner, SiteGate, useMaintenance } from "@/components/site/SiteNotices";
import { StorageMoveBanner } from "@/components/files/StorageMove";

/** Shows the app's chrome (sidebar, ⌘K palette, timer badge, tool dock) and `AppShell` around
    every page except the landing page, a standalone marketing site with its own nav. The body
    itself never scrolls (see `app/layout.tsx`), so the landing page gets its own scroll box. */
export default function AppChrome({ chrome, children }: { chrome: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  // iPhone / iPad: play sound even with the silent switch or silent mode on.
  useEffect(() => installIosAudio(), []);
  const maintenance = useMaintenance();
  // Standalone pages: the landing page and the forgot-password page.
  const landing = pathname === LANDING_PATH || pathname === "/reset-password";
  if (maintenance !== null) return <MaintenanceScreen message={maintenance} />;
  if (landing) {
    return (
      <div className="h-dvh w-full overflow-y-auto overflow-x-hidden">
        <SiteGate>{children}</SiteGate>
        <SiteBanner />
        <FeedbackFab />
        <FeedbackDialog />
        <UsageTracker />
      </div>
    );
  }
  return (
    <>
      {chrome}
      <AppShell>
        <SiteGate>{children}</SiteGate>
      </AppShell>
      <SiteBanner />
      <StorageMoveBanner />
      <FeedbackFab />
      <FeedbackDialog />
      <UsageTracker />
    </>
  );
}

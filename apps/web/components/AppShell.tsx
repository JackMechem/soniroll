"use client";

import Notice from "@/components/Notice";
import TilingLayout from "@/components/TilingLayout";
import PracticeLogGlobal from "@/components/practicelog/PracticeLogGlobal";
import TabStrip from "@/components/tabs/TabStrip";
import TabsSync from "@/components/tabs/TabsSync";
import { useRecordToolVisits } from "@/lib/toolRecents";

/** The main area beside the sidebar: the tab strip (desktop, always; `lib/useTabs.ts`)
    over the page Next.js resolved (`children`), inside `TilingLayout`, which also draws
    split-screen panes and the side view around it when there are any (`lib/useTilingLayout.ts`).
    With nothing open beside it, it's just the page, sliding in on each route change. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  useRecordToolVisits();
  return (
    <>
      <PracticeLogGlobal />
      <TabsSync />
      <Notice />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabStrip />
        {/* The tab strip sits in the window's top-left corner (where the hidden sidebar's menu
            button is), so the page's bar under it needs no room for the button. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:[--sidebar-toggle-room:0px]">
          <TilingLayout>{children}</TilingLayout>
        </div>
      </div>
    </>
  );
}

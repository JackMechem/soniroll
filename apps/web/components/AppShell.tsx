"use client";

import TilingLayout from "@/components/TilingLayout";
import PracticeLogGlobal from "@/components/practicelog/PracticeLogGlobal";
import TabStrip from "@/components/tabs/TabStrip";
import TabsSync from "@/components/tabs/TabsSync";
import { useRecordToolVisits } from "@/lib/toolRecents";
import { useTabs } from "@/lib/useTabs";

/** The main area beside the sidebar: the tab strip (desktop, two or more tabs; `lib/useTabs.ts`)
    over the page Next.js resolved (`children`), inside `TilingLayout`, which also draws
    split-screen panes and the side view around it when there are any (`lib/useTilingLayout.ts`).
    With nothing open beside it, it's just the page, sliding in on each route change. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  useRecordToolVisits();
  // The tab strip sits in the window's top-left corner then (where the hidden sidebar's menu
  // button is), so the page's bar under it needs no room for the button.
  const strip = useTabs().tabs.length > 1;
  return (
    <>
      <PracticeLogGlobal />
      <TabsSync />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabStrip />
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${strip ? "lg:[--sidebar-toggle-room:0px]" : ""}`}>
          <TilingLayout>{children}</TilingLayout>
        </div>
      </div>
    </>
  );
}

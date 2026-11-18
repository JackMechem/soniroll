"use client";

import Link from "next/link";
import { navIconButtonClass, navIconClass, navRowClass } from "@/components/navRow";
import { HomeIcon } from "@/components/tools";
import { DASHBOARD_PATH } from "@/lib/landing";

/** The sidebar's first row: the dashboard, the app's home. Collapsed, just its icon. */
export default function DashboardNavCard({ active, collapsed, large, onNavigate }: { active: boolean; collapsed?: boolean; large?: boolean; onNavigate?: () => void }) {
  if (collapsed) {
    return (
      <Link href={DASHBOARD_PATH} onClick={onNavigate} title="Dashboard" aria-label="Dashboard" className={navIconButtonClass(active)}>
        <HomeIcon className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <Link href={DASHBOARD_PATH} onClick={onNavigate} className={navRowClass(active, large)}>
      <span data-nav-icon className="flex shrink-0 text-foreground">
        <HomeIcon className={navIconClass(large)} />
      </span>
      <span className="truncate">Dashboard</span>
    </Link>
  );
}

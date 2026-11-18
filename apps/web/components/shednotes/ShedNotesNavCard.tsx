"use client";

import Link from "next/link";
import { navIconButtonClass, navIconClass, navRowClass } from "@/components/navRow";
import { DocumentIcon } from "@/components/tools";

/** Shed Notes' row in the sidebar, under the Shed Log. Collapsed, just the icon. */
export default function ShedNotesNavCard({ active, collapsed, large, onNavigate }: { active: boolean; collapsed?: boolean; large?: boolean; onNavigate?: () => void }) {
  if (collapsed) {
    return (
      <Link href="/shed-notes" onClick={onNavigate} title="Shed Notes" aria-label="Shed Notes" className={navIconButtonClass(active)}>
        <DocumentIcon className="h-4 w-4 text-accent" />
      </Link>
    );
  }

  return (
    <Link href="/shed-notes" onClick={onNavigate} className={navRowClass(active, large)}>
      <span data-nav-icon className="flex shrink-0 text-accent">
        <DocumentIcon className={navIconClass(large)} />
      </span>
      <span className="truncate">Shed Notes</span>
    </Link>
  );
}

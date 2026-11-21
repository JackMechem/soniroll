"use client";

import { useState } from "react";

function Chevron({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

/** The `<summary>` of a native `<details>` ("How to type a chord", "Shortcuts", "More tips") in
    the same look as `Disclosure`: muted words and a chevron that turns when it's open, instead of
    the browser's ▶ marker. Text size comes from the `<details>`. */
export function DisclosureSummary({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <summary
      className={`flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 font-medium text-muted outline-none transition-colors select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden ${className}`}
    >
      {children}
      <Chevron className="h-3.5 w-3.5 transition-transform [details[open]>summary>&]:rotate-180" />
    </summary>
  );
}

/** A small "Advanced"-style toggle that folds away a group of controls. */
export default function Disclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 self-start rounded-lg py-1 text-sm font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        {title}
        <Chevron className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="flex flex-col gap-4 pt-3">{children}</div>}
    </div>
  );
}

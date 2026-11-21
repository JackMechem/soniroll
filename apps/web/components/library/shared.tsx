"use client";

import PageBar, { type Crumb } from "@/components/PageBar";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon, DotsVerticalIcon, PlusIcon, SearchIcon } from "@/components/tools";
import type { Tune } from "@/lib/types";

/** Shared pieces of the Tunes and Chord Charts pages (`components/library/*`), modeled on the
    mobile app's Tunes and Chord Charts tabs. */

/** `fullWidth` (default): no max width from `lg` up. Off, the page keeps its max width on desktop
    too (Community). */
export function PageShell({ children, wide = false, fullWidth = true }: { children: ReactNode; wide?: boolean; fullWidth?: boolean }) {
  return (
    <main
      className={`mx-auto flex w-full ${wide ? "max-w-5xl" : "max-w-4xl"} flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 ${fullWidth ? "lg:max-w-none lg:px-8" : ""} lg:pt-20`}
    >
      {children}
    </main>
  );
}

/** The "back" control above a page title (and in the setlist chart reader's header): a chevron +
    label. Pass `href` to make it a link instead of a button. */
export function BackButton({ onClick, href, label = "Back", className = "" }: { onClick?: () => void; href?: string; label?: string; className?: string }) {
  const cls = `inline-flex h-8 items-center gap-1 self-start rounded-full bg-foreground/[0.05] pl-2 pr-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${className}`;
  const inner = (
    <>
      <ChevronLeftIcon className="h-4 w-4" />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** A page's header: its name in the header bar (`PageBar`, with `crumbs` — the pages above it —
    and the ? for `helpTopic`), then a line with the `subtitle` and the page's buttons when there
    are any. `back` is the old back button: used as the one crumb above the page ("Back") when no
    `crumbs` are given. */
export function PageHeader({
  title,
  subtitle,
  back,
  crumbs,
  icon,
  actions,
  helpTopic,
}: {
  title: string;
  subtitle?: string;
  back?: () => void;
  /** The pages above this one, top first; the page's own `title` is added. */
  crumbs?: Crumb[];
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  /** A Help page topic id: shows the page's icon and a ? for its intro. */
  helpTopic?: string;
}) {
  const parents = crumbs ?? (back ? [{ label: "Back", onClick: back }] : []);
  // Buttons with no subtitle beside them go up in the header bar on desktop, rather than alone on
  // a row of their own (phones, and split-screen panes, keep the row).
  const inBar = !!actions && !subtitle;
  return (
    <>
      <PageBar crumbs={[...parents, { label: title }]} icon={icon} helpTopic={helpTopic} actions={inBar ? actions : undefined} />
      {(subtitle || actions) && (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${inBar ? "lg:hidden" : ""}`}>
          {subtitle && <p className="min-w-0 truncate text-sm text-muted">{subtitle}</p>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
    </>
  );
}

export function SearchBox({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id?: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-md bg-foreground/[0.05] px-3 transition-colors focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
      <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
      />
    </label>
  );
}

export function SectionHeader({
  title,
  detail,
  href,
  onAdd,
  addLabel,
}: {
  title: string;
  detail?: string;
  href?: string;
  /** Shows a small + next to the title — adds to this section. */
  onAdd?: (e: React.MouseEvent) => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-2 px-1">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={addLabel ?? `Add to ${title}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {detail && <span className="text-xs text-muted">{detail}</span>}
      </div>
      {href && (
        <Link href={href} className="text-xs text-muted transition-colors hover:text-foreground">
          See all ›
        </Link>
      )}
    </div>
  );
}

export function EmptyCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted">{children}</div>;
}

/** A ⋮ button for a row — always visible on touch screens, on hover elsewhere. */
export function MenuButton({ label, onClick, alwaysVisible = false }: { label: string; onClick: (e: React.MouseEvent) => void; alwaysVisible?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={label}
      title="Options"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-foreground/[0.08] hover:text-foreground focus-visible:opacity-100 ${
        alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      }`}
    >
      <DotsVerticalIcon className="h-4 w-4" />
    </button>
  );
}

export function tuneSummary(tune: Tune): string {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [keys.join(", ") || null, tempos.length ? `${tempos.join(", ")} BPM` : null, tune.timeSignature].filter(Boolean).join(" · ");
}

export function menuPosition(e: React.MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // ContextMenu's width (208px), so the menu's right edge lines up with the button's.
  return { x: rect.right - 208, y: rect.bottom + 4 };
}

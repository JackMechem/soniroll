"use client";

/** One row in a page's own left sidebar nav (`components/AccountPage.tsx`'s Profile/Tunes/Public
    Profile/... switcher, and `components/Community.tsx`'s Search/Following switcher) — a plain
    button, not `next/link` (this isn't page navigation, just which panel shows in the content
    column next to it), styled to match this app's other active/inactive nav-item convention
    (`components/Sidebar.tsx`'s `NavItems`). Pulled out into its own file so both pages render the
    literal same component rather than two copies that could drift apart — "the same sidebar thing"
    was a direct request, not just a visual coincidence to approximate twice. */
export default function SidebarNavButton({
  active,
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  active?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Styles the row for a destructive action (e.g. Account's Danger zone) even when it's not the
      active view. */
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-md px-3 text-left text-sm transition-colors ${
        active
          ? "bg-surface-hover font-medium text-foreground"
          : danger
            ? "text-danger hover:bg-surface-hover"
            : "text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

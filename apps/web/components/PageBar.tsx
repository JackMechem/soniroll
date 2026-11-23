"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FeedbackHeaderButton } from "@/components/feedback/FeedbackFab";
import ToolIntro, { IntroButton, useIntro } from "@/components/help/ToolIntro";
import { ICON_BY_ID } from "@/components/help/helpParts";
import { topicById } from "@/lib/helpContent";
import { type Crumb, type CrumbIcon, usePageCrumbs } from "@/lib/pageCrumbs";

export type { Crumb } from "@/lib/pageCrumbs";

/**
 * Every page's header bar on desktop (from `lg`): a slim 56px bar across the top of the page with
 * the page's icon, its trail of crumbs ("Library / Tunes / Setlists / Gig", the earlier ones links
 * up the page's structure, the last one the page itself), the page's intro "?", and the page's
 * buttons on the right with "Report a bug" at the far end. The tools' bar (`ToolLayout`) is this
 * same component.
 *
 * It's `absolute` at the top of the nearest positioned box — the page scroller (`AppShell`) or
 * `ToolLayout`'s page — so the page leaves room for it: `lg:pt-20` (`PageShell` does). Below `lg`
 * it's hidden, and the same trail is shown in the phone's top bar (`Sidebar`'s `MobileBarTitle`)
 * or, in split screen, the pane's own bar: the bar hands its crumbs over with `usePageCrumbs`.
 */
export default function PageBar({
  crumbs,
  icon,
  helpTopic,
  intro,
  help,
  titleExtra,
  actions,
  phoneIntro = true,
  phoneCrumbs,
}: {
  /** The trail, the page itself last. Earlier crumbs with an `href` (or `onClick`) are links. */
  crumbs: Crumb[];
  /** The page's icon, before the first crumb (muted). Defaults to `helpTopic`'s. */
  icon?: CrumbIcon;
  /** A Help page topic id: a ? beside the title that opens the page's intro. */
  helpTopic?: string;
  /** Or a ? the page runs itself (`ToolLayout`, which has its own intro state). */
  intro?: { label: string; show: () => void };
  /** Another help control after the ? (a tool's own). */
  help?: React.ReactNode;
  /** Beside the title, cut short when the bar is tight (e.g. Score Writer's project). Desktop only. */
  titleExtra?: React.ReactNode;
  /** Page-level buttons on the right, before "Report a bug". Desktop only: a page shows its own
      buttons in its content on phones. */
  actions?: React.ReactNode;
  /** Whether the ? also goes in the phone's top bar / the pane's bar (tools show theirs in their
      own row on phones). */
  phoneIntro?: boolean;
  /** A different trail for the phone's top bar and a pane's bar, when the page shows something
      else below `lg` (Help: the list of topics, until one is opened). */
  phoneCrumbs?: Crumb[];
}) {
  const topic = helpTopic ? topicById(helpTopic) : undefined;
  const ownIntro = useIntro(topic);
  const shownIntro = intro ?? (topic ? { label: `How ${topic.title} works`, show: ownIntro.show } : undefined);
  const Icon = icon ?? (topic ? ICON_BY_ID[topic.id] : undefined);
  usePageCrumbs({ crumbs: phoneCrumbs ?? crumbs, icon: Icon, intro: phoneIntro ? shownIntro : undefined });

  return (
    <>
      {/* With the sidebar hidden, room at the left for its menu button (`--sidebar-toggle-room`). */}
      <div className="absolute inset-x-0 top-0 hidden h-14 items-center gap-2 border-b border-foreground/10 pl-[calc(2rem+var(--sidebar-toggle-room,0px))] pr-8 lg:flex">
        <CrumbTrail crumbs={crumbs} icon={Icon} />
        {shownIntro && <IntroButton onClick={shownIntro.show} label={shownIntro.label} />}
        {help && <div className="ml-1">{help}</div>}
        {/* Only the room left over (`basis-0`), cut short with … when the header is tight, so
            the title and the buttons on the right never get squeezed by it (FB-22). */}
        {titleExtra && <div className="ml-3 min-w-0 flex-1 basis-0 truncate pr-4">{titleExtra}</div>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          <FeedbackHeaderButton />
        </div>
      </div>
      {ownIntro.open && topic && <ToolIntro topic={topic} onClose={ownIntro.close} />}
    </>
  );
}

/** The crumbs themselves. `bar`: the desktop bar (all of them, the middle ones folded into "…" past
    five). `compact`: the phone's top bar and a pane's bar — all of a short trail, else the page and
    the one above it with anything further up behind "…"; a single crumb shows the page's icon too
    (a tool, Help). */
export function CrumbTrail({
  crumbs,
  icon: Icon,
  variant = "bar",
  onCurrentClick,
}: {
  crumbs: Crumb[];
  icon?: CrumbIcon;
  variant?: "bar" | "compact";
  /** Compact only: tapping the page's own name (the phone bar scrolls back to the top). */
  onCurrentClick?: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (crumbs.length === 0) return null;
  const compact = variant === "compact";
  const last = crumbs[crumbs.length - 1];
  const earlier = crumbs.slice(0, -1);
  // Which earlier crumbs are shown before and after "…", and which are folded into it.
  let before: Crumb[] = earlier;
  let folded: Crumb[] = [];
  let after: Crumb[] = [];
  // Compact: all of it when it's short ("Library / Tunes / Setlists"), else "… / parent / page" —
  // the phone bar has room for about 28 characters (~245px at 390 wide), and the page's own name
  // must not be the part that's cut short. The bar: all of it up to five, else "first / … / last two / page".
  const length = crumbs.reduce((n, c) => n + (compact && c.short ? c.short : c.label).length + 3, -3);
  if (compact && earlier.length > 1 && length > 26) {
    before = [];
    folded = earlier.slice(0, -1);
    after = earlier.slice(-1);
    // Still too long for both ("… / Sam St… / Lesson — Nov…"): fold the parent too, so the page's
    // own name is whole ("… / Lesson — Nov 20").
    const tail = [after[0], last].reduce((n, c) => n + (c.short ?? c.label).length + 3, -3);
    if (tail > 24) {
      folded = earlier;
      after = [];
    }
  } else if (!compact && earlier.length > 4) {
    before = earlier.slice(0, 1);
    folded = earlier.slice(1, -2);
    after = earlier.slice(-2);
  }
  const sep = <span aria-hidden className="shrink-0 text-foreground/30">/</span>;
  const linkCls = compact
    ? "-mx-1 flex h-10 min-w-0 items-center rounded-md px-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    : "min-w-0 rounded-md text-muted transition-colors hover:text-foreground";
  const crumbEl = (c: Crumb) => {
    const label = compact && c.short ? c.short : c.label;
    const text = <span className="truncate">{label}</span>;
    if (c.href)
      return (
        <Link
          href={c.href}
          onClick={
            c.onClick
              ? (e) => {
                  e.preventDefault();
                  c.onClick!();
                }
              : undefined
          }
          title={c.label}
          className={`flex ${linkCls}`}
        >
          {text}
        </Link>
      );
    if (c.onClick)
      return (
        <button type="button" onClick={c.onClick} title={c.label} className={`flex ${linkCls}`}>
          {text}
        </button>
      );
    return <span className={`flex min-w-0 ${compact ? "h-10 items-center" : ""} text-muted`}>{text}</span>;
  };
  const crumbItem = (c: Crumb, i: number) => {
    // Earlier crumbs give way first (they shrink faster than the page's own name), down to a few
    // letters each. On phones a short one ("Help", "Tunes") is already under that minimum, so it
    // just takes its own width (a minimum would leave a gap after its "/").
    const short = compact && (c.short ?? c.label).length <= 7;
    return (
      <li key={`${i}-${c.label}`} className={`flex items-center gap-1.5 ${short ? "shrink-0" : compact ? "min-w-[4rem] max-w-[7.5rem] shrink-[2]" : "min-w-[2.5rem] max-w-[16rem] shrink-[2]"}`}>
        {crumbEl(c)}
        {sep}
      </li>
    );
  };
  const openFolded = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4 });
  };
  const lastLabel = compact && last.short ? last.short : last.label;
  // A lone crumb (a tool, Help) shows its icon on phones too, as the top bar always did.
  const showIcon = Icon && (!compact || crumbs.length === 1);

  return (
    <nav aria-label="Breadcrumb" className={`flex min-w-0 items-center ${compact ? "gap-1.5 text-sm font-medium" : "gap-2 text-base"}`}>
      {showIcon && <Icon className={`${compact ? "h-4 w-4" : "h-[18px] w-[18px]"} shrink-0 text-muted`} />}
      <ol className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
        {before.map(crumbItem)}
        {folded.length > 0 && (
          <li className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={openFolded}
              aria-label="Pages above this one"
              title={folded.map((c) => c.label).join(" / ")}
              className={`flex ${compact ? "h-10 w-6" : "h-7 w-7"} items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground`}
            >
              …
            </button>
            {sep}
          </li>
        )}
        {after.map((c, i) => crumbItem(c, i + 100))}
        <li className="flex min-w-0 shrink items-center">
          {compact ? (
            // The page's heading on phones (the desktop bar's is the h1 below, hidden there).
            <span role="heading" aria-level={1} className="flex min-w-0">
              {onCurrentClick ? (
                <button type="button" onClick={onCurrentClick} aria-current="page" title={last.label} className="-mx-1 flex h-10 min-w-0 items-center rounded-md px-1 text-left hover:bg-surface-hover">
                  <span className="truncate">{lastLabel}</span>
                </button>
              ) : (
                <span aria-current="page" title={last.label} className="flex h-10 min-w-0 items-center">
                  <span className="truncate">{lastLabel}</span>
                </span>
              )}
            </span>
          ) : (
            <h1 aria-current="page" className="min-w-0 truncate text-base font-semibold" title={last.label}>
              {last.label}
            </h1>
          )}
        </li>
      </ol>
      {menu && createPortal(<FoldedMenu at={menu} crumbs={folded} onClose={() => setMenu(null)} />, document.body)}
    </nav>
  );
}

/** The crumbs folded into "…", as a small menu of real links (so a page's leave guard still asks
    before going, as it does for the crumbs themselves). Escape, a click outside or a choice close it. */
function FoldedMenu({ at, crumbs, onClose }: { at: { x: number; y: number }; crumbs: Crumb[]; onClose: () => void }) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-crumb-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const width = Math.min(240, window.innerWidth - 16);
  const left = Math.max(8, Math.min(at.x, window.innerWidth - width - 8));
  const cls = "flex w-full min-w-0 items-center rounded-md px-2.5 py-1.5 text-left pointer-coarse:min-h-11 transition-colors hover:bg-surface-hover";
  return (
    <div
      data-crumb-menu
      role="menu"
      className="fixed z-[70] flex flex-col gap-px overflow-y-auto rounded-lg bg-surface p-1 text-sm shadow-lg ring-1 ring-foreground/[0.06]"
      style={{ left, top: at.y, width, maxHeight: window.innerHeight - at.y - 8 }}
    >
      {crumbs.map((c, i) =>
        c.href ? (
          <Link
            key={i}
            role="menuitem"
            href={c.href}
            onClick={(e) => {
              if (c.onClick) {
                e.preventDefault();
                c.onClick();
              }
              onClose();
            }}
            className={cls}
          >
            <span className="truncate">{c.label}</span>
          </Link>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              c.onClick?.();
            }}
            className={cls}
          >
            <span className="truncate">{c.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

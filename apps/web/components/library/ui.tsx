"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import ToolIntro, { IntroButton, useIntro } from "@/components/help/ToolIntro";
import { ICON_BY_ID } from "@/components/help/helpParts";
import { BackButton, MenuButton, tuneSummary } from "@/components/library/shared";
import { ChevronRightIcon, ChordChartIcon, NoteIcon, PlusIcon, SearchIcon, ShareIcon } from "@/components/tools";
import { formatComposer, keyPitchClass } from "@/lib/iRealPro";
import { topicById } from "@/lib/helpContent";
import type { Tune } from "@/lib/types";
import type { LibrarySongMeta } from "@/lib/useChordChartsLibrary";
import type { Setlist } from "@/lib/useSetlists";
import { displayKey } from "@jam-practice/core/setlistKeys";

/** The look of the Library pages (`components/library/*`): a plain title with underline tabs,
    a search-and-buttons toolbar, then bordered panels holding divided rows (each tune or chart
    with its coloured key badge). Colours come from the theme (`--key-0…11` in globals.css, from
    the accent). */

// ---------- colour ----------

/** A key's colour (one per key, neighbours on the circle of fifths close together), or the
    muted colour when there's no key. */
export function keyColor(label: string | null | undefined): string {
  if (!label || !/^[A-Ga-g]/.test(label.trim())) return "var(--muted)";
  return `var(--key-${keyPitchClass(label)}, var(--accent))`;
}

/** A stable colour for a name (playlists, setlists) — one of the 12 key colours. */
export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(--key-${h % 12}, var(--accent))`;
}

export const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// ---------- small pieces ----------

export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

/** A key as people read it: "Bb-" → "B♭m", "F#" → "F♯". Display only — the stored label keeps
    its plain b/#. */
export function prettyKey(label: string): string {
  return displayKey(label).replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯");
}

/** Minor keys on a black key that are written with sharps (C♯m, not D♭m). */
const MINOR_SHARP: Record<string, string> = { Db: "C♯", Gb: "F♯", Ab: "G♯" };

/** One of the 12 key-grid buttons' names (`KEY_NAMES[pc]` plus "m" for a minor tune), spelled the
    way it's usually written: D♭ but C♯m, A♭ but G♯m. Only for the grids, never a stored key. */
export function gridKeyName(name: string, minor: boolean): string {
  return minor ? `${MINOR_SHARP[name] ?? prettyKey(name)}m` : prettyKey(name);
}

/** A tune's or chart's key in a little tile of the key's colour ("Gm", "Bb"). The colour says
    which key it is, so this is the one tinted tile the library keeps. */
export function KeyBadge({ label, size = "md" }: { label: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const color = keyColor(label);
  const text = label ? prettyKey(label) : "";
  const dims =
    size === "lg" ? "h-12 w-12 rounded-lg text-base sm:h-14 sm:w-14 sm:text-lg" : size === "sm" ? "h-7 w-7 rounded-md text-[11px]" : "h-9 w-9 rounded-md text-xs";
  return (
    <span className={`flex shrink-0 items-center justify-center font-semibold tracking-tight ${dims}`} style={{ background: tint(color, 14), color }} aria-hidden>
      {text ? (
        <span className="max-w-full truncate px-0.5">{text.length > 4 ? text.slice(0, 4) : text}</span>
      ) : (
        <NoteIcon className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
      )}
    </span>
  );
}

export function Chip({ children, accent = false, title }: { children: ReactNode; accent?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-medium ${accent ? "bg-accent/10 text-accent" : "bg-foreground/[0.05] text-muted"}`}
    >
      {children}
    </span>
  );
}

/** A button — `primary` filled with the accent, else a faint fill (the secondary look every
    page header uses). A link with `href`. (Named Pill from when it was round; it's a plain
    rectangular button now.) */
export function Pill({
  icon: Icon,
  label,
  onClick,
  href,
  primary = false,
  disabled = false,
  iconOnlyOnPhone = false,
  className = "",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  primary?: boolean;
  disabled?: boolean;
  iconOnlyOnPhone?: boolean;
  className?: string;
}) {
  const cls = `${className} inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 sm:h-9 ${
    iconOnlyOnPhone && Icon ? "w-10 sm:w-auto sm:px-3" : "px-3"
  } ${primary ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-foreground/[0.05] text-foreground hover:bg-surface-hover"}`;
  const inner = (
    <>
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className={iconOnlyOnPhone && Icon ? "hidden sm:inline" : undefined}>{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className={cls} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} aria-label={label}>
      {inner}
    </button>
  );
}

/** For a row that scrolls sideways (tabs, chips): fades whichever edge has more to scroll to,
    so a phone shows there's more off screen. Pass `attach` as the scrolling element's `ref`, and `style`. */
export function useEdgeFade<T extends HTMLElement>() {
  // A callback ref (kept in state), so a row that mounts later — after data loads — is still seen.
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    // The observer also fires once straight away, which sets the first state.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [el]);
  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent, black 2rem" : "black, black"}, ${edges.right ? "black calc(100% - 2rem), transparent" : "black"})`
      : undefined;
  return { attach: setEl, style: mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined };
}

export type LibraryTab = "tunes" | "setlists" | "charts" | "files";
export const LIBRARY_TABS: readonly LibraryTab[] = ["tunes", "setlists", "charts", "files"];

/** Library is one page (`/tunes`); its tabs are a `?tab=` query (none means Tunes). */
export function libraryHref(tab: LibraryTab): string {
  return tab === "tunes" ? "/tunes" : `/tunes?tab=${tab}`;
}

/** Tunes · Setlists · Chord Charts · Files · Recordings — Library's tabs, under its title. They
    swap the `?tab=` query in place (replace, no scroll) rather than going to another page;
    Recordings is its own page (`/recordings`) but sits here too, so it's found from the Library. */
export function LibraryTabs({ active }: { active: LibraryTab | "recordings" }) {
  const tabs = [
    { id: "tunes", label: "Tunes", href: libraryHref("tunes") },
    { id: "setlists", label: "Setlists", href: libraryHref("setlists") },
    { id: "charts", label: "Chord Charts", short: "Charts", href: libraryHref("charts") },
    { id: "files", label: "Files", href: libraryHref("files") },
    { id: "recordings", label: "Recordings", href: "/recordings" },
  ] as const;
  const { attach: fadeRef, style: fadeStyle } = useEdgeFade<HTMLElement>();
  return (
    <nav ref={fadeRef} style={fadeStyle} className="flex max-w-full overflow-x-auto border-b border-foreground/10 [scrollbar-width:none] sm:gap-2" aria-label="Library">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          replace
          scroll={false}
          aria-current={active === t.id ? "page" : undefined}
          className={`-mb-px flex h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-2 text-sm transition-colors sm:px-3 ${
            active === t.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {"short" in t ? (
            <>
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </>
          ) : (
            t.label
          )}
        </Link>
      ))}
    </nav>
  );
}

// ---------- page frame ----------

export function LibraryPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:max-w-none lg:px-8 lg:pt-8">
      {children}
    </main>
  );
}

/**
 * The header every library page starts with: an optional back button, a muted icon (or any
 * `leading` element, e.g. a key badge), the title and a line under it, the page's buttons, then
 * `tabs` (Library's sub-pages) and `children` (usually a search toolbar) below. Without tabs it
 * ends with a hairline, like the dashboard's header. `color` colours the icon when given.
 */
export function Hero({
  title,
  subtitle,
  icon: Icon,
  leading,
  color,
  tabs,
  back,
  backHref,
  backLabel,
  actions,
  helpTopic,
  titleExtra,
  rule = true,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  leading?: ReactNode;
  color?: string;
  tabs?: ReactNode;
  back?: () => void;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  helpTopic?: string;
  /** Beside the title, e.g. Library's storage meter. */
  titleExtra?: ReactNode;
  /** The hairline under a header without tabs; off when a search toolbar ends the header. */
  rule?: boolean;
  children?: ReactNode;
}) {
  const topic = helpTopic ? topicById(helpTopic) : undefined;
  const intro = useIntro(topic);
  const TopicIcon = topic ? ICON_BY_ID[topic.id] : undefined;
  const ShownIcon = Icon ?? TopicIcon;
  return (
    <header className={`flex flex-col gap-4 ${tabs || !rule ? "" : "border-b border-foreground/10 pb-6"}`}>
      {(back || backHref) && (
        <div>
          <BackButton onClick={back} href={backHref} label={backLabel} />
        </div>
      )}
      {/* With tabs (Library), the buttons stay on the title's line on phones too, so the tabs don't
          move between pages. */}
      <div className={`flex items-center gap-x-4 gap-y-3 ${tabs ? "" : "flex-wrap"}`}>
        <div className={`flex items-center gap-3 ${tabs ? "min-w-0 flex-1" : "min-w-[min(100%,16rem)] flex-1 basis-72"}`}>
          {leading}
          <div className={`min-w-0 ${titleExtra ? "max-sm:flex-1" : "flex-1"}`}>
            <div className="flex min-w-0 items-center gap-1">
              <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight">
                {!leading && ShownIcon && (
                  <span className={`shrink-0 ${color ? "" : "text-accent"}`} style={color ? { color } : undefined}>
                    <ShownIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="line-clamp-2 break-words">{title}</span>
              </h1>
              {topic && <IntroButton onClick={intro.show} label={`How ${topic.title} works`} />}
            </div>
            {subtitle && <div className={`mt-0.5 text-sm text-muted ${tabs ? "truncate" : ""}`}>{subtitle}</div>}
          </div>
          {titleExtra && <div className="ml-auto shrink-0">{titleExtra}</div>}
        </div>
        {/* Buttons here sit on the page background, so any "on a card" bg-background ones turn surface.
            min-w-0: on its own line it fits the page, and a select in it shrinks (a chart's key). */}
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 [&_.bg-background]:bg-surface">{actions}</div>}
      </div>
      {tabs}
      {children && <div>{children}</div>}
      {intro.open && topic && <ToolIntro topic={topic} onClose={intro.close} />}
    </header>
  );
}

export function HeroSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md bg-foreground/[0.05] pl-3 pr-2 transition-colors focus-within:ring-2 focus-within:ring-accent/40 sm:h-9">
      <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface-hover hover:text-foreground">
          Clear
        </button>
      )}
    </label>
  );
}

/** A search box with the page's buttons beside it — the row under Library's tabs. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-2">{children}</div>;
}

/** A bordered panel: a header row (title, detail, a small +, "See all") over its content. */
export function Panel({
  title,
  detail,
  href,
  hrefLabel = "See all",
  onAdd,
  addLabel,
  icon: Icon,
  children,
  className = "",
  flush = false,
}: {
  title: string;
  detail?: ReactNode;
  href?: string;
  hrefLabel?: string;
  onAdd?: (e: React.MouseEvent) => void;
  addLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
  /** Rows go edge to edge (a list) instead of padded content. */
  flush?: boolean;
}) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface ${className}`}>
      <div className="flex h-11 shrink-0 items-center gap-2 pl-4 pr-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
        {href ? (
          <Link href={href} className="truncate text-sm font-medium hover:underline">
            {title}
          </Link>
        ) : (
          <h2 className="truncate text-sm font-medium">{title}</h2>
        )}
        {detail != null && <span className="shrink-0 text-xs tabular-nums text-muted">{detail}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {href && (
            <Link href={href} className="flex h-8 items-center rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
              {hrefLabel}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={addLabel ?? `Add to ${title}`}
              title={addLabel ?? `Add to ${title}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** Rows inside a `Panel` (or any bordered box), separated by hairlines. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-foreground/10">{children}</div>;
}

/** A short "nothing here" message: a line, an optional sentence and one action. `boxed` draws the
    dashed outline it uses on its own on a page; inside a panel leave it off. */
export function EmptyState({
  title,
  body,
  action,
  boxed = false,
}: {
  /** Kept for callers; empty states don't show an icon any more. */
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  boxed?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 px-6 py-8 text-center ${boxed ? "rounded-lg border border-dashed border-foreground/15" : ""}`}>
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ---------- rows ----------

function RowShell({
  href,
  leading,
  title,
  extra,
  meta,
  onMenu,
  menuLabel,
  trailing,
  reserveMenu = false,
}: {
  href: string;
  leading?: ReactNode;
  title: string;
  extra?: ReactNode;
  meta?: ReactNode;
  onMenu?: (e: React.MouseEvent) => void;
  menuLabel?: string;
  trailing?: ReactNode;
  /** No ⋮ on this row, but keep its space so `trailing` lines up with rows that have one. */
  reserveMenu?: boolean;
}) {
  return (
    <div className="group flex items-center gap-1 transition-colors hover:bg-surface-hover">
      <Link href={href} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2">
        {leading}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{title}</span>
            {extra}
          </span>
          {meta && <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 overflow-hidden text-xs text-muted">{meta}</span>}
        </span>
        {trailing}
      </Link>
      {onMenu ? (
        <div className="pr-1.5">
          <MenuButton label={menuLabel ?? `Options for ${title}`} onClick={onMenu} />
        </div>
      ) : (
        reserveMenu && <div aria-hidden className="w-8 shrink-0 box-content pr-1.5" />
      )}
    </div>
  );
}

/** A tune: its key badge, name (with a chart mark if it has one), tempo / time / keys known. */
export function TuneItem({ tune, href, onMenu }: { tune: Tune; href: string; onMenu?: (e: React.MouseEvent) => void }) {
  const keys = tune.keys.filter((k) => k.enabled);
  const tempo = tune.tempos.find((t) => t.enabled)?.value;
  const meta = [tempo != null ? `${tempo} BPM` : null, tune.timeSignature || null, keys.length > 1 ? `${keys.length} keys` : null].filter(Boolean).join(" · ");
  return (
    <RowShell
      href={href}
      leading={<KeyBadge label={keys[0]?.value} />}
      title={tune.name}
      extra={
        tune.chordChartId && (
          <span title="Has a chord chart" className="shrink-0 text-muted">
            <ChordChartIcon className="h-3.5 w-3.5" />
          </span>
        )
      }
      meta={<span className="truncate">{!tempo && !keys.length ? tuneSummary(tune) || "No key or tempo yet" : meta}</span>}
      onMenu={onMenu}
    />
  );
}

/** A chart: its key badge, title, composer and anything else in `subtitle`. */
export function ChartItem({ song, href, subtitle, onMenu }: { song: LibrarySongMeta; href: string; subtitle?: string; onMenu?: (e: React.MouseEvent) => void }) {
  const line = subtitle ?? [song.composer ? formatComposer(song.composer) : null, song.style || null].filter(Boolean).join(" · ");
  return (
    <RowShell href={href} leading={<KeyBadge label={song.key} />} title={song.title} meta={line ? <span className="truncate">{line}</span> : undefined} onMenu={onMenu} />
  );
}

/** Recently opened tunes or charts, as rows with their key (inside a `Panel`). */
export function RecentList({
  items,
}: {
  items: {
    key: string;
    title: string;
    detail: string;
    href: string;
    keyLabel?: string | null;
  }[];
}) {
  return (
    <Rows>
      {items.map((it) => (
        <RowShell key={it.key} href={it.href} leading={<KeyBadge label={it.keyLabel} />} title={it.title} meta={it.detail ? <span className="truncate">{it.detail}</span> : undefined} />
      ))}
    </Rows>
  );
}

/** Recently opened charts (or tunes) as one slim row of chips — key badge and title — under a
    small "Recent" label. Scrolls sideways when it doesn't fit (phones), with a faded edge. */
export function RecentStrip({ items }: { items: { key: string; title: string; href: string; keyLabel?: string | null; detail?: string }[] }) {
  const { attach: fadeRef, style: fadeStyle } = useEdgeFade<HTMLDivElement>();
  if (items.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-xs font-medium text-muted">Recent</span>
      <div ref={fadeRef} style={fadeStyle} className="-mr-4 min-w-0 flex-1 overflow-x-auto pr-4 [scrollbar-width:none] sm:mr-0 sm:pr-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              title={it.detail ? `${it.title} · ${it.detail}` : it.title}
              className="flex h-10 max-w-[14rem] shrink-0 items-center gap-2 rounded-md bg-surface pl-1.5 pr-3 text-sm font-medium transition-colors hover:bg-surface-hover sm:h-9"
            >
              <KeyBadge label={it.keyLabel} size="sm" />
              <span className="truncate">{it.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A folder of charts as a row: a folder icon, its name, how many charts, and its ⋮ menu. */
export function PlaylistItem({ name, count, href, onMenu, all = false }: { name: string; count: number; href: string; onMenu?: (e: React.MouseEvent) => void; all?: boolean }) {
  return (
    <RowShell
      href={href}
      leading={all ? <ChordChartIcon className="h-4 w-4 shrink-0 text-muted" /> : <FolderIcon className="h-4 w-4 shrink-0 text-muted" />}
      title={name}
      trailing={
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {count} chart{count === 1 ? "" : "s"}
        </span>
      }
      onMenu={onMenu}
      reserveMenu={all}
    />
  );
}

/** A setlist as a row: its name (and a share mark), its description or first tunes, how many. */
export function SetlistItem({ setlist, href, tuneNames }: { setlist: Setlist; href: string; tuneNames: string[] }) {
  const n = setlist.tuneIds.length;
  return (
    <RowShell
      href={href}
      title={setlist.name}
      extra={
        setlist.shareId && (
          <span title="Shared by link" className="shrink-0 text-muted">
            <ShareIcon className="h-3.5 w-3.5" />
          </span>
        )
      }
      meta={<span className="truncate">{setlist.description || (tuneNames.length ? tuneNames.slice(0, 4).join(" · ") : "No tunes yet")}</span>}
      trailing={
        <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted">
          {n} tune{n === 1 ? "" : "s"}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      }
    />
  );
}

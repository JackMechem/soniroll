"use client";

import type { ReactNode } from "react";
import { Chip, KeyBadge, prettyKey } from "@/components/library/ui";
import { ChevronLeftIcon } from "@/components/tools";
import { formatComposer, type IRealSong } from "@/lib/iRealPro";

/** The frame around a chord chart wherever one is read (a chart's page, the setlist reader, a
    tune's page, full screen) — the chart itself is always the unchanged `ChordChart`. */

/** The "paper" a chart sits on. `fill` stretches it to its container's height (full screen / the
    reader); otherwise it's as tall as the chart. */
export function ChartPaper({ children, top, fill = false, className = "" }: { children: ReactNode; top?: ReactNode; fill?: boolean; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col rounded-lg bg-surface ${fill ? "min-h-0 flex-1" : ""} ${className}`}>
      {top && <div className="flex flex-wrap items-center gap-1.5 border-b border-foreground/10 px-4 py-2.5 sm:px-5">{top}</div>}
      <div className={fill ? "min-h-0 flex-1 p-2 sm:p-3" : "p-2 sm:p-5"}>{children}</div>
    </div>
  );
}

/** A chart's details as chips: composer, style, key (and what it was transposed from), time,
    tempo. */
export function ChartMeta({ song, originalKey, tempo, extra, composer = true }: { song: IRealSong; originalKey?: string | null; tempo?: number | null; extra?: ReactNode; composer?: boolean }) {
  const transposed = originalKey && originalKey !== song.key;
  return (
    <>
      {composer && song.composer && <span className="mr-1 truncate text-sm font-medium text-foreground/80">{formatComposer(song.composer)}</span>}
      {song.style && <Chip>{song.style}</Chip>}
      {song.key && (
        <Chip accent={!!transposed} title={transposed ? `Written in ${prettyKey(originalKey!)}` : undefined}>
          {prettyKey(song.key)}
          {transposed ? ` · from ${prettyKey(originalKey!)}` : ""}
        </Chip>
      )}
      <Chip>
        {song.timeSignature.top}/{song.timeSignature.bottom}
      </Chip>
      {tempo ? <Chip>{tempo} BPM</Chip> : null}
      {extra}
    </>
  );
}

/** The bar above a chart that fills the screen (the setlist reader, a chart's full screen): a
    back / close button, the key badge, title and a line under it, and controls on the right. */
export function ReaderBar({
  onBack,
  backLabel = "Back",
  backIcon,
  keyLabel,
  title,
  subtitle,
  children,
}: {
  onBack: () => void;
  backLabel?: string;
  backIcon?: ReactNode;
  keyLabel?: string | null;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground sm:h-9 sm:w-9"
      >
        {backIcon ?? <ChevronLeftIcon className="h-5 w-5" />}
      </button>
      {keyLabel !== undefined && (
        <span className="hidden sm:block">
          <KeyBadge label={keyLabel} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight tracking-tight sm:text-lg">{title}</h1>
        {subtitle && <div className="truncate text-xs text-muted sm:text-sm">{subtitle}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </header>
  );
}

/** A square icon button for the reader bars (named from when it was round). */
export function RoundButton({ label, onClick, disabled, active, children }: { label: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30 sm:h-9 sm:w-9 ${
        active ? "bg-accent text-accent-foreground" : "bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

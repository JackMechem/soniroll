"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import { useSidebarShownWidth } from "@/components/Sidebar";
import { NAV_LINKS, svgProps } from "@/components/tools";
import {
  getMetricModServerSnapshot,
  getMetricModSnapshot,
  stopMetricMod,
  subscribeMetricMod,
} from "@/lib/metricModulationEngine";
import {
  getMetronomeServerSnapshot,
  getMetronomeSnapshot,
  stopMetronome,
  subscribeMetronome,
} from "@/lib/metronomeEngine";
import { midiToNote } from "@/lib/noteRange";
import { centsColor } from "@/lib/pitchTrack";
import {
  getTunerServerSnapshot,
  getTunerSnapshot,
  stopTunerListening,
  subscribeTuner,
} from "@/lib/tunerEngine";
import { useIsDesktop } from "@/lib/useIsDesktop";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** The card shell shared by every preview below — label/icon (from `NAV_LINKS`) link back to the
    tool, a close button (sibling of the `<Link>`, not nested inside it — a button inside an
    anchor is invalid HTML) stops it the same way its own Stop/Pause control would, and
    `children` is whatever small live visual that specific tool wants to show. */
function DockCard({
  href,
  onClose,
  children,
}: {
  href: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const link = NAV_LINKS.find((l) => l.href === href);
  const Icon = link?.icon;
  return (
    <div className="relative flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-lg">
      {/* `pr-6` reserves room for the close button only on this row (its text could otherwise
          run under it) — kept off the card's own padding so the preview row below stays
          symmetric and `justify-center` actually centers it in the card, not in a box already
          lopsided by the button's reserved space. */}
      <Link href={href} className="flex items-center gap-2 pr-6">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-accent" />}
        <span className="truncate text-xs font-medium text-foreground">{link?.label ?? href}</span>
      </Link>
      <div className="flex items-center justify-center">{children}</div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`Stop ${link?.label ?? href}`}
        title={`Stop ${link?.label ?? href}`}
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-danger"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

function MetronomeCard({ hidden }: { hidden: boolean }) {
  const snap = useSyncExternalStore(subscribeMetronome, getMetronomeSnapshot, getMetronomeServerSnapshot);
  if (!snap.running || hidden) return null;
  return (
    <DockCard href="/metronome" onClose={stopMetronome}>
      <BeatIndicator
        accents={snap.displayAccents}
        currentBeat={snap.currentBeat}
        subdivision={snap.displaySubdivision}
        subAccents={snap.displaySubAccents}
        currentSub={snap.currentSub}
        size="sm"
      />
    </DockCard>
  );
}

function PolyrhythmCard({ hidden }: { hidden: boolean }) {
  const snap = useSyncExternalStore(subscribeMetricMod, getMetricModSnapshot, getMetricModServerSnapshot);
  if (!snap.running || hidden) return null;
  return (
    <DockCard href="/random-metric-modulation" onClose={stopMetricMod}>
      <div className="flex flex-col items-center gap-1">
        <BeatIndicator
          accents={snap.accents}
          currentBeat={snap.currentBeat}
          subdivision={snap.subdivision}
          subAccents={snap.subAccents}
          currentSub={snap.currentSub}
          size="sm"
        />
        <span className="text-[0.65rem] tabular-nums text-muted">
          {Math.round(snap.preciseBpmDisplay)} BPM
        </span>
      </div>
    </DockCard>
  );
}

function TunerCard({ hidden }: { hidden: boolean }) {
  const snap = useSyncExternalStore(subscribeTuner, getTunerSnapshot, getTunerServerSnapshot);
  if (!snap.listening || hidden) return null;
  const reading = snap.reading;
  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const color = reading ? centsColor(reading.cents) : undefined;
  const noteName = reading ? midiToNote(reading.target) : null;
  return (
    <DockCard href="/tuner" onClose={stopTunerListening}>
      <div className="flex w-full flex-col items-center gap-1.5">
        {noteName ? (
          <span className="text-2xl font-bold" style={{ color }}>
            {noteName}
          </span>
        ) : (
          <span className="text-xs text-muted">Listening…</span>
        )}
        <div className="relative h-1.5 w-full rounded-full bg-background">
          <div className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-muted/60" />
          {reading && (
            <div
              className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${50 + cents}%`, background: color }}
            />
          )}
        </div>
      </div>
    </DockCard>
  );
}

/**
 * Floating "what's running in the background" stack — a small preview card per tool
 * (`lib/metronomeEngine.ts`, `lib/metricModulationEngine.ts`, `lib/tunerEngine.ts`) that's
 * currently running but isn't the page you're actually looking at right now. Each engine lives
 * independently of any component's mount lifecycle (see those files' own doc comments), so this
 * really is a live view onto something still running in the background, not a frozen snapshot —
 * the click blocks actually pulse, the tuning meter actually tracks the mic in real time.
 * Navigate back to a tool and its card disappears — same instance, nothing lost, nothing
 * restarted. Deliberately *not* inside the sidebar itself — per an explicit request to keep this
 * out of the sidebar's own layout so it costs no sidebar space — it floats fixed to the
 * bottom-left of the page, just past the sidebar's own right edge. Desktop-only: this whole
 * feature is a no-op on mobile.
 */
export default function BackgroundToolDock() {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const sidebarWidth = useSidebarShownWidth();

  if (!isDesktop) return null;

  return (
    <div
      style={{ left: sidebarWidth + 16 }}
      className="fixed bottom-4 z-30 flex w-56 flex-col-reverse gap-2"
    >
      <MetronomeCard hidden={pathname === "/metronome"} />
      <PolyrhythmCard hidden={pathname === "/random-metric-modulation"} />
      <TunerCard hidden={pathname === "/tuner"} />
    </div>
  );
}

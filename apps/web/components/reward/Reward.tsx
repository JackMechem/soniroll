"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { burstAt } from "@/components/practicelog/Celebrations";
import { CheckIcon } from "@/components/tools";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/**
 * The "reward" look for a tool's options, in the spirit of the Shed Log: chunky pills with a
 * coloured icon, values that pop and glow when they change, big picker cards that light up in the
 * tool's colour, sliders that fill with a gradient, a sparkle on round numbers, and a "New" badge
 * (and a burst when you pick it) on choices you haven't tried yet.
 *
 * `ToolLayout` turns it on (in the theme's accent, like the rest of the page) for tools on the new Shed Log
 * logging (`LOG_BY_BUTTON` in lib/toolTime.ts); the shared option components (`SettingChip`,
 * `Segmented`, `SubdivisionPicker`, `ClickSoundCards`, the sliders) check `useReward()` and keep
 * their plain look everywhere else.
 */

type Reward = {
  color: string;
  /** Whether a choice (an id like "sound:wood") gets a "New" badge: not tried yet, in a pool the
      visitor has started exploring (see `poolStarted`). */
  isNew: (id: string) => boolean;
  /** Whether a choice hasn't been tried (or seen as the current one) yet, badge or not. */
  unseen: (id: string) => boolean;
  /** Marks a choice as tried; the first time, and if it was showing "New", a burst of sparkles
      comes out of `el`. */
  tried: (id: string, el?: Element | null) => void;
};

const RewardContext = createContext<Reward | null>(null);
export const useReward = () => useContext(RewardContext);

const TRIED_KEY = "jam-practice-tried-options";
const DEFAULT_TRIED: { tools: Record<string, string[]> } = { tools: {} };

/** The pool a choice belongs to: "sound" for "sound:wood", "meter" for "meter:3/4". */
function poolOf(id: string) {
  const i = id.indexOf(":");
  return i < 0 ? id : id.slice(0, i);
}

/** "New" badges only show in a pool once the visitor has tried something in it besides what they
    started on (which is marked as tried just by being the current choice). So a first visit shows
    none, instead of "New" on nearly every option. */
function poolStarted(list: string[], id: string) {
  const pool = poolOf(id);
  return list.filter((x) => poolOf(x) === pool).length >= 2;
}

export function RewardProvider({ href, color, children }: { href: string; color: string; children: ReactNode }) {
  const [stored, update, ready] = useSyncedSettings(TRIED_KEY, DEFAULT_TRIED);
  const value = useMemo<Reward>(() => {
    const list = stored.tools[href] ?? [];
    return {
      color,
      // Until the list has loaded, nothing is "New" (so badges don't flash on and off).
      isNew: (id) => ready && !list.includes(id) && poolStarted(list, id),
      unseen: (id) => ready && !list.includes(id),
      tried: (id, el) => {
        if (!ready || list.includes(id)) return;
        if (el && poolStarted(list, id)) burstAt(el, color);
        update({ tools: { ...stored.tools, [href]: [...list, id].slice(-200) } });
      },
    };
  }, [stored.tools, href, color, ready, update]);
  return <RewardContext.Provider value={value}>{children}</RewardContext.Provider>;
}

/** The tool colour as a lively gradient (for an active card, an icon tile, the Log button). */
export function rewardGradient(color: string) {
  return `linear-gradient(150deg, color-mix(in srgb, ${color} 75%, white) 0%, ${color} 100%)`;
}

/** A value that pops (and its ring glows) each time it changes — not when it first appears. */
export function usePopKey(value: string): number {
  const [seen, setSeen] = useState(value);
  const [n, setN] = useState(0);
  if (seen !== value) {
    setSeen(value);
    setN(n + 1);
  }
  return n;
}

/** A small dot on a choice you haven't tried yet. */
export function NewBadge({ color }: { color: string }) {
  return (
    <span title="You haven't tried this one yet" className="absolute right-1 top-1 rounded-sm px-1 text-[9px] font-semibold leading-4" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      New
    </span>
  );
}

/** A big tappable choice card: lights up in the tool's colour when picked, with a "New" badge
    until it's been tried. */
export function RewardCard({
  id,
  on,
  onPick,
  label,
  className = "",
  children,
}: {
  /** For "New" tracking, e.g. "sub:3". */
  id: string;
  on: boolean;
  onPick: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const reward = useReward();
  const color = reward?.color ?? "var(--accent)";
  const fresh = !on && !!reward?.isNew(id);
  // What you're already using counts as tried (no dot, no burst).
  const unseenCurrent = on && !!reward?.unseen(id);
  useEffect(() => {
    if (unseenCurrent) reward?.tried(id);
  }, [unseenCurrent, reward, id]);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        onPick();
        reward?.tried(id, e.currentTarget);
      }}
      className={`relative flex flex-col items-center justify-center gap-1 rounded-md border transition-colors ${
        on ? "text-foreground" : "border-foreground/15 bg-background text-foreground hover:bg-surface-hover"
      } ${className}`}
      style={on ? { borderColor: color, background: `color-mix(in srgb, ${color} 12%, var(--background))` } : undefined}
    >
      {on && <span key={id} className="reward-glow pointer-events-none absolute inset-0 rounded-md" style={{ "--reward": color } as React.CSSProperties} />}
      <span key={on ? "on" : "off"} className={`flex flex-col items-center gap-1 ${on ? "reward-pop" : ""}`}>
        {children}
      </span>
      {fresh && <NewBadge color={color} />}
    </button>
  );
}

/** A ✦ that pops in beside a value when it lands on a round number. */
export function Sparkle({ show, at, color }: { show: boolean; at: string | number; color?: string }) {
  if (!show) return null;
  return (
    <span key={String(at)} aria-hidden className="star-pop inline-block text-base leading-none" style={{ color: color ?? "var(--accent)" }}>
      ✦
    </span>
  );
}

/** One choice in a pool you pick several from (which intervals, which chords, which ratios): a
    small bordered toggle, filled with the accent while it's on. With the reward look it fills
    with the tool's colour and a check pops in (`plainClassName` keeps each tool's own sizing). */
export function PoolPill({
  on,
  onClick,
  disabled,
  title,
  plainClassName = "rounded-full px-3 py-1.5 text-xs font-medium",
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  plainClassName?: string;
  children: ReactNode;
}) {
  const reward = useReward();
  if (!reward) {
    return (
      <button
        type="button"
        aria-pressed={on}
        title={title}
        onClick={onClick}
        disabled={disabled}
        className={`${plainClassName} border transition-colors disabled:opacity-60 ${on ? "border-accent bg-accent text-accent-foreground" : "border-foreground/15 bg-background text-foreground hover:bg-surface-hover"}`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center gap-1 rounded-full border py-1.5 text-sm font-medium tabular-nums transition-colors disabled:opacity-60 ${
        on ? "pl-2 pr-3 text-accent-foreground" : "border-foreground/15 bg-background px-3 text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
      style={on ? { background: reward.color, borderColor: reward.color } : undefined}
    >
      {on && <CheckIcon key="on" className="reward-pop h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

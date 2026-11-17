"use client";

import { useEffect, useRef } from "react";
import {
  LEARNING_LEVELS,
  LearningTrack,
  PASS_SCORE,
  TrackProgress,
  currentLevelIndex,
  isPassed,
  levelStars,
  summarizeTrack,
} from "@/lib/learningPath";

export function Stars({ count, size = "text-sm" }: { count: number; size?: string }) {
  return (
    <span className={`flex gap-0.5 leading-none ${size}`} aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? "text-amber-400" : "text-foreground/15"}>
          ★
        </span>
      ))}
    </span>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** How far each level's node sits from the centre line, so the path winds gently instead of
    being a straight column. */
const WIND = [0, 1, 1.6, 1, 0, -1, -1.6, -1];

/**
 * A tool's learning path: a winding trail of levels, each a round node — done (filled, with its
 * stars), the current one (pulsing, with a Start bubble), or still locked. Any level you've
 * reached can be picked to play again; the selected one is what Start plays.
 */
export default function LearningPath({
  track,
  progress,
  selected,
  onSelect,
  onStart,
}: {
  track: LearningTrack;
  progress: TrackProgress;
  selected: number;
  onSelect: (index: number) => void;
  onStart: () => void;
}) {
  const levels = LEARNING_LEVELS[track];
  const current = currentLevelIndex(track, progress);
  const summary = summarizeTrack(track, progress);
  const listRef = useRef<HTMLOListElement | null>(null);

  // Bring the level being worked on into view when the path first shows. Only the list scrolls:
  // `scrollIntoView` would scroll the page too, opening it part-way down.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-level="${Math.min(current, levels.length - 1)}"]`);
    if (!list || !el) return;
    list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
  }, [current, levels.length]);

  const done = summary.passed === summary.total;
  const pct = Math.round((summary.passed / summary.total) * 100);

  return (
    <section aria-label="Learning path" className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg bg-surface p-4 text-left">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">
            {done ? "Path complete!" : `Level ${current + 1} of ${levels.length}`}
          </p>
          <p className="flex items-center gap-1 text-sm font-medium tabular-nums text-amber-500">
            ★ {summary.stars}
            <span className="font-normal text-muted">/ {summary.maxStars}</span>
          </p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted">
          {done
            ? "Every level passed. Go back for three stars on each, or keep practicing in Practice mode."
            : `Score ${Math.round(PASS_SCORE * 100)}% or better on a level to unlock the next one.`}
        </p>
      </div>

      {/* The trail scrolls inside itself, with no scrollbar: its top and bottom fade out instead
          of cutting a node in half. */}
      <ol
        ref={listRef}
        className="relative flex max-h-72 flex-col items-center gap-1 overflow-y-auto py-6 [mask-image:linear-gradient(to_bottom,transparent,black_3rem,black_calc(100%-3rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {levels.map((level, i) => {
          const passed = isPassed(progress, level.id);
          const unlocked = i <= current;
          const isCurrent = i === current;
          const isSelected = i === selected;
          const stars = levelStars(progress, level.id);
          const offset = WIND[i % WIND.length] * 2.25;
          return (
            <li key={level.id} data-level={i} className="flex flex-col items-center" style={{ transform: `translateX(${offset}rem)` }}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={`mb-1 h-5 w-0.5 rounded-full ${unlocked ? "bg-accent/50" : "bg-foreground/10"}`}
                />
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => (isSelected && unlocked ? onStart() : onSelect(i))}
                  aria-label={`Level ${i + 1}: ${level.title}${passed ? ", passed" : unlocked ? "" : ", locked"}`}
                  aria-pressed={isSelected}
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-base font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    passed
                      ? "border-accent bg-accent text-accent-foreground hover:bg-accent-hover"
                      : isCurrent
                        ? "border-2 border-accent bg-surface text-accent hover:bg-surface-hover"
                        : "border-foreground/10 bg-surface text-muted/60"
                  } ${isSelected && unlocked ? "ring-2 ring-accent/40 ring-offset-2 ring-offset-background" : ""}`}
                >
                  {passed ? <CheckIcon className="h-5 w-5" /> : unlocked ? i + 1 : <LockIcon className="h-4 w-4" />}
                </button>
                <div className="flex w-36 flex-col items-start text-left">
                  <span className={`text-sm font-medium ${unlocked ? "" : "text-muted/60"}`}>{level.title}</span>
                  {passed ? (
                    <Stars count={stars} />
                  ) : isCurrent ? (
                    <span className="text-xs font-medium text-accent">{isSelected ? "Up next" : "Current level"}</span>
                  ) : (
                    <span className="text-xs text-muted/60">Level {i + 1}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
